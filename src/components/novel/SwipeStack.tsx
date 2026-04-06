"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import SwipeCard from "./SwipeCard";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import type { Novel } from "@/types/novel";

type SwipeStackProps = {
  novels: Novel[];
  onSwipe: (novelId: string, direction: "right" | "left", novel: Novel) => void;
  onReadProgress?: (novelId: string, episodesRead: number) => void;
  onReset: () => void;
  likedCount: number;
};

export default function SwipeStack({ novels, onSwipe, onReadProgress, onReset, likedCount }: SwipeStackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const t = useTranslations("swipe");

  const handleSwipe = useCallback(
    (direction: "right" | "left") => {
      const novel = novels[currentIndex];
      if (!novel) return;
      onSwipe(novel.id, direction, novel);
      setCurrentIndex((prev) => prev + 1);
    },
    [currentIndex, novels, onSwipe]
  );

  const { offsetX, rotation, overlayOpacity, isAnimating, handlers, triggerSwipe } =
    useSwipeGesture({
      onSwipe: handleSwipe,
      enabled: currentIndex < novels.length,
    });

  // 全カードスワイプ済み
  if (currentIndex >= novels.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
          <svg className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">{t("empty")}</h2>
        <p className="mb-2 text-sm text-gray-500">{t("emptySubtitle")}</p>
        <p className="mb-8 text-lg font-bold text-green-600">
          {t("likedCount", { count: likedCount })}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onReset}
            className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            {t("resetSwipes")}
          </button>
          <Link
            href="/novels"
            className="rounded-full border border-gray-300 px-6 py-2.5 text-sm text-gray-600 transition hover:bg-gray-100"
          >
            {t("goToDiscover")}
          </Link>
        </div>
      </div>
    );
  }

  // 表示する最大3枚のカードインデックス
  const visibleCards = [];
  for (let i = 0; i < 3 && currentIndex + i < novels.length; i++) {
    visibleCards.push(currentIndex + i);
  }

  return (
    <div className="flex h-full flex-col">
      {/* カードエリア */}
      <div className="relative flex-1">
        {visibleCards.reverse().map((idx) => (
          <SwipeCard
            key={novels[idx].id}
            novel={novels[idx]}
            index={idx}
            stackPosition={idx - currentIndex}
            offsetX={idx === currentIndex ? offsetX : 0}
            rotation={idx === currentIndex ? rotation : 0}
            overlayOpacity={idx === currentIndex ? overlayOpacity : 0}
            isAnimating={idx === currentIndex ? isAnimating : false}
            handlers={idx === currentIndex ? handlers : undefined}
            onReadProgress={idx === currentIndex ? onReadProgress : undefined}
          />
        ))}
      </div>

      {/* ボタン */}
      <div className="flex items-center justify-center gap-6 px-4 pb-8 pt-4">
        <button
          onClick={() => triggerSwipe("left")}
          disabled={isAnimating}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-300 text-red-400 shadow-sm transition hover:bg-red-50 active:scale-95 disabled:opacity-50"
          aria-label={t("skip")}
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <span className="text-xs text-gray-400">
          {currentIndex + 1} / {novels.length}
        </span>

        <button
          onClick={() => triggerSwipe("right")}
          disabled={isAnimating}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-300 text-green-500 shadow-sm transition hover:bg-green-50 active:scale-95 disabled:opacity-50"
          aria-label={t("interested")}
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </button>
      </div>

      <p className="pb-4 text-center text-xs text-gray-400">
        {t("hint")}
      </p>
    </div>
  );
}
