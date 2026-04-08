import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST /api/points/login-bonus — ログインボーナスを受け取る
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_login_bonus", {
    p_user_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // claim_login_bonus は JSONB を返す: { balance, bonus, current_streak, longest_streak, already_claimed }
  return NextResponse.json(data);
}
