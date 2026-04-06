"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import SwipeStack from "@/components/novel/SwipeStack";
import { addSwipe, getSwipedNovelIds, clearSwipeHistory } from "@/lib/swipe-history";
import type { Novel } from "@/types/novel";

export default function SwipePage() {
  const t = useTranslations("swipe");
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [likedCount, setLikedCount] = useState(0);

  const fetchNovels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/discover");
      const data = await res.json();
      const swipedIds = getSwipedNovelIds();
      const unswipedNovels = (data.novels || []).filter(
        (n: Novel) => !swipedIds.has(n.id)
      );
      setNovels(unswipedNovels);
    } catch {
      setNovels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNovels();
  }, [fetchNovels]);

  const handleSwipe = useCallback(
    (novelId: string, direction: "right" | "left", novel: Novel) => {
      addSwipe({
        novelId,
        direction,
        genre: novel.genre,
        tags: novel.tags,
      });
      if (direction === "right") {
        setLikedCount((prev) => prev + 1);
      }
    },
    []
  );

  const handleReset = useCallback(() => {
    clearSwipeHistory();
    setLikedCount(0);
    fetchNovels();
  }, [fetchNovels]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
          <p className="text-sm text-gray-500">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 pt-4">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
        <div className="text-center">
          <h1 className="text-sm font-bold text-gray-900">{t("title")}</h1>
          <p className="text-[10px] text-gray-400">{t("subtitle")}</p>
        </div>
        <div className="w-8" />
      </div>

      {/* カードスタック */}
      <div className="flex-1">
        <SwipeStack
          novels={novels}
          onSwipe={handleSwipe}
          onReset={handleReset}
          likedCount={likedCount}
        />
      </div>
    </div>
  );
}
