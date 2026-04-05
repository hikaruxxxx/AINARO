import Link from "next/link";
import { fetchRankedNovels } from "@/lib/data";
import GenreBadge, { GENRE_LABELS } from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatPV } from "@/lib/utils/format";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "ランキング",
  description: "読者に最も愛されている作品のランキング。PV数だけでなく読了率・次話遷移率など「面白さ」を加味したスコアで順位付け。",
};

type Props = {
  searchParams: Promise<{ genre?: string }>;
};

export default async function RankingPage({ searchParams }: Props) {
  const { genre } = await searchParams;
  const novels = await fetchRankedNovels({ genre, limit: 50 });

  const genres = Object.entries(GENRE_LABELS);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-text">ランキング</h1>
      <p className="mb-6 text-sm text-muted">
        PV数だけでなく、読了率・次話遷移率を加味した「面白さスコア」で順位付け
      </p>

      {/* ジャンルフィルター */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/ranking"
          className={`rounded-full px-3 py-1 text-sm transition ${
            !genre ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
          }`}
        >
          全ジャンル
        </Link>
        {genres.map(([id, label]) => (
          <Link
            key={id}
            href={`/ranking?genre=${id}`}
            className={`rounded-full px-3 py-1 text-sm transition ${
              genre === id ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* ランキングリスト */}
      {novels.length === 0 ? (
        <p className="py-12 text-center text-muted">該当する作品がありません。</p>
      ) : (
        <ol className="divide-y divide-border">
          {novels.map((novel, index) => (
            <li key={novel.id}>
              <Link
                href={`/novels/${novel.slug}`}
                className="flex items-start gap-4 py-4 transition hover:bg-surface"
              >
                {/* 順位 */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                  {index < 3 ? (
                    <span className={`text-2xl font-bold ${
                      index === 0 ? "text-yellow-500" :
                      index === 1 ? "text-gray-400" :
                      "text-amber-600"
                    }`}>
                      {index + 1}
                    </span>
                  ) : (
                    <span className="text-lg font-bold text-muted">{index + 1}</span>
                  )}
                </div>

                {/* 表紙 */}
                <div className="h-20 w-14 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                  {novel.cover_image_url ? (
                    <img
                      src={novel.cover_image_url}
                      alt={novel.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xl text-muted">📖</span>
                  )}
                </div>

                {/* 作品情報 */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate font-bold text-text">{novel.title}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <GenreBadge genre={novel.genre} />
                    <StatusBadge status={novel.status} />
                    <span className="text-xs text-muted">{novel.author_name}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <span>{novel.total_chapters}話</span>
                    <span>PV {formatPV(novel.total_pv)}</span>
                    {novel.avg_completion_rate != null && (
                      <span>読了率 {(novel.avg_completion_rate * 100).toFixed(0)}%</span>
                    )}
                    {novel.avg_next_episode_rate != null && (
                      <span>次話遷移 {(novel.avg_next_episode_rate * 100).toFixed(0)}%</span>
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
