"use client";

import Link from "next/link";
import type { Novel } from "@/types/novel";
import GenreBadge from "@/components/common/GenreBadge";
import { formatPV } from "@/lib/utils/format";

// TikTok型フルスクリーンカード（1作品 = 1画面）
export default function NovelFeedCard({ novel }: { novel: Novel }) {
  return (
    <div className="relative flex h-[100dvh] snap-start snap-always flex-col items-center justify-center px-6">
      {/* 背景（表紙画像のぼかし or グラデーション） */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-primary/20" />

      {/* 表紙 */}
      <div className="mb-6 h-56 w-40 rounded-xl bg-surface shadow-lg flex items-center justify-center overflow-hidden">
        {novel.cover_image_url ? (
          <img
            src={novel.cover_image_url}
            alt={novel.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-5xl">📖</span>
        )}
      </div>

      {/* 作品情報 */}
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-2xl font-bold leading-tight">{novel.title}</h2>

        {novel.tagline && (
          <p className="max-w-xs text-sm text-muted">{novel.tagline}</p>
        )}

        <div className="flex items-center gap-2">
          <GenreBadge genre={novel.genre} />
          <span className="text-xs text-muted">{novel.total_chapters}話</span>
          <span className="text-xs text-muted">PV {formatPV(novel.total_pv)}</span>
        </div>

        {novel.synopsis && (
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted line-clamp-3">
            {novel.synopsis}
          </p>
        )}

        {/* CTA */}
        <Link
          href={`/novels/${novel.slug}/1`}
          className="mt-4 rounded-full bg-secondary px-8 py-3 text-base font-bold text-white shadow-md transition active:scale-95 hover:opacity-90"
        >
          読む
        </Link>

        <Link
          href={`/novels/${novel.slug}`}
          className="text-xs text-muted underline"
        >
          作品詳細を見る
        </Link>
      </div>

      {/* スクロールヒント（最初のカードのみ表示させたいが、CSSで制御） */}
      <div className="absolute bottom-8 animate-bounce text-muted">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </div>
  );
}
