import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { extractPatterns } from "@/lib/agents/pattern-extraction/analyzer";
import { designAndCreateABTests } from "@/lib/agents/ab-test-designer/designer";
import type { EpisodeWithSignal } from "@/types/learning-loop";

/**
 * パターン抽出Cron (毎週日曜 UTC 5:00 = JST 14:00)
 * episode_signalsの上位/下位エピソードを分析し、パターンを自動発見
 */
export const maxDuration = 300; // 5分（LLM呼び出しがあるため）

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  // 1. quality_signalがNULLでないエピソードを取得
  const { data: signals, error: signalError } = await supabase
    .from("episode_signals")
    .select("episode_id, novel_id, quality_signal, completion_rate, next_transition_rate, sample_size")
    .not("quality_signal", "is", null)
    .gte("sample_size", 10)
    .order("quality_signal", { ascending: false });

  if (signalError || !signals || signals.length < 10) {
    return NextResponse.json({
      success: false,
      reason: signalError?.message || `分析に必要なエピソード数不足 (${signals?.length ?? 0}/10)`,
    });
  }

  // 2. 上位20%と下位20%を取得
  const topCount = Math.max(5, Math.floor(signals.length * 0.2));
  const topSignals = signals.slice(0, topCount);
  const bottomSignals = signals.slice(-topCount);

  // 3. エピソード本文を取得
  const allEpisodeIds = [...topSignals, ...bottomSignals].map(s => s.episode_id);

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, novel_id, episode_number, title")
    .in("id", allEpisodeIds);

  const { data: bodies } = await supabase
    .from("episode_bodies")
    .select("episode_id, body_md")
    .in("episode_id", allEpisodeIds);

  // episode_bodiesがない場合はepisodesのbody_mdを使う（移行前互換）
  const bodyMap = new Map<string, string>();
  if (bodies) {
    for (const b of bodies) bodyMap.set(b.episode_id, b.body_md);
  }
  // episode_bodiesにない場合はepisodesテーブルから直接取得
  const missingIds = allEpisodeIds.filter(id => !bodyMap.has(id));
  if (missingIds.length > 0) {
    const { data: fallbackEps } = await supabase
      .from("episodes")
      .select("id, body_md")
      .in("id", missingIds)
      .not("body_md", "is", null);
    if (fallbackEps) {
      for (const ep of fallbackEps) {
        if (ep.body_md) bodyMap.set(ep.id, ep.body_md);
      }
    }
  }

  // 4. ジャンル情報を取得
  const novelIds = [...new Set(allEpisodeIds.map(id =>
    [...topSignals, ...bottomSignals].find(s => s.episode_id === id)?.novel_id,
  ).filter(Boolean))];

  const { data: novels } = await supabase
    .from("novels")
    .select("id, genre")
    .in("id", novelIds as string[]);

  const novelGenreMap = new Map<string, string>();
  if (novels) {
    for (const n of novels) novelGenreMap.set(n.id, n.genre);
  }

  const episodeMap = new Map<string, { episode_number: number; title: string; novel_id: string }>();
  if (episodes) {
    for (const ep of episodes) episodeMap.set(ep.id, ep);
  }

  // 5. EpisodeWithSignal形式に変換
  function toEpisodeWithSignal(
    signal: typeof topSignals[0],
  ): EpisodeWithSignal | null {
    const ep = episodeMap.get(signal.episode_id);
    const body = bodyMap.get(signal.episode_id);
    if (!ep || !body) return null;
    return {
      episode_id: signal.episode_id,
      novel_id: signal.novel_id,
      episode_number: ep.episode_number,
      title: ep.title,
      body_md: body,
      genre: novelGenreMap.get(signal.novel_id) || null,
      quality_signal: signal.quality_signal,
      completion_rate: signal.completion_rate ?? 0,
      next_transition_rate: signal.next_transition_rate ?? 0,
      sample_size: signal.sample_size,
    };
  }

  const topEpisodes = topSignals.map(toEpisodeWithSignal).filter(Boolean) as EpisodeWithSignal[];
  const bottomEpisodes = bottomSignals.map(toEpisodeWithSignal).filter(Boolean) as EpisodeWithSignal[];

  if (topEpisodes.length < 3 || bottomEpisodes.length < 3) {
    return NextResponse.json({
      success: false,
      reason: `本文取得可能なエピソード不足 (top=${topEpisodes.length}, bottom=${bottomEpisodes.length})`,
    });
  }

  // 6. パターン抽出実行
  const result = await extractPatterns(topEpisodes, bottomEpisodes);

  // 7. 発見パターンをDBに保存
  let insertedCount = 0;
  for (const pattern of result.patterns) {
    const { error: insertError } = await supabase
      .from("discovered_patterns")
      .insert({
        finding: pattern.finding,
        pattern_type: pattern.pattern_type,
        genre: pattern.genre,
        confidence: pattern.confidence,
        sample_size: topEpisodes.length + bottomEpisodes.length,
        actionable_rule: pattern.actionable_rule,
        status: "hypothesis",
      });
    if (!insertError) insertedCount++;
  }

  // 8. パターン抽出後、A/Bテストを自動設計
  const abResult = await designAndCreateABTests();

  return NextResponse.json({
    success: true,
    patterns_discovered: result.patterns.length,
    patterns_inserted: insertedCount,
    ab_tests_created: abResult.testsCreated,
    ab_test_designs: abResult.designs,
    meta: result.meta,
    extracted_at: new Date().toISOString(),
  });
}
