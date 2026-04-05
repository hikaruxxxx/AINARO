import type { AIDetectionResult, AIDetectionMetric } from "@/types/agents";

// --- ユーティリティ ---

/** テキストを文単位に分割（句点・感嘆符・疑問符で区切る） */
function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** テキストを段落単位に分割（空行区切り） */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 標準偏差を計算 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** 変動係数（CV）を計算。平均0のときは0を返す */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  return standardDeviation(values) / mean;
}

/** スコアを0-100に収める */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// --- 各指標の分析関数 ---

/**
 * 語彙多様性 (Type-Token Ratio)
 * AIは同じ表現を繰り返す傾向があり、TTRが低くなりやすい。
 * ただし長文ではTTRは自然に低下するため、サンプルウィンドウで計算する。
 */
function analyzeVocabularyDiversity(text: string): AIDetectionMetric {
  // 文字単位のbigramで多様性を測る（形態素解析なし）
  const chars = [...text.replace(/[\s\n\r、。！？!?「」『』（）\(\)・…―─ー]/g, "")];
  if (chars.length < 10) {
    return { score: 50, detail: "テキストが短すぎるため判定不能" };
  }

  // 文字bigramのTTR
  const bigrams = new Set<string>();
  const totalBigrams = chars.length - 1;
  for (let i = 0; i < totalBigrams; i++) {
    bigrams.add(chars[i] + chars[i + 1]);
  }
  const ttr = bigrams.size / totalBigrams;

  // TTRが高い＝多様＝人間らしい / 低い＝均一＝AI寄り
  // 日本語小説の典型的なTTR: 人間 0.65-0.85, AI 0.45-0.65
  let score: number;
  if (ttr >= 0.80) {
    score = 10;
  } else if (ttr >= 0.70) {
    score = 25;
  } else if (ttr >= 0.60) {
    score = 50;
  } else if (ttr >= 0.50) {
    score = 70;
  } else {
    score = 90;
  }

  return {
    score: clamp(score),
    detail: `文字bigram TTR: ${ttr.toFixed(3)}（ユニーク${bigrams.size}/${totalBigrams}）`,
  };
}

/**
 * 文長分布の分散
 * 人間の文章は文の長さのバラつきが大きい。AIは均一化する傾向。
 */
function analyzeSentenceLengthVariance(sentences: string[]): AIDetectionMetric {
  if (sentences.length < 5) {
    return { score: 50, detail: "文数が少なすぎるため判定不能" };
  }

  const lengths = sentences.map((s) => [...s].length);
  const cv = coefficientOfVariation(lengths);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // CV（変動係数）: 人間 0.6-1.2, AI 0.2-0.5
  let score: number;
  if (cv >= 1.0) {
    score = 5;
  } else if (cv >= 0.7) {
    score = 20;
  } else if (cv >= 0.5) {
    score = 45;
  } else if (cv >= 0.35) {
    score = 70;
  } else {
    score = 90;
  }

  return {
    score: clamp(score),
    detail: `平均文長: ${mean.toFixed(1)}文字, 変動係数: ${cv.toFixed(3)}（${sentences.length}文）`,
  };
}

/**
 * 文長のバースト性
 * 人間は短文→長文の急な切り替え（バースト）が多い。AIは滑らか。
 */
function analyzeBurstiness(sentences: string[]): AIDetectionMetric {
  if (sentences.length < 5) {
    return { score: 50, detail: "文数が少なすぎるため判定不能" };
  }

  const lengths = sentences.map((s) => [...s].length);

  // 隣接文との長さの差分の絶対値
  const diffs: number[] = [];
  for (let i = 1; i < lengths.length; i++) {
    diffs.push(Math.abs(lengths[i] - lengths[i - 1]));
  }

  const meanLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

  // 平均文長に対する差分の比率
  const burstRatio = meanLength > 0 ? meanDiff / meanLength : 0;

  // 大きな変動（平均文長の1.5倍以上の差）の割合
  const bigJumps = diffs.filter((d) => d > meanLength * 1.5).length;
  const bigJumpRatio = bigJumps / diffs.length;

  // burstRatio: 人間 0.5-1.0, AI 0.2-0.4
  let score: number;
  if (burstRatio >= 0.8) {
    score = 10;
  } else if (burstRatio >= 0.6) {
    score = 25;
  } else if (burstRatio >= 0.4) {
    score = 50;
  } else if (burstRatio >= 0.25) {
    score = 70;
  } else {
    score = 90;
  }

  return {
    score: clamp(score),
    detail: `バースト比: ${burstRatio.toFixed(3)}, 大きな変動: ${bigJumps}/${diffs.length}文間（${(bigJumpRatio * 100).toFixed(1)}%）`,
  };
}

/**
 * 接続詞パターン
 * AIは「しかし」「そして」「また」「そのため」等を均等に使う傾向。
 * 人間は特定の接続詞に偏る。
 */
function analyzeConjunctionPattern(text: string): AIDetectionMetric {
  const conjunctions = [
    "しかし",
    "そして",
    "また",
    "さらに",
    "そのため",
    "ところが",
    "けれど",
    "だが",
    "それでも",
    "一方",
    "つまり",
    "なぜなら",
    "ただし",
    "もっとも",
    "すると",
    "やがて",
    "それから",
    "だから",
    "ゆえに",
    "なお",
  ];

  const counts: Record<string, number> = {};
  let total = 0;
  for (const conj of conjunctions) {
    const regex = new RegExp(conj, "g");
    const matches = text.match(regex);
    const count = matches ? matches.length : 0;
    if (count > 0) {
      counts[conj] = count;
      total += count;
    }
  }

  if (total < 3) {
    return { score: 50, detail: "接続詞の出現が少なすぎるため判定不能" };
  }

  const usedConjunctions = Object.keys(counts);
  const frequencies = Object.values(counts);

  // 使用接続詞の種類数に対する均等度を測る
  const cv = coefficientOfVariation(frequencies);

  // AIの特徴: 多種の接続詞を均等に使う → cvが小さく、種類が多い
  // 人間の特徴: 少数の接続詞を偏って使う → cvが大きく、種類が少ない
  const varietyRatio = usedConjunctions.length / conjunctions.length;

  let score: number;
  if (cv < 0.3 && varietyRatio > 0.5) {
    // 均等に多種類 → AI寄り
    score = 85;
  } else if (cv < 0.5 && varietyRatio > 0.4) {
    score = 65;
  } else if (cv >= 0.8 || varietyRatio < 0.2) {
    // 偏りが強い → 人間寄り
    score = 15;
  } else {
    score = 45;
  }

  const topConjunctions = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}(${v})`)
    .join(", ");

  return {
    score: clamp(score),
    detail: `使用接続詞: ${usedConjunctions.length}種/${total}回, 変動係数: ${cv.toFixed(3)}, 上位: ${topConjunctions}`,
  };
}

/**
 * 繰り返し検出
 * 近接する文で同じフレーズ（3文字以上の連続）が繰り返される割合。
 * AI生成は近接文での同一表現が多い。
 */
function analyzeRepetition(sentences: string[]): AIDetectionMetric {
  if (sentences.length < 5) {
    return { score: 50, detail: "文数が少なすぎるため判定不能" };
  }

  // 各文から3文字以上のngramを抽出し、近接5文以内での重複を数える
  const windowSize = 5;
  const ngramLength = 4;
  let repetitionCount = 0;
  let totalComparisons = 0;

  for (let i = 0; i < sentences.length; i++) {
    const chars = [...sentences[i]];
    if (chars.length < ngramLength) continue;

    const currentNgrams = new Set<string>();
    for (let j = 0; j <= chars.length - ngramLength; j++) {
      currentNgrams.add(chars.slice(j, j + ngramLength).join(""));
    }

    // 前のwindowSize文と比較
    for (let k = Math.max(0, i - windowSize); k < i; k++) {
      const prevChars = [...sentences[k]];
      if (prevChars.length < ngramLength) continue;
      totalComparisons++;

      for (let j = 0; j <= prevChars.length - ngramLength; j++) {
        const ngram = prevChars.slice(j, j + ngramLength).join("");
        if (currentNgrams.has(ngram)) {
          repetitionCount++;
          break; // 1ペアにつき1回だけカウント
        }
      }
    }
  }

  if (totalComparisons === 0) {
    return { score: 50, detail: "比較対象が不足" };
  }

  const repetitionRate = repetitionCount / totalComparisons;

  // 繰り返し率: AI 0.4-0.7, 人間 0.1-0.3
  let score: number;
  if (repetitionRate >= 0.6) {
    score = 90;
  } else if (repetitionRate >= 0.4) {
    score = 70;
  } else if (repetitionRate >= 0.25) {
    score = 45;
  } else if (repetitionRate >= 0.15) {
    score = 25;
  } else {
    score = 10;
  }

  return {
    score: clamp(score),
    detail: `近接文の繰り返し率: ${(repetitionRate * 100).toFixed(1)}%（${repetitionCount}/${totalComparisons}ペア）`,
  };
}

/**
 * 文末パターン
 * AI生成は「〜だった」「〜のだった」「〜ていた」等の特定パターンに偏りやすい。
 * 人間はより多様な文末を使う。
 */
function analyzeEndingPattern(sentences: string[]): AIDetectionMetric {
  if (sentences.length < 5) {
    return { score: 50, detail: "文数が少なすぎるため判定不能" };
  }

  // 文末パターンを分類
  const patterns: Record<string, number> = {};
  for (const s of sentences) {
    const chars = [...s];
    if (chars.length < 2) continue;
    // 末尾3文字をパターンとして取得
    const ending = chars.slice(-3).join("");
    patterns[ending] = (patterns[ending] || 0) + 1;
  }

  const patternCounts = Object.values(patterns);
  const uniquePatterns = patternCounts.length;
  const totalSentences = sentences.length;

  // パターンの多様性: ユニークパターン数 / 文数
  const diversity = uniquePatterns / totalSentences;

  // 最頻パターンの占有率
  const maxCount = Math.max(...patternCounts);
  const dominance = maxCount / totalSentences;

  // AI: diversity低い + dominance高い
  let score: number;
  if (diversity >= 0.8) {
    score = 10;
  } else if (diversity >= 0.6) {
    score = 30;
  } else if (diversity >= 0.4) {
    score = 50;
  } else if (diversity >= 0.25) {
    score = 70;
  } else {
    score = 90;
  }

  // 支配的パターンがあればスコアを加算
  if (dominance > 0.3) {
    score = clamp(score + 15);
  }

  const topPatterns = Object.entries(patterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `「…${k}」(${v})`)
    .join(", ");

  return {
    score: clamp(score),
    detail: `文末パターン多様性: ${diversity.toFixed(3)}（${uniquePatterns}種/${totalSentences}文）, 上位: ${topPatterns}`,
  };
}

/**
 * 句読点密度
 * AI生成は読点（、）の使い方が均一。
 * 人間は文によって読点の打ち方にムラがある。
 */
function analyzePunctuationDensity(sentences: string[]): AIDetectionMetric {
  if (sentences.length < 5) {
    return { score: 50, detail: "文数が少なすぎるため判定不能" };
  }

  // 各文における読点密度（読点数 / 文字数）を計算
  const densities: number[] = [];
  for (const s of sentences) {
    const chars = [...s];
    if (chars.length < 3) continue;
    const commaCount = (s.match(/[、,]/g) || []).length;
    densities.push(commaCount / chars.length);
  }

  if (densities.length < 5) {
    return { score: 50, detail: "分析対象の文が不足" };
  }

  const cv = coefficientOfVariation(densities);
  const meanDensity =
    densities.reduce((a, b) => a + b, 0) / densities.length;

  // CV: AI 0.3-0.6, 人間 0.7-1.5
  let score: number;
  if (cv >= 1.2) {
    score = 10;
  } else if (cv >= 0.8) {
    score = 25;
  } else if (cv >= 0.6) {
    score = 45;
  } else if (cv >= 0.4) {
    score = 65;
  } else {
    score = 85;
  }

  return {
    score: clamp(score),
    detail: `読点密度の変動係数: ${cv.toFixed(3)}, 平均密度: ${(meanDensity * 100).toFixed(2)}%`,
  };
}

/**
 * 段落構造
 * AI生成は段落の長さが均一になりやすい。
 */
function analyzeParagraphStructure(text: string): AIDetectionMetric {
  const paragraphs = splitParagraphs(text);

  if (paragraphs.length < 3) {
    return { score: 50, detail: "段落数が少なすぎるため判定不能" };
  }

  const lengths = paragraphs.map((p) => [...p].length);
  const cv = coefficientOfVariation(lengths);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // CV: AI 0.2-0.4, 人間 0.5-1.0+
  let score: number;
  if (cv >= 0.9) {
    score = 10;
  } else if (cv >= 0.6) {
    score = 25;
  } else if (cv >= 0.4) {
    score = 50;
  } else if (cv >= 0.25) {
    score = 70;
  } else {
    score = 90;
  }

  return {
    score: clamp(score),
    detail: `段落長の変動係数: ${cv.toFixed(3)}, 平均段落長: ${mean.toFixed(0)}文字（${paragraphs.length}段落）`,
  };
}

// --- メイン分析関数 ---

/**
 * テキストのAI生成度を分析する
 * 形態素解析なし、文字・句読点ベースの統計分析v1
 */
export function analyzeText(text: string): AIDetectionResult {
  const sentences = splitSentences(text);

  // 各指標を分析
  const vocabularyDiversity = analyzeVocabularyDiversity(text);
  const sentenceLengthVariance = analyzeSentenceLengthVariance(sentences);
  const burstiness = analyzeBurstiness(sentences);
  const conjunctionPattern = analyzeConjunctionPattern(text);
  const repetition = analyzeRepetition(sentences);
  const endingPattern = analyzeEndingPattern(sentences);
  const punctuationDensity = analyzePunctuationDensity(sentences);
  const paragraphStructure = analyzeParagraphStructure(text);

  const metrics = {
    vocabularyDiversity,
    sentenceLengthVariance,
    burstiness,
    conjunctionPattern,
    repetition,
    endingPattern,
    punctuationDensity,
    paragraphStructure,
  };

  // 重み付き平均で総合スコアを計算
  // 文長系の指標を重視（AI検出で比較的信頼性が高い）
  const weights = {
    vocabularyDiversity: 1.5,
    sentenceLengthVariance: 1.5,
    burstiness: 1.2,
    conjunctionPattern: 1.0,
    repetition: 1.3,
    endingPattern: 1.0,
    punctuationDensity: 1.0,
    paragraphStructure: 1.0,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [key, metric] of Object.entries(metrics)) {
    const weight = weights[key as keyof typeof weights];
    weightedSum += metric.score * weight;
    totalWeight += weight;
  }

  const overallScore = clamp(Math.round(weightedSum / totalWeight));

  // 信頼度の判定
  // テキスト量と文数に基づく
  const textLength = [...text].length;
  let confidence: AIDetectionResult["confidence"];
  if (textLength >= 3000 && sentences.length >= 30) {
    confidence = "high";
  } else if (textLength >= 1000 && sentences.length >= 10) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  // 総評を生成
  const summary = generateSummary(overallScore, confidence, metrics);

  return {
    overallScore,
    confidence,
    metrics,
    summary,
  };
}

/** 総評テキストを生成 */
function generateSummary(
  score: number,
  confidence: AIDetectionResult["confidence"],
  metrics: AIDetectionResult["metrics"]
): string {
  const confidenceLabel =
    confidence === "high" ? "高" : confidence === "medium" ? "中" : "低";

  let judgement: string;
  if (score >= 75) {
    judgement = "AI生成の可能性が高いテキストです";
  } else if (score >= 55) {
    judgement = "AI生成の可能性があるテキストです";
  } else if (score >= 35) {
    judgement = "人間による執筆とAI生成の中間的な特徴を示しています";
  } else {
    judgement = "人間による執筆の特徴が強いテキストです";
  }

  // 特に高スコアの指標を指摘
  const highScoreMetrics: string[] = [];
  const metricLabels: Record<string, string> = {
    vocabularyDiversity: "語彙の多様性",
    sentenceLengthVariance: "文長の分散",
    burstiness: "文長のバースト性",
    conjunctionPattern: "接続詞パターン",
    repetition: "表現の繰り返し",
    endingPattern: "文末パターン",
    punctuationDensity: "句読点密度",
    paragraphStructure: "段落構造",
  };

  for (const [key, metric] of Object.entries(metrics)) {
    if (metric.score >= 70) {
      highScoreMetrics.push(metricLabels[key]);
    }
  }

  let detail = "";
  if (highScoreMetrics.length > 0) {
    detail = `特にAI的な特徴が見られた指標: ${highScoreMetrics.join("、")}。`;
  }

  return `総合スコア ${score}/100（信頼度: ${confidenceLabel}）。${judgement}。${detail}`;
}
