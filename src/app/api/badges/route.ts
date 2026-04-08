import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/badges — 全バッジマスタ + ログインユーザーの獲得状況
export async function GET() {
  const admin = createAdminClient();

  // 全バッジマスタ
  const { data: badges, error: badgesError } = await admin
    .from("badges")
    .select("*")
    .order("display_order", { ascending: true });

  if (badgesError) {
    return NextResponse.json({ error: badgesError.message }, { status: 500 });
  }

  // ログインユーザーの獲得済みバッジ
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let earnedIds = new Set<string>();
  if (user) {
    const { data: earned } = await admin
      .from("user_badges")
      .select("badge_id, earned_at")
      .eq("user_id", user.id);
    earnedIds = new Set((earned ?? []).map((r) => r.badge_id));
  }

  return NextResponse.json({
    badges: (badges ?? []).map((b) => ({
      ...b,
      earned: earnedIds.has(b.id),
    })),
    authenticated: !!user,
  });
}
