import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatCharCount, formatRelativeTime } from "@/lib/utils/format";

const COVER_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-rose-500 to-orange-500",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-red-500",
  "from-violet-500 to-fuchsia-600",
];

export const revalidate = 3600;

export async function generateMetadata() {
  const t = await getTranslations("pages");
  return {
    title: t("novelsList"),
    description: t("novelsDescription"),
  };
}

export default async function NovelsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const locale = await getLocale();
  const t = await getTranslations();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const perPage = 30;
  const { novels, total } = await fetchNovels(locale, page, perPage);
  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <h1 className="mb-2 text-2xl font-bold text-text">{t("pages.novelsList")}</h1>
      <p className="mb-8 text-sm text-muted">
        {t("pages.novelsDescription")} ({total}作品)
      </p>

      {novels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="mb-4 text-5xl">📖</span>
          <p className="text-muted">{t("novel.noNovels")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {novels.map((novel, i) => (
            <Link
              key={novel.id}
              href={`/novels/${novel.slug}`}
              className="group flex flex-col"
            >
              {/* カバー */}
              <div className="relative mb-3 aspect-[2/3] w-full overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover:shadow-lg group-hover:ring-black/10 group-hover:-translate-y-1">
                {novel.cover_image_url ? (
                  <img
                    src={novel.cover_image_url}
                    alt={novel.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  /* カバー画像がない場合: タイトルは下のh2にあるのでアイコンのみ表示し二重表示を回避 */
                  <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${COVER_GRADIENTS[i % COVER_GRADIENTS.length]}`}>
                    <svg className="h-12 w-12 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </div>
                )}
                {/* オーバーレイ情報 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2.5">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={novel.status} />
                    <span className="text-[10px] text-white/80">
                      {t("novel.episodes", { count: novel.total_chapters })}
                    </span>
                  </div>
                </div>
              </div>

              {/* テキスト情報 */}
              <h2 className="mb-0.5 text-sm font-medium leading-tight text-text line-clamp-2 transition-colors group-hover:text-primary">
                {novel.title}
              </h2>
              <div className="flex items-center gap-1.5">
                <GenreBadge genre={novel.genre} />
              </div>
              {novel.latest_chapter_at && (
                <span className="mt-0.5 text-[11px] text-muted">
                  {t("novel.update", { time: formatRelativeTime(novel.latest_chapter_at, locale) })}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/novels?page=${page - 1}`}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-surface transition-colors"
            >
              ← 前へ
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/novels?page=${page + 1}`}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-surface transition-colors"
            >
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
