import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/points — 現在のポイント残高を取得
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ balance: 0, authenticated: false });
  }

  const { data, error } = await supabase
    .from("user_points")
    .select("balance, total_earned, total_spent, last_login_bonus_at")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({
      balance: 0,
      total_earned: 0,
      total_spent: 0,
      last_login_bonus_at: null,
      authenticated: true,
    });
  }

  return NextResponse.json({ ...data, authenticated: true });
}
