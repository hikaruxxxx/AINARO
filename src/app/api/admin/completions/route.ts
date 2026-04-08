import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/supabase/auth";

// 主KPI「完走者数」ダッシュボード用API
// - 月次の完走者数推移 (完結作品 / 連載追従の2系統)
// - 直近30日の作品別完走数トップ
//
// 設計参照: docs/strategy/product_philosophy.md 節3.1
//   主KPI = 完走者数(月次)。完結作品の最終話到達と連載作品の最新話追従を別系統で持つ
export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.authorized) return authCheck.response;

  const supabase = createAdminClient();

  // 月次完走者数 (過去6ヶ月)
  const { data: monthly, error: monthlyErr } = await supabase.rpc(
    "monthly_completion_stats",
    { p_months_back: 6 }
  );

  // 作品別完走数トップ20 (直近30日)
  const { data: topWorks, error: topErr } = await supabase.rpc(
    "top_completed_works",
    { p_limit: 20, p_days_back: 30 }
  );

  if (monthlyErr || topErr) {
    return NextResponse.json(
      { error: monthlyErr?.message || topErr?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    monthly: monthly ?? [],
    top_works: topWorks ?? [],
  });
}
