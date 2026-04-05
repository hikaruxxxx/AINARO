"use client";

// ローカル読書履歴管理
// localStorageに最後に読んだエピソード番号を保存
// Supabaseのreading_eventsと併用するが、こちらは即座にUIに反映するための軽量キャッシュ

const STORAGE_KEY = "ainaro_reading_history";

type ReadingHistory = Record<string, number>; // novel_id → 最後に読んだ episode_number

function getHistory(): ReadingHistory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHistory(history: ReadingHistory) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// 読んだエピソードを記録
export function markEpisodeRead(novelId: string, episodeNumber: number) {
  const history = getHistory();
  const current = history[novelId] ?? 0;
  // 最大値だけ保持（前の話を再読してもリセットしない）
  if (episodeNumber > current) {
    history[novelId] = episodeNumber;
    saveHistory(history);
  }
}

// 最後に読んだ話数を取得
export function getLastReadEpisode(novelId: string): number | null {
  const history = getHistory();
  return history[novelId] ?? null;
}

// 全履歴を取得
export function getAllReadingHistory(): ReadingHistory {
  return getHistory();
}
