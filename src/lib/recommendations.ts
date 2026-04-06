// パーソナライズドレコメンデーション
// 読書履歴とジャンル嗜好からおすすめ作品を選出

import type { Novel } from "@/types/novel";
import type { SwipeRecord } from "./swipe-history";

type ReadingHistoryEntry = {
  novelId: string;
  lastEpisode: number;
  lastReadAt: string;
};

// localStorageの読書履歴からジャンル嗜好を算出
function getGenrePreferences(
  history: ReadingHistoryEntry[],
  novels: Novel[]
): Map<string, number> {
  const prefs = new Map<string, number>();

  for (const entry of history) {
    const novel = novels.find((n) => n.id === entry.novelId);
    if (!novel) continue;
    // 読んだ話数が多いほどスコアを高く
    const score = Math.min(entry.lastEpisode, 10);
    prefs.set(novel.genre, (prefs.get(novel.genre) || 0) + score);
    // タグにもスコア加算（ジャンルより小さめ）
    for (const tag of novel.tags) {
      prefs.set(`tag:${tag}`, (prefs.get(`tag:${tag}`) || 0) + score * 0.5);
    }
  }

  return prefs;
}

// スワイプ信号からジャンル/タグスコアを算出
function getSwipePreferences(swipeHistory: SwipeRecord[]): Map<string, number> {
  const prefs = new Map<string, number>();
  const now = Date.now();

  for (const record of swipeHistory) {
    const daysSince = (now - new Date(record.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const decay = 1 / (1 + daysSince * 0.1);

    // ジャンル: 右+3, 左-1
    const genreWeight = record.direction === "right" ? 3 : -1;
    prefs.set(record.genre, (prefs.get(record.genre) || 0) + genreWeight * decay);

    // タグ: 右+1.5, 左-0.5
    for (const tag of record.tags) {
      const tagWeight = record.direction === "right" ? 1.5 : -0.5;
      const key = `tag:${tag}`;
      prefs.set(key, (prefs.get(key) || 0) + tagWeight * decay);
    }
  }

  return prefs;
}

// パーソナライズドレコメンデーション算出
// swipeHistory を渡すと、スワイプ信号もスコアリングに統合
export function getPersonalizedRecommendations(
  allNovels: Novel[],
  readingHistory: ReadingHistoryEntry[],
  limit: number = 6,
  swipeHistory?: SwipeRecord[]
): Novel[] {
  if (readingHistory.length === 0 && (!swipeHistory || swipeHistory.length === 0)) return [];

  const readNovelIds = new Set(readingHistory.map((h) => h.novelId));
  const readingPrefs = getGenrePreferences(readingHistory, allNovels);
  const swipePrefs = swipeHistory ? getSwipePreferences(swipeHistory) : new Map<string, number>();

  // 未読作品にスコアを付与
  const scored = allNovels
    .filter((n) => !readNovelIds.has(n.id))
    .map((novel) => {
      let score = 0;
      // 読書履歴ベースのジャンル/タグスコア
      score += readingPrefs.get(novel.genre) || 0;
      for (const tag of novel.tags) {
        score += readingPrefs.get(`tag:${tag}`) || 0;
      }
      // スワイプベースのジャンル/タグスコア
      score += swipePrefs.get(novel.genre) || 0;
      for (const tag of novel.tags) {
        score += swipePrefs.get(`tag:${tag}`) || 0;
      }
      // PVでの底上げ
      score += Math.log10(Math.max(novel.total_pv, 1)) * 0.5;
      return { novel, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.novel);
}
