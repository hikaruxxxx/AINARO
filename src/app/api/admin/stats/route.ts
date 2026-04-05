import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 統計データ取得API
// reading_events から直接集計（daily_stats が溜まるまではリアルタイム集計）
export async function GET(req: NextRequest) {
  const supabase = createAdminClient();

  const { searchParams } = new URL(req.url);
  const novelId = searchParams.get("novel_id");
  const days = Math.min(Number(searchParams.get("days") || "7"), 90);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  // 1. 作品一覧（PV順）
  const { data: novels } = await supabase
    .from("novels")
    .select("id, slug, title, total_pv, total_bookmarks, total_chapters")
    .order("total_pv", { ascending: false });

  // 2. reading_events からイベント集計
  let eventsQuery = supabase
    .from("reading_events")
    .select("*")
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false });

  if (novelId) {
    eventsQuery = eventsQuery.eq("novel_id", novelId);
  }

  const { data: events } = await eventsQuery.limit(10000);

  // 3. エピソード情報を取得（話数・タイトル表示用）
  let episodesQuery = supabase
    .from("episodes")
    .select("id, novel_id, episode_number, title, pv");
  if (novelId) {
    episodesQuery = episodesQuery.eq("novel_id", novelId);
  }
  const { data: episodes } = await episodesQuery.order("episode_number", { ascending: true });

  // エピソードIDから情報を引けるマップ
  const episodeMap = new Map<string, { episode_number: number; title: string; novel_id: string; pv: number }>();
  for (const ep of episodes || []) {
    episodeMap.set(ep.id, { episode_number: ep.episode_number, title: ep.title, novel_id: ep.novel_id, pv: ep.pv });
  }

  // 4. イベントを集計
  const stats = aggregateEvents(events || [], episodeMap);

  // 5. daily_stats があればそちらも返す
  let dailyQuery = supabase
    .from("daily_stats")
    .select("*")
    .gte("date", since.toISOString().split("T")[0])
    .order("date", { ascending: true });

  if (novelId) {
    dailyQuery = dailyQuery.eq("novel_id", novelId);
  }

  const { data: dailyStats } = await dailyQuery;

  return NextResponse.json({
    novels: novels || [],
    realtime: stats,
    daily: dailyStats || [],
  });
}

type Event = {
  novel_id: string;
  episode_id: string;
  event_type: string;
  scroll_depth: number | null;
  reading_time_sec: number | null;
  session_id: string;
  created_at: string;
};

type EpisodeInfo = { episode_number: number; title: string; novel_id: string; pv: number };

// イベントを作品×エピソード単位で集計
function aggregateEvents(events: Event[], episodeMap: Map<string, EpisodeInfo>) {
  // 全体サマリー
  const totalStarts = events.filter((e) => e.event_type === "start").length;
  const totalCompletes = events.filter((e) => e.event_type === "complete").length;
  const totalNexts = events.filter((e) => e.event_type === "next").length;
  const totalDrops = events.filter((e) => e.event_type === "drop").length;
  const uniqueSessions = new Set(events.map((e) => e.session_id)).size;

  const completionRate = totalStarts > 0 ? totalCompletes / totalStarts : null;
  const nextEpisodeRate = totalCompletes > 0 ? totalNexts / totalCompletes : null;
  const dropRate = totalStarts > 0 ? totalDrops / totalStarts : null;

  // 平均滞在時間（completeイベントのみ）
  const completeDurations = events
    .filter((e) => e.event_type === "complete" && e.reading_time_sec != null)
    .map((e) => e.reading_time_sec!);
  const avgReadDuration =
    completeDurations.length > 0
      ? completeDurations.reduce((a, b) => a + b, 0) / completeDurations.length
      : null;

  // エピソード別集計
  const byEpisode = new Map<string, Event[]>();
  for (const e of events) {
    const key = e.episode_id;
    if (!byEpisode.has(key)) byEpisode.set(key, []);
    byEpisode.get(key)!.push(e);
  }

  const episodeStats = Array.from(byEpisode.entries()).map(([episodeId, eps]) => {
    const starts = eps.filter((e) => e.event_type === "start").length;
    const completes = eps.filter((e) => e.event_type === "complete").length;
    const nexts = eps.filter((e) => e.event_type === "next").length;
    const drops = eps.filter((e) => e.event_type === "drop").length;

    // スクロール深度の分布（ヒートマップデータ）
    const scrollDepths = eps
      .filter((e) => e.scroll_depth != null && ["complete", "drop", "progress"].includes(e.event_type))
      .map((e) => e.scroll_depth!);
    const avgScrollDepth =
      scrollDepths.length > 0 ? scrollDepths.reduce((a, b) => a + b, 0) / scrollDepths.length : null;

    // スクロール深度を10%刻みでバケット化（ヒートマップ用）
    const scrollBuckets = Array(10).fill(0);
    for (const depth of scrollDepths) {
      const bucket = Math.min(9, Math.floor(depth * 10));
      scrollBuckets[bucket]++;
    }

    const info = episodeMap.get(episodeId);

    return {
      episode_id: episodeId,
      episode_number: info?.episode_number ?? null,
      episode_title: info?.title ?? null,
      starts,
      completes,
      nexts,
      drops,
      completion_rate: starts > 0 ? completes / starts : null,
      next_episode_rate: completes > 0 ? nexts / completes : null,
      drop_rate: starts > 0 ? drops / starts : null,
      avg_scroll_depth: avgScrollDepth,
      scroll_buckets: scrollBuckets, // ヒートマップ用: [0-10%, 10-20%, ..., 90-100%]
    };
  });

  return {
    total_events: events.length,
    unique_sessions: uniqueSessions,
    total_starts: totalStarts,
    total_completes: totalCompletes,
    total_nexts: totalNexts,
    total_drops: totalDrops,
    completion_rate: completionRate,
    next_episode_rate: nextEpisodeRate,
    drop_rate: dropRate,
    avg_read_duration_sec: avgReadDuration,
    by_episode: episodeStats,
  };
}
