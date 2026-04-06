import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchRankedNovels } from "@/lib/data";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import ContinueReadingSection from "@/components/novel/ContinueReadingSection";
import PersonalizedSection from "@/components/novel/PersonalizedSection";
import TasteOnboarding from "@/components/novel/TasteOnboarding";
import type { NovelScore } from "@/types/novel";

export const revalidate = 3600;

// カバー画像のないときのグラデーション背景
const COVER_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-rose-500 to-orange-500",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-red-500",
  "from-violet-500 to-fuchsia-600",
];

function CoverPlaceholder({ title, index = 0, className = "" }: { title: string; index?: number; className?: string }) {
  const gradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br ${gradient} ${className}`}>
      <span className="px-3 text-center text-sm font-bold leading-tight text-white/90 line-clamp-3">
        {title}
      </span>
    </div>
  );
}

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

  // 完結作品（一気読みにおすすめ）
  const completedNovels = novels.filter((n) => n.status === "complete").slice(0, 8);

  // 高評価作品
  const highRated = novels
    .filter((n) => (n.avg_completion_rate ?? 0) >= 70)
    .slice(0, 8);

  return (
    <div>
      <TasteOnboarding />
      <ContinueReadingSection />

      {/* ヒーローセクション — 最高スコア作品を大きく */}
      <section className="mb-10">
        <HeroCard
          novel={novels[0]}
          locale={locale}
          episodesLabel={tNovel("episodes", { count: novels[0].total_chapters })}
          readLabel={tNovel("readFromEp1")}
          detailLabel={tNovel("viewDetails")}
        />
      </section>

      {/* パーソナライズ */}
      <div className="mx-auto max-w-6xl px-4">
        <PersonalizedSection allNovels={novels} />
      </div>

      {/* 高評価 */}
      {highRated.length > 0 && (
        <ScrollSection title={t("highlyRated")} novels={highRated} locale={locale} />
      )}

      {/* 全作品 */}
      <ScrollSection title={t("allNovels")} novels={novels.slice(0, 12)} locale={locale} viewAllHref="/novels" viewAllLabel={t("viewAll")} />

      {/* 完結済み */}
      {completedNovels.length > 0 && (
        <ScrollSection title={t("bingeWorthy")} novels={completedNovels} locale={locale} />
      )}
    </div>
  );
}

// ヒーロー — Netflix風の全幅ビジュアルカード
function HeroCard({
  novel,
  locale,
  episodesLabel,
  readLabel,
  detailLabel,
}: {
  novel: NovelScore;
  locale: string;
  episodesLabel: string;
  readLabel: string;
  detailLabel: string;
}) {
  return (
    <Link href={`/novels/${novel.slug}`} className="group relative block">
      {/* 背景 */}
      <div className="relative overflow-hidden bg-gradient-to-b from-gray-900 to-gray-800" style={{ minHeight: "420px" }}>
        {novel.cover_image_url ? (
          <img
            src={novel.cover_image_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30 transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900" />
        )}
        {/* グラデーションオーバーレイ */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

        {/* コンテンツ */}
        <div className="relative mx-auto flex max-w-6xl items-end gap-8 px-6 pb-10 pt-20 md:px-8">
          {/* カバー画像 */}
          <div className="hidden flex-shrink-0 md:block">
            <div className="h-56 w-40 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-105">
              {novel.cover_image_url ? (
                <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
              ) : (
                <CoverPlaceholder title={novel.title} className="h-full w-full text-lg" />
              )}
            </div>
          </div>

          {/* テキスト */}
          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <GenreBadge genre={novel.genre} />
              <StatusBadge status={novel.status} />
              <span className="text-xs text-white/60">
                {episodesLabel}
              </span>
            </div>
            <h1 className="mb-2 text-2xl font-bold leading-tight text-white md:text-3xl lg:text-4xl">
              {novel.title}
            </h1>
            {novel.tagline && (
              <p className="mb-3 text-sm leading-relaxed text-white/70 md:text-base">
                {novel.tagline}
              </p>
            )}
            {novel.synopsis && (
              <p className="mb-5 max-w-xl text-sm leading-relaxed text-white/50 line-clamp-2">
                {novel.synopsis}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-gray-900 shadow-lg transition group-hover:bg-white/90">
                {readLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 transition group-hover:border-white/40">
                {detailLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Netflix風 横スクロールセクション
function ScrollSection({
  title,
  novels,
  locale,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  novels: NovelScore[];
  locale: string;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  return (
    <section className="mb-10">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text">{title}</h2>
          {viewAllHref && viewAllLabel && (
            <Link href={viewAllHref} className="text-sm font-medium text-secondary hover:underline">
              {viewAllLabel}
            </Link>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {novels.map((novel, i) => (
            <NovelCard key={novel.id} novel={novel} index={i} locale={locale} />
          ))}
        </div>
      </div>
    </section>
  );
}

// 作品カード — 縦長カバー + タイトル + メタ情報
function NovelCard({
  novel,
  index,
  locale,
}: {
  novel: NovelScore;
  index: number;
  locale: string;
}) {
  return (
    <Link
      href={`/novels/${novel.slug}`}
      className="group flex w-36 flex-shrink-0 flex-col md:w-44"
    >
      {/* カバー */}
      <div className="relative mb-2.5 aspect-[2/3] w-full overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover:shadow-lg group-hover:ring-black/10 group-hover:-translate-y-1">
        {novel.cover_image_url ? (
          <img
            src={novel.cover_image_url}
            alt={novel.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <CoverPlaceholder title={novel.title} index={index} className="h-full w-full" />
        )}
        {/* ステータスオーバーレイ */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2.5">
          <span className="text-[10px] font-medium text-white/90">
            {novel.total_chapters}{locale === "en" ? " eps" : "話"}
          </span>
        </div>
      </div>

      {/* タイトル */}
      <h3 className="mb-0.5 text-sm font-medium leading-tight text-text line-clamp-2 group-hover:text-primary transition-colors">
        {novel.title}
      </h3>
      {/* ジャンル */}
      <span className="text-xs text-muted">{novel.author_name}</span>
    </Link>
  );
}
