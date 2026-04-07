import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/ja/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return response;
}
