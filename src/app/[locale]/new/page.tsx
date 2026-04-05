import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchRecentEpisodes } from "@/lib/data";
import { formatRelativeTime } from "@/lib/utils/format";

export const revalidate = 300;

export async function generateMetadata() {
  const t = await getTranslations("pages");
  return {
    title: t("newEpisodes"),
    description: t("newEpisodesDescription"),
  };
}

export default async function NewEpisodesPage() {
  const locale = await getLocale();
  const t = await getTranslations();
  const episodes = await fetchRecentEpisodes(30, locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("pages.newEpisodes")}</h1>

      {episodes.length === 0 ? (
        <p className="py-12 text-center text-muted">{t("pages.noNewEpisodes")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {episodes.map((ep) => (
            <li key={ep.id}>
              <Link
                href={`/novels/${ep.novel_slug}/${ep.episode_number}`}
                className="block py-4 transition hover:bg-surface"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">{ep.novel_title}</p>
                    <h2 className="mt-0.5 font-bold text-text">
                      {t("episode.epTitle", { num: ep.episode_number, title: ep.title })}
                    </h2>
                    <div className="mt-1 flex gap-3 text-xs text-muted">
                      <span>{t("episode.charCount", { count: ep.character_count.toLocaleString() })}</span>
                      <span>{formatRelativeTime(ep.published_at, locale)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
