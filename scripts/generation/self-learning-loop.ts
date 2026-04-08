/**
 * 人気予測モデルの自己学習ループ
 *
 * 仮説を自動生成 → 特徴量を追加 → テスト → 評価 → 改善
 * を繰り返してtier分類精度を向上させる。
 *
 * 実行: npx tsx scripts/self-learning-loop.ts
 */

import * as fs from "fs";
import * as path from "path";

// --- データ読み込み ---

const dataDir = path.resolve(__dirname, "../data");
const crawledDir = path.join(dataDir, "crawled");
const targets: { ncode: string; tier: string; globalPoint: number; searchGenre?: string; genreName?: string }[] =
  JSON.parse(fs.readFileSync(path.join(dataDir, "targets/stratified_all.json"), "utf-8"));
const crawlLog: Record<string, { episodes: number }> =
  JSON.parse(fs.readFileSync(path.join(crawledDir, "_crawl_log.json"), "utf-8"));

const tierMap: Record<string, { tier: string; gp: number; genre: string }> = {};
for (const t of targets) tierMap[t.ncode] = { tier: t.tier, gp: t.globalPoint, genre: t.searchGenre || t.genreName || "" };

const tierOrder = ["top", "upper", "mid", "lower", "bottom"];
const tierRank: Record<string, number> = { top: 5, upper: 4, mid: 3, lower: 2, bottom: 1 };

// --- 拡張特徴量 ---

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

const POSITIVE_EMOTIONS = ["嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し", "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく", "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ"];
const NEGATIVE_EMOTIONS = ["悲しい", "悲し", "泣い", "泣き", "涙", "辛い", "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖", "不安", "心配", "焦り", "焦っ", "怒り", "怒っ", "悔し", "絶望", "寂し", "孤独"];

interface ExtendedFeatures {
  // 基本（v2と同じ）
  avgSentenceLength: number;
  sentenceLengthCV: number;
  dialogueRatio: number;
  shortSentenceRatio: number;
  emotionDensity: number;
  questionRatio: number;
  exclamationRatio: number;
  burstRatio: number;

  // 新規特徴量（Round 1: 構成力の指標）
  paragraphLengthCV: number;       // 段落長の変動係数（構成の安定性）
  avgParagraphLength: number;      // 平均段落長
  longSentenceRatio: number;       // 長文（50字以上）の割合
  sentenceLengthRange: number;     // 文長のレンジ（最大-最小）/平均
  dialogueAvgLength: number;       // 平均セリフ長（会話の密度）

  // 新規特徴量（Round 2: 感情の質）
  emotionPolarity: number;         // 感情の極性（正-負）/（正+負）。-1〜+1
  emotionSwing: number;            // 前半と後半の感情極性の差（感情反転度）
  uniqueEmotionRatio: number;      // ユニーク感情語数/全感情語数（感情表現の多様性）

  // 新規特徴量（Round 3: テキスト構造）
  commaPerSentence: number;        // 1文あたりの読点数
  sceneBreakCount: number;         // シーン転換数（空行2行以上）
  openingLength: number;           // 冒頭3文の合計文字数（冒頭の密度）
  endingQuestionOrTension: number; // 末尾が疑問/緊張で終わるか（0 or 1）

  // 新規特徴量（Round 4: キャラ関連）
  speakerVariety: number;          // 会話の発話者数の推定（「」直前テキストの多様性）
  innerMonologueRatio: number;     // （）独白比率

  // 新規特徴量（Round 5: 情報密度）
  uniqueKanjiRatio: number;        // ユニーク漢字数/全漢字数（語彙の豊かさ）
  katakanaRatio: number;           // カタカナ比率（固有名詞・外来語の多さ）
  punctuationVariety: number;      // 句読点以外の記号の種類数（——、……、！？等）
}

function extractExtendedFeatures(text: string): ExtendedFeatures | null {
  if (!text || text.length < 300) return null;

  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length < 5) return null;

  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  const charCount = text.replace(/\s/g, "").length;
  const lengths = sentences.map(s => s.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const stdDev = Math.sqrt(lengths.reduce((acc, l) => acc + (l - avgLen) ** 2, 0) / lengths.length);

  // 基本
  const dialogues = text.match(/「[^」]*」/g) || [];
  const dialogueChars = dialogues.join("").length;
  const monologueChars = (text.match(/（[^）]*）/g) || []).join("").length;
  const diffs: number[] = [];
  for (let i = 1; i < lengths.length; i++) diffs.push(Math.abs(lengths[i] - lengths[i - 1]));
  const meanDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  // 段落統計
  const paraLengths = paragraphs.map(p => p.length);
  const paraAvg = paraLengths.reduce((a, b) => a + b, 0) / paraLengths.length;
  const paraStd = Math.sqrt(paraLengths.reduce((acc, l) => acc + (l - paraAvg) ** 2, 0) / paraLengths.length);

  // 感情分析
  const posCount = POSITIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const negCount = NEGATIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const totalEmotion = posCount + negCount;

  // 前半/後半の感情
  const halfPoint = Math.floor(text.length / 2);
  const firstHalf = text.slice(0, halfPoint);
  const secondHalf = text.slice(halfPoint);
  const posFirst = POSITIVE_EMOTIONS.filter(w => firstHalf.includes(w)).length;
  const negFirst = NEGATIVE_EMOTIONS.filter(w => firstHalf.includes(w)).length;
  const posSecond = POSITIVE_EMOTIONS.filter(w => secondHalf.includes(w)).length;
  const negSecond = NEGATIVE_EMOTIONS.filter(w => secondHalf.includes(w)).length;
  const polarityFirst = (posFirst + negFirst) > 0 ? (posFirst - negFirst) / (posFirst + negFirst) : 0;
  const polaritySecond = (posSecond + negSecond) > 0 ? (posSecond - negSecond) / (posSecond + negSecond) : 0;

  // 読点
  const commas = (text.match(/、/g) || []).length;

  // シーン転換
  const sceneBreaks = (text.match(/\n\s*\n\s*\n/g) || []).length + (text.match(/\n\s*[＊*]{3,}\s*\n/g) || []).length + (text.match(/\n\s*[─―]{3,}\s*\n/g) || []).length;

  // 冒頭
  const opening3 = sentences.slice(0, 3);
  const openingLen = opening3.reduce((acc, s) => acc + s.length, 0);

  // 末尾
  const lastSentences = sentences.slice(-3);
  const tensionWords = ["しかし", "だが", "その時", "まさか", "突然", "……", "――", "？"];
  const endingTension = lastSentences.some(s => tensionWords.some(w => s.includes(w))) ? 1 : 0;

  // 発話者多様性（「」直前の20文字のユニーク性で推定）
  const speakerContexts = new Set<string>();
  const dialogueRegex = /([^\n「」]{0,10})「[^」]+」/g;
  let match;
  while ((match = dialogueRegex.exec(text)) !== null) {
    speakerContexts.add(match[1].trim().slice(-5)); // 直前5文字
  }

  // 漢字
  const kanji = text.match(/[\u4e00-\u9fff]/g) || [];
  const uniqueKanji = new Set(kanji);

  // カタカナ
  const katakana = text.match(/[\u30a0-\u30ff]/g) || [];

  // 記号多様性
  const specialPunct = new Set<string>();
  for (const ch of text) {
    if ("——――……！？!?「」（）『』【】".includes(ch)) specialPunct.add(ch);
  }

  return {
    avgSentenceLength: round(avgLen),
    sentenceLengthCV: round(avgLen > 0 ? stdDev / avgLen : 0),
    dialogueRatio: round(charCount > 0 ? dialogueChars / charCount : 0),
    shortSentenceRatio: round(lengths.filter(l => l <= 20).length / lengths.length),
    emotionDensity: round(charCount > 0 ? (totalEmotion / charCount) * 100 : 0),
    questionRatio: round(sentences.filter(s => s.includes("？") || s.includes("?")).length / sentences.length),
    exclamationRatio: round(sentences.filter(s => s.includes("！") || s.includes("!")).length / sentences.length),
    burstRatio: round(avgLen > 0 ? meanDiff / avgLen : 0),

    paragraphLengthCV: round(paraAvg > 0 ? paraStd / paraAvg : 0),
    avgParagraphLength: round(paraAvg),
    longSentenceRatio: round(lengths.filter(l => l >= 50).length / lengths.length),
    sentenceLengthRange: round(avgLen > 0 ? (Math.max(...lengths) - Math.min(...lengths)) / avgLen : 0),
    dialogueAvgLength: round(dialogues.length > 0 ? dialogueChars / dialogues.length : 0),

    emotionPolarity: round(totalEmotion > 0 ? (posCount - negCount) / totalEmotion : 0),
    emotionSwing: round(Math.abs(polarityFirst - polaritySecond)),
    uniqueEmotionRatio: round(totalEmotion > 0 ? new Set([...POSITIVE_EMOTIONS.filter(w => text.includes(w)), ...NEGATIVE_EMOTIONS.filter(w => text.includes(w))]).size / totalEmotion : 0),

    commaPerSentence: round(commas / sentences.length),
    sceneBreakCount: sceneBreaks,
    openingLength: openingLen,
    endingQuestionOrTension: endingTension,

    speakerVariety: speakerContexts.size,
    innerMonologueRatio: round(charCount > 0 ? monologueChars / charCount : 0),

    uniqueKanjiRatio: round(kanji.length > 0 ? uniqueKanji.size / kanji.length : 0),
    katakanaRatio: round(charCount > 0 ? katakana.length / charCount : 0),
    punctuationVariety: specialPunct.size,
  };
}

function round(v: number): number { return Math.round(v * 10000) / 10000; }

// --- データ収集 ---

interface WorkData {
  ncode: string;
  tier: string;
  gp: number;
  genre: string;
  features: ExtendedFeatures;
}

function collectData(): WorkData[] {
  const results: WorkData[] = [];

  for (const [ncode, log] of Object.entries(crawlLog)) {
    if (!log.episodes) continue;
    const info = tierMap[ncode];
    if (!info) continue;

    const epFeatures: ExtendedFeatures[] = [];
    for (let i = 1; i <= log.episodes; i++) {
      const f = path.join(crawledDir, ncode, `ep${String(i).padStart(4, "0")}.json`);
      if (!fs.existsSync(f)) continue;
      try {
        const ep = JSON.parse(fs.readFileSync(f, "utf-8"));
        const feat = extractExtendedFeatures(ep.bodyText);
        if (feat) epFeatures.push(feat);
      } catch { continue; }
    }

    if (epFeatures.length < 2) continue;

    // 作品平均
    const avg: Record<string, number> = {};
    const keys = Object.keys(epFeatures[0]) as (keyof ExtendedFeatures)[];
    for (const k of keys) {
      avg[k] = round(epFeatures.reduce((s, f) => s + (f[k] as number), 0) / epFeatures.length);
    }

    results.push({ ncode, tier: info.tier, gp: info.gp, genre: info.genre, features: avg as unknown as ExtendedFeatures });
  }

  return results;
}

// --- 評価関数 ---

function spearmanCorrelation(x: number[], y: number[]): number {
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

function binaryAccuracy(scores: number[], tiers: string[], threshold: number): { accuracy: number; f1: number } {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < scores.length; i++) {
    if (tiers[i] !== "top" && tiers[i] !== "bottom") continue;
    const predTop = scores[i] >= threshold;
    const isTop = tiers[i] === "top";
    if (predTop && isTop) tp++;
    else if (predTop && !isTop) fp++;
    else if (!predTop && isTop) fn++;
    else tn++;
  }
  const total = tp + fp + fn + tn;
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return { accuracy: total > 0 ? (tp + tn) / total : 0, f1 };
}

// --- スコアリング: 重み付き線形結合 ---

type FeatureKey = keyof ExtendedFeatures;

interface Model {
  name: string;
  weights: Partial<Record<FeatureKey, number>>; // 正 = tier高いほど高スコア, 負 = 逆
  description: string;
}

function scoreWork(features: ExtendedFeatures, weights: Partial<Record<FeatureKey, number>>): number {
  let sum = 0;
  let wSum = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = features[k as FeatureKey] as number;
    if (v === undefined) continue;
    sum += v * w;
    wSum += Math.abs(w);
  }
  return wSum > 0 ? sum / wSum : 0;
}

function evaluateModel(data: WorkData[], model: Model): { spearman: number; topVsBottom: { accuracy: number; f1: number }; tierMedians: Record<string, number> } {
  const scores = data.map(d => scoreWork(d.features, model.weights));
  const tierValues = data.map(d => tierRank[d.tier]);
  const sp = spearmanCorrelation(scores, tierValues);

  // 最適閾値探索（二値分類）
  const topBottomData = data.filter(d => d.tier === "top" || d.tier === "bottom");
  const tbScores = topBottomData.map(d => scoreWork(d.features, model.weights));
  const tbTiers = topBottomData.map(d => d.tier);

  let bestF1 = 0;
  let bestResult = { accuracy: 0, f1: 0 };
  const min = Math.min(...tbScores);
  const max = Math.max(...tbScores);
  const step = (max - min) / 50;
  for (let t = min; t <= max; t += step) {
    const result = binaryAccuracy(tbScores, tbTiers, t);
    if (result.f1 > bestF1) {
      bestF1 = result.f1;
      bestResult = result;
    }
  }

  // tier別中央値
  const tierMedians: Record<string, number> = {};
  for (const tier of tierOrder) {
    const tierScores = data.filter(d => d.tier === tier).map(d => scoreWork(d.features, model.weights)).sort((a, b) => a - b);
    if (tierScores.length > 0) {
      tierMedians[tier] = round(tierScores[Math.floor(tierScores.length / 2)]);
    }
  }

  return { spearman: round(sp), topVsBottom: bestResult, tierMedians };
}

// --- 学習ループ ---

function main() {
  const data = collectData();
  console.log(`\n=== 自己学習ループ ===`);
  console.log(`データ: ${data.length}作品\n`);

  // 全特徴量のtierとの個別相関を計算
  const featureKeys = Object.keys(data[0].features) as FeatureKey[];
  console.log("=== 特徴量の個別相関（tier順位との相関） ===\n");

  const featureCorrelations: { key: FeatureKey; corr: number }[] = [];
  const tierValues = data.map(d => tierRank[d.tier]);

  for (const key of featureKeys) {
    const values = data.map(d => d.features[key] as number);
    const corr = spearmanCorrelation(values, tierValues);
    featureCorrelations.push({ key, corr });
  }

  featureCorrelations.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
  console.log("特徴量\t\t\t相関\t方向");
  for (const { key, corr } of featureCorrelations) {
    const dir = corr > 0.1 ? "top↑" : corr < -0.1 ? "top↓" : "---";
    const mark = Math.abs(corr) >= 0.2 ? " ★" : Math.abs(corr) >= 0.1 ? " ·" : "";
    console.log(`${key.padEnd(25)}\t${corr.toFixed(3)}\t${dir}${mark}`);
  }

  // --- モデル候補 ---
  const models: Model[] = [];

  // モデル1: v2基準（現行）
  models.push({
    name: "v2_current",
    description: "現行のv2キャリブレーション",
    weights: {
      avgSentenceLength: 1,
      sentenceLengthCV: -1,
      dialogueRatio: -1,
      shortSentenceRatio: -1,
      emotionDensity: 1,
      burstRatio: -1,
      exclamationRatio: -1,
    },
  });

  // モデル2: 相関上位のみ
  const topCorrelated = featureCorrelations.filter(f => Math.abs(f.corr) >= 0.1);
  const corrWeights: Partial<Record<FeatureKey, number>> = {};
  for (const { key, corr } of topCorrelated) {
    corrWeights[key] = corr; // 相関係数そのものを重みに
  }
  models.push({
    name: "correlation_based",
    description: "個別相関が0.1以上の特徴量を相関係数で重み付け",
    weights: corrWeights,
  });

  // モデル3: 新特徴量重視
  models.push({
    name: "new_features",
    description: "新規追加特徴量を重視",
    weights: {
      paragraphLengthCV: -1,
      emotionSwing: 1,
      uniqueEmotionRatio: 1,
      openingLength: 1,
      commaPerSentence: 1,
      uniqueKanjiRatio: 1,
      sentenceLengthRange: -1,
      longSentenceRatio: 1,
    },
  });

  // モデル4: 構成力モデル（安定性重視）
  models.push({
    name: "composition_quality",
    description: "構成の安定性を重視（CV低い・段落安定・長文あり）",
    weights: {
      sentenceLengthCV: -2,
      paragraphLengthCV: -2,
      burstRatio: -1,
      longSentenceRatio: 2,
      avgSentenceLength: 1,
      shortSentenceRatio: -1,
      exclamationRatio: -1,
    },
  });

  // モデル5: 感情表現の質
  models.push({
    name: "emotion_quality",
    description: "感情表現の多様性と起伏",
    weights: {
      emotionDensity: 1,
      uniqueEmotionRatio: 2,
      emotionSwing: 2,
      emotionPolarity: -0.5, // ネガティブ寄りのほうがドラマチック
    },
  });

  // モデル6: 全特徴量を相関で重み付け（相関が弱くても使う）
  const allCorrWeights: Partial<Record<FeatureKey, number>> = {};
  for (const { key, corr } of featureCorrelations) {
    allCorrWeights[key] = corr;
  }
  models.push({
    name: "all_features_corr",
    description: "全特徴量を相関係数で重み付け",
    weights: allCorrWeights,
  });

  // モデル7: 構成力 + 感情の複合
  models.push({
    name: "composite",
    description: "構成の安定性 + 感情の質 + テキスト成熟度",
    weights: {
      sentenceLengthCV: -2,
      paragraphLengthCV: -1,
      burstRatio: -1,
      longSentenceRatio: 1.5,
      avgSentenceLength: 1,
      shortSentenceRatio: -1,
      exclamationRatio: -1,
      emotionDensity: 1,
      uniqueEmotionRatio: 1.5,
      emotionSwing: 1,
      uniqueKanjiRatio: 1,
      commaPerSentence: 0.5,
      dialogueRatio: -0.5,
    },
  });

  // --- 全モデル評価 ---
  console.log("\n=== モデル比較 ===\n");
  console.log("モデル\t\t\tスピアマン\tF1(top/bot)\ttier中央値の序列");

  const results: { name: string; spearman: number; f1: number; tierMedians: Record<string, number>; desc: string }[] = [];

  for (const model of models) {
    const eval_ = evaluateModel(data, model);
    const tierSeq = tierOrder.map(t => eval_.tierMedians[t]?.toFixed(3) || "-").join(" > ");
    // tier中央値が正しい序列（top > upper > ... > bottom）になっているかチェック
    const isMonotonic = tierOrder.every((t, i) => {
      if (i === 0) return true;
      const prev = eval_.tierMedians[tierOrder[i - 1]];
      const curr = eval_.tierMedians[t];
      return prev === undefined || curr === undefined || prev >= curr;
    });
    const monotoneFlag = isMonotonic ? "✓ 単調" : "✗ 逆転あり";

    console.log(`${model.name.padEnd(25)}\t${eval_.spearman.toFixed(3)}\t\t${(eval_.topVsBottom.f1 * 100).toFixed(1)}%\t\t${monotoneFlag}`);

    results.push({ name: model.name, spearman: eval_.spearman, f1: eval_.topVsBottom.f1, tierMedians: eval_.tierMedians, desc: model.description });
  }

  // --- ベストモデル ---
  results.sort((a, b) => Math.abs(b.spearman) - Math.abs(a.spearman));
  const best = results[0];

  console.log(`\n=== ベストモデル: ${best.name} ===`);
  console.log(`説明: ${best.desc}`);
  console.log(`スピアマン: ${best.spearman.toFixed(3)}`);
  console.log(`F1 (top/bottom): ${(best.f1 * 100).toFixed(1)}%`);
  console.log(`tier中央値:`);
  for (const tier of tierOrder) {
    console.log(`  ${tier}: ${best.tierMedians[tier]?.toFixed(4) || "-"}`);
  }

  // --- 結果保存 ---
  const outputFile = path.join(dataDir, "experiments/self-learning-results.json");
  fs.writeFileSync(outputFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    dataCount: data.length,
    featureCorrelations: featureCorrelations.map(f => ({ feature: f.key, correlation: f.corr })),
    modelResults: results,
    bestModel: best.name,
  }, null, 2));

  console.log(`\n結果保存: ${outputFile}`);
}

main();
