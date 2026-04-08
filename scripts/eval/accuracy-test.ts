/**
 * 人気予測エージェントの分類精度テスト
 *
 * 全クロール済み作品に対して analyzePopularity を実行し、
 * スコア/グレードと実際のtierの一致度を計算する。
 *
 * 実行: npx tsx scripts/accuracy-test.ts
 */

import * as fs from "fs";
import * as path from "path";

// analyzePopularityを直接importできないので、
// Node.js環境でもimportできるようにtsconfig.pathsを解決する
// → tsx は @/ エイリアスを解決できないので、相対パスでimport

// --- analyzer のコードを直接コピーして使う代わりに、
//     APIエンドポイントを叩く方式にする ---
// → ローカルサーバーが必要なので、直接importする

// tsxではパスエイリアスが使えないので、ビルド済みを使うか直接パスで参照
// ここでは特徴量を抽出して、スコアリングロジックを再現する

// --- 特徴量抽出（validate-popularity.tsと同じ） ---

const EMOTION_WORDS = [
  "嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し",
  "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく",
  "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ",
  "悲しい", "悲し", "泣い", "泣き", "涙", "辛い",
  "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖",
  "不安", "心配", "焦り", "焦っ", "怒り", "怒っ",
  "悔し", "絶望", "寂し", "孤独",
  "驚い", "驚き", "まさか", "呆然",
  "緊張", "震え", "息を呑",
];

const SENSORY_WORDS: Record<string, string[]> = {
  visual: ["見え", "見つめ", "眺め", "輝い", "光", "色", "瞳", "目", "姿", "影", "闇"],
  auditory: ["聞こえ", "響い", "音", "声", "叫び", "囁い", "静か", "沈黙"],
  tactile: ["触れ", "肌", "温かい", "冷たい", "熱い", "柔らか", "握っ", "抱き"],
  olfactory: ["匂い", "香り"],
  gustatory: ["味", "甘い", "苦い"],
};

function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))); }

// --- v2キャリブレーション済みのスコアリングロジック ---

function scorePacing(text: string): number {
  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length < 5) return 50;

  const lengths = sentences.map(s => s.length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(lengths.reduce((acc, l) => acc + (l - avg) ** 2, 0) / lengths.length);
  const cv = avg > 0 ? stdDev / avg : 0;
  const shortRatio = lengths.filter(l => l <= 20).length / lengths.length;

  let score = 50;
  if (cv >= 0.5 && cv <= 0.7) score += 25;
  else if (cv >= 0.4 && cv <= 0.8) score += 15;
  else if (cv < 0.4) score += 0;
  else score -= 10;

  if (shortRatio >= 0.2 && shortRatio <= 0.4) score += 15;
  else if (shortRatio > 0.45) score -= 10;

  if (avg >= 25 && avg <= 45) score += 10;
  else if (avg < 20) score -= 10;
  else if (avg > 55) score -= 5;

  return clamp(score);
}

function scoreDialogueRatio(text: string): number {
  const dialogues = (text.match(/「[^」]*」/g) || []).join("").length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return 0;
  const ratio = dialogues / total;

  if (ratio >= 0.15 && ratio <= 0.30) return 85;
  if (ratio >= 0.10 && ratio <= 0.40) return 65;
  if (ratio > 0.40) return 35;
  if (ratio < 0.05) return 30;
  return 50;
}

function scoreEmotionalArc(text: string): number {
  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length < 3) return 50;

  const densities = paragraphs.map(p => {
    const count = EMOTION_WORDS.filter(w => p.includes(w)).length;
    return p.length > 0 ? count / (p.length / 100) : 0;
  });

  const avgDensity = densities.reduce((a, b) => a + b, 0) / densities.length;
  const range = Math.max(...densities) - Math.min(...densities);
  const totalEmotions = EMOTION_WORDS.filter(w => text.includes(w)).length;

  if (totalEmotions === 0) return 20;

  let score = 40;
  if (avgDensity >= 0.5 && avgDensity <= 3.0) score += 20;
  else if (avgDensity > 3.0) score += 10;
  if (range >= 1.0) score += 20;
  else if (range >= 0.5) score += 10;

  const latterHalf = densities.slice(Math.floor(densities.length / 2));
  if (Math.max(...latterHalf) >= avgDensity * 1.5) score += 10;

  return clamp(score);
}

function scoreHook(text: string): number {
  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  const opening = paragraphs.slice(0, 3).join("\n");
  const openingSentences = opening.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);

  let score = 40;
  if (openingSentences.some(s => s.includes("？") || s.includes("?"))) score += 15;
  if (openingSentences.some(s => s.includes("！") || s.includes("!"))) score += 10;
  if (openingSentences.filter(s => s.length <= 20).length >= 2) score += 10;
  if (EMOTION_WORDS.filter(w => opening.includes(w)).length >= 2) score += 10;
  if (paragraphs[0]?.startsWith("「")) score += 10;

  return clamp(score);
}

function scoreCliffhanger(text: string): number {
  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length === 0) return 0;
  const ending = paragraphs.slice(-3).join("\n");
  const sentences = ending.split(/(?<=[。！？!?])/).filter(s => s.trim().length > 0);
  const last = sentences[sentences.length - 1] || "";

  let score = 30;
  if (last.includes("？") || last.includes("?") || last.endsWith("だろうか")) score += 25;
  const tensionWords = ["しかし", "だが", "その時", "まさか", "突然", "不意に", "異変", "予感"];
  if (tensionWords.some(w => ending.includes(w))) score += 20;
  if (last.includes("……") || last.includes("――") || last.includes("…")) score += 15;
  if (EMOTION_WORDS.some(w => ending.includes(w))) score += 10;

  return clamp(score);
}

function scoreReadability(text: string): number {
  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length === 0) return 0;

  const avgLen = sentences.reduce((acc, s) => acc + s.length, 0) / sentences.length;
  let score = 50;
  if (avgLen >= 20 && avgLen <= 50) score += 15;
  else if (avgLen > 70) score -= 10;

  const commas = (text.match(/、/g) || []).length;
  if (commas / sentences.length <= 2.5 && commas / sentences.length >= 0.5) score += 10;

  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars >= 3000 && totalChars <= 5000) score += 5;

  return clamp(score);
}

function scoreSensory(text: string): number {
  const count = Object.values(SENSORY_WORDS).filter(words => words.some(w => text.includes(w))).length;
  if (count >= 4) return 90;
  if (count === 3) return 70;
  if (count === 2) return 50;
  if (count === 1) return 30;
  return 10;
}

function scoreInnerMonologue(text: string): number {
  const monologues = (text.match(/（[^）]*）/g) || []).join("").length;
  const total = text.replace(/\s/g, "").length;
  if (total === 0) return 0;
  const ratio = monologues / total;

  if (ratio >= 0.05 && ratio <= 0.15) return 85;
  if (ratio >= 0.02 && ratio <= 0.25) return 65;
  if (ratio === 0) return 40;
  if (ratio > 0.25) return 40;
  return 50;
}

// --- 総合スコア計算（v2キャリブレーション済み重み） ---

function calculateOverallScore(text: string): { score: number; grade: string } {
  const weights = {
    hookStrength: 12,
    pacing: 18,
    dialogueRatio: 14,
    innerMonologue: 8,
    cliffhanger: 13,
    emotionalArc: 16,
    sensoryDescription: 7,
    readability: 12,
  };

  const scores = {
    hookStrength: scoreHook(text),
    pacing: scorePacing(text),
    dialogueRatio: scoreDialogueRatio(text),
    innerMonologue: scoreInnerMonologue(text),
    cliffhanger: scoreCliffhanger(text),
    emotionalArc: scoreEmotionalArc(text),
    sensoryDescription: scoreSensory(text),
    readability: scoreReadability(text),
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let weightedSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    weightedSum += scores[k as keyof typeof scores] * w;
  }

  const score = clamp(Math.round(weightedSum / totalWeight));
  const grade = score >= 90 ? "S" : score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D";
  return { score, grade };
}

// --- メイン ---

function main() {
  const dataDir = path.resolve(__dirname, "../data");
  const crawledDir = path.join(dataDir, "crawled");
  const targets = JSON.parse(fs.readFileSync(path.join(dataDir, "targets/stratified_all.json"), "utf-8"));
  const crawlLog = JSON.parse(fs.readFileSync(path.join(crawledDir, "_crawl_log.json"), "utf-8"));

  const tierMap: Record<string, { tier: string; gp: number }> = {};
  for (const t of targets) tierMap[t.ncode] = { tier: t.tier, gp: t.globalPoint };

  const tierOrder = ["top", "upper", "mid", "lower", "bottom"];

  // 作品ごとに平均スコアを計算
  const results: { ncode: string; tier: string; gp: number; avgScore: number; grade: string; epCount: number }[] = [];

  for (const [ncode, log] of Object.entries(crawlLog) as [string, { episodes: number }][]) {
    if (!log.episodes) continue;
    const info = tierMap[ncode];
    if (!info) continue;

    const epScores: number[] = [];
    for (let i = 1; i <= log.episodes; i++) {
      const f = path.join(crawledDir, ncode, `ep${String(i).padStart(4, "0")}.json`);
      if (!fs.existsSync(f)) continue;
      try {
        const ep = JSON.parse(fs.readFileSync(f, "utf-8"));
        if (!ep.bodyText || ep.bodyText.length < 300) continue;
        const { score } = calculateOverallScore(ep.bodyText);
        epScores.push(score);
      } catch { continue; }
    }

    if (epScores.length < 2) continue;

    const avgScore = Math.round(epScores.reduce((a, b) => a + b, 0) / epScores.length);
    const grade = avgScore >= 90 ? "S" : avgScore >= 80 ? "A" : avgScore >= 60 ? "B" : avgScore >= 40 ? "C" : "D";

    results.push({ ncode, tier: info.tier, gp: info.gp, avgScore, grade, epCount: epScores.length });
  }

  results.sort((a, b) => b.avgScore - a.avgScore);

  console.log(`\n=== 人気予測エージェント 分類精度テスト ===`);
  console.log(`対象: ${results.length}作品\n`);

  // --- tier別のスコア分布 ---
  console.log("=== tier別スコア分布 ===\n");
  console.log("tier\t作品数\t平均\t中央値\t最小\t最大\tグレード分布");

  for (const tier of tierOrder) {
    const works = results.filter(r => r.tier === tier);
    if (works.length === 0) { console.log(`${tier}\t0`); continue; }

    const scores = works.map(w => w.avgScore).sort((a, b) => a - b);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const med = scores[Math.floor(scores.length / 2)];
    const min = scores[0];
    const max = scores[scores.length - 1];

    const gradeDist: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    for (const w of works) gradeDist[w.grade]++;
    const gradeStr = Object.entries(gradeDist).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(" ");

    console.log(`${tier}\t${works.length}\t${avg}\t${med}\t${min}\t${max}\t${gradeStr}`);
  }

  // --- 二値分類精度: top vs bottom ---
  console.log("\n=== 二値分類: top vs bottom ===\n");

  const topWorks = results.filter(r => r.tier === "top");
  const bottomWorks = results.filter(r => r.tier === "bottom");

  if (topWorks.length > 0 && bottomWorks.length > 0) {
    // 最適閾値を探索
    const allScores = [...topWorks.map(w => ({ score: w.avgScore, isTop: true })),
                       ...bottomWorks.map(w => ({ score: w.avgScore, isTop: false }))];

    let bestThreshold = 0;
    let bestAccuracy = 0;

    for (let threshold = 30; threshold <= 80; threshold++) {
      let correct = 0;
      for (const w of allScores) {
        const predicted = w.score >= threshold;
        if (predicted === w.isTop) correct++;
      }
      const accuracy = correct / allScores.length;
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        bestThreshold = threshold;
      }
    }

    // 最適閾値での混同行列
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const w of allScores) {
      const predicted = w.score >= bestThreshold;
      if (predicted && w.isTop) tp++;
      else if (predicted && !w.isTop) fp++;
      else if (!predicted && w.isTop) fn++;
      else tn++;
    }

    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

    console.log(`最適閾値: ${bestThreshold}点`);
    console.log(`正解率: ${(bestAccuracy * 100).toFixed(1)}% (${Math.round(bestAccuracy * allScores.length)}/${allScores.length})`);
    console.log(`適合率: ${(precision * 100).toFixed(1)}%`);
    console.log(`再現率: ${(recall * 100).toFixed(1)}%`);
    console.log(`F1スコア: ${(f1 * 100).toFixed(1)}%`);
    console.log(`\n混同行列:`);
    console.log(`          予測top  予測bottom`);
    console.log(`実際top     ${tp}       ${fn}`);
    console.log(`実際bottom  ${fp}       ${tn}`);
  }

  // --- 5値分類: スコアでtierを予測 ---
  console.log("\n=== 5値分類: スコア順位とtier順位の一致度 ===\n");

  // スピアマン順位相関: スコア順位 vs tier順位
  const tierToRank: Record<string, number> = { top: 5, upper: 4, mid: 3, lower: 2, bottom: 1 };
  const n = results.length;

  function rank(arr: number[]): number[] {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    for (let i = 0; i < n; i++) ranks[sorted[i].i] = i + 1;
    return ranks;
  }

  const scoreRanks = rank(results.map(r => r.avgScore));
  const tierRanks = rank(results.map(r => tierToRank[r.tier]));

  let dSquared = 0;
  for (let i = 0; i < n; i++) dSquared += (scoreRanks[i] - tierRanks[i]) ** 2;
  const spearman = 1 - (6 * dSquared) / (n * (n * n - 1));

  console.log(`スピアマン順位相関: ${spearman.toFixed(3)}`);
  if (Math.abs(spearman) >= 0.5) console.log("→ 中〜強い相関。スコアとtierに意味のある関係がある");
  else if (Math.abs(spearman) >= 0.3) console.log("→ 弱〜中程度の相関。改善の余地あり");
  else console.log("→ 弱い相関。スコアリングの見直しが必要");

  // --- 隣接tier誤分類率 ---
  console.log("\n=== tier別の分離度 ===\n");
  for (let i = 0; i < tierOrder.length - 1; i++) {
    const higher = results.filter(r => r.tier === tierOrder[i]).map(r => r.avgScore);
    const lower = results.filter(r => r.tier === tierOrder[i + 1]).map(r => r.avgScore);
    if (higher.length === 0 || lower.length === 0) continue;

    const higherMed = higher.sort((a, b) => a - b)[Math.floor(higher.length / 2)];
    const lowerMed = lower.sort((a, b) => a - b)[Math.floor(lower.length / 2)];

    // 重複率: 上tierの下位25%と下tierの上位25%の重なり
    const h25 = higher[Math.floor(higher.length * 0.25)];
    const l75 = lower[Math.floor(lower.length * 0.75)];
    const overlap = l75 !== undefined && h25 !== undefined && l75 >= h25 ? "重複あり" : "分離";

    console.log(`${tierOrder[i]} vs ${tierOrder[i + 1]}: 中央値 ${higherMed} vs ${lowerMed} (${overlap})`);
  }

  // --- 詳細出力 ---
  console.log("\n=== 全作品スコア一覧（スコア降順） ===\n");
  console.log("tier\tスコア\tグレード\tep数\tncode");
  for (const r of results.slice(0, 20)) {
    console.log(`${r.tier}\t${r.avgScore}\t${r.grade}\t\t${r.epCount}\t${r.ncode}`);
  }
  console.log("...");
  for (const r of results.slice(-10)) {
    console.log(`${r.tier}\t${r.avgScore}\t${r.grade}\t\t${r.epCount}\t${r.ncode}`);
  }
}

main();
