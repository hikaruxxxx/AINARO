"use client";

// ローカルフォロー管理（Phase 0: localStorage）
// Phase 2でSupabase novel_followsテーブルに移行

const STORAGE_KEY = "ainaro_follows";

function getFollows(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFollows(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function isFollowing(novelId: string): boolean {
  return getFollows().includes(novelId);
}

export function toggleFollow(novelId: string): boolean {
  const follows = getFollows();
  const index = follows.indexOf(novelId);
  if (index >= 0) {
    follows.splice(index, 1);
    saveFollows(follows);
    return false;
  } else {
    follows.unshift(novelId);
    saveFollows(follows);
    return true;
  }
}

export function getFollowedNovelIds(): string[] {
  return getFollows();
}
