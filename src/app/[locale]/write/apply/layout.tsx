import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 作家登録ページのガード:
 * - 未ログイン → /login へ（戻り先として apply を渡す）
 * - メール未認証 → /login へ
 * - 既に作家承認済み → /dashboard へ（再登録不要）
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

  // 既に作家ならダッシュボードへ
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, writer_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.role === "writer" && profile.writer_status === "approved") {
    redirect(`/${locale}/dashboard`);
  }

  return <>{children}</>;
}
