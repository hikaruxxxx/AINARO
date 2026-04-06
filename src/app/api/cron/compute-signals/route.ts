import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";

/**
 * 品質シグナル算出Cron (UTC 4:00 = JST 13:00)
 * reading_eventsからepisode_signalsを算出・更新
 */
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const supabase = createAdminClient();

  // SQL関数でバッチ算出（最小サンプル数: 10）
  const { data, error } = await supabase.rpc("compute_episode_signals", {
    min_sample: 10,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data?.[0] ?? { episodes_updated: 0, episodes_skipped: 0 };

  return NextResponse.json({
    success: true,
    episodes_updated: result.episodes_updated,
    episodes_skipped: result.episodes_skipped,
    computed_at: new Date().toISOString(),
  });
}
