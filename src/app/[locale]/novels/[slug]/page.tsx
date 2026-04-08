import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchNovelBySlug, fetchEpisodeToc, fetchRelatedNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import ContinueReadingButton from "@/components/novel/ContinueReadingButton";
import FollowButton from "@/components/novel/FollowButton";
import BookmarkButton from "@/components/novel/BookmarkButton";
import ShareButton from "@/components/novel/ShareButton";
import { ContentWarningBadges } from "@/components/novel/ContentWarning";
import PushNotificationButton from "@/components/novel/PushNotificationButton";
import TocPagination from "@/components/novel/TocPagination";
import { formatCharCount, formatDate } from "@/lib/utils/format";
import type { Metadata } from "next";

const COVER_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-rose-500 to-orange-500",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
];

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string; locale: string }>; searchParams: Promise<{ page?: string }> };

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

const EPISODES_PER_PAGE = 50;

export default async function NovelDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, Number(pageParam) || 1);
  const locale = await getLocale();
  const t = await getTranslations();
  const novel = await fetchNovelBySlug(slug, locale);
  if (!novel) notFound();

  const [{ episodes, total }, relatedNovels] = await Promise.all([
    fetchEpisodeToc(novel.id, currentPage, EPISODES_PER_PAGE, locale),
    fetchRelatedNovels({ id: novel.id, genre: novel.genre, tags: novel.tags }, 3, locale),
  ]);
  const totalPages = Math.ceil(total / EPISODES_PER_PAGE);
  const genreHash = novel.genre.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  return (
    <div>
      {/* ヒーロー */}
      <section className="relative overflow-hidden bg-gradient-to-b from-gray-900 to-gray-800">
        {novel.cover_image_url ? (
          <img src={novel.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 blur-sm" />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${COVER_GRADIENTS[genreHash % COVER_GRADIENTS.length]} opacity-30`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/70 to-transparent" />

        <div className="relative mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-10 pt-20 sm:flex-row sm:items-end sm:gap-8 md:px-8">
          {/* カバー */}
          <div className="mx-auto h-56 w-40 flex-shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 sm:mx-0">
            {novel.cover_image_url ? (
              <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
            ) : (
              <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${COVER_GRADIENTS[genreHash % COVER_GRADIENTS.length]}`}>
                <span className="px-4 text-center text-lg font-bold leading-tight text-white/90">{novel.title}</span>
              </div>
            )}
          </div>

          {/* メタ情報 */}
          <div className="flex-1 text-center sm:text-left">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <GenreBadge genre={novel.genre} />
              <StatusBadge status={novel.status} />
              {novel.tags.map((tag) => (
                <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`} className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/70 transition hover:bg-white/20">#{tag}</Link>
              ))}
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white md:text-3xl">{novel.title}</h1>
            {novel.tagline && <p className="mb-3 text-sm text-white/60">{novel.tagline}</p>}
            <p className="mb-4 text-sm text-white/50">
              {t("novel.author", { name: novel.author_name })} · {t("novel.episodes", { count: novel.total_chapters })} · {formatCharCount(novel.total_characters, locale)}
            </p>
            {/* 完結を約束する: 完結作品は推定読書時間と完結ラベルを表示 (philosophy §3.7) */}
            {novel.status === "complete" && novel.total_characters > 0 && (() => {
              // 日本語の標準読書速度: 約600字/分
              const totalMinutes = Math.round(novel.total_characters / 600);
              const label = totalMinutes >= 60
                ? t("novel.readingTimeHours", { hours: Math.round(totalMinutes / 60) })
                : t("novel.readingTimeMinutes", { minutes: Math.max(1, totalMinutes) });
              return (
                <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200 ring-1 ring-emerald-400/30">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>{t("novel.completedPromise")} · {label}</span>
                </p>
              );
            })()}
            {novel.content_warnings && novel.content_warnings.length > 0 && (
              <div className="mb-4">
                <ContentWarningBadges warnings={novel.content_warnings} />
              </div>
            )}

            {/* CTAボタン */}
            {episodes.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <Link
                  href={`/novels/${slug}/1`}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-gray-900 shadow-lg transition hover:bg-white/90"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {t("novel.readFromEp1")}
                </Link>
                <ContinueReadingButton novelId={novel.id} slug={slug} totalChapters={novel.total_chapters} />
              </div>
            )}

            {/* ソーシャルボタン */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <FollowButton novelId={novel.id} />
              <PushNotificationButton />
              <BookmarkButton novelId={novel.id} size="sm" />
              <ShareButton title={novel.title} text={novel.tagline || undefined} />
            </div>
          </div>
        </div>
      </section>

      {/* メインコンテンツ */}
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        {/* あらすじ */}
        {novel.synopsis && (
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-bold text-text">{t("novel.synopsis")}</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{novel.synopsis}</p>
          </section>
        )}

        {/* 目次 */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-text">{t("novel.toc")}</h2>
          {episodes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">{t("novel.noEpisodes")}</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border">
                <ul className="divide-y divide-border">
                  {episodes.map((ep) => (
                    <li key={ep.episode_number}>
                      <Link
                        href={`/novels/${slug}/${ep.episode_number}`}
                        className="flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-surface"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-muted">
                              {ep.episode_number}
                            </span>
                            <p className="truncate text-sm font-medium text-text">{ep.title}</p>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-3 text-xs text-muted">
                          <span className="hidden sm:inline">{formatDate(ep.published_at, locale)}</span>
                          {!ep.is_free && <span className="text-secondary">🔒</span>}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              {totalPages > 1 && (
                <TocPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  slug={slug}
                />
              )}
            </>
          )}
        </section>

        {/* 関連作品 */}
        {relatedNovels.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-bold text-text">{t("novel.relatedNovels")}</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {relatedNovels.map((related, i) => (
                <Link
                  key={related.id}
                  href={`/novels/${related.slug}`}
                  className="group flex w-36 flex-shrink-0 flex-col md:w-44"
                >
                  <div className="relative mb-2.5 aspect-[2/3] w-full overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover:shadow-lg group-hover:-translate-y-1">
                    {related.cover_image_url ? (
                      <img src={related.cover_image_url} alt={related.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${COVER_GRADIENTS[i % COVER_GRADIENTS.length]}`}>
                        <span className="px-3 text-center text-sm font-bold leading-tight text-white/90 line-clamp-3">{related.title}</span>
                      </div>
                    )}
                  </div>
                  <h3 className="mb-0.5 text-sm font-medium leading-tight text-text line-clamp-2 transition-colors group-hover:text-primary">{related.title}</h3>
                  <span className="text-xs text-muted">{t("novel.episodes", { count: related.total_chapters })}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
