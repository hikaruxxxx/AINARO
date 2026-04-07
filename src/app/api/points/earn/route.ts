import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/points/earn — 読了・コメントなどでポイント獲得
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { type, reference_id } = await req.json();
  const admin = createAdminClient();

  // 獲得タイプごとのルール
  switch (type) {
    case "episode_complete": {
      if (!reference_id) {
        return NextResponse.json({ error: "reference_idが必要です" }, { status: 400 });
      }
      // 同じエピソードで既に獲得済みか確認
      const { data: existing } = await admin
        .from("point_transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "episode_complete")
        .eq("reference_id", reference_id)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({ earned: 0, reason: "このエピソードでは既に獲得済みです" });
      }

      const { data: newBalance, error: grantError } = await admin.rpc("grant_points", {
        p_user_id: user.id,
        p_amount: 1,
        p_type: "episode_complete",
        p_reference_id: reference_id,
        p_description: "エピソード読了ボーナス",
      });

      if (grantError) {
        return NextResponse.json({ error: grantError.message }, { status: 500 });
      }

      return NextResponse.json({ earned: 1, balance: newBalance });
    }

    case "comment": {
      // 1日1回制限
      const today = new Date().toISOString().split("T")[0];
      const { data: todayComment } = await admin
        .from("point_transactions")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "comment")
        .gte("created_at", `${today}T00:00:00`)
        .limit(1);

      if (todayComment && todayComment.length > 0) {
        return NextResponse.json({ earned: 0, reason: "コメントボーナスは1日1回までです" });
      }

      const { data: newBalance, error: grantError } = await admin.rpc("grant_points", {
        p_user_id: user.id,
        p_amount: 1,
        p_type: "comment",
        p_reference_id: reference_id ?? null,
        p_description: "コメントボーナス",
      });

      if (grantError) {
        return NextResponse.json({ error: grantError.message }, { status: 500 });
      }

      return NextResponse.json({ earned: 1, balance: newBalance });
    }

    default:
      return NextResponse.json({ error: "不正なタイプです" }, { status: 400 });
  }
}
