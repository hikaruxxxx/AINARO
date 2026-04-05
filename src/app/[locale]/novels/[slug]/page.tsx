import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchNovelBySlug, fetchEpisodes, fetchRelatedNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import ContinueReadingButton from "@/components/novel/ContinueReadingButton";
import { formatCharCount, formatDate } from "@/lib/utils/format";
import type { Metadata } from "next";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string; locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const novel = await fetchNovelBySlug(slug);
  if (!novel) return {};

  const description = [novel.tagline, novel.synopsis?.slice(0, 100)].filter(Boolean).join(" ");
  return {
    title: novel.title,
    description,
    openGraph: {
      title: novel.title,
      description,
      images: novel.cover_image_url ? [novel.cover_image_url] : [],
    },
  };
}

export default async function NovelDetailPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations();
  const novel = await fetchNovelBySlug(slug, locale);
  if (!novel) notFound();

  const [episodes, relatedNovels] = await Promise.all([
    fetchEpisodes(novel.id, locale),
    fetchRelatedNovels({ id: novel.id, genre: novel.genre, tags: novel.tags }, 3, locale),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* 作品ヘッダー */}
      <section className="mb-8 flex flex-col gap-6 sm:flex-row">
        <div className="mx-auto h-48 w-32 flex-shrink-0 rounded-lg bg-surface flex items-center justify-center overflow-hidden sm:mx-0">
          {novel.cover_image_url ? (
            <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl text-muted">📖</span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-2xl font-bold">{novel.title}</h1>
          {novel.tagline && <p className="text-sm text-muted">{novel.tagline}</p>}
          <p className="text-sm text-muted">{t("novel.author", { name: novel.author_name })}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/genre/${novel.genre}`}>
              <GenreBadge genre={novel.genre} />
            </Link>
            <StatusBadge status={novel.status} />
            {novel.tags.map((tag) => (
              <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`} className="rounded bg-surface px-2 py-0.5 text-xs text-muted hover:text-text transition">#{tag}</Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <span>{t("novel.episodes", { count: novel.total_chapters })}</span>
            <span>{formatCharCount(novel.total_characters, locale)}</span>
          </div>
          {episodes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href={`/novels/${slug}/1`}
                className="inline-block w-fit rounded-full bg-secondary px-6 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                {t("novel.readFromEp1")}
              </Link>
              <ContinueReadingButton novelId={novel.id} slug={slug} totalChapters={novel.total_chapters} />
            </div>
          )}
        </div>
      </section>

      {/* あらすじ */}
      {novel.synopsis && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-bold">{t("novel.synopsis")}</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{novel.synopsis}</p>
        </section>
      )}

      {/* 目次 */}
      <section>
        <h2 className="mb-4 text-lg font-bold">{t("novel.toc")}</h2>
        {episodes.length === 0 ? (
          <p className="text-sm text-muted">{t("novel.noEpisodes")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {episodes.map((ep) => (
              <li key={ep.id}>
                <Link
                  href={`/novels/${slug}/${ep.episode_number}`}
                  className="flex items-center justify-between gap-4 py-3 transition hover:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-muted">{t("episode.epNumber", { num: ep.episode_number })}</span>
                    <p className="truncate font-medium">{ep.title}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3 text-xs text-muted">
                    <span>{t("episode.charCount", { count: ep.character_count.toLocaleString() })}</span>
                    <span>{formatDate(ep.published_at, locale)}</span>
                    {!ep.is_free && <span className="text-secondary">🔒</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 関連作品 */}
      {relatedNovels.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-bold">{t("novel.relatedNovels")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {relatedNovels.map((related) => (
              <Link
                key={related.id}
                href={`/novels/${related.slug}`}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 transition hover:bg-surface"
              >
                <div className="mx-auto h-28 w-20 rounded bg-surface flex items-center justify-center overflow-hidden">
                  {related.cover_image_url ? (
                    <img src={related.cover_image_url} alt={related.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl text-muted">📖</span>
                  )}
                </div>
                <h3 className="text-center text-sm font-medium leading-tight line-clamp-2">{related.title}</h3>
                <div className="flex justify-center gap-2">
                  <GenreBadge genre={related.genre} />
                  <span className="text-xs text-muted">{t("novel.episodes", { count: related.total_chapters })}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
