"use client";

const STORAGE_KEY = "ainaro_swipe_history";

export type SwipeRecord = {
  novelId: string;
  direction: "right" | "left";
  genre: string;
  tags: string[];
  timestamp: string;
};

export function getSwipeHistory(): SwipeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addSwipe(record: Omit<SwipeRecord, "timestamp">): void {
  const history = getSwipeHistory();
  // 同じ作品の既存レコードを上書き
  const filtered = history.filter((r) => r.novelId !== record.novelId);
  filtered.push({ ...record, timestamp: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function getSwipedNovelIds(): Set<string> {
  return new Set(getSwipeHistory().map((r) => r.novelId));
}

export function clearSwipeHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// スワイプ統計: ジャンル/タグごとの好み傾向を集計
export function getSwipeStats(): {
  genreScores: Map<string, number>;
  tagScores: Map<string, number>;
  likedCount: number;
  totalCount: number;
} {
  const history = getSwipeHistory();
  const genreScores = new Map<string, number>();
  const tagScores = new Map<string, number>();
  let likedCount = 0;

  const now = Date.now();

  for (const record of history) {
    // 時間減衰: 古いスワイプほど影響が小さい
    const daysSince = (now - new Date(record.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const decay = 1 / (1 + daysSince * 0.1);

    const sign = record.direction === "right" ? 1 : -1;
    if (record.direction === "right") likedCount++;

    // ジャンルスコア: 右+3, 左-1
    const genreWeight = record.direction === "right" ? 3 : -1;
    const prev = genreScores.get(record.genre) || 0;
    genreScores.set(record.genre, prev + genreWeight * decay);

    // タグスコア: 右+1.5, 左-0.5
    for (const tag of record.tags) {
      const tagWeight = record.direction === "right" ? 1.5 : -0.5;
      const prevTag = tagScores.get(tag) || 0;
      tagScores.set(tag, prevTag + tagWeight * decay);
    }
  }

  return { genreScores, tagScores, likedCount, totalCount: history.length };
}
