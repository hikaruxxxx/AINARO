/**
 * アンサンブルモデル: 統計特徴量 + 高次分析 + 最適重み探索
 *
 * 全モデルのスコアを読み込み、最適な組み合わせを網羅探索する。
 */

import * as fs from "fs";
import * as path from "path";

const dataDir = path.resolve(__dirname, "../data");
const tierRankMap: Record<string, number> = { top: 5, upper: 4, mid: 3, lower: 2, bottom: 1 };

// --- 統計特徴量の全データを読み込み ---
const v2Results = JSON.parse(fs.readFileSync(path.join(dataDir, "experiments/popularity-validation-v2.json"), "utf-8"));
const llmResults = JSON.parse(fs.readFileSync(path.join(dataDir, "experiments/llm-proxy-eval-results.json"), "utf-8"));
const selfLearning = JSON.parse(fs.readFileSync(path.join(dataDir, "experiments/self-learning-results.json"), "utf-8"));

// ncodeでjoin
const statScores: Record<string, Record<string, number>> = {};
for (const w of v2Results.workResults) {
  statScores[w.ncode] = w;
}

const llmScores: Record<string, Record<string, number>> = {};
for (const r of llmResults.results) {
  llmScores[r.ncode] = r;
}

// 共通のncodeだけ使用
const commonNcodes = Object.keys(statScores).filter(n => llmScores[n]);
console.log(`\n=== アンサンブルモデル最適化 ===`);
console.log(`共通データ: ${commonNcodes.length}作品\n`);

// --- 各モデルの個別スコア ---
interface JoinedData {
  ncode: string;
  tier: string;
  tierRank: number;
  // 統計特徴量（個別）
  avgSentenceLength: number;
  sentenceLengthCV: number;
  dialogueRatio: number;
  shortSentenceRatio: number;
  emotionDensity: number;
  questionRatio: number;
  exclamationRatio: number;
  burstRatio: number;
  // 高次分析
  prose: number;
  dialogue: number;
  tension: number;
  pull: number;
  llmTotal: number;
}

const joined: JoinedData[] = commonNcodes.map(ncode => {
  const stat = statScores[ncode];
  const llm = llmScores[ncode];
  return {
    ncode,
    tier: stat.tier || llm.tier,
    tierRank: tierRankMap[stat.tier || llm.tier],
    avgSentenceLength: stat.avgSentenceLength || 0,
    sentenceLengthCV: stat.sentenceLengthCV || 0,
    dialogueRatio: stat.dialogueRatio || 0,
    shortSentenceRatio: stat.shortSentenceRatio || 0,
    emotionDensity: stat.emotionDensity || 0,
    questionRatio: stat.questionRatio || 0,
    exclamationRatio: stat.exclamationRatio || 0,
    burstRatio: stat.burstRatio || 0,
    prose: llm.prose || 0,
    dialogue: llm.dialogue || 0,
    tension: llm.tension || 0,
    pull: llm.pull || 0,
    llmTotal: llm.total || 0,
  };
});

// --- スピアマン ---
function spearman(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  function rank(arr: number[]): number[] {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    for (let i = 0; i < n; i++) ranks[sorted[i].i] = i + 1;
    return ranks;
  }
  const rx = rank(x);
  const ry = rank(y);
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const tierValues = joined.map(d => d.tierRank);

// --- 全特徴量の個別相関（再計算） ---
const featureKeys: (keyof JoinedData)[] = [
  "avgSentenceLength", "sentenceLengthCV", "dialogueRatio", "shortSentenceRatio",
  "emotionDensity", "questionRatio", "exclamationRatio", "burstRatio",
  "prose", "dialogue", "tension", "pull", "llmTotal",
];

console.log("特徴量の個別相関:");
const corrs: { key: string; corr: number }[] = [];
for (const key of featureKeys) {
  const values = joined.map(d => d[key] as number);
  const corr = spearman(values, tierValues);
  corrs.push({ key, corr });
}
corrs.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
for (const { key, corr } of corrs) {
  console.log(`  ${key.padEnd(25)} ${corr.toFixed(3)}`);
}

// --- 網羅的重み探索 ---
// 上位相関特徴量の重みを0, ±1, ±2で網羅探索（計算量を抑えるため上位6個）
const topFeatures = corrs.slice(0, 8).map(c => c.key);
console.log(`\n探索対象特徴量: ${topFeatures.join(", ")}`);

let bestSpearman = -1;
let bestWeights: Record<string, number> = {};
let bestTierMedians: Record<string, number> = {};

const weightOptions = [-2, -1, 0, 1, 2];

// 上位4特徴量で網羅探索（5^4 = 625通り）、残りは相関の符号で固定
const searchFeatures = topFeatures.slice(0, 4);
const fixedFeatures = topFeatures.slice(4);

const fixedWeights: Record<string, number> = {};
for (const key of fixedFeatures) {
  const c = corrs.find(c => c.key === key);
  fixedWeights[key] = c ? Math.sign(c.corr) : 0;
}

let explored = 0;

function explore(depth: number, weights: Record<string, number>) {
  if (depth === searchFeatures.length) {
    // 全重みが0ならスキップ
    if (Object.values(weights).every(w => w === 0) && Object.values(fixedWeights).every(w => w === 0)) return;

    const allWeights = { ...weights, ...fixedWeights };
    const scores = joined.map(d => {
      let s = 0;
      let wSum = 0;
      for (const [k, w] of Object.entries(allWeights)) {
        if (w === 0) continue;
        s += (d[k as keyof JoinedData] as number) * w;
        wSum += Math.abs(w);
      }
      return wSum > 0 ? s / wSum : 0;
    });

    const sp = spearman(scores, tierValues);
    explored++;

    if (sp > bestSpearman) {
      bestSpearman = sp;
      bestWeights = { ...allWeights };

      // tier中央値
      const tiers = ["top", "upper", "mid", "lower", "bottom"];
      bestTierMedians = {};
      for (const tier of tiers) {
        const tierScores = joined.filter(d => d.tier === tier).map((d, i) => scores[joined.indexOf(d)]).sort((a, b) => a - b);
        if (tierScores.length > 0) bestTierMedians[tier] = tierScores[Math.floor(tierScores.length / 2)];
      }
    }
    return;
  }

  const key = searchFeatures[depth];
  for (const w of weightOptions) {
    weights[key] = w;
    explore(depth + 1, weights);
  }
  delete weights[key];
}

explore(0, {});

console.log(`\n探索完了: ${explored}通り`);
console.log(`\nベストモデル:`);
console.log(`  スピアマン: ${bestSpearman.toFixed(3)}`);
console.log(`  重み:`);
for (const [k, w] of Object.entries(bestWeights)) {
  if (w !== 0) console.log(`    ${k}: ${w}`);
}

console.log(`\n  tier中央値:`);
const tiers = ["top", "upper", "mid", "lower", "bottom"];
let monotonic = true;
let prev = Infinity;
for (const tier of tiers) {
  const v = bestTierMedians[tier];
  if (v !== undefined) {
    const ok = v <= prev;
    if (!ok) monotonic = false;
    console.log(`    ${tier}: ${v.toFixed(4)} ${ok ? "✓" : "✗"}`);
    prev = v;
  }
}
console.log(`  単調性: ${monotonic ? "✓" : "✗"}`);

// --- F1も計算 ---
const finalScores = joined.map(d => {
  let s = 0, wSum = 0;
  for (const [k, w] of Object.entries(bestWeights)) {
    if (w === 0) continue;
    s += (d[k as keyof JoinedData] as number) * w;
    wSum += Math.abs(w);
  }
  return wSum > 0 ? s / wSum : 0;
});

const topBottom = joined.filter(d => d.tier === "top" || d.tier === "bottom");
let bestF1 = 0;
for (let t = -5; t <= 5; t += 0.05) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const d of topBottom) {
    const idx = joined.indexOf(d);
    const pred = finalScores[idx] >= t;
    const isTop = d.tier === "top";
    if (pred && isTop) tp++;
    else if (pred && !isTop) fp++;
    else if (!pred && isTop) fn++;
    else tn++;
  }
  const p = tp / (tp + fp) || 0;
  const r = tp / (tp + fn) || 0;
  const f1 = p + r > 0 ? 2 * p * r / (p + r) : 0;
  if (f1 > bestF1) bestF1 = f1;
}

console.log(`\n  F1 (top/bottom): ${(bestF1 * 100).toFixed(1)}%`);

// 最終比較
console.log("\n=== 全モデル最終比較 ===\n");
console.log("モデル\t\t\tスピアマン\tF1");
console.log(`線形統計(v2)\t\t0.264\t\t85.2%`);
console.log(`ランダムフォレスト\t0.247\t\t81.4%`);
console.log(`高次テキスト分析\t-0.080\t\t73.7%`);
console.log(`アンサンブル最適化\t${bestSpearman.toFixed(3)}\t\t${(bestF1 * 100).toFixed(1)}%`);

// 保存
fs.writeFileSync(path.join(dataDir, "experiments/ensemble-best-model.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  performance: { spearman: parseFloat(bestSpearman.toFixed(3)), binaryF1: parseFloat((bestF1 * 100).toFixed(1)), monotonic },
  weights: bestWeights,
  tierMedians: bestTierMedians,
  explored,
}, null, 2));
