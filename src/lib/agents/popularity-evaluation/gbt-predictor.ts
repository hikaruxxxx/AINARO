/**
 * GBT（勾配ブースティング木）予測器 v10
 *
 * LightGBMで訓練したヒット予測モデル（binary classification）の
 * JSON表現をTypeScriptで実行する。
 *
 * v10の変更点:
 * - 目的: コホートpercentile回帰 → top 20% ヒット予測（binary classification）
 * - 出力: leaf値の和 → sigmoid → 確率 [0, 1]
 * - 欠損値（null/undefined）対応はそのまま
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { LLMQualityScores, PopularityGenre } from "@/types/agents";

// ─── 型定義 ───

interface TreeNode {
  f?: number;
  t?: number;
  l?: TreeNode;
  r?: TreeNode;
  d?: "l" | "r";
  cat?: boolean;
  v?: number;
}

interface GBTModel {
  version: string;
  type: string;
  objective?: string;
  trees: TreeNode[];
  feature_names: string[];
  hit_threshold_gp_per_ep?: number;
  genre_groups: Record<string, number>;
  performance: Record<string, number>;
}

// ─── モデル読み込み ───

let _model: GBTModel | null = null;

function getModel(): GBTModel {
  if (!_model) {
    const modelPath = join(process.cwd(), "data", "models", "hit-prediction-v10.json");
    const raw = readFileSync(modelPath, "utf-8");
    _model = JSON.parse(raw) as GBTModel;
  }
  return _model;
}

// ─── ツリー走査 ───

function predictTree(node: TreeNode, features: (number | null)[]): number {
  // 葉ノード
  if (node.v !== undefined) return node.v;

  const val = features[node.f!];

  // 欠損値: missing_directionに従う
  if (val === null || val === undefined || Number.isNaN(val)) {
    const dir = node.d ?? "l";
    return dir === "l"
      ? predictTree(node.l!, features)
      : predictTree(node.r!, features);
  }

  // カテゴリカル分割: val == threshold
  if (node.cat) {
    return val === node.t
      ? predictTree(node.l!, features)
      : predictTree(node.r!, features);
  }

  // 数値分割: val <= threshold
  return val <= node.t!
    ? predictTree(node.l!, features)
    : predictTree(node.r!, features);
}

/** sigmoid関数: binary classificationのraw score → 確率変換 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function predictGBT(features: (number | null)[]): number {
  const model = getModel();
  // v10: leaf値にはlearning_rateが既に反映済み。単純に和を取る
  let rawScore = 0;
  for (const tree of model.trees) {
    rawScore += predictTree(tree, features);
  }
  // Binary classification: sigmoid適用でヒット確率を返す
  return sigmoid(rawScore);
}

// ─── 特徴量抽出 ───

// PV予測用の感情語リスト
const POSITIVE_EMO = [
  "嬉しい", "嬉し", "喜び", "幸せ", "楽しい", "好き", "愛し",
  "感動", "ときめ", "安心", "微笑", "笑顔", "笑い", "笑っ",
];
const NEGATIVE_EMO = [
  "悲しい", "悲し", "泣い", "涙", "辛い", "苦しい", "痛い",
  "怖い", "恐怖", "不安", "心配", "焦っ", "怒り", "怒っ",
  "悔し", "絶望", "寂し",
];
const CONJ = [
  "しかし", "そして", "また", "さらに", "そのため", "ところが",
  "けれど", "だが", "それでも", "つまり", "すると", "やがて",
  "それから", "だから",
];

/** テキストから表層特徴量21次元を抽出 */
function extractSurfaceFeatures(text: string): number[] | null {
  const sentences = text
    .split(/(?<=[。！？!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length < 5) return null;

  const paragraphs = text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const chars = text.replace(/\s/g, "").length;
  const sLens = sentences.map((s) => s.length);
  const sAvg = sLens.reduce((a, b) => a + b, 0) / sLens.length;
  const sStd = Math.sqrt(
    sLens.reduce((acc, l) => acc + (l - sAvg) ** 2, 0) / sLens.length,
  );

  const pLens = paragraphs.map((p) => p.length);
  const pAvg = pLens.reduce((a, b) => a + b, 0) / pLens.length;
  const pStd = Math.sqrt(
    pLens.reduce((acc, l) => acc + (l - pAvg) ** 2, 0) / pLens.length,
  );

  const dialoguesText = (text.match(/「[^」]*」/g) || []).join("");
  const monologuesText = (text.match(/（[^）]*）/g) || []).join("");

  const diffs: number[] = [];
  for (let i = 1; i < sLens.length; i++)
    diffs.push(Math.abs(sLens[i] - sLens[i - 1]));
  const meanDiff =
    diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  const posCount = POSITIVE_EMO.filter((w) => text.includes(w)).length;
  const negCount = NEGATIVE_EMO.filter((w) => text.includes(w)).length;
  const totalEmo = posCount + negCount;

  const kanji = text.match(/[\u4e00-\u9fff]/g) || [];
  const katakana = text.match(/[\u30a0-\u30ff]/g) || [];
  const hiragana = text.match(/[\u3040-\u309f]/g) || [];
  const commas = (text.match(/、/g) || []).length;
  const questions = sentences.filter(
    (s) => s.includes("？") || s.includes("?"),
  ).length;
  const exclamations = sentences.filter(
    (s) => s.includes("！") || s.includes("!"),
  ).length;
  const cleanChars = [
    ...text.replace(/[\s\n\r、。！？!?「」『』（）\(\)・…―─ー]/g, ""),
  ];
  const bigrams = new Set<string>();
  for (let i = 0; i < cleanChars.length - 1; i++)
    bigrams.add(cleanChars[i] + cleanChars[i + 1]);

  const conjUsed = CONJ.reduce(
    (acc, w) => acc + (text.match(new RegExp(w, "g"))?.length || 0),
    0,
  );

  return [
    sAvg, // avgSentenceLen
    sAvg > 0 ? sStd / sAvg : 0, // sentenceLenCV
    sLens.filter((l) => l <= 20).length / sLens.length, // shortSentenceRatio
    sLens.filter((l) => l >= 50).length / sLens.length, // longSentenceRatio
    sLens.filter((l) => l > 20 && l < 50).length / sLens.length, // medSentenceRatio
    sAvg > 0 ? meanDiff / sAvg : 0, // burstRatio
    pAvg > 0 ? pStd / pAvg : 0, // paragraphLenCV
    pAvg, // avgParagraphLen
    chars > 0 ? dialoguesText.length / chars : 0, // dialogueRatio
    chars > 0 ? monologuesText.length / chars : 0, // innerMonologueRatio
    chars > 0
      ? (chars - dialoguesText.length - monologuesText.length) / chars
      : 0, // narrativeRatio
    chars > 0 ? totalEmo / (chars / 1000) : 0, // emotionDensity
    totalEmo > 0
      ? new Set([
          ...POSITIVE_EMO.filter((w) => text.includes(w)),
          ...NEGATIVE_EMO.filter((w) => text.includes(w)),
        ]).size / totalEmo
      : 0, // uniqueEmotionRatio
    questions / sentences.length, // questionRatio
    exclamations / sentences.length, // exclamationRatio
    commas / sentences.length, // commaPerSentence
    cleanChars.length > 1 ? bigrams.size / (cleanChars.length - 1) : 0, // bigramTTR
    chars > 0 ? kanji.length / chars : 0, // kanjiRatio
    chars > 0 ? katakana.length / chars : 0, // katakataRatio
    chars > 0 ? hiragana.length / chars : 0, // hiraganaRatio
    chars > 0 ? conjUsed / (chars / 1000) : 0, // conjDensity
  ];
}

/** ジャンルをモデルのカテゴリIDに変換 */
function genreToGroupId(genre?: PopularityGenre): number {
  if (!genre) return 3; // その他
  switch (genre) {
    case "fantasy":
    case "scifi":
      return 0; // ファンタジー
    case "romance":
      return 1; // 恋愛
    case "horror":
    case "mystery":
    case "slice_of_life":
      return 2; // 文芸
    default:
      return 3; // その他
  }
}

// ─── 公開API ───

export interface GBTPrediction {
  hitProbability: number; // 0-100 (top 20%に入る確率)
  tier: "top" | "upper" | "mid" | "lower" | "bottom";
  detail: string;
  hasLLMScores: boolean;
  hasSynopsisScores: boolean;
  reliability: "high" | "medium" | "low";
  modelVersion: string;
}

/**
 * テキストからヒット確率（top 20%に入る確率）を予測する
 *
 * @param text - 小説テキスト（500文字以上推奨）
 * @param genre - ジャンル（任意）
 * @param llmScores - LLM品質スコア（任意、6軸）
 * @param synopsisScores - あらすじ評価スコア（任意、4軸）
 */
export function predictQuality(
  text: string,
  genre?: PopularityGenre,
  llmScores?: LLMQualityScores,
  synopsisScores?: {
    concept: number;
    hook: number;
    differentiation: number;
    appeal: number;
  },
): GBTPrediction {
  const surfaceFeatures = extractSurfaceFeatures(text);
  if (!surfaceFeatures) {
    return {
      hitProbability: 20,
      tier: "mid",
      detail: "テキストが短すぎて予測不能",
      hasLLMScores: false,
      hasSynopsisScores: false,
      reliability: "low",
      modelVersion: getModel().version,
    };
  }

  // 特徴量ベクトル構築（v10の feature_names 順）
  const features: (number | null)[] = [
    // 表層 21D
    ...surfaceFeatures,
    // メタ 4D（ランタイムでは不明）
    null, // titleLen
    null, // titleHasBracket
    null, // titleHasTemplateKw
    null, // avgEpChars
    // log_episodes（ランタイムでは不明）
    null,
    // genre_group
    genreToGroupId(genre),
    // Synopsis 4D
    synopsisScores?.concept ?? null,
    synopsisScores?.hook ?? null,
    synopsisScores?.differentiation ?? null,
    synopsisScores?.appeal ?? null,
    // LLM 6D
    llmScores?.hook ?? null,
    llmScores?.character ?? null,
    llmScores?.originality ?? null,
    llmScores?.prose ?? null,
    llmScores?.tension ?? null,
    llmScores?.pull ?? null,
  ];

  const m = getModel();
  const probability = predictGBT(features); // 0-1
  const probability100 = Math.round(probability * 100);

  // Tier判定: ヒット確率に応じて5段階
  // top: 50%以上, upper: 35-50%, mid: 20-35%, lower: 10-20%, bottom: <10%
  let tier: "top" | "upper" | "mid" | "lower" | "bottom";
  if (probability >= 0.5) tier = "top";
  else if (probability >= 0.35) tier = "upper";
  else if (probability >= 0.2) tier = "mid";
  else if (probability >= 0.1) tier = "lower";
  else tier = "bottom";

  const hasLLM = !!llmScores;
  const hasSynopsis = !!synopsisScores;

  // 信頼度: 入力情報量に応じて判定
  let reliability: "high" | "medium" | "low";
  if (hasLLM && hasSynopsis) reliability = "high";
  else if (hasLLM || hasSynopsis) reliability = "medium";
  else reliability = "low";

  const auc = m.performance.cv_auc;
  const inputNote = hasLLM
    ? "LLM+表層"
    : hasSynopsis
      ? "Synopsis+表層"
      : "表層のみ";
  const detail = `ヒット確率: ${probability100}%（${tier} tier）。${inputNote}モデル（CV AUC ${auc}）`;

  return {
    hitProbability: probability100,
    tier,
    detail,
    hasLLMScores: hasLLM,
    hasSynopsisScores: hasSynopsis,
    reliability,
    modelVersion: m.version,
  };
}
