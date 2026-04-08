import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// プッシュ通知購読の永続化
// ボディ: { endpoint, keys: { p256dh, auth } }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const endpoint: string | undefined = body?.endpoint;
    const p256dh: string | undefined = body?.keys?.p256dh;
    const auth: string | undefined = body?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "endpoint and keys.p256dh / keys.auth are required" },
        { status: 400 }
      );
    }

    // ログイン中なら user_id を紐付ける (未ログインも許容)
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();

    // RLSをバイパスして UPSERT (user_idが任意のため admin client を使う)
    const admin = createAdminClient();
    const { error } = await admin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user?.id ?? null,
          endpoint,
          p256dh,
          auth,
          user_agent: req.headers.get("user-agent") ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
