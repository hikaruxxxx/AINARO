import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchNovelsByTag } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatCharCount, formatRelativeTime } from "@/lib/utils/format";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = { params: Promise<{ tagName: string; locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tagName } = await params;
  const tag = decodeURIComponent(tagName);
  const t = await getTranslations("pages");
  return {
    title: t("tagNovels", { tag }),
    description: t("tagNovelsDescription", { tag }),
  };
}

export default async function TagPage({ params }: Props) {
  const { tagName } = await params;
  const tag = decodeURIComponent(tagName);
  const locale = await getLocale();
  const t = await getTranslations();
  const novels = await fetchNovelsByTag(tag, locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link href="/novels" className="text-sm text-muted hover:text-text transition">
          {t("pages.backToNovels")}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text">{t("pages.tagLabel", { tag })}</h1>
      </div>

      {novels.length === 0 ? (
        <p className="py-12 text-center text-muted">{t("pages.noTagNovels")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {novels.map((novel) => (
            <li key={novel.id}>
              <Link href={`/novels/${novel.slug}`} className="flex gap-4 py-4 transition hover:bg-surface">
                <div className="h-24 w-16 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                  {novel.cover_image_url ? (
                    <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl text-muted">📖</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate font-bold text-text">{novel.title}</h2>
                  {novel.tagline && <p className="truncate text-xs text-muted">{novel.tagline}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <GenreBadge genre={novel.genre} />
                    <StatusBadge status={novel.status} />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <span>{t("novel.episodes", { count: novel.total_chapters })}</span>
                    <span>{formatCharCount(novel.total_characters, locale)}</span>
                    {novel.latest_chapter_at && (
                      <span>{t("novel.update", { time: formatRelativeTime(novel.latest_chapter_at, locale) })}</span>
                    )}
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
