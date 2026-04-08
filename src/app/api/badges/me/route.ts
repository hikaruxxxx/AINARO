import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 自分の獲得バッジ + 全バッジマスタを返す
// 未獲得バッジも表示するため badges 全件 + user_badges を JOIN
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ authenticated: false, badges: [] });
  }

  // 全バッジマスタ
  const { data: allBadges } = await supabase
    .from("badges")
    .select("id, name, description, category, icon, tier, threshold, display_order")
    .order("display_order", { ascending: true });

  // 自分が獲得済みのバッジID
  const { data: ownedRows } = await supabase
    .from("user_badges")
    .select("badge_id, earned_at")
    .eq("user_id", user.id);

  const ownedMap = new Map<string, string>();
  for (const row of ownedRows ?? []) {
    ownedMap.set(row.badge_id, row.earned_at);
  }

  const badges = (allBadges ?? []).map((b) => ({
    ...b,
    earned: ownedMap.has(b.id),
    earned_at: ownedMap.get(b.id) ?? null,
  }));

  return NextResponse.json({
    authenticated: true,
    badges,
    earned_count: ownedMap.size,
    total_count: badges.length,
  });
}
