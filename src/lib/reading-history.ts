"use client";

// ローカル読書履歴管理
// localStorageに読書履歴を保存（slug/title/genre/更新日時を含むリッチデータ）
// Supabaseのreading_eventsと併用するが、こちらは即座にUIに反映するための軽量キャッシュ

const STORAGE_KEY = "ainaro_reading_history";

// リッチな読書履歴エントリ
export type ReadingHistoryEntry = {
  novelId: string;
  slug: string;
  title: string;
  genre: string;
  coverImageUrl: string | null;
  lastEpisode: number;
  totalChapters: number;
  updatedAt: string; // ISO 8601
};

type StoredHistory = Record<string, ReadingHistoryEntry>;

function getStoredHistory(): StoredHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // 旧形式（Record<string, number>）からのマイグレーション
    const first = Object.values(parsed)[0];
    if (typeof first === "number") {
      // 旧形式: { novelId: episodeNumber } → 新形式に変換（メタデータなし）
      const migrated: StoredHistory = {};
      for (const [novelId, ep] of Object.entries(parsed)) {
        migrated[novelId] = {
          novelId,
          slug: "",
          title: "",
          genre: "",
          coverImageUrl: null,
          lastEpisode: ep as number,
          totalChapters: 0,
          updatedAt: new Date().toISOString(),
        };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return parsed as StoredHistory;
  } catch {
    return {};
  }
}

function saveStoredHistory(history: StoredHistory) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// 読んだエピソードを記録（作品メタデータ付き）
export function markEpisodeRead(
  novelId: string,
  episodeNumber: number,
  meta?: {
    slug?: string;
    title?: string;
    genre?: string;
    coverImageUrl?: string | null;
    totalChapters?: number;
  }
) {
  const history = getStoredHistory();
  const existing = history[novelId];
  const current = existing?.lastEpisode ?? 0;

  // 最大値だけ保持（前の話を再読してもリセットしない）
  if (episodeNumber > current || !existing) {
    history[novelId] = {
      novelId,
      slug: meta?.slug ?? existing?.slug ?? "",
      title: meta?.title ?? existing?.title ?? "",
      genre: meta?.genre ?? existing?.genre ?? "",
      coverImageUrl: meta?.coverImageUrl ?? existing?.coverImageUrl ?? null,
      lastEpisode: Math.max(episodeNumber, current),
      totalChapters: meta?.totalChapters ?? existing?.totalChapters ?? 0,
      updatedAt: new Date().toISOString(),
    };
    saveStoredHistory(history);
  } else if (meta?.title && existing && !existing.title) {
    // メタデータ補完（旧形式からマイグレーションした場合）
    history[novelId] = { ...existing, ...meta, novelId };
    saveStoredHistory(history);
  }
}

// 最後に読んだ話数を取得
export function getLastReadEpisode(novelId: string): number | null {
  const history = getStoredHistory();
  return history[novelId]?.lastEpisode ?? null;
}

// 全履歴をリッチデータで取得（最近読んだ順）
export function getAllReadingHistory(): ReadingHistoryEntry[] {
  const history = getStoredHistory();
  return Object.values(history).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// 読書履歴があるか（初回訪問判定用）
export function hasReadingHistory(): boolean {
  const history = getStoredHistory();
  return Object.keys(history).length > 0;
}

// 全履歴を削除
export function clearReadingHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
