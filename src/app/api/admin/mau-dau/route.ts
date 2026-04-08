import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

// MAU/DAU ダッシュボードAPI
// v2 主KPI: MAU(ログイン読者) と DAU/MAU比
// 設計参照: docs/strategy/product_philosophy.md v2 §1
export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const supabase = createAdminClient();

  // 過去30日のサマリー (MAU/DAU平均/比率)
  const { data: summary, error: sErr } = await supabase.rpc("mau_summary", {
    p_days_back: 30,
  });

  // 過去30日の日次推移
  const { data: daily, error: dErr } = await supabase.rpc("dau_daily", {
    p_days_back: 30,
  });

  if (sErr || dErr) {
    return NextResponse.json(
      { error: sErr?.message || dErr?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    summary: summary?.[0] ?? null,
    daily: daily ?? [],
  });
}
