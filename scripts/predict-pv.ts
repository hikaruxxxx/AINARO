/**
 * PV予測モデル（globalPoint回帰）
 *
 * テキスト特徴量からglobalPoint（対数）を予測する回帰モデル。
 * Leave-One-Out交差検証で精度を評価。
 *
 * 実行: npx tsx scripts/predict-pv.ts
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================
// 特徴量抽出（self-learning-loop.tsと同じ）
// ============================================================

const POSITIVE_EMOTIONS = ["嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し", "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく", "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ"];
const NEGATIVE_EMOTIONS = ["悲しい", "悲し", "泣い", "泣き", "涙", "辛い", "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖", "不安", "心配", "焦り", "焦っ", "怒り", "怒っ", "悔し", "絶望", "寂し", "孤独"];
const CONJUNCTIONS = ["しかし", "そして", "また", "さらに", "そのため", "ところが", "けれど", "だが", "それでも", "つまり", "すると", "やがて", "それから", "だから"];

function r(v: number): number { return Math.round(v * 10000) / 10000; }

function extractFeatures(text: string): Record<string, number> | null {
  if (!text || text.length < 300) return null;
  const sentences = text.split(/(?<=[。！？!?])/).map(s => s.trim()).filter(s => s.length > 0);
  if (sentences.length < 5) return null;

  const paragraphs = text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(p => p.length > 0);
  const chars = text.replace(/\s/g, "").length;
  const sLens = sentences.map(s => s.length);
  const sAvg = sLens.reduce((a, b) => a + b, 0) / sLens.length;
  const sStd = Math.sqrt(sLens.reduce((acc, l) => acc + (l - sAvg) ** 2, 0) / sLens.length);

  const pLens = paragraphs.map(p => p.length);
  const pAvg = pLens.reduce((a, b) => a + b, 0) / pLens.length;
  const pStd = Math.sqrt(pLens.reduce((acc, l) => acc + (l - pAvg) ** 2, 0) / pLens.length);

  const dialogues = text.match(/「[^」]*」/g) || [];
  const dChars = dialogues.join("").length;
  const monologues = text.match(/（[^）]*）/g) || [];
  const mChars = monologues.join("").length;

  const diffs: number[] = [];
  for (let i = 1; i < sLens.length; i++) diffs.push(Math.abs(sLens[i] - sLens[i - 1]));
  const meanDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  const posCount = POSITIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const negCount = NEGATIVE_EMOTIONS.filter(w => text.includes(w)).length;
  const totalEmo = posCount + negCount;

  const kanji = text.match(/[\u4e00-\u9fff]/g) || [];
  const katakana = text.match(/[\u30a0-\u30ff]/g) || [];
  const hiragana = text.match(/[\u3040-\u309f]/g) || [];

  const commas = (text.match(/、/g) || []).length;
  const questions = sentences.filter(s => s.includes("？") || s.includes("?")).length;
  const exclamations = sentences.filter(s => s.includes("！") || s.includes("!")).length;

  const cleanChars = [...text.replace(/[\s\n\r、。！？!?「」『』（）\(\)・…―─ー]/g, "")];
  const bigrams = new Set<string>();
  for (let i = 0; i < cleanChars.length - 1; i++) bigrams.add(cleanChars[i] + cleanChars[i + 1]);

  const conjUsed = CONJUNCTIONS.reduce((acc, w) => acc + (text.match(new RegExp(w, "g"))?.length || 0), 0);

  return {
    avgSentenceLen: r(sAvg),
    sentenceLenCV: r(sAvg > 0 ? sStd / sAvg : 0),
    shortSentenceRatio: r(sLens.filter(l => l <= 20).length / sLens.length),
    longSentenceRatio: r(sLens.filter(l => l >= 50).length / sLens.length),
    medSentenceRatio: r(sLens.filter(l => l > 20 && l < 50).length / sLens.length),
    burstRatio: r(sAvg > 0 ? meanDiff / sAvg : 0),
    paragraphLenCV: r(pAvg > 0 ? pStd / pAvg : 0),
    avgParagraphLen: r(pAvg),
    dialogueRatio: r(chars > 0 ? dChars / chars : 0),
    innerMonologueRatio: r(chars > 0 ? mChars / chars : 0),
    narrativeRatio: r(chars > 0 ? (chars - dChars - mChars) / chars : 0),
    emotionDensity: r(chars > 0 ? totalEmo / (chars / 1000) : 0),
    uniqueEmotionRatio: r(totalEmo > 0 ? new Set([...POSITIVE_EMOTIONS.filter(w => text.includes(w)), ...NEGATIVE_EMOTIONS.filter(w => text.includes(w))]).size / totalEmo : 0),
    questionRatio: r(questions / sentences.length),
    exclamationRatio: r(exclamations / sentences.length),
    commaPerSentence: r(commas / sentences.length),
    bigramTTR: r(cleanChars.length > 1 ? bigrams.size / (cleanChars.length - 1) : 0),
    kanjiRatio: r(chars > 0 ? kanji.length / chars : 0),
    katakanaRatio: r(chars > 0 ? katakana.length / chars : 0),
    hiraganaRatio: r(chars > 0 ? hiragana.length / chars : 0),
    conjDensity: r(chars > 0 ? conjUsed / (chars / 1000) : 0),
  };
}

// ============================================================
// 回帰モデル（リッジ回帰 + LOO-CV）
// ============================================================

// 標準化
function standardize(values: number[]): { normalized: number[]; mean: number; std: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length) || 1;
  return { normalized: values.map(v => (v - mean) / std), mean, std };
}

// リッジ回帰（閉形式解）
function ridgeRegression(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length;
  const p = X[0].length;

  // X^T X + lambda * I
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < n; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
    XtX[i][i] += lambda;
  }

  // X^T y
  const Xty: number[] = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let k = 0; k < n; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }

  // ガウス消去法で XtX * beta = Xty を解く
  const aug: number[][] = XtX.map((row, i) => [...row, Xty[i]]);
  for (let i = 0; i < p; i++) {
    let maxRow = i;
    for (let k = i + 1; k < p; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-10) continue;

    for (let k = i + 1; k < p; k++) {
      const factor = aug[k][i] / aug[i][i];
      for (let j = i; j <= p; j++) {
        aug[k][j] -= factor * aug[i][j];
      }
    }
  }

  const beta: number[] = Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-10) continue;
    beta[i] = aug[i][p];
    for (let j = i + 1; j < p; j++) {
      beta[i] -= aug[i][j] * beta[j];
    }
    beta[i] /= aug[i][i];
  }

  return beta;
}

// ============================================================
// メイン
// ============================================================

function main() {
  const dataDir = path.resolve(__dirname, "../data");
  const crawledDir = path.join(dataDir, "crawled");
  const targets = JSON.parse(fs.readFileSync(path.join(dataDir, "targets/stratified_all.json"), "utf-8"));
  const crawlLog = JSON.parse(fs.readFileSync(path.join(crawledDir, "_crawl_log.json"), "utf-8"));

  const tierMap: Record<string, { gp: number; bm: number; tier: string }> = {};
  for (const t of targets) tierMap[t.ncode] = { gp: t.globalPoint, bm: t.bookmarks, tier: t.tier };

  // データ収集
  interface WorkData { ncode: string; gp: number; logGP: number; bm: number; tier: string; features: Record<string, number> }
  const works: WorkData[] = [];

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
        const feat = extractFeatures(ep.bodyText);
        if (feat) epFeats.push(feat);
      } catch { continue; }
    }
    if (epFeats.length < 2) continue;

    const avg: Record<string, number> = {};
    for (const k of Object.keys(epFeats[0])) {
      avg[k] = r(epFeats.reduce((s, f) => s + f[k], 0) / epFeats.length);
    }

    // gP=0の場合はlog取れないので1にクランプ
    const logGP = Math.log10(Math.max(info.gp, 1));

    works.push({ ncode, gp: info.gp, logGP, bm: info.bm, tier: info.tier, features: avg });
  }

  console.log(`\n=== PV予測モデル（globalPoint回帰） ===`);
  console.log(`データ: ${works.length}作品\n`);

  const featureNames = Object.keys(works[0].features);
  const nFeatures = featureNames.length;

  // 特徴量行列
  const X = works.map(w => featureNames.map(k => w.features[k]));
  const y = works.map(w => w.logGP);

  // 各特徴量のgPとの相関
  console.log("=== 特徴量のlog(gP)との相関 ===\n");

  function pearson(x: number[], y: number[]): number {
    const n = x.length;
    const mx = x.reduce((a, b) => a + b, 0) / n;
    const my = y.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - mx) * (y[i] - my);
      dx += (x[i] - mx) ** 2;
      dy += (y[i] - my) ** 2;
    }
    return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
  }

  const corrList: { name: string; corr: number }[] = [];
  for (let i = 0; i < nFeatures; i++) {
    const values = works.map(w => w.features[featureNames[i]]);
    corrList.push({ name: featureNames[i], corr: r(pearson(values, y)) });
  }
  corrList.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

  for (const { name, corr } of corrList) {
    const bar = Math.abs(corr) >= 0.2 ? " ★" : Math.abs(corr) >= 0.1 ? " ·" : "";
    console.log(`  ${name.padEnd(25)} r=${corr.toFixed(3)}${bar}`);
  }

  // --- LOO-CV リッジ回帰 ---
  console.log("\n=== LOO-CV リッジ回帰 ===\n");

  // 標準化パラメータ
  const featureStats = featureNames.map((_, i) => standardize(X.map(row => row[i])));
  const yStats = standardize(y);

  const Xstd = X.map(row => row.map((v, i) => (v - featureStats[i].mean) / featureStats[i].std));
  const ystd = y.map(v => (v - yStats.mean) / yStats.std);

  // 最適lambda探索
  const lambdas = [0.01, 0.1, 1, 10, 100, 1000];
  let bestLambda = 1;
  let bestRMSE = Infinity;

  for (const lambda of lambdas) {
    let sumSqErr = 0;
    for (let i = 0; i < works.length; i++) {
      const trainX = Xstd.filter((_, j) => j !== i);
      const trainY = ystd.filter((_, j) => j !== i);
      const beta = ridgeRegression(trainX, trainY, lambda);
      const predStd = Xstd[i].reduce((s, v, k) => s + v * beta[k], 0);
      const pred = predStd * yStats.std + yStats.mean;
      sumSqErr += (pred - y[i]) ** 2;
    }
    const rmse = Math.sqrt(sumSqErr / works.length);
    if (rmse < bestRMSE) { bestRMSE = rmse; bestLambda = lambda; }
  }

  console.log(`最適lambda: ${bestLambda}`);
  console.log(`RMSE (log10 gP): ${bestRMSE.toFixed(3)}`);

  // LOO-CV予測値を収集
  const predictions: number[] = [];
  for (let i = 0; i < works.length; i++) {
    const trainX = Xstd.filter((_, j) => j !== i);
    const trainY = ystd.filter((_, j) => j !== i);
    const beta = ridgeRegression(trainX, trainY, bestLambda);
    const predStd = Xstd[i].reduce((s, v, k) => s + v * beta[k], 0);
    predictions.push(predStd * yStats.std + yStats.mean);
  }

  // 実数に戻す
  const predGP = predictions.map(p => Math.round(10 ** p));
  const actualGP = works.map(w => w.gp);

  // ピアソン・スピアマン相関
  const pearsonCorr = pearson(predictions, y);

  function spearman(x: number[], y: number[]): number {
    const n = x.length;
    function rank(arr: number[]): number[] {
      const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
      const ranks = new Array(n);
      for (let i = 0; i < n; i++) ranks[sorted[i].i] = i + 1;
      return ranks;
    }
    const rx = rank(x); const ry = rank(y);
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
    return 1 - (6 * d2) / (n * (n * n - 1));
  }

  const spearmanCorr = spearman(predictions, y);

  console.log(`ピアソン相関 (LOO-CV): ${pearsonCorr.toFixed(3)}`);
  console.log(`スピアマン相関 (LOO-CV): ${spearmanCorr.toFixed(3)}`);

  // tier別の予測gP中央値
  console.log("\ntier別 予測gP中央値:");
  const tiers = ["top", "upper", "mid", "lower", "bottom"];
  for (const tier of tiers) {
    const tierWorks = works.map((w, i) => ({ ...w, predGP: predGP[i] })).filter(w => w.tier === tier);
    if (tierWorks.length === 0) continue;
    const sorted = tierWorks.map(w => w.predGP).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const actualSorted = tierWorks.map(w => w.gp).sort((a, b) => a - b);
    const actualMedian = actualSorted[Math.floor(actualSorted.length / 2)];
    console.log(`  ${tier}: 予測${median.toLocaleString()} / 実際${actualMedian.toLocaleString()} (n=${tierWorks.length})`);
  }

  // 予測の誤差分布
  console.log("\n予測誤差の分布 (log10スケール):");
  const errors = predictions.map((p, i) => Math.abs(p - y[i]));
  errors.sort((a, b) => a - b);
  console.log(`  中央値: ${errors[Math.floor(errors.length / 2)].toFixed(2)} (= ${Math.round(10 ** errors[Math.floor(errors.length / 2)])}倍の誤差)`);
  console.log(`  90%ile: ${errors[Math.floor(errors.length * 0.9)].toFixed(2)} (= ${Math.round(10 ** errors[Math.floor(errors.length * 0.9)])}倍の誤差)`);
  console.log(`  最大:   ${errors[errors.length - 1].toFixed(2)} (= ${Math.round(10 ** errors[errors.length - 1])}倍の誤差)`);

  // 具体例
  console.log("\n=== 予測結果の例 ===\n");
  const sortedWorks = works.map((w, i) => ({ ...w, predGP: predGP[i], predLog: predictions[i] })).sort((a, b) => b.gp - a.gp);

  console.log("tier\t実際gP\t\t予測gP\t\t誤差倍率\tncode");
  for (const w of sortedWorks.slice(0, 10)) {
    const ratio = w.predGP > 0 ? (w.gp / w.predGP).toFixed(1) : "-";
    console.log(`${w.tier}\t${w.gp.toLocaleString().padEnd(12)}\t${w.predGP.toLocaleString().padEnd(12)}\t${ratio}x\t\t${w.ncode}`);
  }
  console.log("...");
  for (const w of sortedWorks.slice(-5)) {
    const ratio = w.predGP > 0 ? (w.gp / w.predGP).toFixed(1) : "-";
    console.log(`${w.tier}\t${w.gp.toLocaleString().padEnd(12)}\t${w.predGP.toLocaleString().padEnd(12)}\t${ratio}x\t\t${w.ncode}`);
  }

  // --- 最終モデルを全データで訓練して係数を保存 ---
  const finalBeta = ridgeRegression(Xstd, ystd, bestLambda);

  console.log("\n=== 回帰係数（重要度順） ===\n");
  const coefs = featureNames.map((name, i) => ({ name, coef: r(finalBeta[i]) })).sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef));
  for (const { name, coef } of coefs) {
    const dir = coef > 0 ? "↑gP" : "↓gP";
    console.log(`  ${name.padEnd(25)} ${coef.toFixed(4)} ${dir}`);
  }

  // 保存
  const modelDir = path.join(dataDir, "models");
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  fs.writeFileSync(path.join(modelDir, "pv-prediction-model.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    type: "ridge_regression",
    target: "log10(globalPoint)",
    lambda: bestLambda,
    featureNames,
    featureStats: featureStats.map((s, i) => ({ name: featureNames[i], mean: r(s.mean), std: r(s.std) })),
    targetStats: { mean: r(yStats.mean), std: r(yStats.std) },
    coefficients: finalBeta.map(r),
    performance: {
      rmseLog10: r(bestRMSE),
      pearson: r(pearsonCorr),
      spearman: r(spearmanCorr),
      dataCount: works.length,
    },
  }, null, 2));

  console.log(`\nモデル保存: ${path.join(modelDir, "pv-prediction-model.json")}`);
}

main();
