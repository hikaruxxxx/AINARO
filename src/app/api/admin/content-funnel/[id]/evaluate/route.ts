import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/content-funnel/[id]/evaluate
// パイロット版の読者データからスコアを自動算出してcontent_candidatesを更新
export async function POST(_req: NextRequest, { params }: Params) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const supabase = createAdminClient();

  // 候補を取得
  const { data: candidate } = await supabase
    .from("content_candidates")
    .select("novel_id, pilot_episodes")
    .eq("id", id)
    .single();

  if (!candidate || !candidate.novel_id) {
    return NextResponse.json(
      { error: "候補にnovel_idが設定されていません。パイロット版を作品として登録してください。" },
      { status: 400 }
    );
  }

  // パイロット版の全エピソードのreading_eventsを集計
  const { data: events } = await supabase
    .from("reading_events")
    .select("event_type, reading_time_sec, session_id")
    .eq("novel_id", candidate.novel_id);

  if (!events || events.length === 0) {
    return NextResponse.json(
      { error: "読者データがまだありません" },
      { status: 400 }
    );
  }

  const starts = events.filter((e) => e.event_type === "start").length;
  const completes = events.filter((e) => e.event_type === "complete").length;
  const nexts = events.filter((e) => e.event_type === "next").length;
  const bookmarks = events.filter((e) => e.event_type === "bookmark").length;
  const uniqueSessions = new Set(events.map((e) => e.session_id)).size;

  const completeDurations = events
    .filter((e) => e.event_type === "complete" && e.reading_time_sec != null)
    .map((e) => e.reading_time_sec!);
  const avgReadSec =
    completeDurations.length > 0
      ? completeDurations.reduce((a, b) => a + b, 0) / completeDurations.length
      : null;

  const completionRate = starts > 0 ? completes / starts : 0;
  const nextRate = completes > 0 ? nexts / completes : 0;
  const bookmarkRate = uniqueSessions > 0 ? bookmarks / uniqueSessions : 0;
  const pilotScore = completionRate * (1 + nextRate) * (1 + bookmarkRate);

  // 更新
  const { data: updated, error } = await supabase
    .from("content_candidates")
    .update({
      pilot_completion_rate: completionRate,
      pilot_next_rate: nextRate,
      pilot_bookmark_rate: bookmarkRate,
      pilot_avg_read_sec: avgReadSec,
      pilot_score: pilotScore,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    candidate: updated,
    raw_stats: {
      starts,
      completes,
      nexts,
      bookmarks,
      unique_sessions: uniqueSessions,
      avg_read_sec: avgReadSec,
    },
  });
}
