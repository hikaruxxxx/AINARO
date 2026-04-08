import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * メール認証（Confirm signup / Magic Link / Recovery）共通ハンドラ
 * Supabase SSR 推奨の token_hash + verifyOtp 方式
 * メールテンプレート側で {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=... に書き換えて使う
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/ja/mypage";

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/ja/login?error=missing_params`);
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

  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) {
    return NextResponse.redirect(
      `${origin}/ja/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return response;
}
