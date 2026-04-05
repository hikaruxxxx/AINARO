import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/ab-tests/[id] — テスト詳細（バリアント・結果含む）
export async function GET(_req: NextRequest, { params }: Params) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const supabase = createAdminClient();

  const [testRes, variantsRes, assignmentsRes] = await Promise.all([
    supabase
      .from("ab_tests")
      .select("*, episodes(episode_number, title), novels(title, slug)")
      .eq("id", id)
      .single(),
    supabase
      .from("episode_variants")
      .select("*")
      .eq("ab_test_id", id),
    supabase
      .from("ab_assignments")
      .select("variant_id")
      .eq("ab_test_id", id),
  ]);

  if (testRes.error || !testRes.data) {
    return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });
  }

  // バリアントごとの割り当て数
  const assignmentCounts: Record<string, number> = {};
  for (const a of assignmentsRes.data || []) {
    assignmentCounts[a.variant_id] = (assignmentCounts[a.variant_id] || 0) + 1;
  }

  // テストがrunning/completedならreading_eventsから結果集計
  let results: Record<string, Record<string, number>> | null = null;
  if (testRes.data.status !== "draft") {
    results = await aggregateTestResults(supabase, id, testRes.data.episode_id);
  }

  return NextResponse.json({
    test: testRes.data,
    variants: variantsRes.data || [],
    assignment_counts: assignmentCounts,
    results,
  });
}

// PATCH /api/admin/ab-tests/[id] — テスト状態更新（start / complete）
export async function PATCH(req: NextRequest, { params }: Params) {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const { id } = await params;
  const supabase = createAdminClient();
  const body = await req.json();
  const { action, winner_variant } = body;

  if (action === "start") {
    const { data, error } = await supabase
      .from("ab_tests")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft")
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ test: data });
  }

  if (action === "complete") {
    // 結果集計
    const { data: test } = await supabase
      .from("ab_tests")
      .select("episode_id")
      .eq("id", id)
      .single();

    if (!test) return NextResponse.json({ error: "テストが見つかりません" }, { status: 404 });

    const results = await aggregateTestResults(supabase, id, test.episode_id);

    const { data, error } = await supabase
      .from("ab_tests")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        winner_variant: winner_variant || null,
        results,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ test: data, results });
  }

  return NextResponse.json({ error: "不正なactionです" }, { status: 400 });
}

// バリアントごとの読書指標を集計
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aggregateTestResults(supabase: any, testId: string, episodeId: string) {
  // reading_eventsからバリアント別に集計
  const { data: events } = await supabase
    .from("reading_events")
    .select("event_type, variant_id, reading_time_sec, scroll_depth, session_id")
    .eq("episode_id", episodeId)
    .not("variant_id", "is", null);

  if (!events || events.length === 0) return null;

  // バリアントごとに分離して集計
  const byVariant: Record<string, typeof events> = {};
  for (const e of events) {
    const vid = e.variant_id || "unknown";
    if (!byVariant[vid]) byVariant[vid] = [];
    byVariant[vid].push(e);
  }

  const results: Record<string, Record<string, number>> = {};
  for (const [variantId, variantEvents] of Object.entries(byVariant)) {
    const starts = variantEvents.filter((e: { event_type: string }) => e.event_type === "start").length;
    const completes = variantEvents.filter((e: { event_type: string }) => e.event_type === "complete").length;
    const nexts = variantEvents.filter((e: { event_type: string }) => e.event_type === "next").length;
    const bookmarks = variantEvents.filter((e: { event_type: string }) => e.event_type === "bookmark").length;
    const uniqueSessions = new Set(variantEvents.map((e: { session_id: string }) => e.session_id)).size;

    const completeDurations = variantEvents
      .filter((e: { event_type: string; reading_time_sec: number | null }) => e.event_type === "complete" && e.reading_time_sec != null)
      .map((e: { reading_time_sec: number }) => e.reading_time_sec);

    results[variantId] = {
      starts,
      completes,
      nexts,
      bookmarks,
      unique_sessions: uniqueSessions,
      completion_rate: starts > 0 ? completes / starts : 0,
      next_episode_rate: completes > 0 ? nexts / completes : 0,
      bookmark_rate: uniqueSessions > 0 ? bookmarks / uniqueSessions : 0,
      avg_read_duration:
        completeDurations.length > 0
          ? completeDurations.reduce((a: number, b: number) => a + b, 0) / completeDurations.length
          : 0,
    };
  }

  return results;
}
