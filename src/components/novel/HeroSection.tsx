"use client";

// ヒーローセクション
// サーバーから上位N件の候補を受け取り、クライアントで読書履歴と照合して
// 「まだ読んでいない最高スコア作品」を表示する。
// 全部既読のときは先頭（=ランキング1位）にフォールバック。

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import GenreBadge from "@/components/common/GenreBadge";
import StatusBadge from "@/components/common/StatusBadge";
import { getAllReadingHistory } from "@/lib/reading-history";
import type { NovelScore } from "@/types/novel";

const COVER_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-rose-500 to-orange-500",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
];

function CoverPlaceholder({ title, className = "" }: { title: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br ${COVER_GRADIENTS[0]} ${className}`}>
      <span className="px-3 text-center text-sm font-bold leading-tight text-white/90 line-clamp-3">
        {title}
      </span>
    </div>
  );
}

type Props = {
  candidates: NovelScore[];
  episodesLabelTemplate: string; // "{count}話" のテンプレート
  readLabel: string;
  detailLabel: string;
};

export default function HeroSection({ candidates, episodesLabelTemplate, readLabel, detailLabel }: Props) {
  // SSR時は先頭（ランキング1位）を表示し、マウント後に既読除外で差し替える
  // ハイドレーション不一致を避けるため初期値はサーバーと一致させる
  const [novel, setNovel] = useState<NovelScore>(candidates[0]);

  useEffect(() => {
    if (candidates.length === 0) return;
    const history = getAllReadingHistory();
    const readSlugs = new Set(history.map((h) => h.slug).filter(Boolean));
    // 既読でない最初の候補を選ぶ（全部既読なら先頭）
    const unread = candidates.find((n) => !readSlugs.has(n.slug));
    if (unread && unread.id !== candidates[0].id) {
      setNovel(unread);
    }
  }, [candidates]);

  if (!novel) return null;

  const episodesLabel = episodesLabelTemplate.replace("{count}", String(novel.total_chapters));

  return (
    <Link href={`/novels/${novel.slug}`} className="group relative block">
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
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />

        <div className="relative mx-auto flex max-w-6xl items-end gap-4 px-6 pb-10 pt-20 md:gap-8 md:px-8">
          {/* カバー画像（モバイルでも表示） */}
          <div className="flex-shrink-0">
            <div className="h-40 w-28 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-500 group-hover:scale-105 md:h-56 md:w-40">
              {novel.cover_image_url ? (
                <img src={novel.cover_image_url} alt={novel.title} className="h-full w-full object-cover" />
              ) : (
                <CoverPlaceholder title={novel.title} className="h-full w-full text-lg" />
              )}
            </div>
          </div>

          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <GenreBadge genre={novel.genre} />
              <StatusBadge status={novel.status} />
              <span className="text-xs text-white/60">{episodesLabel}</span>
            </div>
            <h1 className="mb-2 text-2xl font-bold leading-tight text-white md:text-3xl lg:text-4xl">
              {novel.title}
            </h1>
            {novel.tagline && (
              <p className="mb-3 text-sm leading-relaxed text-white/70 md:text-base">{novel.tagline}</p>
            )}
            {novel.synopsis && (
              <p className="mb-5 max-w-xl text-sm leading-relaxed text-white/50 line-clamp-2">{novel.synopsis}</p>
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
