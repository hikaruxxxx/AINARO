import Link from "next/link";
import type { Novel } from "@/types/novel";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { formatPV, formatCharCount } from "@/lib/utils/format";

export default function NovelCard({ novel }: { novel: Novel }) {
  return (
    <Link
      href={`/novels/${novel.slug}`}
      className="flex gap-4 rounded-lg border border-border p-4 transition hover:bg-surface"
    >
      {/* 表紙サムネイル */}
      <div className="h-24 w-16 flex-shrink-0 rounded bg-surface flex items-center justify-center overflow-hidden">
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

      {/* テキスト情報 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="truncate font-bold text-text">{novel.title}</h3>
        {novel.tagline && (
          <p className="truncate text-sm text-muted">{novel.tagline}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <GenreBadge genre={novel.genre} />
          <StatusBadge status={novel.status} />
          {novel.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs text-muted">
              #{tag}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-3 text-xs text-muted">
          <span>{novel.total_chapters}話</span>
          <span>{formatCharCount(novel.total_characters)}</span>
          <span>PV {formatPV(novel.total_pv)}</span>
        </div>
      </div>
    </Link>
  );
}
