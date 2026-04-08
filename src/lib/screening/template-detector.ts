// テンプレ化検出: 作品間の類似度をMinHash/Jaccardで計算してクラスタを検出
//
// 背景: batch_002 の breakup系15作品が「ほぼ同一の冒頭テンプレ」で50%付近に団子化した。
// LLM評価では捕まえにくいので、決定論的な類似度検査で事後検出する。
//
// 設計:
// - 各本文の冒頭500字を bigram set 化
// - MinHash で署名を生成(K=128)
// - 全ペアの Jaccard 類似度を推定
// - 類似度 >= THRESHOLD(0.6) のペアをクラスタ化
// - クラスタサイズ >= MIN_CLUSTER_SIZE(3) なら「テンプレ群」として警告

const HEAD_CHARS = 500;
const NGRAM_N = 2;
const MINHASH_K = 128;
const SIMILARITY_THRESHOLD = 0.6;
const MIN_CLUSTER_SIZE = 3;

export interface TemplateCluster {
  members: string[]; // slugs
  representativeJaccard: number; // 代表値
}

export interface TemplateDetectionReport {
  totalWorks: number;
  clusters: TemplateCluster[];
  flaggedSlugs: string[];
}

/** bigram set 抽出 */
function bigramSet(text: string, n = NGRAM_N): Set<string> {
  const head = text.replace(/\s/g, "").slice(0, HEAD_CHARS);
  const set = new Set<string>();
  for (let i = 0; i <= head.length - n; i++) {
    set.add(head.slice(i, i + n));
  }
  return set;
}

/** ハッシュ関数: FNV-1a */
function fnv1a(str: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** MinHash 署名生成 */
export function minhash(set: Set<string>, k = MINHASH_K): number[] {
  const sig = new Array<number>(k).fill(0xffffffff);
  for (const item of set) {
    for (let i = 0; i < k; i++) {
      const h = fnv1a(item, i);
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

/** MinHash署名同士のJaccard推定 */
export function jaccardEstimate(sigA: number[], sigB: number[]): number {
  if (sigA.length !== sigB.length) return 0;
  let match = 0;
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] === sigB[i]) match++;
  }
  return match / sigA.length;
}

/** 厳密Jaccard(検証用) */
export function jaccardExact(setA: Set<string>, setB: Set<string>): number {
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 作品群のテンプレクラスタを検出する。
 * works: { slug, text } の配列
 */
export function detectTemplateClusters(
  works: { slug: string; text: string }[],
  threshold = SIMILARITY_THRESHOLD,
  minClusterSize = MIN_CLUSTER_SIZE,
): TemplateDetectionReport {
  if (works.length < 2) {
    return { totalWorks: works.length, clusters: [], flaggedSlugs: [] };
  }

  // 各作品の MinHash 署名
  const signatures = works.map((w) => ({
    slug: w.slug,
    sig: minhash(bigramSet(w.text)),
  }));

  // Union-Find でクラスタ化
  const parent = new Map<string, string>();
  const find = (s: string): string => {
    let p = parent.get(s) ?? s;
    while (p !== (parent.get(p) ?? p)) {
      p = parent.get(p) ?? p;
    }
    parent.set(s, p);
    return p;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // 全ペア比較(N^2、works数が数百なら問題ない)
  const pairwise: Array<{ a: string; b: string; sim: number }> = [];
  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const sim = jaccardEstimate(signatures[i].sig, signatures[j].sig);
      if (sim >= threshold) {
        union(signatures[i].slug, signatures[j].slug);
        pairwise.push({ a: signatures[i].slug, b: signatures[j].slug, sim });
      }
    }
  }

  // クラスタ集約
  const clusters = new Map<string, { members: string[]; sims: number[] }>();
  for (const sig of signatures) {
    const root = find(sig.slug);
    if (!clusters.has(root)) {
      clusters.set(root, { members: [], sims: [] });
    }
    clusters.get(root)!.members.push(sig.slug);
  }
  for (const pw of pairwise) {
    const root = find(pw.a);
    const c = clusters.get(root);
    if (c) c.sims.push(pw.sim);
  }

  const result: TemplateCluster[] = [];
  const flagged: string[] = [];
  for (const [, c] of clusters) {
    if (c.members.length >= minClusterSize) {
      const avg = c.sims.length > 0 ? c.sims.reduce((a, b) => a + b, 0) / c.sims.length : 0;
      result.push({ members: c.members, representativeJaccard: avg });
      flagged.push(...c.members);
    }
  }

  return {
    totalWorks: works.length,
    clusters: result,
    flaggedSlugs: flagged,
  };
}
