import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Novel } from "@/types/novel";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  serial: { label: "連載中", dot: "bg-green-500" },
  complete: { label: "完結", dot: "bg-blue-500" },
  hiatus: { label: "休止", dot: "bg-gray-400" },
};

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const user = await getUser();

  const supabase = createAdminClient();
  const { data: novels } = await supabase
    .from("novels")
    .select("*")
    .eq("author_id", user!.id)
    .eq("author_type", "external")
    .order("updated_at", { ascending: false });

  const myNovels = (novels || []) as Novel[];

  return (
    <div>
      {/* ヘッダー */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text">{t("myNovels")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("novelCount", { count: myNovels.length })}
          </p>
        </div>
        <Link
          href="/dashboard/novels/new"
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("newNovel")}
        </Link>
      </div>

      {myNovels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center dark:border-gray-700 dark:bg-gray-900">
          <svg className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          <p className="mt-4 text-sm font-medium text-text">{t("noNovels")}</p>
          <p className="mt-1 text-sm text-muted">{t("noNovelsHint")}</p>
          <Link
            href="/dashboard/novels/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            {t("createFirst")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myNovels.map((novel) => {
            const status = STATUS_CONFIG[novel.status] || STATUS_CONFIG.serial;
            return (
              <div
                key={novel.id}
                className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-indigo-800"
              >
                <Link href={`/dashboard/novels/${novel.id}`} className="flex-1">
                  {novel.cover_image_url && (
                    <div className="mb-3 aspect-[3/1] overflow-hidden rounded-lg">
                      <img src={novel.cover_image_url} alt="" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <h3 className="mb-1 font-bold text-text group-hover:text-indigo-600 line-clamp-2">
                    {novel.title}
                  </h3>
                  <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    <span>{novel.total_chapters}{t("episodes")}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{t("pv")}: {novel.total_pv.toLocaleString()}</span>
                    <span>{t("bookmarks")}: {novel.total_bookmarks}</span>
                  </div>
                </Link>
                {/* クイックアクション: 通常の執筆者がすぐ次話を書けるように */}
                <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                  <Link
                    href={`/dashboard/novels/${novel.id}/episodes/new`}
                    className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-center text-xs font-medium text-white transition hover:bg-indigo-700"
                  >
                    + 次の話を書く
                  </Link>
                  <Link
                    href={`/dashboard/novels/${novel.id}`}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    管理
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
