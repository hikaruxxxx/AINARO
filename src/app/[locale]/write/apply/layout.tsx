import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth";

/**
 * 作家登録ページのガード:
 * - 未ログイン → /login へ（戻り先として apply を渡す）
 * - メール未認証 → /login へ（Magic Link で再度ログインさせる）
 */
export default async function WriterApplyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const user = await getUser();

  if (!user) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/write/apply`)}`);
  }

  if (!user.email_confirmed_at) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/write/apply`)}&error=email_not_confirmed`);
  }

  return <>{children}</>;
}
