"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SwipeStack from "@/components/novel/SwipeStack";
import { addSwipe, getSwipedNovelIds, clearSwipeHistory } from "@/lib/swipe-history";
import type { Novel } from "@/types/novel";

const SESSION_KEY = "ainaro_swipe_session";

type SwipeSession = {
  novels: Novel[];
  currentIndex: number;
  likedCount: number;
};

function saveSession(session: SwipeSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

function loadSession(): SwipeSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as SwipeSession;
    // リストが空や壊れていたら無視
    if (!Array.isArray(session.novels) || session.novels.length === 0) return null;
    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export default function SwipePage() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedCount, setLikedCount] = useState(0);
  const [initialIndex, setInitialIndex] = useState(0);
  const sessionRestored = useRef(false);

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
      setInitialIndex(0);
      saveSession({ novels: unswipedNovels, currentIndex: 0, likedCount: 0 });
    } catch (e) {
      setError("作品の読み込みに失敗しました");
      setNovels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // リロード時: sessionStorageから復元を試みる
    const saved = loadSession();
    if (saved && !sessionRestored.current) {
      sessionRestored.current = true;
      setNovels(saved.novels);
      setInitialIndex(saved.currentIndex);
      setLikedCount(saved.likedCount);
      setLoading(false);
    } else {
      fetchNovels();
    }
  }, [fetchNovels]);

  // SwipeStackからcurrentIndex変更を受け取ってsessionStorageに保存
  const handleIndexChange = useCallback(
    (newIndex: number) => {
      saveSession({ novels, currentIndex: newIndex, likedCount });
    },
    [novels, likedCount]
  );

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
        setLikedCount((prev) => {
          const next = prev + 1;
          // likedCountの変更もセッションに反映
          saveSession({ novels, currentIndex: 0, likedCount: next });
          return next;
        });
      }
    },
    [novels]
  );

  const handleReadProgress = useCallback(
    (novelId: string, episodesRead: number) => {
      if (episodesRead >= 2) {
        const novel = novels.find((n) => n.id === novelId);
        if (novel) {
          try {
            addSwipe({ novelId, direction: "right", genre: novel.genre, tags: novel.tags });
          } catch {}
          setLikedCount((prev) => {
            const next = prev + 1;
            saveSession({ novels, currentIndex: 0, likedCount: next });
            return next;
          });
        }
      }
    },
    [novels]
  );

  const handleReset = useCallback(() => {
    try { clearSwipeHistory(); } catch {}
    clearSession();
    setLikedCount(0);
    fetchNovels();
  }, [fetchNovels]);

  if (loading) {
    return (
      <div className="relative h-[calc(100vh-3.5rem)] w-full flex items-center justify-center bg-gray-50">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative h-[calc(100vh-3.5rem)] w-full flex flex-col items-center justify-center bg-gray-50 px-8 text-center">
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
    <div className="relative h-[calc(100vh-3.5rem)] w-full bg-gray-50">
      <SwipeStack
        novels={novels}
        initialIndex={initialIndex}
        onSwipe={handleSwipe}
        onIndexChange={handleIndexChange}
        onReadProgress={handleReadProgress}
        onReset={handleReset}
        likedCount={likedCount}
      />
    </div>
  );
}
