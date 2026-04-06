import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";
import type { LoopStats } from "@/types/learning-loop";

/**
 * 学習ループ統計API
 * ダッシュボードで使用
 */
export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const supabase = createAdminClient();

  // パターンのステータス別集計
  const { data: patterns } = await supabase
    .from("discovered_patterns")
    .select("status");

  const patternsByStatus: Record<string, number> = {
    hypothesis: 0, testing: 0, confirmed: 0, rejected: 0, retired: 0,
  };
  if (patterns) {
    for (const p of patterns) {
      patternsByStatus[p.status] = (patternsByStatus[p.status] || 0) + 1;
    }
  }

  // 実行中のA/Bテスト数
  const { count: activeTests } = await supabase
    .from("ab_tests")
    .select("*", { count: "exact", head: true })
    .eq("status", "running");

  // quality_signal の全体平均
  const { data: signalAvg } = await supabase
    .from("episode_signals")
    .select("quality_signal")
    .not("quality_signal", "is", null);

  const avgSignal = signalAvg && signalAvg.length > 0
    ? signalAvg.reduce((sum, s) => sum + (s.quality_signal ?? 0), 0) / signalAvg.length
    : null;

  // quality_signal の週次推移（直近12週）
  const { data: weeklySignals } = await supabase
    .from("episode_signals")
    .select("quality_signal, calculated_at")
    .not("quality_signal", "is", null)
    .order("calculated_at", { ascending: true });

  const weeklyTrend: { week: string; avg_signal: number }[] = [];
  if (weeklySignals && weeklySignals.length > 0) {
    const byWeek = new Map<string, number[]>();
    for (const s of weeklySignals) {
      const date = new Date(s.calculated_at);
      // ISO週の月曜日を算出
      const day = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((day + 6) % 7));
      const weekKey = monday.toISOString().split("T")[0];
      if (!byWeek.has(weekKey)) byWeek.set(weekKey, []);
      byWeek.get(weekKey)!.push(s.quality_signal ?? 0);
    }
    const sortedWeeks = Array.from(byWeek.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [week, values] of sortedWeeks.slice(-12)) {
      weeklyTrend.push({
        week,
        avg_signal: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
      });
    }
  }

  // 探索枠 vs 通常枠の比較
  const { data: metaWithSignals } = await supabase
    .from("episode_generation_meta")
    .select("is_exploration, episode_id");

  let explorationAvg: number | null = null;
  let normalAvg: number | null = null;

  if (metaWithSignals && metaWithSignals.length > 0) {
    const explorationIds = metaWithSignals.filter(m => m.is_exploration).map(m => m.episode_id);
    const normalIds = metaWithSignals.filter(m => !m.is_exploration).map(m => m.episode_id);

    if (explorationIds.length > 0) {
      const { data: expSignals } = await supabase
        .from("episode_signals")
        .select("quality_signal")
        .in("episode_id", explorationIds)
        .not("quality_signal", "is", null);
      if (expSignals && expSignals.length > 0) {
        explorationAvg = expSignals.reduce((s, e) => s + (e.quality_signal ?? 0), 0) / expSignals.length;
      }
    }
    if (normalIds.length > 0) {
      const { data: normSignals } = await supabase
        .from("episode_signals")
        .select("quality_signal")
        .in("episode_id", normalIds)
        .not("quality_signal", "is", null);
      if (normSignals && normSignals.length > 0) {
        normalAvg = normSignals.reduce((s, e) => s + (e.quality_signal ?? 0), 0) / normSignals.length;
      }
    }
  }

  const stats: LoopStats = {
    last_signal_computation: null, // TODO: cron実行ログから取得
    last_pattern_extraction: null,
    last_pattern_update: null,
    total_patterns: patterns?.length ?? 0,
    patterns_by_status: patternsByStatus as LoopStats["patterns_by_status"],
    active_ab_tests: activeTests ?? 0,
    avg_quality_signal: avgSignal ? Math.round(avgSignal * 100) / 100 : null,
    quality_signal_trend: weeklyTrend,
    exploration_vs_normal: {
      exploration_avg: explorationAvg ? Math.round(explorationAvg * 100) / 100 : null,
      normal_avg: normalAvg ? Math.round(normalAvg * 100) / 100 : null,
    },
  };

  return NextResponse.json(stats);
}
