import { Link } from "@/i18n/navigation";
import { requireWriter } from "@/lib/supabase/auth";
import { getTranslations } from "next-intl/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireWriter();
  const t = await getTranslations("dashboard");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ダッシュボードヘッダー */}
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-indigo-600">
              Novelis
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <Link
                href="/dashboard"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                {t("navNovels")}
              </Link>
              <Link
                href="/dashboard/analytics"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                {t("navAnalytics")}
              </Link>
            </nav>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-500 transition hover:text-gray-700 dark:text-gray-400"
          >
            {t("backToSite")}
          </Link>
        </div>
      </header>

      {/* コンテンツ */}
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
