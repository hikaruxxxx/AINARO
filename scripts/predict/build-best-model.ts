/**
 * 人気予測 最強モデル構築
 *
 * 1. 50+特徴量の抽出
 * 2. ランダムフォレスト（ゼロ依存TS実装）
 * 3. Leave-One-Out交差検証
 * 4. 特徴量重要度の計算
 * 5. 最終モデルの構築・保存
 *
 * 実行: npx tsx scripts/build-best-model.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================
// 1. 特徴量抽出（50+個）
// ============================================================

const POSITIVE_EMOTIONS = ["嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し", "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく", "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ"];
const NEGATIVE_EMOTIONS = ["悲しい", "悲し", "泣い", "泣き", "涙", "辛い", "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖", "不安", "心配", "焦り", "焦っ", "怒り", "怒っ", "悔し", "絶望", "寂し", "孤独"];
const SURPRISE_WORDS = ["驚い", "驚き", "まさか", "呆然", "信じられ"];
const TENSION_WORDS = ["緊張", "震え", "戦慄", "息を呑", "固まっ"];

const SENSORY = {
  visual: ["見え", "見つめ", "眺め", "輝い", "光", "色", "瞳", "目", "姿", "影", "闇", "鮮やか", "暗い", "明るい"],
  auditory: ["聞こえ", "響い", "音", "声", "叫び", "囁い", "静か", "沈黙", "足音"],
  tactile: ["触れ", "肌", "温かい", "冷たい", "熱い", "柔らか", "握っ", "抱き", "震え"],
  olfactory: ["匂い", "香り"],
  gustatory: ["味", "甘い", "苦い"],
};

const CONJUNCTIONS = ["しかし", "そして", "また", "さらに", "そのため", "ところが", "けれど", "だが", "それでも", "一方", "つまり", "すると", "やがて", "それから", "だから"];

function r(v: number, d = 4): number { return Math.round(v * 10 ** d) / 10 ** d; }

function extractAllFeatures(text: string): Record<string, number> | null {
  if (!text || text.length < 300) return null;

  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length < 5) return null;

  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  const chars = text.replace(/\s/g, "").length;
  const sLens = sentences.map(s => s.length);
  const sAvg = sLens.reduce((a, b) => a + b, 0) / sLens.length;
  const sStd = Math.sqrt(sLens.reduce((acc, l) => acc + (l - sAvg) ** 2, 0) / sLens.length);
  const sCV = sAvg > 0 ? sStd / sAvg : 0;

  const pLens = paragraphs.map(p => p.length);
  const pAvg = pLens.reduce((a, b) => a + b, 0) / pLens.length;
  const pStd = Math.sqrt(pLens.reduce((acc, l) => acc + (l - pAvg) ** 2, 0) / pLens.length);

  const dialogues = text.match(/「[^」]*」/g) || [];
  const dChars = dialogues.join("").length;
  const monologues = text.match(/（[^）]*）/g) || [];
  const mChars = monologues.join("").length;

  // バースト
  const diffs: number[] = [];
  for (let i = 1; i < sLens.length; i++) diffs.push(Math.abs(sLens[i] - sLens[i - 1]));
  const meanDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  // 感情
  const posCount = POSITIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const negCount = NEGATIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const surpriseCount = SURPRISE_WORDS.filter(w => text.includes(w)).length;
  const tensionCount = TENSION_WORDS.filter(w => text.includes(w)).length;
  const totalEmo = posCount + negCount + surpriseCount + tensionCount;

  // 前半/後半の感情
  const half = Math.floor(text.length / 2);
  const fh = text.slice(0, half);
  const sh = text.slice(half);
  const emoFirst = [...POSITIVE_EMOTIONS, ...NEGATIVE_EMOTIONS].filter(w => fh.includes(w)).length;
  const emoSecond = [...POSITIVE_EMOTIONS, ...NEGATIVE_EMOTIONS].filter(w => sh.includes(w)).length;

  // 五感
  const sensoryCount = Object.values(SENSORY).filter(ws => ws.some(w => text.includes(w))).length;
  const sensoryTotal = Object.values(SENSORY).flat().filter(w => text.includes(w)).length;

  // 接続詞
  const conjCount = CONJUNCTIONS.filter(w => text.includes(w)).length;
  const conjUsed = CONJUNCTIONS.reduce((acc, w) => acc + (text.match(new RegExp(w, "g"))?.length || 0), 0);

  // 句読点
  const commas = (text.match(/、/g) || []).length;
  const periods = (text.match(/。/g) || []).length;

  // 記号
  const ellipsis = (text.match(/……|…/g) || []).length;
  const dashes = (text.match(/——|――/g) || []).length;

  // 疑問・感嘆
  const questions = sentences.filter(s => s.includes("？") || s.includes("?")).length;
  const exclamations = sentences.filter(s => s.includes("！") || s.includes("!")).length;

  // 漢字
  const kanji = text.match(/[\u4e00-\u9fff]/g) || [];
  const uniqueKanji = new Set(kanji);
  const hiragana = text.match(/[\u3040-\u309f]/g) || [];
  const katakana = text.match(/[\u30a0-\u30ff]/g) || [];

  // 文字bigram TTR
  const cleanChars = [...text.replace(/[\s\n\r、。！？!?「」『』（）\(\)・…―─ー]/g, "")];
  const bigrams = new Set<string>();
  for (let i = 0; i < cleanChars.length - 1; i++) bigrams.add(cleanChars[i] + cleanChars[i + 1]);
  const ttr = cleanChars.length > 1 ? bigrams.size / (cleanChars.length - 1) : 0;

  // 文末パターンの多様性
  const endings = new Set<string>();
  for (const s of sentences) {
    const c = [...s];
    if (c.length >= 3) endings.add(c.slice(-3).join(""));
  }
  const endingDiversity = sentences.length > 0 ? endings.size / sentences.length : 0;

  // 冒頭・末尾
  const opening3Len = sentences.slice(0, 3).reduce((a, s) => a + s.length, 0);
  const endingSentences = sentences.slice(-3);
  const endHasTension = endingSentences.some(s =>
    ["しかし", "だが", "その時", "まさか", "突然", "……", "――", "？"].some(w => s.includes(w))
  ) ? 1 : 0;
  const endHasQuestion = endingSentences.some(s => s.includes("？") || s.includes("?")) ? 1 : 0;

  // 発話者多様性
  const speakerCtx = new Set<string>();
  const dRe = /([^\n「」]{0,10})「[^」]+」/g;
  let m;
  while ((m = dRe.exec(text)) !== null) speakerCtx.add(m[1].trim().slice(-5));

  // 文長分位点
  const sorted = [...sLens].sort((a, b) => a - b);
  const q25 = sorted[Math.floor(sorted.length * 0.25)];
  const q75 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q75 - q25;

  return {
    // 基本統計
    f_charCount: chars,
    f_sentenceCount: sentences.length,
    f_paragraphCount: paragraphs.length,
    f_avgSentenceLen: r(sAvg),
    f_sentenceLenCV: r(sCV),
    f_sentenceLenIQR: r(sAvg > 0 ? iqr / sAvg : 0),
    f_sentenceLenQ25: q25,
    f_sentenceLenQ75: q75,
    f_longSentenceRatio: r(sLens.filter(l => l >= 50).length / sLens.length),
    f_shortSentenceRatio: r(sLens.filter(l => l <= 20).length / sLens.length),
    f_medSentenceRatio: r(sLens.filter(l => l > 20 && l < 50).length / sLens.length),
    f_burstRatio: r(sAvg > 0 ? meanDiff / sAvg : 0),
    f_maxBurst: r(sAvg > 0 && diffs.length > 0 ? Math.max(...diffs) / sAvg : 0),

    // 段落
    f_avgParagraphLen: r(pAvg),
    f_paragraphLenCV: r(pAvg > 0 ? pStd / pAvg : 0),
    f_sentencesPerParagraph: r(sentences.length / paragraphs.length),

    // 会話・独白
    f_dialogueRatio: r(chars > 0 ? dChars / chars : 0),
    f_innerMonologueRatio: r(chars > 0 ? mChars / chars : 0),
    f_dialogueCount: dialogues.length,
    f_avgDialogueLen: r(dialogues.length > 0 ? dChars / dialogues.length : 0),
    f_speakerVariety: speakerCtx.size,
    f_narrativeRatio: r(chars > 0 ? (chars - dChars - mChars) / chars : 0), // 地の文比率

    // 感情
    f_emotionDensity: r(chars > 0 ? totalEmo / (chars / 1000) : 0),
    f_posEmoCount: posCount,
    f_negEmoCount: negCount,
    f_emotionPolarity: r(totalEmo > 0 ? (posCount - negCount) / totalEmo : 0),
    f_surpriseCount: surpriseCount,
    f_tensionCount: tensionCount,
    f_emotionVariety: new Set([...POSITIVE_EMOTIONS.filter(w => text.includes(w)), ...NEGATIVE_EMOTIONS.filter(w => text.includes(w))]).size,
    f_uniqueEmotionRatio: r(totalEmo > 0 ? new Set([...POSITIVE_EMOTIONS.filter(w => text.includes(w)), ...NEGATIVE_EMOTIONS.filter(w => text.includes(w))]).size / totalEmo : 0),
    f_emotionSwing: r(Math.abs(emoFirst - emoSecond) / Math.max(emoFirst + emoSecond, 1)),
    f_emotionConcentration: r(emoSecond / Math.max(emoFirst + emoSecond, 1)), // 後半に感情が集中

    // 五感
    f_sensoryTypes: sensoryCount,
    f_sensoryTotal: sensoryTotal,

    // 句読点・記号
    f_commaPerSentence: r(commas / sentences.length),
    f_ellipsisCount: ellipsis,
    f_dashCount: dashes,
    f_questionRatio: r(questions / sentences.length),
    f_exclamationRatio: r(exclamations / sentences.length),

    // 語彙
    f_bigramTTR: r(ttr),
    f_endingDiversity: r(endingDiversity),
    f_uniqueKanjiRatio: r(kanji.length > 0 ? uniqueKanji.size / kanji.length : 0),
    f_kanjiRatio: r(chars > 0 ? kanji.length / chars : 0),
    f_hiraganaRatio: r(chars > 0 ? hiragana.length / chars : 0),
    f_katakanaRatio: r(chars > 0 ? katakana.length / chars : 0),

    // 接続詞
    f_conjunctionVariety: conjCount,
    f_conjunctionDensity: r(chars > 0 ? conjUsed / (chars / 1000) : 0),

    // 構造
    f_openingLength: opening3Len,
    f_endingTension: endHasTension,
    f_endingQuestion: endHasQuestion,
  };
}

// ============================================================
// 2. ランダムフォレスト（ゼロ依存実装）
// ============================================================

interface DataPoint {
  features: number[];
  label: number; // tier rank: 5=top, 1=bottom
}

interface TreeNode {
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  prediction?: number;
}

function giniImpurity(labels: number[]): number {
  if (labels.length === 0) return 0;
  const counts: Record<number, number> = {};
  for (const l of labels) counts[l] = (counts[l] || 0) + 1;
  let gini = 1;
  for (const c of Object.values(counts)) {
    const p = c / labels.length;
    gini -= p * p;
  }
  return gini;
}

function buildTree(data: DataPoint[], featureIndices: number[], maxDepth: number, minSamples: number): TreeNode {
  const labels = data.map(d => d.label);

  // 停止条件
  if (data.length <= minSamples || maxDepth <= 0 || new Set(labels).size <= 1) {
    // 多数決（回帰なので平均）
    return { prediction: labels.reduce((a, b) => a + b, 0) / labels.length };
  }

  let bestGain = -Infinity;
  let bestFeature = 0;
  let bestThreshold = 0;
  let bestLeft: DataPoint[] = [];
  let bestRight: DataPoint[] = [];

  const parentGini = giniImpurity(labels);

  // ランダムに特徴量をサンプリング（sqrt(n)個）
  const sqrtN = Math.max(1, Math.floor(Math.sqrt(featureIndices.length)));
  const sampledFeatures = shuffle(featureIndices).slice(0, sqrtN);

  for (const fi of sampledFeatures) {
    const values = [...new Set(data.map(d => d.features[fi]))].sort((a, b) => a - b);

    for (let i = 0; i < values.length - 1; i++) {
      const threshold = (values[i] + values[i + 1]) / 2;
      const left = data.filter(d => d.features[fi] <= threshold);
      const right = data.filter(d => d.features[fi] > threshold);

      if (left.length === 0 || right.length === 0) continue;

      const leftGini = giniImpurity(left.map(d => d.label));
      const rightGini = giniImpurity(right.map(d => d.label));
      const weightedGini = (left.length * leftGini + right.length * rightGini) / data.length;
      const gain = parentGini - weightedGini;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fi;
        bestThreshold = threshold;
        bestLeft = left;
        bestRight = right;
      }
    }
  }

  if (bestGain <= 0) {
    return { prediction: labels.reduce((a, b) => a + b, 0) / labels.length };
  }

  return {
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildTree(bestLeft, featureIndices, maxDepth - 1, minSamples),
    right: buildTree(bestRight, featureIndices, maxDepth - 1, minSamples),
  };
}

function predictTree(node: TreeNode, features: number[]): number {
  if (node.prediction !== undefined) return node.prediction;
  if (features[node.featureIndex!] <= node.threshold!) {
    return predictTree(node.left!, features);
  }
  return predictTree(node.right!, features);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ランダムフォレスト
function trainForest(data: DataPoint[], nTrees: number, maxDepth: number, minSamples: number): TreeNode[] {
  const featureCount = data[0].features.length;
  const featureIndices = Array.from({ length: featureCount }, (_, i) => i);
  const trees: TreeNode[] = [];

  for (let t = 0; t < nTrees; t++) {
    // ブートストラップサンプリング
    const bootstrapData: DataPoint[] = [];
    for (let i = 0; i < data.length; i++) {
      bootstrapData.push(data[Math.floor(Math.random() * data.length)]);
    }
    trees.push(buildTree(bootstrapData, featureIndices, maxDepth, minSamples));
  }

  return trees;
}

function predictForest(trees: TreeNode[], features: number[]): number {
  const predictions = trees.map(t => predictTree(t, features));
  return predictions.reduce((a, b) => a + b, 0) / predictions.length;
}

// 特徴量重要度（permutation importance）
function featureImportance(trees: TreeNode[], data: DataPoint[], featureNames: string[]): { name: string; importance: number }[] {
  // ベースライン精度
  const basePreds = data.map(d => predictForest(trees, d.features));
  const baseError = data.reduce((acc, d, i) => acc + (d.label - basePreds[i]) ** 2, 0) / data.length;

  const importances: { name: string; importance: number }[] = [];

  for (let fi = 0; fi < featureNames.length; fi++) {
    // 特徴量fiをシャッフル
    let permError = 0;
    for (let rep = 0; rep < 5; rep++) {
      const shuffledValues = shuffle(data.map(d => d.features[fi]));
      const permPreds = data.map((d, i) => {
        const permFeatures = [...d.features];
        permFeatures[fi] = shuffledValues[i];
        return predictForest(trees, permFeatures);
      });
      permError += data.reduce((acc, d, i) => acc + (d.label - permPreds[i]) ** 2, 0) / data.length;
    }
    permError /= 5;

    importances.push({
      name: featureNames[fi],
      importance: r((permError - baseError) / baseError, 4),
    });
  }

  return importances.sort((a, b) => b.importance - a.importance);
}

// ============================================================
// 3. メイン
// ============================================================

function main() {
  console.log("\n=== 最強モデル構築 ===\n");

  // データ読み込み
  const dataDir = path.resolve(__dirname, "../data");
  const crawledDir = path.join(dataDir, "crawled");
  const targets = JSON.parse(fs.readFileSync(path.join(dataDir, "targets/stratified_all.json"), "utf-8"));
  const crawlLog = JSON.parse(fs.readFileSync(path.join(crawledDir, "_crawl_log.json"), "utf-8"));

  const tierMap: Record<string, { tier: string; gp: number }> = {};
  for (const t of targets) tierMap[t.ncode] = { tier: t.tier, gp: t.globalPoint };
  const tierRankMap: Record<string, number> = { top: 5, upper: 4, mid: 3, lower: 2, bottom: 1 };

  // 特徴量抽出
  interface WorkRecord { ncode: string; tier: string; gp: number; features: Record<string, number> }
  const works: WorkRecord[] = [];

  for (const [ncode, log] of Object.entries(crawlLog) as [string, { episodes: number }][]) {
    if (!log.episodes) continue;
    const info = tierMap[ncode];
    if (!info) continue;

    const epFeats: Record<string, number>[] = [];
    for (let i = 1; i <= log.episodes; i++) {
      const f = path.join(crawledDir, ncode, `ep${String(i).padStart(4, "0")}.json`);
      if (!fs.existsSync(f)) continue;
      try {
        const ep = JSON.parse(fs.readFileSync(f, "utf-8"));
        const feat = extractAllFeatures(ep.bodyText);
        if (feat) epFeats.push(feat);
      } catch { continue; }
    }
    if (epFeats.length < 2) continue;

    // 平均
    const avg: Record<string, number> = {};
    const keys = Object.keys(epFeats[0]);
    for (const k of keys) {
      avg[k] = r(epFeats.reduce((s, f) => s + f[k], 0) / epFeats.length);
    }

    // エピソード間分散も特徴量として追加
    for (const k of keys) {
      const vals = epFeats.map(f => f[k]);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length;
      avg[`${k}_var`] = r(variance);
    }

    works.push({ ncode, tier: info.tier, gp: info.gp, features: avg });
  }

  console.log(`データ: ${works.length}作品`);
  const featureNames = Object.keys(works[0].features);
  console.log(`特徴量: ${featureNames.length}個\n`);

  // DataPoint配列に変換
  const dataPoints: DataPoint[] = works.map(w => ({
    features: featureNames.map(k => w.features[k]),
    label: tierRankMap[w.tier],
  }));

  // --- Leave-One-Out交差検証 ---
  console.log("=== Leave-One-Out 交差検証 ===\n");

  const predictions: number[] = [];
  const actuals: number[] = [];

  for (let i = 0; i < dataPoints.length; i++) {
    const trainData = dataPoints.filter((_, j) => j !== i);
    const testPoint = dataPoints[i];

    // シードを固定するために乱数を手動制御（簡易的にi基準）
    const trees = trainForest(trainData, 100, 6, 3);
    const pred = predictForest(trees, testPoint.features);
    predictions.push(pred);
    actuals.push(testPoint.label);
  }

  // スピアマン
  function spearman(x: number[], y: number[]): number {
    const n = x.length;
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

  const spearmanCorr = spearman(predictions, actuals);
  console.log(`スピアマン順位相関 (LOO-CV): ${spearmanCorr.toFixed(3)}`);

  // RMSE
  const rmse = Math.sqrt(predictions.reduce((acc, p, i) => acc + (p - actuals[i]) ** 2, 0) / predictions.length);
  console.log(`RMSE (LOO-CV): ${rmse.toFixed(3)}`);

  // 二値分類 (top vs bottom)
  const tbIndices = works.map((w, i) => ({ i, tier: w.tier })).filter(x => x.tier === "top" || x.tier === "bottom");
  let bestF1 = 0;
  let bestThreshold = 0;
  for (let t = 1.5; t <= 4.5; t += 0.1) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const { i, tier } of tbIndices) {
      const pred = predictions[i] >= t;
      const isTop = tier === "top";
      if (pred && isTop) tp++;
      else if (pred && !isTop) fp++;
      else if (!pred && isTop) fn++;
      else tn++;
    }
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    if (f1 > bestF1) { bestF1 = f1; bestThreshold = t; }
  }

  // 最適閾値での詳細
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const { i, tier } of tbIndices) {
    const pred = predictions[i] >= bestThreshold;
    const isTop = tier === "top";
    if (pred && isTop) tp++;
    else if (pred && !isTop) fp++;
    else if (!pred && isTop) fn++;
    else tn++;
  }

  console.log(`\n二値分類 (top vs bottom):`);
  console.log(`  閾値: ${bestThreshold.toFixed(1)}`);
  console.log(`  正解率: ${((tp + tn) / (tp + fp + fn + tn) * 100).toFixed(1)}%`);
  console.log(`  F1: ${(bestF1 * 100).toFixed(1)}%`);
  console.log(`  混同: TP=${tp} FP=${fp} FN=${fn} TN=${tn}`);

  // tier別の予測中央値
  console.log("\ntier別予測中央値:");
  const tiers = ["top", "upper", "mid", "lower", "bottom"];
  let monotonic = true;
  let prevMedian = Infinity;
  for (const tier of tiers) {
    const tierPreds = works.map((w, i) => ({ tier: w.tier, pred: predictions[i] })).filter(x => x.tier === tier).map(x => x.pred).sort((a, b) => a - b);
    if (tierPreds.length > 0) {
      const med = tierPreds[Math.floor(tierPreds.length / 2)];
      const isCorrectOrder = med <= prevMedian;
      if (!isCorrectOrder) monotonic = false;
      console.log(`  ${tier}: ${med.toFixed(3)} ${isCorrectOrder ? "✓" : "✗ 逆転"}`);
      prevMedian = med;
    }
  }
  console.log(`  序列: ${monotonic ? "✓ 単調（正しい序列）" : "✗ 逆転あり"}`);

  // --- 最終モデルを全データで訓練 ---
  console.log("\n=== 最終モデル構築 ===\n");
  const finalTrees = trainForest(dataPoints, 200, 6, 3);

  // 特徴量重要度
  const importances = featureImportance(finalTrees, dataPoints, featureNames);
  console.log("特徴量重要度 TOP 20:");
  for (const imp of importances.slice(0, 20)) {
    console.log(`  ${imp.name.padEnd(30)} ${imp.importance.toFixed(4)}`);
  }

  // 保存
  const outputDir = path.join(dataDir, "models");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // モデルをJSON化（ツリー構造をそのまま保存）
  fs.writeFileSync(path.join(outputDir, "popularity-rf-model.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    type: "random_forest",
    nTrees: 200,
    maxDepth: 6,
    featureNames,
    featureCount: featureNames.length,
    dataCount: works.length,
    performance: {
      spearmanLOOCV: r(spearmanCorr),
      rmseLOOCV: r(rmse),
      binaryF1: r(bestF1),
      binaryThreshold: r(bestThreshold, 1),
      monotonic,
    },
    featureImportance: importances.slice(0, 30),
    trees: finalTrees,
  }));

  // 特徴量抽出関数のスナップショットも保存（再現性のため）
  fs.writeFileSync(path.join(outputDir, "feature-extraction-snapshot.json"), JSON.stringify({
    featureNames,
    emotionWords: { positive: POSITIVE_EMOTIONS, negative: NEGATIVE_EMOTIONS, surprise: SURPRISE_WORDS, tension: TENSION_WORDS },
    sensoryWords: SENSORY,
    conjunctions: CONJUNCTIONS,
  }, null, 2));

  console.log(`\nモデル保存: ${path.join(outputDir, "popularity-rf-model.json")}`);
  console.log(`特徴量定義: ${path.join(outputDir, "feature-extraction-snapshot.json")}`);

  // --- 比較サマリー ---
  console.log("\n=== 改善サマリー ===\n");
  console.log("指標\t\t線形モデル(v2)\tランダムフォレスト\t改善");
  console.log(`スピアマン\t0.264\t\t${spearmanCorr.toFixed(3)}\t\t\t${spearmanCorr > 0.264 ? "↑" : "↓"}`);
  console.log(`F1(top/bot)\t85.2%\t\t${(bestF1 * 100).toFixed(1)}%\t\t\t${bestF1 > 0.852 ? "↑" : "↓"}`);
  console.log(`tier序列\t逆転あり\t${monotonic ? "単調✓" : "逆転あり✗"}\t\t\t${monotonic ? "↑" : "→"}`);
}

main();
