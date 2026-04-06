// パーソナライズドレコメンデーション
// 読書履歴とジャンル嗜好からおすすめ作品を選出

import type { Novel } from "@/types/novel";

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

// パーソナライズドレコメンデーション算出
export function getPersonalizedRecommendations(
  allNovels: Novel[],
  readingHistory: ReadingHistoryEntry[],
  limit: number = 6
): Novel[] {
  if (readingHistory.length === 0) return [];

  const readNovelIds = new Set(readingHistory.map((h) => h.novelId));
  const prefs = getGenrePreferences(readingHistory, allNovels);

  // 未読作品にスコアを付与
  const scored = allNovels
    .filter((n) => !readNovelIds.has(n.id))
    .map((novel) => {
      let score = 0;
      // ジャンル一致
      score += prefs.get(novel.genre) || 0;
      // タグ一致
      for (const tag of novel.tags) {
        score += prefs.get(`tag:${tag}`) || 0;
      }
      // PVでの底上げ（人気作品を少し優遇）
      score += Math.log10(Math.max(novel.total_pv, 1)) * 0.5;
      return { novel, score };
    });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.novel);
}
