// logline重複排除
// 埋め込みAPIに依存せず、文字bigramのJaccard類似度で十分機能する
// （短文かつ日本語形態素の重複に強い）。閾値は実運用で調整。

export const SIMILARITY_THRESHOLD = 0.55;

/** 文字bigram集合に変換 */
function bigrams(text: string): Set<string> {
  const norm = text.replace(/\s/g, "").toLowerCase();
  const set = new Set<string>();
  for (let i = 0; i < norm.length - 1; i++) {
    set.add(norm.slice(i, i + 2));
  }
  return set;
}

/** Jaccard類似度（0〜1） */
export function jaccard(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** 既存loglineと閾値以上類似していれば true */
export function isDuplicate(
  candidate: string,
  existing: readonly string[],
  threshold = SIMILARITY_THRESHOLD,
): boolean {
  for (const e of existing) {
    if (jaccard(candidate, e) >= threshold) return true;
  }
  return false;
}

/** 候補配列から重複を順次排除して返す（先着優先） */
export function dedupLoglines(
  candidates: readonly string[],
  history: readonly string[] = [],
  threshold = SIMILARITY_THRESHOLD,
): string[] {
  const accepted: string[] = [];
  const all: string[] = [...history];
  for (const c of candidates) {
    if (!isDuplicate(c, all, threshold)) {
      accepted.push(c);
      all.push(c);
    }
  }
  return accepted;
}
