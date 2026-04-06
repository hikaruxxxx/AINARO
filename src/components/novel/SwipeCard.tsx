"use client";

import { useTranslations } from "next-intl";
import GenreBadge from "@/components/common/GenreBadge";
import type { Novel } from "@/types/novel";

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
  // ジェスチャー制御（トップカードのみ）
  offsetX?: number;
  rotation?: number;
  overlayOpacity?: number;
  isAnimating?: boolean;
  handlers?: Record<string, (e: never) => void>;
  // スタック内の位置（0 = 最前面）
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

  // スタック効果: 奥のカードほど小さく下にずれる
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
      className="absolute inset-4 select-none overflow-hidden rounded-2xl shadow-2xl"
      style={cardStyle}
      {...(stackPosition === 0 ? handlers : {})}
    >
      {/* 背景画像 or グラデーション */}
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

      {/* ダークオーバーレイ */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

      {/* スワイプ方向オーバーレイ */}
      {direction === "right" && (
        <div
          className="absolute inset-0 bg-green-500/20 transition-opacity"
          style={{ opacity: overlayOpacity }}
        />
      )}
      {direction === "left" && (
        <div
          className="absolute inset-0 bg-red-500/20 transition-opacity"
          style={{ opacity: overlayOpacity }}
        />
      )}

      {/* スワイプラベル */}
      {direction === "right" && overlayOpacity > 0.1 && (
        <div className="absolute left-6 top-20 z-20 rotate-[-15deg]">
          <span className="rounded-lg border-3 border-green-400 px-4 py-2 text-2xl font-black text-green-400">
            {t("interested")}
          </span>
        </div>
      )}
      {direction === "left" && overlayOpacity > 0.1 && (
        <div className="absolute right-6 top-20 z-20 rotate-[15deg]">
          <span className="rounded-lg border-3 border-red-400 px-4 py-2 text-2xl font-black text-red-400">
            {t("skip")}
          </span>
        </div>
      )}

      {/* コンテンツ */}
      <div className="absolute inset-x-0 bottom-0 p-6">
        {/* ジャンル・タグ */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <GenreBadge genre={novel.genre} />
          {novel.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs text-white/80">
              #{tag}
            </span>
          ))}
        </div>

        {/* タイトル */}
        <h2 className="mb-2 text-2xl font-bold leading-tight text-white">
          {novel.title}
        </h2>

        {/* タグライン */}
        {novel.tagline && (
          <p className="mb-2 text-sm font-medium text-white/80">
            {novel.tagline}
          </p>
        )}

        {/* あらすじ */}
        {novel.synopsis && (
          <p className="mb-4 text-sm leading-relaxed text-white/60 line-clamp-4">
            {novel.synopsis}
          </p>
        )}

        {/* メタ情報 */}
        <div className="flex items-center gap-3 text-xs text-white/50">
          <span>{novel.total_chapters}話</span>
          <span>·</span>
          <span>{novel.author_name}</span>
        </div>
      </div>
    </div>
  );
}
