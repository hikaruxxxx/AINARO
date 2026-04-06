"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import GenreBadge from "@/components/common/GenreBadge";
import type { Novel, Episode } from "@/types/novel";

const COVER_GRADIENTS = [
  "from-indigo-500 to-purple-600",
  "from-rose-500 to-orange-500",
  "from-emerald-500 to-teal-600",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-red-500",
  "from-violet-500 to-fuchsia-600",
];

type SwipeCardProps = {
  novel: Novel;
  index: number;
  offsetX?: number;
  rotation?: number;
  overlayOpacity?: number;
  isAnimating?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers?: Record<string, any>;
  stackPosition: number;
  // 読み進めた時の好み信号コールバック
  onReadProgress?: (novelId: string, episodesRead: number) => void;
};

export default function SwipeCard({
  novel,
  index,
  offsetX = 0,
  rotation = 0,
  overlayOpacity = 0,
  isAnimating = false,
  handlers,
  stackPosition,
  onReadProgress,
}: SwipeCardProps) {
  const t = useTranslations("swipe");
  const gradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingNext, setLoadingNext] = useState(false);

  // トップカードの場合のみ第1話を取得
  useEffect(() => {
    if (stackPosition !== 0) return;
    let cancelled = false;
    fetch(`/api/episodes/read?novelId=${novel.id}&episodeNumber=1`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data?.episode) setEpisodes([data.episode]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [novel.id, stackPosition]);

  // 次の話を読む
  const loadNextEpisode = useCallback(async () => {
    const nextNum = episodes.length + 1;
    if (nextNum > novel.total_chapters) return;
    setLoadingNext(true);
    try {
      const res = await fetch(`/api/episodes/read?novelId=${novel.id}&episodeNumber=${nextNum}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.episode) {
        setEpisodes((prev) => [...prev, data.episode]);
        // 2話以上読んだ = 明確な好み信号
        onReadProgress?.(novel.id, nextNum);
      }
    } catch {} finally {
      setLoadingNext(false);
    }
  }, [episodes.length, novel.id, novel.total_chapters, onReadProgress]);

  const scale = 1 - stackPosition * 0.03;
  const translateY = stackPosition * 8;

  const cardStyle: React.CSSProperties = stackPosition === 0
    ? {
        transform: `translateX(${offsetX}px) rotate(${rotation}deg)`,
        transition: isAnimating ? "transform 0.3s ease-out" : "none",
        zIndex: 10 - stackPosition,
        cursor: "grab",
      }
    : {
        transform: `scale(${scale}) translateY(${translateY}px)`,
        transition: "transform 0.3s ease-out",
        zIndex: 10 - stackPosition,
      };

  const direction = offsetX > 0 ? "right" : offsetX < 0 ? "left" : null;
  const hasMoreEpisodes = episodes.length < novel.total_chapters;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={cardStyle}
    >
      <div
        className="absolute inset-0 overflow-y-auto overscroll-contain"
        ref={stackPosition === 0 && handlers ? (handlers as Record<string, unknown>).ref as React.Ref<HTMLDivElement> : undefined}
        onTouchStart={stackPosition === 0 ? handlers?.onTouchStart : undefined}
        onTouchMove={stackPosition === 0 ? handlers?.onTouchMove : undefined}
        onTouchEnd={stackPosition === 0 ? handlers?.onTouchEnd : undefined}
        onMouseDown={stackPosition === 0 ? handlers?.onMouseDown : undefined}
        onMouseMove={stackPosition === 0 ? handlers?.onMouseMove : undefined}
        onMouseUp={stackPosition === 0 ? handlers?.onMouseUp : undefined}
        onMouseLeave={stackPosition === 0 ? (handlers as Record<string, unknown>)?.onMouseLeave as React.MouseEventHandler : undefined}
      >
        {/* ヒーローエリア */}
        <div className="relative" style={{ height: "calc(100vh - 200px)" }}>
          {novel.cover_image_url ? (
            <img src={novel.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

          {/* スワイプ方向オーバーレイ */}
          {direction === "right" && (
            <div className="absolute inset-0 bg-green-500/20 transition-opacity" style={{ opacity: overlayOpacity }} />
          )}
          {direction === "left" && (
            <div className="absolute inset-0 bg-red-500/20 transition-opacity" style={{ opacity: overlayOpacity }} />
          )}

          {/* スワイプラベル */}
          {direction === "right" && overlayOpacity > 0.1 && (
            <div className="absolute left-6 top-16 z-20 rotate-[-15deg]">
              <span className="rounded-lg border-3 border-green-400 px-4 py-2 text-2xl font-black text-green-400">{t("interested")}</span>
            </div>
          )}
          {direction === "left" && overlayOpacity > 0.1 && (
            <div className="absolute right-6 top-16 z-20 rotate-[15deg]">
              <span className="rounded-lg border-3 border-red-400 px-4 py-2 text-2xl font-black text-red-400">{t("skip")}</span>
            </div>
          )}

          {/* 作品情報 */}
          <div className="relative flex min-h-full flex-col justify-end p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <GenreBadge genre={novel.genre} />
              {novel.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs text-white/80">#{tag}</span>
              ))}
            </div>
            <h2 className="mb-2 text-2xl font-bold leading-tight text-white">{novel.title}</h2>
            {novel.tagline && <p className="mb-2 text-sm font-medium text-white/80">{novel.tagline}</p>}
            {novel.synopsis && <p className="mb-4 text-sm leading-relaxed text-white/60 line-clamp-3">{novel.synopsis}</p>}
            <div className="flex items-center gap-3 text-xs text-white/50">
              <span>{novel.total_chapters}話</span>
              <span>·</span>
              <span>{novel.author_name}</span>
            </div>

            {/* 試し読みCTA — 大きく目立たせる */}
            {episodes.length > 0 && (
              <div className="mt-5 flex flex-col items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // 本文エリアまでスクロール
                    const container = (e.target as HTMLElement).closest('.overflow-y-auto');
                    container?.scrollTo({ top: container.clientHeight, behavior: 'smooth' });
                  }}
                  className="flex items-center gap-2 rounded-full bg-white/20 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/30"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  第1話を試し読み
                </button>
                <div className="animate-bounce">
                  <svg className="h-5 w-5 text-white/40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* エピソード本文 — 読み進められる */}
        {episodes.length > 0 && (
          <div className="bg-white">
            {episodes.map((ep, i) => (
              <div key={ep.episode_number} className="border-b border-gray-100 px-6 py-8">
                <div className="mb-6 border-b border-gray-200 pb-4">
                  <p className="text-xs font-medium text-gray-400">第{ep.episode_number}話</p>
                  <h3 className="text-lg font-bold text-gray-900">{ep.title}</h3>
                </div>
                <div
                  className="novel-body select-text text-gray-800"
                  dangerouslySetInnerHTML={{
                    __html: ep.body_html || ep.body_md.replace(/\n/g, "<br/>"),
                  }}
                />
              </div>
            ))}

            {/* 次の話 or 完了 */}
            <div className="px-6 py-8 text-center">
              {hasMoreEpisodes ? (
                <button
                  onClick={loadNextEpisode}
                  disabled={loadingNext}
                  className="rounded-full bg-gray-900 px-8 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50"
                >
                  {loadingNext ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      読み込み中...
                    </span>
                  ) : (
                    `第${episodes.length + 1}話を読む →`
                  )}
                </button>
              ) : (
                <p className="text-sm text-gray-500">最新話まで読了しました</p>
              )}

              {/* 作品ページへのリンク */}
              <div className="mt-4">
                <Link
                  href={`/novels/${novel.slug}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  作品ページを見る →
                </Link>
              </div>

              {/* スワイプに戻るヒント */}
              <p className="mt-6 text-xs text-gray-400">
                ↑ 上に戻ってスワイプで次の作品へ
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
