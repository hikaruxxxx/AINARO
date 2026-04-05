"use client";

// ローカルブックマーク管理（Phase 0: 認証不要のlocalStorageベース）
// Phase 2でSupabase Auth + bookmarksテーブルに移行

const STORAGE_KEY = "ainaro_bookmarks";

function getBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export function isBookmarked(novelId: string): boolean {
  return getBookmarks().includes(novelId);
}

export function toggleBookmark(novelId: string): boolean {
  const bookmarks = getBookmarks();
  const index = bookmarks.indexOf(novelId);
  if (index >= 0) {
    bookmarks.splice(index, 1);
    saveBookmarks(bookmarks);
    return false; // 解除
  } else {
    bookmarks.unshift(novelId);
    saveBookmarks(bookmarks);
    return true; // 追加
  }
}

export function getBookmarkedNovelIds(): string[] {
  return getBookmarks();
}
