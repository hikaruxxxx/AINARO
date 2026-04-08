import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Magic Link / OAuth コールバックハンドラ
 * Supabase Auth から ?code=... で戻ってくるので、セッションに交換してリダイレクトする
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // ログイン後の戻り先（デフォルトはマイページ）
  const next = searchParams.get("next") || "/ja/mypage";

  if (!code) {
    return NextResponse.redirect(`${origin}/ja/login?error=missing_code`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/ja/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // 初回ログイン時に user_profiles を自動作成
  const user = data?.user;
  if (user) {
    try {
      const admin = createAdminClient();
      const { data: existing } = await admin
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) {
        const localPart = (user.email ?? "").split("@")[0] || "reader";
        await admin.from("user_profiles").insert({
          user_id: user.id,
          display_name: localPart.slice(0, 50),
          role: "reader",
          writer_status: "none",
        });
      }
    } catch (e) {
      console.error("[auth/callback] failed to create user_profile", e);
    }
  }

  return response;
}
