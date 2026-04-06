import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchRankedNovels, fetchRecentEpisodes } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import QualityBadge from "@/components/novel/QualityBadge";
import ContinueReadingSection from "@/components/novel/ContinueReadingSection";
import PersonalizedSection from "@/components/novel/PersonalizedSection";
import TasteOnboarding from "@/components/novel/TasteOnboarding";
import { formatRelativeTime } from "@/lib/utils/format";
import type { NovelScore } from "@/types/novel";

export const revalidate = 3600;

export default async function HomePage() {
  const locale = await getLocale();
  const t = await getTranslations("home");
  const tNovel = await getTranslations("novel");

  const novels = await fetchRankedNovels({ limit: 30, locale });

  if (novels.length === 0) {
    return (
      <div className="flex h-[80dvh] flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 text-5xl">📖</span>
        <h1 className="mb-2 text-2xl font-bold text-primary">Novelis</h1>
        <p className="text-muted">{tNovel("noNovels")}</p>
      </div>
    );
  }

  // ジャンル別に作品を分類
  const genreMap = new Map<string, NovelScore[]>();
  for (const novel of novels) {
    const list = genreMap.get(novel.genre) || [];
    list.push(novel);
    genreMap.set(novel.genre, list);
  }
  // 2作品以上あるジャンルのみセクション表示
  const genreSections = Array.from(genreMap.entries())
    .filter(([, list]) => list.length >= 2)
    .slice(0, 3);

  // 完結作品（一気読みにおすすめ）
  const completedNovels = novels.filter((n) => n.status === "complete").slice(0, 6);

  // 高評価作品（読了率・次話遷移率が高い）
  const highRated = novels
    .filter((n) => (n.avg_completion_rate ?? 0) >= 70)
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* テイストオンボーディング（初回訪問者のみ） */}
      <TasteOnboarding />

      {/* 1. 続きを読む（最重要: Netflixの「視聴中」） */}
      <ContinueReadingSection />

      {/* 2. ヒーローカード（最もスコアの高い作品） */}
      <section className="mb-8">
        <HeroCard novel={novels[0]} locale={locale} />
      </section>

      {/* 3. パーソナライズドレコメンド（読書履歴ベース） */}
      <PersonalizedSection allNovels={novels} />

      {/* 4. 高評価作品（品質シグナル付き） */}
      {highRated.length > 0 && (
        <HorizontalSection
          title={t("highlyRated")}
          novels={highRated}
          locale={locale}
          showQuality
        />
      )}

      {/* 5. ジャンル別セクション */}
      {genreSections.map(([genre, list]) => (
        <GenreSection key={genre} genre={genre} novels={list} locale={locale} />
      ))}

      {/* 6. 完結済み（一気読み向け） */}
      {completedNovels.length > 0 && (
        <HorizontalSection
          title={t("bingeWorthy")}
          novels={completedNovels}
          locale={locale}
        />
      )}

      {/* 7. 全作品一覧（フォールバック発見経路） */}
      <section className="mt-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text">{t("allNovels")}</h2>
          <Link href="/novels" className="text-sm text-secondary hover:underline">
            {t("viewAll")}
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {novels.slice(0, 10).map((novel) => (
            <li key={novel.id}>
              <Link
                href={`/novels/${novel.slug}`}
                className="flex gap-4 py-4 transition hover:bg-surface"
              >
                <div className="h-24 w-16 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                  {novel.cover_image_url ? (
                    <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl text-muted">📖</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h3 className="truncate font-bold text-text">{novel.title}</h3>
                  {novel.tagline && <p className="truncate text-xs text-muted">{novel.tagline}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <GenreBadge genre={novel.genre} />
                    <StatusBadge status={novel.status} />
                    <QualityBadge
                      completionRate={novel.avg_completion_rate}
                      nextEpisodeRate={novel.avg_next_episode_rate}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <span>{tNovel("episodes", { count: novel.total_chapters })}</span>
                    {novel.latest_chapter_at && (
                      <span>{tNovel("update", { time: formatRelativeTime(novel.latest_chapter_at, locale) })}</span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ヒーローカード（トップ作品の大きなプレゼンテーション）
function HeroCard({ novel, locale }: { novel: NovelScore; locale: string }) {
  return (
    <Link
      href={`/novels/${novel.slug}`}
      className="group block overflow-hidden rounded-xl border border-border bg-white transition hover:shadow-md"
    >
      <div className="relative flex items-center justify-center bg-gradient-to-b from-surface to-white py-8">
        <div className="h-48 w-32 rounded-lg bg-white shadow-sm flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105">
          {novel.cover_image_url ? (
            <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl">📖</span>
          )}
        </div>
      </div>
      <div className="p-5">
        <h2 className="mb-1 text-lg font-bold text-text">{novel.title}</h2>
        {novel.tagline && <p className="mb-2 text-sm text-muted">{novel.tagline}</p>}
        {novel.synopsis && (
          <p className="mb-3 text-sm leading-relaxed text-muted line-clamp-2">{novel.synopsis}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <GenreBadge genre={novel.genre} />
          <StatusBadge status={novel.status} />
          <span className="text-xs text-muted">{novel.total_chapters} {locale === "en" ? "eps" : "話"}</span>
          <QualityBadge
            completionRate={novel.avg_completion_rate}
            nextEpisodeRate={novel.avg_next_episode_rate}
            size="md"
          />
        </div>
      </div>
    </Link>
  );
}

// 横スクロールセクション（Netflix型のカルーセル）
function HorizontalSection({
  title,
  novels,
  locale,
  showQuality = false,
}: {
  title: string;
  novels: NovelScore[];
  locale: string;
  showQuality?: boolean;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-text">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {novels.map((novel) => (
          <Link
            key={novel.id}
            href={`/novels/${novel.slug}`}
            className="flex w-32 flex-shrink-0 flex-col gap-1.5 rounded-lg border border-border p-2 transition hover:border-secondary hover:bg-surface"
          >
            <div className="mx-auto h-36 w-24 rounded bg-surface flex items-center justify-center overflow-hidden">
              {novel.cover_image_url ? (
                <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl text-muted">📖</span>
              )}
            </div>
            <h3 className="text-center text-xs font-medium leading-tight line-clamp-2">{novel.title}</h3>
            <div className="flex justify-center">
              <GenreBadge genre={novel.genre} />
            </div>
            {showQuality && (
              <div className="flex justify-center">
                <QualityBadge completionRate={novel.avg_completion_rate} />
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

// ジャンル別セクション
function GenreSection({
  genre,
  novels,
  locale,
}: {
  genre: string;
  novels: NovelScore[];
  locale: string;
}) {
  // ジャンル名はクライアントサイドでしか翻訳できないので、サーバーではgenre idをそのまま使う
  // i18nはGenreBadge内で処理されるが、セクションタイトルはサーバーで必要
  // → 専用コンポーネントで処理
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GenreBadge genre={genre} />
        </div>
        <Link href={`/genre/${genre}`} className="text-xs text-secondary hover:underline">
          &gt;
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {novels.slice(0, 6).map((novel) => (
          <Link
            key={novel.id}
            href={`/novels/${novel.slug}`}
            className="flex w-28 flex-shrink-0 flex-col gap-1 rounded-lg border border-border p-2 transition hover:border-secondary hover:bg-surface"
          >
            <div className="mx-auto h-32 w-20 rounded bg-surface flex items-center justify-center overflow-hidden">
              {novel.cover_image_url ? (
                <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl text-muted">📖</span>
              )}
            </div>
            <h3 className="text-center text-[11px] font-medium leading-tight line-clamp-2">{novel.title}</h3>
          </Link>
        ))}
      </div>
    </section>
  );
}
