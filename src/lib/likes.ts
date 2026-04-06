"use client";

// ローカルいいね管理（Phase 0: localStorage）
// Phase 2でSupabase episode_likesテーブルに移行

const STORAGE_KEY = "ainaro_likes";

function getLikes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLikes(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function isLiked(episodeId: string): boolean {
  return getLikes().includes(episodeId);
}

export function toggleLike(episodeId: string): boolean {
  const likes = getLikes();
  const index = likes.indexOf(episodeId);
  if (index >= 0) {
    likes.splice(index, 1);
    saveLikes(likes);
    return false;
  } else {
    likes.unshift(episodeId);
    saveLikes(likes);
    return true;
  }
}

export function getLikedEpisodeIds(): string[] {
  return getLikes();
}
