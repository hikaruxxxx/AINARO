"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  handlers?: Record<string, (e: never) => void>;
  stackPosition: number;
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
}: SwipeCardProps) {
  const t = useTranslations("swipe");
  const gradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  const [episode, setEpisode] = useState<Episode | null>(null);

  // トップカードの場合のみ第1話を取得
  useEffect(() => {
    if (stackPosition !== 0) return;
    fetch(`/api/novels/batch?slugs=${novel.slug}`)
      .then((r) => r.json())
      .then((data) => {
        // batch APIがない場合のフォールバック: 個別取得
        if (data.error) return;
      })
      .catch(() => {});

    // エピソード本文を直接取得
    fetch(`/api/episodes/read?novelId=${novel.id}&episodeNumber=1`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.episode) setEpisode(data.episode);
      })
      .catch(() => {});
  }, [novel.id, novel.slug, stackPosition]);

  const scale = 1 - stackPosition * 0.05;
  const translateY = stackPosition * 12;

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

  return (
    <div
      className="absolute inset-4 overflow-hidden rounded-2xl shadow-2xl"
      style={cardStyle}
    >
      {/* スクロール可能な内側コンテナ — 横スワイプはhandlersで処理 */}
      <div
        className="h-full overflow-y-auto overscroll-contain"
        {...(stackPosition === 0 ? handlers : {})}
      >
        {/* ヒーローエリア（ビジュアル部分） */}
        <div className="relative" style={{ minHeight: "70%" }}>
          {/* 背景 */}
          {novel.cover_image_url ? (
            <img
              src={novel.cover_image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
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
          <div className="relative flex min-h-[70vh] flex-col justify-end p-6">
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

            {/* スクロールヒント */}
            {episode && (
              <div className="mt-4 flex flex-col items-center">
                <span className="mb-1 text-[10px] text-white/40">↓ スクロールで試し読み</span>
                <div className="h-1 w-8 rounded-full bg-white/20" />
              </div>
            )}
          </div>
        </div>

        {/* 第1話本文（スクロールで表示） */}
        {episode && (
          <div className="bg-white px-6 py-8">
            <div className="mb-6 border-b border-gray-200 pb-4">
              <p className="text-xs font-medium text-gray-400">第1話</p>
              <h3 className="text-lg font-bold text-gray-900">{episode.title}</h3>
            </div>
            <div
              className="novel-body select-text text-gray-800"
              dangerouslySetInnerHTML={{
                __html: episode.body_html || episode.body_md.replace(/\n/g, "<br/>"),
              }}
            />
            <div className="mt-8 border-t border-gray-200 pt-6 text-center">
              <p className="mb-2 text-sm text-gray-500">気に入りましたか？</p>
              <p className="text-xs text-gray-400">上に戻って右スワイプで「気になる」に追加</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
