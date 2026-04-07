/**
 * LLM評価精度分析スクリプト
 *
 * v3スコアファイルを読み込み、GPとの相関・ティア分析・ジャンル別精度を出力する。
 *
 * 実行: npx tsx scripts/llm-eval-analysis.ts
 */

import * as fs from "fs";
import * as path from "path";

const SCORES_FILE = path.resolve(__dirname, "../data/experiments/llm-feature-scores-v3.json");

interface Result {
  ncode: string;
  gp: number;
  genre: string;
  totalEpisodes: number;
  scores: { hook: number; character: number; originality: number; prose: number; tension: number; pull: number };
  total: number;
  evalMeta: {
    episodeUsed: number;
    textLength: number;
    isStoryContent: boolean;
    contentFilter: string;
    evaluatedAt: string;
  };
}

// --- 統計関数 ---

/** タイ対応スピアマン順位相関 */
function spearmanRho(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 5) return NaN;
  const rx = tieCorrectedRanks(x);
  const ry = tieCorrectedRanks(y);
  const dSq = rx.reduce((sum, _, i) => sum + (rx[i] - ry[i]) ** 2, 0);
  return 1 - (6 * dSq) / (n * (n * n - 1));
}

function tieCorrectedRanks(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++;
    const avgRank = (i + j - 1) / 2; // 0-indexed平均順位
    for (let k = i; k < j; k++) ranks[indexed[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- メイン ---

function main() {
  if (!fs.existsSync(SCORES_FILE)) {
    console.error(`スコアファイルが見つかりません: ${SCORES_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SCORES_FILE, "utf-8"));
  const all: Result[] = data.results;
  const valid = all.filter((r) => r.gp > 0 && r.scores);
  const story = valid.filter((r) => r.evalMeta?.isStoryContent !== false);
  const nonStory = valid.filter((r) => r.evalMeta?.isStoryContent === false);

  console.log("=== LLM評価精度分析 ===");
  console.log(`全作品: ${all.length}, 有効(gp>0): ${valid.length}`);
  console.log(`物語テキスト: ${story.length}, 非物語(キャラ一覧等): ${nonStory.length}`);

  // コンテンツフィルタ統計
  const filterStats = new Map<string, number>();
  for (const r of all) {
    const f = r.evalMeta?.contentFilter || "unknown";
    filterStats.set(f, (filterStats.get(f) || 0) + 1);
  }
  console.log("\n--- コンテンツフィルタ ---");
  for (const [k, v] of [...filterStats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  // 全体相関
  console.log("\n--- 全体相関 (gp vs スコア) ---");
  const dims = ["pull", "hook", "character", "originality", "prose", "tension", "total"] as const;
  for (const subset of [
    { label: "全体", data: valid },
    { label: "物語のみ", data: story },
  ]) {
    console.log(`\n  [${subset.label}] (n=${subset.data.length})`);
    for (const dim of dims) {
      const gps = subset.data.map((r) => r.gp);
      const scores = subset.data.map((r) => (dim === "total" ? r.total : r.scores[dim]));
      const rho = spearmanRho(gps, scores);
      console.log(`    gp vs ${dim.padEnd(12)}: rho=${rho.toFixed(4)}`);
    }
  }

  // GPティア分析
  const tiers = [
    { label: "mega (100k+)", lo: 100000, hi: Infinity },
    { label: "large (30k-100k)", lo: 30000, hi: 100000 },
    { label: "mid (5k-30k)", lo: 5000, hi: 30000 },
    { label: "small (<5k)", lo: 0, hi: 5000 },
  ];

  console.log("\n--- GPティア別 (物語のみ) ---");
  console.log(`  ${"ティア".padEnd(20)} ${"n".padStart(4)} ${"avg_pull".padStart(9)} ${"med_pull".padStart(9)} ${"avg_total".padStart(10)}`);
  for (const tier of tiers) {
    const t = story.filter((r) => r.gp >= tier.lo && r.gp < tier.hi);
    if (t.length === 0) continue;
    const pulls = t.map((r) => r.scores.pull);
    const totals = t.map((r) => r.total);
    console.log(
      `  ${tier.label.padEnd(20)} ${String(t.length).padStart(4)} ${mean(pulls).toFixed(2).padStart(9)} ${median(pulls).toFixed(1).padStart(9)} ${mean(totals).toFixed(2).padStart(10)}`
    );
  }

  // ジャンル別相関
  const genreMap = new Map<string, Result[]>();
  for (const r of story) {
    const g = r.genre || "unknown";
    if (!genreMap.has(g)) genreMap.set(g, []);
    genreMap.get(g)!.push(r);
  }

  console.log("\n--- ジャンル別相関 (物語のみ, n>=10) ---");
  console.log(`  ${"ジャンル".padEnd(28)} ${"n".padStart(4)} ${"rho(pull)".padStart(10)} ${"avg_pull".padStart(9)}`);
  const genreEntries = [...genreMap.entries()]
    .filter(([, items]) => items.length >= 10)
    .sort((a, b) => b[1].length - a[1].length);

  for (const [genre, items] of genreEntries) {
    const rho = spearmanRho(
      items.map((r) => r.gp),
      items.map((r) => r.scores.pull)
    );
    const avgPull = mean(items.map((r) => r.scores.pull));
    console.log(
      `  ${genre.padEnd(28)} ${String(items.length).padStart(4)} ${rho.toFixed(3).padStart(10)} ${avgPull.toFixed(2).padStart(9)}`
    );
  }

  // スコア分布
  console.log("\n--- pull スコア分布 (物語のみ) ---");
  for (let s = 1; s <= 10; s++) {
    const count = story.filter((r) => r.scores.pull === s).length;
    const bar = "█".repeat(Math.round(count / 3));
    console.log(`  ${String(s).padStart(2)}: ${String(count).padStart(3)} ${bar}`);
  }

  // 過大/過小評価サンプル
  console.log("\n--- 過大評価 (pull>=8 & gp<3000, 物語のみ) ---");
  const overrated = story.filter((r) => r.scores.pull >= 8 && r.gp < 3000).slice(0, 5);
  for (const r of overrated) {
    console.log(`  ${r.ncode}: pull=${r.scores.pull}, gp=${r.gp}, genre=${r.genre}`);
  }

  console.log("\n--- 過小評価 (pull<=3 & gp>50000, 物語のみ) ---");
  const underrated = story.filter((r) => r.scores.pull <= 3 && r.gp > 50000).slice(0, 5);
  for (const r of underrated) {
    console.log(`  ${r.ncode}: pull=${r.scores.pull}, gp=${r.gp}, genre=${r.genre}`);
  }
}

main();
