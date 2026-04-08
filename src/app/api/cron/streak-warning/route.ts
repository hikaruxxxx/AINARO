import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/cron-auth";
import { sendPush } from "@/lib/web-push";

// GET /api/cron/streak-warning
// 当日まだログインボーナス未受け取りで、ストリークが3日以上ある (=失うものがある) ユーザーに
// 「ストリーク途切れ警告」プッシュを送る。Vercel Cron で 21:00 JST (12:00 UTC) 起動。
//
// EXIT戦略v5: 継続率(D1/D7/M3)を伸ばす依存設計の一環。
export async function GET(req: NextRequest) {
  const unauthorized = verifyCronAuth(req);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();

  // 今日まだログインしていない & ストリーク3日以上のユーザー
  const today = new Date().toISOString().split("T")[0];
  const { data: atRisk, error } = await admin
    .from("user_points")
    .select("user_id, current_streak, last_login_bonus_at")
    .gte("current_streak", 3)
    .or(`last_login_bonus_at.is.null,last_login_bonus_at.lt.${today}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!atRisk || atRisk.length === 0) {
    return NextResponse.json({ targeted: 0, sent: 0, gone: 0 });
  }

  // 対象ユーザーの push 購読を取得
  const userIds = atRisk.map((u) => u.user_id);
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  let sent = 0;
  let gone = 0;
  const goneIds: string[] = [];

  // ユーザーIDからストリーク値を引けるよう Map 化
  const streakByUser = new Map(atRisk.map((u) => [u.user_id, u.current_streak]));

  for (const sub of subs ?? []) {
    const streak = streakByUser.get(sub.user_id) ?? 0;
    const result = await sendPush(
      {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
      {
        title: `🔥 ${streak}日連続が途切れます`,
        body: `今日まだログインしていません。続きを読んでストリークを継続しましょう。`,
        url: "/",
        tag: "streak-warning",
      },
    );

    if (result.success) {
      sent++;
    } else if (result.gone) {
      gone++;
      goneIds.push(sub.id);
    }
  }

  // 失効した購読を削除
  if (goneIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", goneIds);
  }

  return NextResponse.json({
    targeted: atRisk.length,
    subscriptions: subs?.length ?? 0,
    sent,
    gone,
  });
}
