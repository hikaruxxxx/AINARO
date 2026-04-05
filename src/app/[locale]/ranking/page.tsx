import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchRankedNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import { GENRE_KEYS } from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
// PV表示は初期段階では非表示（データ蓄積後に復活）

export const revalidate = 3600;

export async function generateMetadata() {
  const t = await getTranslations("pages");
  return {
    title: t("ranking"),
    description: t("rankingDescription"),
  };
}

type Props = {
  searchParams: Promise<{ genre?: string }>;
};

export default async function RankingPage({ searchParams }: Props) {
  const { genre } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations();
  const novels = await fetchRankedNovels({ genre, limit: 50, locale });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-text">{t("pages.ranking")}</h1>
      <p className="mb-6 text-sm text-muted">{t("pages.rankingSubtitle")}</p>

      {/* ジャンルフィルター */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/ranking"
          className={`rounded-full px-3 py-1 text-sm transition ${
            !genre ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
          }`}
        >
          {t("pages.allGenres")}
        </Link>
        {GENRE_KEYS.map((id) => (
          <Link
            key={id}
            href={`/ranking?genre=${id}`}
            className={`rounded-full px-3 py-1 text-sm transition ${
              genre === id ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
            }`}
          >
            {t(`genre.${id}`)}
          </Link>
        ))}
      </div>

      {novels.length === 0 ? (
        <p className="py-12 text-center text-muted">{t("pages.noMatchingNovels")}</p>
      ) : (
        <ol className="divide-y divide-border">
          {novels.map((novel, index) => (
            <li key={novel.id}>
              <Link
                href={`/novels/${novel.slug}`}
                className="flex items-start gap-4 py-4 transition hover:bg-surface"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                  {index < 3 ? (
                    <span className={`text-2xl font-bold ${
                      index === 0 ? "text-yellow-500" : index === 1 ? "text-gray-400" : "text-amber-600"
                    }`}>{index + 1}</span>
                  ) : (
                    <span className="text-lg font-bold text-muted">{index + 1}</span>
                  )}
                </div>
                <div className="h-20 w-14 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                  {novel.cover_image_url ? (
                    <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl text-muted">📖</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate font-bold text-text">{novel.title}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <GenreBadge genre={novel.genre} />
                    <StatusBadge status={novel.status} />
                    <span className="text-xs text-muted">{novel.author_name}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <span>{t("novel.episodes", { count: novel.total_chapters })}</span>
                    {novel.avg_completion_rate != null && (
                      <span>{t("pages.completionRate", { rate: (novel.avg_completion_rate * 100).toFixed(0) })}</span>
                    )}
                    {novel.avg_next_episode_rate != null && (
                      <span>{t("pages.nextEpRate", { rate: (novel.avg_next_episode_rate * 100).toFixed(0) })}</span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
