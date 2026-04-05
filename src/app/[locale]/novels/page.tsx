import Link from "next/link";
import { fetchNovels, fetchNovelsByGenre } from "@/lib/data";
import GenreBadge, { GENRE_LABELS } from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatPV, formatCharCount, formatRelativeTime } from "@/lib/utils/format";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "作品一覧",
  description: "面白さで選ばれた小説だけが並ぶ場所。異世界ファンタジー、恋愛、ホラーなど多ジャンルの作品をお楽しみください。",
};

type Props = {
  searchParams: Promise<{ genre?: string }>;
};

export default async function NovelsPage({ searchParams }: Props) {
  const { genre } = await searchParams;
  const novels = genre ? await fetchNovelsByGenre(genre) : await fetchNovels();
  const genres = Object.entries(GENRE_LABELS);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-text">作品一覧</h1>

      {/* ジャンルフィルター */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/novels"
          className={`rounded-full px-3 py-1 text-sm transition ${
            !genre ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
          }`}
        >
          すべて
        </Link>
        {genres.map(([id, label]) => (
          <Link
            key={id}
            href={`/novels?genre=${id}`}
            className={`rounded-full px-3 py-1 text-sm transition ${
              genre === id ? "bg-primary text-white" : "bg-surface text-muted hover:text-text"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {novels.length === 0 ? (
        <p className="py-12 text-center text-muted">
          {genre ? "このジャンルの作品はまだありません。" : "作品はまだ公開されていません。"}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {novels.map((novel) => (
            <li key={novel.id}>
              <Link
                href={`/novels/${novel.slug}`}
                className="flex gap-4 py-4 transition hover:bg-surface"
              >
                {/* 表紙サムネイル */}
                <div className="h-24 w-16 flex-shrink-0 rounded-md bg-surface flex items-center justify-center overflow-hidden">
                  {novel.cover_image_url ? (
                    <img
                      src={novel.cover_image_url}
                      alt={novel.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl text-muted">📖</span>
                  )}
                </div>

                {/* 作品情報 */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="truncate font-bold text-text">{novel.title}</h2>
                  {novel.tagline && (
                    <p className="truncate text-xs text-muted">{novel.tagline}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <GenreBadge genre={novel.genre} />
                    <StatusBadge status={novel.status} />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted">
                    <span>{novel.total_chapters}話</span>
                    <span>{formatCharCount(novel.total_characters)}</span>
                    <span>PV {formatPV(novel.total_pv)}</span>
                    {novel.latest_chapter_at && (
                      <span>更新 {formatRelativeTime(novel.latest_chapter_at)}</span>
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
