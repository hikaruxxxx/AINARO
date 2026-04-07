import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { fetchRankedNovels } from "@/lib/data";
import ContinueReadingSection from "@/components/novel/ContinueReadingSection";
import PersonalizedSection from "@/components/novel/PersonalizedSection";
import TasteOnboarding from "@/components/novel/TasteOnboarding";
import SwipeCTA from "@/components/novel/SwipeCTA";
import ScrollShelf from "@/components/novel/ScrollShelf";
import HeroSection from "@/components/novel/HeroSection";
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
  const tGenre = await getTranslations("genre");

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

  // ジャンル別に作品を分類
  const genreGroups = new Map<string, NovelScore[]>();
  for (const novel of novels) {
    if (!genreGroups.has(novel.genre)) {
      genreGroups.set(novel.genre, []);
    }
    genreGroups.get(novel.genre)!.push(novel);
  }
  // 2作品以上あるジャンルのみ表示
  const genreSections = [...genreGroups.entries()]
    .filter(([, items]) => items.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  // セクションインデックス（縞模様の背景切り替え用）
  let sectionIdx = 0;

  return (
    <div>
      <TasteOnboarding />
      <ContinueReadingSection />

      {/* ヒーローセクション — 上位5件から既読を除外して表示 */}
      <section className="mb-10">
        <HeroSection
          candidates={novels.slice(0, 5)}
          episodesLabelTemplate={tNovel("episodes", { count: 0 }).replace("0", "{count}")}
          readLabel={tNovel("readFromEp1")}
          detailLabel={tNovel("viewDetails")}
        />
      </section>

      {/* スワイプCTA */}
      {novels.length >= 2 && <SwipeCTA locale={locale} />}

      {/* パーソナライズ */}
      <div className="mx-auto max-w-6xl px-4">
        <PersonalizedSection allNovels={novels} />
      </div>

      {/* 高評価 */}
      {highRated.length > 0 && (
        <ScrollSection title={t("highlyRated")} novels={highRated} locale={locale} stripe={sectionIdx++ % 2 === 1} />
      )}

      {/* 全作品 */}
      <ScrollSection title={t("allNovels")} novels={novels.slice(0, 12)} locale={locale} viewAllHref="/novels" viewAllLabel={t("viewAll")} stripe={sectionIdx++ % 2 === 1} />

      {/* 完結済み */}
      {completedNovels.length > 0 && (
        <ScrollSection title={t("bingeWorthy")} novels={completedNovels} locale={locale} stripe={sectionIdx++ % 2 === 1} />
      )}

      {/* ジャンル別セクション */}
      {genreSections.map(([genre, items]) => (
        <ScrollSection
          key={genre}
          title={tGenre.has(genre as any) ? tGenre(genre as any) : genre}
          novels={items.slice(0, 12)}
          locale={locale}
          viewAllHref={`/novels/genre/${genre}`}
          viewAllLabel={t("viewAll")}
          stripe={sectionIdx++ % 2 === 1}
        />
      ))}
    </div>
  );
}

// Netflix風 横スクロールセクション
function ScrollSection({
  title,
  novels,
  locale,
  viewAllHref,
  viewAllLabel,
  stripe = false,
}: {
  title: string;
  novels: NovelScore[];
  locale: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  stripe?: boolean;
}) {
  return (
    <section className={`py-8 ${stripe ? "bg-muted/30" : ""}`}>
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
        <ScrollShelf>
          {novels.map((novel, i) => (
            <NovelCard key={novel.id} novel={novel} index={i} locale={locale} />
          ))}
        </ScrollShelf>
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
  // 実測値ベースの読了率バッジ（avg_completion_rateは0-100の%）
  // 予測スコアを★化すると読者が「他人の評価」と誤解するため、実測値のみ表示する
  const completionRate =
    novel.avg_completion_rate !== null && novel.avg_completion_rate > 0
      ? Math.round(novel.avg_completion_rate)
      : null;

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
        {/* 読了率バッジ（実測値・データがあるときのみ表示） */}
        {completionRate !== null && (
          <div className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
            <span className="text-[10px] font-bold text-white">
              {locale === "en" ? `${completionRate}% read` : `読了率 ${completionRate}%`}
            </span>
          </div>
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
      {/* 著者名 */}
      <span className="text-xs text-muted">{novel.author_name}</span>
      {/* タグバッジ */}
      {novel.tags && novel.tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {novel.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
