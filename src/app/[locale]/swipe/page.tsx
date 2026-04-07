"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import SwipeStack from "@/components/novel/SwipeStack";
import { addSwipe, getSwipedNovelIds, clearSwipeHistory } from "@/lib/swipe-history";
import type { Novel } from "@/types/novel";

export default function SwipePage() {
  const t = useTranslations("swipe");
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedCount, setLikedCount] = useState(0);

  const fetchNovels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/discover");
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const swipedIds = getSwipedNovelIds();
      const unswipedNovels = (data.novels || []).filter(
        (n: Novel) => !swipedIds.has(n.id)
      );
      setNovels(unswipedNovels);
    } catch (e) {
      setError("作品の読み込みに失敗しました");
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
      try {
        addSwipe({
          novelId,
          direction,
          genre: novel.genre,
          tags: novel.tags,
        });
      } catch {}
      if (direction === "right") {
        setLikedCount((prev) => prev + 1);
      }
    },
    []
  );

  const handleReadProgress = useCallback(
    (novelId: string, episodesRead: number) => {
      if (episodesRead >= 2) {
        const novel = novels.find((n) => n.id === novelId);
        if (novel) {
          try {
            addSwipe({ novelId, direction: "right", genre: novel.genre, tags: novel.tags });
          } catch {}
          setLikedCount((prev) => prev + 1);
        }
      }
    },
    [novels]
  );

  const handleReset = useCallback(() => {
    try { clearSwipeHistory(); } catch {}
    setLikedCount(0);
    fetchNovels();
  }, [fetchNovels]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 px-8 text-center">
        <p className="mb-4 text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchNovels}
          className="rounded-full bg-gray-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
        >
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50">
      <SwipeStack
        novels={novels}
        onSwipe={handleSwipe}
        onReadProgress={handleReadProgress}
        onReset={handleReset}
        likedCount={likedCount}
      />
    </div>
  );
}
