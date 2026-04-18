"use client";

import { useState, useCallback, useRef } from "react";
import SwipeCard from "./SwipeCard";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import type { Novel } from "@/types/novel";

type SwipeStackProps = {
  novels: Novel[];
  initialIndex?: number;
  onSwipe: (novelId: string, direction: "right" | "left", novel: Novel) => void;
  onIndexChange?: (newIndex: number) => void;
  onReadProgress?: (novelId: string, episodesRead: number) => void;
  onReset: () => void;
  likedCount: number;
};

export default function SwipeStack({ novels, initialIndex = 0, onSwipe, onIndexChange, onReadProgress, onReset, likedCount }: SwipeStackProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [buttonsHidden, setButtonsHidden] = useState(false);
  const lastScrollTop = useRef(0);

  const handleSwipe = useCallback(
    (direction: "right" | "left") => {
      const novel = novels[currentIndex];
      if (!novel) return;
      onSwipe(novel.id, direction, novel);
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      onIndexChange?.(nextIndex);
    },
    [currentIndex, novels, onSwipe, onIndexChange]
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
        <h2 className="mb-2 text-xl font-bold text-gray-900">すべての作品をチェックしました！</h2>
        <p className="mb-2 text-sm text-gray-500">新しい作品が追加されるのをお楽しみに</p>
        <p className="mb-8 text-lg font-bold text-green-600">
          {likedCount}作品に興味あり
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onReset}
            className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            もう一度スワイプする
          </button>
          <a
            href="/ja/novels"
            className="rounded-full border border-gray-300 px-6 py-2.5 text-sm text-gray-600 transition hover:bg-gray-100"
          >
            作品一覧を見る →
          </a>
        </div>
      </div>
    );
  }

  const visibleCards = [];
  for (let i = 0; i < 3 && currentIndex + i < novels.length; i++) {
    visibleCards.push(currentIndex + i);
  }

  return (
    <div className="relative h-full">
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
          onScrollChange={idx === currentIndex ? (scrollTop: number) => {
            const goingDown = scrollTop > lastScrollTop.current;
            lastScrollTop.current = scrollTop;
            const shouldHide = goingDown && scrollTop > 50;
            if (shouldHide) {
              setButtonsHidden(true);
              document.body.setAttribute("data-reading", "true");
            } else if (!goingDown) {
              setButtonsHidden(false);
              document.body.removeAttribute("data-reading");
            }
          } : undefined}
        />
      ))}

      {/* ボタン — スクロール中はフェードアウト */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-8 pb-20 pt-4 transition-opacity duration-300 ${buttonsHidden ? "opacity-20" : "opacity-100"}`}>
        <button
          onClick={() => triggerSwipe("left")}
          disabled={isAnimating}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-red-500 shadow-lg backdrop-blur-sm transition hover:bg-white active:scale-90 disabled:opacity-50"
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <span className="pointer-events-auto rounded-full bg-black/30 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {currentIndex + 1} / {novels.length}
        </span>

        <button
          onClick={() => triggerSwipe("right")}
          disabled={isAnimating}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-green-500 shadow-lg backdrop-blur-sm transition hover:bg-white active:scale-90 disabled:opacity-50"
        >
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
