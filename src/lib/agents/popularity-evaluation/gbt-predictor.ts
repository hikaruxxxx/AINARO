/**
 * GBT（勾配ブースティング木）予測器 v9
 *
 * LightGBMで訓練したモデルのJSON表現をTypeScriptで実行する。
 * 欠損値（null/undefined）対応。ツリー走査のみで外部依存なし。
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { LLMQualityScores, PopularityGenre } from "@/types/agents";

// ─── 型定義 ───

interface TreeNode {
  f?: number; // split_feature index
  t?: number; // threshold
  l?: TreeNode; // left child
  r?: TreeNode; // right child
  d?: "l" | "r"; // missing_direction (default: "l")
  cat?: boolean; // カテゴリカル分割
  v?: number; // leaf value
}

interface GBTModel {
  version: string;
  learning_rate: number;
  trees: TreeNode[];
  feature_names: string[];
  tier_thresholds: Record<string, number>;
  genre_groups: Record<string, number>;
  performance: Record<string, number>;
}

// ─── モデル読み込み（サーバーサイドのみ） ───

let _model: GBTModel | null = null;

function getModel(): GBTModel {
  if (!_model) {
    const modelPath = join(process.cwd(), "data", "models", "quality-prediction-v9.json");
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

function predictGBT(features: (number | null)[]): number {
  const model = getModel();
  let score = 0;
  for (const tree of model.trees) {
    score += model.learning_rate * predictTree(tree, features);
  }
  // パーセンタイル [0, 1] にクランプ
  return Math.max(0, Math.min(1, score));
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
  predictedPercentile: number; // 0-100
  tier: "top" | "upper" | "mid" | "lower" | "bottom";
  detail: string;
  hasLLMScores: boolean;
  hasSynopsisScores: boolean;
  reliability: "high" | "medium" | "low";
  modelVersion: string;
}

/**
 * テキストからコホート内パーセンタイルを予測する
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
      predictedPercentile: 50,
      tier: "mid",
      detail: "テキストが短すぎて予測不能",
      hasLLMScores: false,
      hasSynopsisScores: false,
      reliability: "low",
      modelVersion: getModel().version,
    };
  }

  // 特徴量ベクトル構築（モデルのfeature_namesの順序に合わせる）
  const features: (number | null)[] = [
    // 表層 21D
    ...surfaceFeatures,
    // メタ 4D（ランタイムでは不明なのでnull）
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
  const percentile = predictGBT(features);
  const percentile100 = Math.round(percentile * 100);

  // Tier判定
  let tier: "top" | "upper" | "mid" | "lower" | "bottom";
  if (percentile >= m.tier_thresholds.top) tier = "top";
  else if (percentile >= m.tier_thresholds.upper) tier = "upper";
  else if (percentile >= m.tier_thresholds.mid) tier = "mid";
  else if (percentile >= m.tier_thresholds.lower) tier = "lower";
  else tier = "bottom";

  const hasLLM = !!llmScores;
  const hasSynopsis = !!synopsisScores;

  // 信頼度: 入力情報量に応じて判定
  let reliability: "high" | "medium" | "low";
  if (hasLLM && hasSynopsis) reliability = "high";
  else if (hasLLM || hasSynopsis) reliability = "medium";
  else reliability = "low";

  const spearman = m.performance.cv_spearman;
  const inputNote = hasLLM
    ? "LLM+表層"
    : hasSynopsis
      ? "Synopsis+表層"
      : "表層のみ";
  const detail = `コホート内パーセンタイル: ${percentile100}%（${tier} tier）。${inputNote}モデル（CV Spearman ${spearman}）`;

  return {
    predictedPercentile: percentile100,
    tier,
    detail,
    hasLLMScores: hasLLM,
    hasSynopsisScores: hasSynopsis,
    reliability,
    modelVersion: m.version,
  };
}
