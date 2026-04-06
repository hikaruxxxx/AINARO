import type {
  PopularityEvaluationResult,
  PopularityMetric,
  PopularityGenre,
  LLMQualityScores,
} from "@/types/agents";

// ─── ユーティリティ ───

/** テキストを文単位に分割（。！？で区切る） */
function splitSentences(text: string): string[] {
  // 「」内の句点では分割しない簡易実装
  return text
    .split(/(?<=[。！？!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** テキストを段落に分割 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** 「」で囲まれた会話部分を抽出 */
function extractDialogue(text: string): string[] {
  const matches = text.match(/「[^」]*」/g);
  return matches || [];
}

/** （）で囲まれた内面独白を抽出 */
function extractInnerMonologue(text: string): string[] {
  const matches = text.match(/（[^）]*）/g);
  return matches || [];
}

/** スコアを0-100に収める */
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// ─── 感情語彙辞書 ───

const EMOTION_WORDS = [
  // ポジティブ感情
  "嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し",
  "好き", "愛し", "感動", "感激", "ときめ", "ドキドキ", "わくわく",
  "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ",
  // ネガティブ感情
  "悲しい", "悲し", "悲しみ", "泣い", "泣き", "涙", "辛い", "辛く",
  "苦しい", "苦し", "痛い", "痛み", "怖い", "恐ろし", "恐怖",
  "不安", "心配", "焦り", "焦っ", "怒り", "怒っ", "憎い", "憎し",
  "悔し", "惨め", "絶望", "寂し", "孤独",
  // 驚き・衝撃
  "驚い", "驚き", "衝撃", "信じられ", "まさか", "呆然",
  // 緊張
  "緊張", "震え", "戦慄", "息を呑", "固まっ", "凍りつ",
];

// ─── 五感語彙辞書 ───

const SENSORY_WORDS = {
  visual: [
    "見え", "見つめ", "眺め", "映っ", "輝い", "光", "色",
    "赤い", "青い", "白い", "黒い", "暗い", "明るい", "煌めき",
    "瞳", "目", "景色", "姿", "影", "闇", "鮮やか",
  ],
  auditory: [
    "聞こえ", "聴こえ", "響い", "音", "声", "叫び", "囁い",
    "静か", "沈黙", "ざわめき", "足音", "鳴っ", "鳴り",
  ],
  tactile: [
    "触れ", "触っ", "肌", "温かい", "温もり", "冷たい", "熱い",
    "柔らか", "硬い", "痛い", "震え", "撫で", "握っ", "抱き",
  ],
  olfactory: [
    "匂い", "匂っ", "香り", "香っ", "臭い", "臭っ", "芳し",
  ],
  gustatory: [
    "味", "甘い", "苦い", "酸っぱい", "辛い", "美味し", "不味い",
  ],
};

// ─── 各指標の分析関数 ───

/**
 * 冒頭の引き込み力を評価
 * 最初の3行で謎・衝撃・感情があるか
 */
function analyzeHookStrength(text: string): PopularityMetric {
  const paragraphs = splitParagraphs(text);
  // 最初の3段落（または全段落が3未満なら全部）
  const opening = paragraphs.slice(0, 3).join("\n");
  const openingSentences = splitSentences(opening);

  let score = 40; // ベーススコア
  const details: string[] = [];

  // 疑問文があるか
  const hasQuestion = openingSentences.some(
    (s) => s.includes("？") || s.includes("?") || s.endsWith("か」")
  );
  if (hasQuestion) {
    score += 15;
    details.push("冒頭に疑問文あり");
  }

  // 感嘆符があるか
  const hasExclamation = openingSentences.some(
    (s) => s.includes("！") || s.includes("!")
  );
  if (hasExclamation) {
    score += 10;
    details.push("感嘆表現あり");
  }

  // 短文の連続（テンポ感）
  const shortSentences = openingSentences.filter((s) => s.length <= 20);
  if (shortSentences.length >= 2) {
    score += 10;
    details.push("短文でテンポよく開始");
  }

  // 感情語の使用
  const emotionInOpening = EMOTION_WORDS.filter((w) =>
    opening.includes(w)
  ).length;
  if (emotionInOpening >= 2) {
    score += 10;
    details.push("冒頭に感情表現が豊富");
  } else if (emotionInOpening >= 1) {
    score += 5;
  }

  // 会話で始まるか（読者を引き込みやすい）
  if (paragraphs[0]?.startsWith("「")) {
    score += 10;
    details.push("会話で始まっている");
  }

  // 冒頭が長すぎる地の文だけだと減点
  if (
    openingSentences.length > 0 &&
    openingSentences.every((s) => s.length > 60)
  ) {
    score -= 15;
    details.push("冒頭の文が長すぎる");
  }

  if (details.length === 0) {
    details.push("冒頭のインパクトがやや弱い");
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * テンポ（ペーシング）を評価
 * v2検証結果: 人気作品はCV 0.5-0.7（安定した緩急）。CV > 0.8は散漫で不人気の特徴。
 * 短文率は0.25-0.40が最適。0.45超は短文頼りで不人気の特徴。
 */
function analyzePacing(text: string): PopularityMetric {
  const sentences = splitSentences(text);
  if (sentences.length < 5) {
    return { score: 50, detail: "文数が少なすぎて判定困難" };
  }

  const lengths = sentences.map((s) => s.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  const variance =
    lengths.reduce((acc, l) => acc + (l - avgLength) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  const cv = avgLength > 0 ? stdDev / avgLength : 0;

  let score = 50;
  const details: string[] = [];

  // 文長CV: 人気作品の中央値0.625。0.5-0.7が安定した緩急
  if (cv >= 0.5 && cv <= 0.7) {
    score += 25;
    details.push("文の長さに安定した緩急がある");
  } else if (cv >= 0.4 && cv <= 0.8) {
    score += 15;
    details.push("文の長さにやや緩急がある");
  } else if (cv < 0.4) {
    details.push("文の長さが均一すぎる");
  } else {
    score -= 10;
    details.push("文の長さのばらつきが大きすぎる（構成が散漫）");
  }

  // 短文率: 人気作品の中央値0.329。0.45超は不人気の特徴
  const shortRatio = lengths.filter((l) => l <= 20).length / lengths.length;
  if (shortRatio >= 0.2 && shortRatio <= 0.4) {
    score += 15;
    details.push("短文が効果的に使われている");
  } else if (shortRatio > 0.45) {
    score -= 10;
    details.push("短文が多すぎる（テンション頼りの傾向）");
  } else if (shortRatio < 0.15) {
    score += 5;
    details.push("短文が少なめ");
  }

  // 平均文長: 人気作品の中央値32字。25-45字が適切
  if (avgLength >= 25 && avgLength <= 45) {
    score += 10;
    details.push(`平均文長${Math.round(avgLength)}文字で適切`);
  } else if (avgLength < 20) {
    score -= 10;
    details.push(`平均文長${Math.round(avgLength)}文字で短すぎる`);
  } else if (avgLength > 55) {
    score -= 5;
    details.push(`平均文長${Math.round(avgLength)}文字でやや長い`);
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * 会話比率を評価
 * v2検証結果: 人気作品の中央値は20%。15-30%が最適。
 * 会話が多すぎる（30%超）は不人気の特徴。地の文・描写の密度が人気に寄与。
 */
function analyzeDialogueRatio(text: string): PopularityMetric {
  const dialogues = extractDialogue(text);
  const dialogueText = dialogues.join("");
  const totalLength = text.replace(/\s/g, "").length;

  if (totalLength === 0) {
    return { score: 0, detail: "テキストが空" };
  }

  const ratio = dialogueText.length / totalLength;
  const percentage = Math.round(ratio * 100);

  let score: number;
  const details: string[] = [];

  // 人気作品の中央値: 20%。15-30%が最適
  if (ratio >= 0.15 && ratio <= 0.30) {
    score = 85;
    details.push(`会話比率${percentage}%で地の文とのバランスが良い`);
  } else if (ratio >= 0.10 && ratio <= 0.40) {
    score = 65;
    details.push(`会話比率${percentage}%で許容範囲`);
  } else if (ratio > 0.40) {
    score = 35;
    details.push(`会話比率${percentage}%で会話に頼りすぎ（描写を増やすべき）`);
  } else if (ratio < 0.05) {
    score = 30;
    details.push(`会話比率${percentage}%で会話が少なすぎる`);
  } else {
    score = 50;
    details.push(`会話比率${percentage}%`);
  }

  // 会話の平均長
  if (dialogues.length > 0) {
    const avgDialogueLength = dialogueText.length / dialogues.length;
    if (avgDialogueLength > 100) {
      score -= 10;
      details.push("一つの台詞が長すぎる傾向");
    }
  } else {
    score = 25;
    details.push("会話がまったくない");
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * 内面独白比率を評価
 */
function analyzeInnerMonologue(text: string): PopularityMetric {
  const monologues = extractInnerMonologue(text);
  const monologueText = monologues.join("");
  const totalLength = text.replace(/\s/g, "").length;

  if (totalLength === 0) {
    return { score: 0, detail: "テキストが空" };
  }

  const ratio = monologueText.length / totalLength;
  const percentage = Math.round(ratio * 100);

  let score: number;
  const details: string[] = [];

  // 5-15%が理想（多すぎると冗長、少なすぎると感情移入しにくい）
  if (ratio >= 0.05 && ratio <= 0.15) {
    score = 85;
    details.push(`内面描写${percentage}%で効果的`);
  } else if (ratio >= 0.02 && ratio <= 0.25) {
    score = 65;
    details.push(`内面描写${percentage}%でほぼ適切`);
  } else if (ratio === 0) {
    score = 40;
    details.push("内面描写が見当たらない（（）括弧を使用していない可能性）");
  } else if (ratio > 0.25) {
    score = 40;
    details.push(`内面描写${percentage}%で多すぎる傾向`);
  } else {
    score = 50;
    details.push(`内面描写${percentage}%`);
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * 引き（クリフハンガー）を評価
 * 末尾が疑問・未解決・緊張で終わっているか
 */
function analyzeCliffhanger(text: string): PopularityMetric {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) {
    return { score: 0, detail: "テキストが空" };
  }

  // 末尾3段落を対象
  const ending = paragraphs.slice(-3).join("\n");
  const endingSentences = splitSentences(ending);
  const lastSentence = endingSentences[endingSentences.length - 1] || "";

  let score = 30; // ベーススコア
  const details: string[] = [];

  // 疑問で終わる
  if (
    lastSentence.includes("？") ||
    lastSentence.includes("?") ||
    lastSentence.endsWith("だろうか") ||
    lastSentence.endsWith("のだろう") ||
    lastSentence.endsWith("のか")
  ) {
    score += 25;
    details.push("疑問を残す終わり方");
  }

  // 緊張・不安を示す語で終わる
  const tensionWords = [
    "しかし", "だが", "けれど", "ところが", "その時",
    "まさか", "突然", "不意に", "異変", "予感",
    "始まり", "始まっ", "変わっ", "変わろうとし",
  ];
  const hasTension = tensionWords.some((w) => ending.includes(w));
  if (hasTension) {
    score += 20;
    details.push("緊張感のある終わり方");
  }

  // 省略（……や――）で終わる
  if (
    lastSentence.includes("……") ||
    lastSentence.includes("――") ||
    lastSentence.includes("…")
  ) {
    score += 15;
    details.push("余韻を残す表現");
  }

  // 感情の高まりで終わる
  const emotionEnd = EMOTION_WORDS.some((w) => ending.includes(w));
  if (emotionEnd) {
    score += 10;
    details.push("感情的な余韻がある");
  }

  // きれいに完結していると引きが弱い
  const closureWords = [
    "こうして", "そして平和", "幸せに",
    "めでたし", "終わった", "解決した",
  ];
  const hasClosure = closureWords.some((w) => ending.includes(w));
  if (hasClosure) {
    score -= 20;
    details.push("話が完結してしまっている");
  }

  if (details.length === 0) {
    details.push("引きの強さは普通");
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * 感情起伏を評価
 */
function analyzeEmotionalArc(text: string): PopularityMetric {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length < 3) {
    return { score: 50, detail: "段落が少なすぎて感情起伏を判定困難" };
  }

  // 各段落の感情語密度を計算
  const emotionDensities = paragraphs.map((p) => {
    const count = EMOTION_WORDS.filter((w) => p.includes(w)).length;
    const length = p.length;
    return length > 0 ? count / (length / 100) : 0; // 100文字あたりの感情語数
  });

  // 感情密度のばらつき（起伏の指標）
  const avgDensity =
    emotionDensities.reduce((a, b) => a + b, 0) / emotionDensities.length;
  const maxDensity = Math.max(...emotionDensities);
  const minDensity = Math.min(...emotionDensities);
  const range = maxDensity - minDensity;

  let score = 40;
  const details: string[] = [];

  // 感情語の絶対量
  const totalEmotionWords = EMOTION_WORDS.filter((w) =>
    text.includes(w)
  ).length;

  if (totalEmotionWords === 0) {
    return { score: 20, detail: "感情表現がほとんど見当たらない" };
  }

  // 密度が適度にある
  if (avgDensity >= 0.5 && avgDensity <= 3.0) {
    score += 20;
    details.push("感情表現の密度が適切");
  } else if (avgDensity > 3.0) {
    score += 10;
    details.push("感情表現がやや過多");
  } else {
    details.push("感情表現が少なめ");
  }

  // 起伏がある（密度の差が大きい）
  if (range >= 1.0) {
    score += 20;
    details.push("感情の緩急がある");
  } else if (range >= 0.5) {
    score += 10;
    details.push("感情の起伏がやや控えめ");
  } else {
    details.push("感情の変化が乏しい");
  }

  // クライマックス的な盛り上がり（後半に感情密度が高い部分がある）
  const latterHalf = emotionDensities.slice(
    Math.floor(emotionDensities.length / 2)
  );
  const latterMax = Math.max(...latterHalf);
  if (latterMax >= avgDensity * 1.5 && latterMax > 0) {
    score += 10;
    details.push("後半にクライマックスがある");
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * 五感描写を評価
 */
function analyzeSensoryDescription(text: string): PopularityMetric {
  const found: Record<string, boolean> = {
    visual: false,
    auditory: false,
    tactile: false,
    olfactory: false,
    gustatory: false,
  };

  const senseNames: Record<string, string> = {
    visual: "視覚",
    auditory: "聴覚",
    tactile: "触覚",
    olfactory: "嗅覚",
    gustatory: "味覚",
  };

  for (const [sense, words] of Object.entries(SENSORY_WORDS)) {
    found[sense] = words.some((w) => text.includes(w));
  }

  const presentSenses = Object.entries(found)
    .filter(([, v]) => v)
    .map(([k]) => senseNames[k]);
  const missingSenses = Object.entries(found)
    .filter(([, v]) => !v)
    .map(([k]) => senseNames[k]);

  const count = presentSenses.length;

  // 5感のうちいくつ使われているか
  let score: number;
  if (count >= 4) {
    score = 90;
  } else if (count === 3) {
    score = 70;
  } else if (count === 2) {
    score = 50;
  } else if (count === 1) {
    score = 30;
  } else {
    score = 10;
  }

  const details: string[] = [];
  if (presentSenses.length > 0) {
    details.push(`使用感覚: ${presentSenses.join("・")}`);
  }
  if (missingSenses.length > 0 && missingSenses.length <= 3) {
    details.push(`不足: ${missingSenses.join("・")}`);
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * 読みやすさを評価
 */
function analyzeReadability(text: string): PopularityMetric {
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);

  if (sentences.length === 0) {
    return { score: 0, detail: "テキストが空" };
  }

  let score = 50;
  const details: string[] = [];

  // 平均文長
  const avgSentenceLength =
    sentences.reduce((acc, s) => acc + s.length, 0) / sentences.length;
  if (avgSentenceLength >= 20 && avgSentenceLength <= 50) {
    score += 15;
    details.push(`平均文長${Math.round(avgSentenceLength)}字で読みやすい`);
  } else if (avgSentenceLength > 70) {
    score -= 10;
    details.push(`平均文長${Math.round(avgSentenceLength)}字で長すぎる`);
  } else if (avgSentenceLength < 10) {
    score -= 5;
    details.push(`平均文長${Math.round(avgSentenceLength)}字で短すぎる`);
  }

  // 段落あたりの文数（3-6文が理想）
  const sentencesPerParagraph = sentences.length / paragraphs.length;
  if (sentencesPerParagraph >= 2 && sentencesPerParagraph <= 6) {
    score += 10;
    details.push("段落の長さが適切");
  } else if (sentencesPerParagraph > 10) {
    score -= 10;
    details.push("段落が長すぎる");
  }

  // 読点の使用頻度（1文に2つまでが理想）
  const commaCount = (text.match(/、/g) || []).length;
  const commaPerSentence = commaCount / sentences.length;
  if (commaPerSentence <= 2.5 && commaPerSentence >= 0.5) {
    score += 10;
    details.push("読点の使い方が適切");
  } else if (commaPerSentence > 3) {
    score -= 5;
    details.push("読点が多すぎる傾向");
  }

  // 改行の頻度（適度な改行がある）
  const lineBreaks = (text.match(/\n/g) || []).length;
  const charsPerLine = text.length / (lineBreaks + 1);
  if (charsPerLine >= 50 && charsPerLine <= 300) {
    score += 10;
    details.push("改行の頻度が適切");
  }

  // テキスト全体の文字数
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars >= 3000 && totalChars <= 5000) {
    score += 5;
    details.push(`全体${totalChars}字で1話分として適切`);
  }

  return { score: clamp(score), detail: details.join("。") };
}

// ─── グレード判定 ───

function determineGrade(
  score: number
): PopularityEvaluationResult["grade"] {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

// ─── ジャンル別重み調整 ───

interface MetricWeights {
  hookStrength: number;
  pacing: number;
  dialogueRatio: number;
  innerMonologue: number;
  cliffhanger: number;
  emotionalArc: number;
  sensoryDescription: number;
  readability: number;
}

function getGenreWeights(genre?: PopularityGenre): MetricWeights {
  // v2検証結果に基づく重み配分
  // 構成の安定感(pacing) > 感情(emotionalArc) > 引き(cliffhanger) > 会話バランス(dialogueRatio)
  // > 冒頭(hookStrength) > 読みやすさ(readability) > 内面(innerMonologue) > 五感(sensoryDescription)
  const base: MetricWeights = {
    hookStrength: 12,
    pacing: 18,         // v2で最も分離に寄与した特徴量群（CV, 短文率, バースト比）
    dialogueRatio: 14,  // v2で強い分離（効果量0.655）
    innerMonologue: 8,
    cliffhanger: 13,
    emotionalArc: 16,   // 感情密度は人気作品が高い
    sensoryDescription: 7,  // v2で逆の相関（不人気のほうが高い）→ 重み下げ
    readability: 12,
  };

  if (!genre) return base;

  // ジャンル別の重み調整
  switch (genre) {
    case "fantasy":
      // ファンタジー: 世界観描写と感情起伏を重視
      return { ...base, sensoryDescription: 14, emotionalArc: 16, innerMonologue: 8 };
    case "romance":
      // ロマンス: 感情と内面独白を重視
      return { ...base, emotionalArc: 18, innerMonologue: 14, sensoryDescription: 8 };
    case "horror":
      // ホラー: 五感描写と引きを重視
      return { ...base, sensoryDescription: 16, cliffhanger: 16, emotionalArc: 10 };
    case "mystery":
      // ミステリー: 引きと冒頭の引き込みを重視
      return { ...base, cliffhanger: 18, hookStrength: 16, emotionalArc: 10 };
    case "scifi":
      // SF: 世界観描写と読みやすさを重視
      return { ...base, sensoryDescription: 14, readability: 15, emotionalArc: 10 };
    case "slice_of_life":
      // 日常: 会話と内面描写を重視
      return { ...base, dialogueRatio: 16, innerMonologue: 14, cliffhanger: 8 };
    default:
      return base;
  }
}

// ─── 強み・改善提案の生成 ───

function generateStrengths(
  metrics: PopularityEvaluationResult["metrics"]
): string[] {
  const strengths: string[] = [];
  const entries = Object.entries(metrics) as [string, PopularityMetric][];

  const labels: Record<string, string> = {
    hookStrength: "冒頭の引き込み力",
    pacing: "テンポ",
    dialogueRatio: "会話バランス",
    innerMonologue: "内面描写",
    cliffhanger: "引きの強さ",
    emotionalArc: "感情起伏",
    sensoryDescription: "五感描写",
    readability: "読みやすさ",
  };

  // スコア70以上の指標を強みとして列挙
  for (const [key, metric] of entries) {
    if (metric.score >= 70) {
      strengths.push(`${labels[key]}が優れている（${metric.score}点）`);
    }
  }

  if (strengths.length === 0) {
    strengths.push("全体的にバランスが取れている");
  }

  return strengths;
}

function generateImprovements(
  metrics: PopularityEvaluationResult["metrics"]
): string[] {
  const improvements: string[] = [];

  // v2検証データに基づく改善提案
  const suggestions: Record<string, string[]> = {
    hookStrength: [
      "冒頭3行で状況・感情・謎のいずれかを提示してください",
      "最初の3行で読者の感情を動かす描写を追加しましょう",
    ],
    pacing: [
      "文長のばらつきを抑え、安定した緩急を意識してください（CV 0.5-0.7が理想）",
      "短文に頼りすぎず、描写を充実させた30字前後の文を増やしましょう",
    ],
    dialogueRatio: [
      "会話を15-30%に抑え、地の文・描写の密度を上げてください（人気作品の中央値は20%）",
      "会話で進めがちな展開を、描写や心理で補強しましょう",
    ],
    innerMonologue: [
      "主人公の心の声を（）括弧で入れると感情移入しやすくなります",
      "重要な場面で主人公の葛藤や迷いを内面描写で表現しましょう",
    ],
    cliffhanger: [
      "章末を疑問や未解決の展開で終わらせると次話への期待が高まります",
      "「――その時」「まさか」など、緊張感のある引きを入れましょう",
    ],
    emotionalArc: [
      "感情語を具体的な身体反応や行動で描写してください（説明より描写）",
      "後半にクライマックスを設け、感情の起伏を明確にしましょう",
    ],
    sensoryDescription: [
      "五感描写は量より質。各シーンに1つ、印象的なものを入れましょう",
      "五感語彙の羅列は避け、物語に溶け込む描写を心がけてください",
    ],
    readability: [
      "平均文長25-45字を目安に。短すぎる文の連続は避けてください",
      "段落を適度な長さで区切り、改行を意識しましょう",
    ],
  };

  const entries = Object.entries(metrics) as [string, PopularityMetric][];

  // スコア50未満の指標に対して改善提案
  for (const [key, metric] of entries) {
    if (metric.score < 50 && suggestions[key]) {
      improvements.push(suggestions[key][0]);
    }
  }

  // スコア50-69の指標にも軽い提案
  for (const [key, metric] of entries) {
    if (metric.score >= 50 && metric.score < 70 && suggestions[key]) {
      improvements.push(suggestions[key][1]);
    }
  }

  if (improvements.length === 0) {
    improvements.push("全体的に高い品質です。この調子で執筆を続けてください");
  }

  return improvements.slice(0, 5); // 最大5つまで
}

// ─── 総評の生成 ───

function generateSummary(
  overallScore: number,
  grade: PopularityEvaluationResult["grade"],
  metrics: PopularityEvaluationResult["metrics"]
): string {
  const highMetrics = Object.entries(metrics)
    .filter(([, m]) => (m as PopularityMetric).score >= 70)
    .length;
  const lowMetrics = Object.entries(metrics)
    .filter(([, m]) => (m as PopularityMetric).score < 50)
    .length;

  let summary = `総合スコア${overallScore}点（${grade}ランク）。`;

  if (grade === "S") {
    summary += "非常に高い完成度です。読者を引き込む力が強く、人気が出やすい作品と言えます。";
  } else if (grade === "A") {
    summary += "高い品質の作品です。いくつかの指標を微調整すれば、さらに魅力的になります。";
  } else if (grade === "B") {
    summary += `${highMetrics}つの指標で良好な結果が出ています。弱い部分を改善すれば大きく伸びる可能性があります。`;
  } else if (grade === "C") {
    summary += `改善の余地が${lowMetrics}つの指標にあります。特にスコアの低い項目を重点的に見直してみてください。`;
  } else {
    summary += "基本的な構成要素の見直しが必要です。各指標の改善提案を参考に、全体的な品質を高めましょう。";
  }

  return summary;
}

// ─── PV予測（リッジ回帰モデル v7） ───

/**
 * 1,290作品（表層）/ 264作品（LLM込み）で訓練済みの品質予測モデル（v7）。
 * 目的変数: log10(GP / log10(episodes + 1))（エピソード数正規化済み）
 *
 * モデルA: 表層21 + ジャンル2 = 23特徴量（Spearman=0.41, RMSE=1.20）— 1,290作品
 * モデルB: 表層21 + ジャンル2 + LLM6 = 29特徴量（Spearman=0.60, RMSE=0.98）— 264作品
 */

// フルモデル（表層+ジャンル+LLM）の係数と標準化パラメータ（264作品で訓練）
const PV_MODEL_FULL = {
  featureStats: [
    { mean: 22.906576, std: 5.502595 },  // avgSentenceLen
    { mean: 0.696750, std: 0.132727 },   // sentenceLenCV
    { mean: 0.392838, std: 0.126425 },   // shortSentenceRatio
    { mean: 0.072006, std: 0.065526 },   // longSentenceRatio
    { mean: 0.535153, std: 0.108621 },   // medSentenceRatio
    { mean: 0.191167, std: 0.114011 },   // burstRatio
    { mean: 0.644573, std: 0.144578 },   // paragraphLenCV
    { mean: 38.636598, std: 12.977314 }, // avgParagraphLen
    { mean: 0.198307, std: 0.146131 },   // dialogueRatio
    { mean: 0.020403, std: 0.043341 },   // innerMonologueRatio
    { mean: 0.781290, std: 0.144906 },   // narrativeRatio
    { mean: 3.644836, std: 2.434824 },   // emotionDensity
    { mean: 0.590692, std: 0.246995 },   // uniqueEmotionRatio
    { mean: 0.075499, std: 0.063303 },   // questionRatio
    { mean: 0.079437, std: 0.081592 },   // exclamationRatio
    { mean: 0.668451, std: 0.277175 },   // commaPerSentence
    { mean: 0.553807, std: 0.083551 },   // bigramTTR
    { mean: 0.250402, std: 0.033222 },   // kanjiRatio
    { mean: 0.079243, std: 0.056385 },   // katakanaRatio
    { mean: 0.512056, std: 0.073521 },   // hiraganaRatio
    { mean: 3.473029, std: 1.720008 },   // conjDensity
    { mean: 0.405303, std: 0.490951 },   // genre_fantasy
    { mean: 0.579545, std: 0.493632 },   // genre_romance
    { mean: 4.916667, std: 1.758278 },   // llm_hook
    { mean: 4.507576, std: 1.637608 },   // llm_character
    { mean: 4.265152, std: 1.650803 },   // llm_originality
    { mean: 4.837121, std: 1.644546 },   // llm_prose
    { mean: 4.428030, std: 1.695172 },   // llm_tension
    { mean: 4.962121, std: 1.880544 },   // llm_pull
  ],
  targetMean: 3.778215,
  targetStd: 1.250410,
  coefficients: [
    0.070276, -0.080178, -0.016532, 0.021102, 0.006522,
    0.002496, 0.045533, -0.003129, -0.038556, 0.052325,
    0.023231, -0.024959, -0.026835, -0.081377, -0.015257,
    -0.014190, -0.022988, 0.035441, 0.070135, -0.094908,
    0.003961,
    -0.197660, 0.214480, // ジャンル
    0.071152, 0.021801, -0.043788, 0.110563, 0.060768, 0.088963, // LLM
  ],
  rmse: 0.9777,
};

// 表層+ジャンルのみモデルの係数（1,290作品で訓練）
const PV_MODEL_SURFACE = {
  featureStats: [
    { mean: 26.168789, std: 12.558957 },
    { mean: 0.686870, std: 0.199606 },
    { mean: 0.395851, std: 0.143829 },
    { mean: 0.102341, std: 0.095900 },
    { mean: 0.501809, std: 0.125044 },
    { mean: 0.397759, std: 0.276302 },
    { mean: 0.653900, std: 0.177641 },
    { mean: 36.828935, std: 15.603591 },
    { mean: 0.214365, std: 0.153687 },
    { mean: 0.018456, std: 0.050796 },
    { mean: 0.767180, std: 0.156807 },
    { mean: 2.088000, std: 2.396046 },
    { mean: 0.733004, std: 0.326624 },
    { mean: 0.080966, std: 0.066117 },
    { mean: 0.094571, std: 0.116237 },
    { mean: 0.717585, std: 0.346503 },
    { mean: 0.499799, std: 0.154250 },
    { mean: 0.257208, std: 0.045769 },
    { mean: 0.074155, std: 0.045524 },
    { mean: 0.514782, std: 0.073585 },
    { mean: 3.340280, std: 1.789291 },
    { mean: 0.359690, std: 0.479909 },
    { mean: 0.217829, std: 0.412771 },
  ],
  targetMean: 3.618643,
  targetStd: 1.293195,
  coefficients: [
    0.058159, -0.005455, -0.099349, 0.051887, 0.078510,
    0.078405, 0.012117, -0.054191, -0.051634, 0.029936,
    0.040674, -0.017032, -0.082070, 0.006833, -0.042826,
    -0.091934, -0.161341, 0.008293, 0.051666, -0.015745,
    -0.010212,
    0.296764, 0.381672, // ジャンル
  ],
  rmse: 1.1953,
};

/** テキストからPV予測用の特徴量を抽出 */
function extractPVFeatures(text: string): number[] | null {
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

  const dialoguesText = (text.match(/「[^」]*」/g) || []).join("");
  const monologuesText = (text.match(/（[^）]*）/g) || []).join("");

  const diffs: number[] = [];
  for (let i = 1; i < sLens.length; i++) diffs.push(Math.abs(sLens[i] - sLens[i - 1]));
  const meanDiff = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;

  const posCount = POSITIVE_EMO.filter(w => text.includes(w)).length;
  const negCount = NEGATIVE_EMO.filter(w => text.includes(w)).length;
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

  const CONJ = ["しかし", "そして", "また", "さらに", "そのため", "ところが", "けれど", "だが", "それでも", "つまり", "すると", "やがて", "それから", "だから"];
  const conjUsed = CONJ.reduce((acc, w) => acc + (text.match(new RegExp(w, "g"))?.length || 0), 0);

  return [
    sAvg,
    sAvg > 0 ? sStd / sAvg : 0,
    sLens.filter(l => l <= 20).length / sLens.length,
    sLens.filter(l => l >= 50).length / sLens.length,
    sLens.filter(l => l > 20 && l < 50).length / sLens.length,
    sAvg > 0 ? meanDiff / sAvg : 0,
    pAvg > 0 ? pStd / pAvg : 0,
    pAvg,
    chars > 0 ? dialoguesText.length / chars : 0,
    chars > 0 ? monologuesText.length / chars : 0,
    chars > 0 ? (chars - dialoguesText.length - monologuesText.length) / chars : 0,
    chars > 0 ? totalEmo / (chars / 1000) : 0,
    totalEmo > 0 ? new Set([...POSITIVE_EMO.filter(w => text.includes(w)), ...NEGATIVE_EMO.filter(w => text.includes(w))]).size / totalEmo : 0,
    questions / sentences.length,
    exclamations / sentences.length,
    commas / sentences.length,
    cleanChars.length > 1 ? bigrams.size / (cleanChars.length - 1) : 0,
    chars > 0 ? kanji.length / chars : 0,
    chars > 0 ? katakana.length / chars : 0,
    chars > 0 ? hiragana.length / chars : 0,
    chars > 0 ? conjUsed / (chars / 1000) : 0,
  ];
}

// PV予測用の感情語リスト（軽量版）
const POSITIVE_EMO = ["嬉しい", "嬉し", "喜び", "幸せ", "楽しい", "好き", "愛し", "感動", "ときめ", "安心", "微笑", "笑顔", "笑い", "笑っ"];
const NEGATIVE_EMO = ["悲しい", "悲し", "泣い", "涙", "辛い", "苦しい", "痛い", "怖い", "恐怖", "不安", "心配", "焦っ", "怒り", "怒っ", "悔し", "絶望", "寂し"];

/** ジャンルをモデル用カテゴリに変換 */
function genreToCategory(genre?: PopularityGenre): "fantasy" | "romance" | "literary" {
  if (!genre) return "literary";
  if (genre === "fantasy" || genre === "horror" || genre === "scifi") return "fantasy";
  if (genre === "romance") return "romance";
  return "literary"; // mystery, slice_of_life
}

/** PV（正規化globalPoint）を予測する。v7モデル: 目的変数=log10(GP/log10(ep+1)) */
function predictPV(text: string, genre?: PopularityGenre, llmScores?: LLMQualityScores): { predictedGP: number; confidenceRange: { low: number; high: number }; tier: "top" | "upper" | "mid" | "lower" | "bottom"; detail: string; hasLLMScores: boolean; reliability: "high" | "medium" | "low" } {
  const textFeatures = extractPVFeatures(text);
  if (!textFeatures) {
    return { predictedGP: 0, confidenceRange: { low: 0, high: 0 }, tier: "mid" as const, detail: "テキストが短すぎて予測不能", hasLLMScores: false, reliability: "low" as const };
  }

  // ジャンルone-hot（ファンタジー/恋愛の2変数、文芸がベースライン）
  const genreCat = genreToCategory(genre);
  const genreVec = [genreCat === "fantasy" ? 1.0 : 0.0, genreCat === "romance" ? 1.0 : 0.0];

  const hasLLM = !!llmScores;

  // モデル選択: LLMスコアありならフルモデル、なければ表層+ジャンルモデル
  const model = hasLLM ? PV_MODEL_FULL : PV_MODEL_SURFACE;
  const features = hasLLM
    ? [...textFeatures, ...genreVec, llmScores.hook, llmScores.character, llmScores.originality, llmScores.prose, llmScores.tension, llmScores.pull]
    : [...textFeatures, ...genreVec];

  // 標準化（各モデル固有の統計量を使用）
  const standardized = features.map((v, i) => {
    const s = model.featureStats[i];
    return s.std > 0 ? (v - s.mean) / s.std : 0;
  });

  // 予測（標準化空間）
  let predStd = 0;
  for (let i = 0; i < features.length; i++) {
    predStd += standardized[i] * model.coefficients[i];
  }

  // 元のスケールに戻す（正規化GP = GP/log10(ep+1)）
  const predLog = predStd * model.targetStd + model.targetMean;
  const predictedNormGP = Math.round(Math.pow(10, predLog));

  // 信頼区間（モデル固有のRMSE）
  const low = Math.round(Math.pow(10, predLog - model.rmse));
  const high = Math.round(Math.pow(10, predLog + model.rmse));

  // tier推定（正規化GPのパーセンタイル閾値 — 1,290作品）
  // P80=61,000 / P60=18,000 / P40=3,500 / P20=172
  let tier: "top" | "upper" | "mid" | "lower" | "bottom";
  if (predictedNormGP >= 61000) tier = "top";
  else if (predictedNormGP >= 18000) tier = "upper";
  else if (predictedNormGP >= 3500) tier = "mid";
  else if (predictedNormGP >= 172) tier = "lower";
  else tier = "bottom";

  // 信頼度判定
  const reliability: "high" | "medium" | "low" = hasLLM ? "medium" : "low";
  const ratio = Math.round(Math.pow(10, model.rmse * 2));

  const llmNote = hasLLM
    ? `（LLM込み・Spearman 0.61・信頼区間${ratio}倍幅）`
    : `⚠️ 表層のみ（Spearman 0.29・信頼区間${ratio}倍幅）— LLMスコア併用を推奨`;
  const detail = `予測正規化GP: ${predictedNormGP.toLocaleString()}（${low.toLocaleString()}〜${high.toLocaleString()}）。${tier} tier相当${llmNote}`;

  return { predictedGP: predictedNormGP, confidenceRange: { low, high }, tier, detail, hasLLMScores: hasLLM, reliability };
}

// ─── メインの分析関数 ───

/**
 * 小説テキストの人気評価を実行する
 * @param text - 分析対象のテキスト
 * @param genre - ジャンル（任意。重み付けに影響）
 */
export function analyzePopularity(
  text: string,
  genre?: PopularityGenre,
  llmScores?: LLMQualityScores,
): PopularityEvaluationResult {
  // 各指標を分析
  const metrics = {
    hookStrength: analyzeHookStrength(text),
    pacing: analyzePacing(text),
    dialogueRatio: analyzeDialogueRatio(text),
    innerMonologue: analyzeInnerMonologue(text),
    cliffhanger: analyzeCliffhanger(text),
    emotionalArc: analyzeEmotionalArc(text),
    sensoryDescription: analyzeSensoryDescription(text),
    readability: analyzeReadability(text),
  };

  // PV予測（LLMスコアがあれば精度向上: Spearman 0.415→0.733）
  const pvPrediction = predictPV(text, genre, llmScores);

  // ジャンル別の重み付けで総合スコアを計算
  const weights = getGenreWeights(genre);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const weightedSum =
    metrics.hookStrength.score * weights.hookStrength +
    metrics.pacing.score * weights.pacing +
    metrics.dialogueRatio.score * weights.dialogueRatio +
    metrics.innerMonologue.score * weights.innerMonologue +
    metrics.cliffhanger.score * weights.cliffhanger +
    metrics.emotionalArc.score * weights.emotionalArc +
    metrics.sensoryDescription.score * weights.sensoryDescription +
    metrics.readability.score * weights.readability;

  const overallScore = clamp(Math.round(weightedSum / totalWeight));
  const grade = determineGrade(overallScore);
  const strengths = generateStrengths(metrics);
  const improvements = generateImprovements(metrics);
  const summary = generateSummary(overallScore, grade, metrics);

  return {
    overallScore,
    grade,
    metrics,
    pvPrediction,
    strengths,
    improvements,
    summary,
  };
}
