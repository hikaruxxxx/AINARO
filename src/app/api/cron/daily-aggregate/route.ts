import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

/**
 * 日次集計Cron (UTC 3:00 = JST 12:00)
 * 既存の aggregate_and_log() SQL関数を呼び出し、daily_statsを更新
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // aggregate_and_log() は対象日の reading_events を daily_stats に集計する
  const { data, error } = await supabase.rpc("aggregate_and_log", {
    target_date: today,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // novel_scores マテリアライズドビューもリフレッシュ
  const { error: refreshError } = await supabase.rpc("refresh_novel_scores");

  return NextResponse.json({
    success: true,
    date: today,
    aggregate_result: data,
    scores_refreshed: !refreshError,
  });
}
