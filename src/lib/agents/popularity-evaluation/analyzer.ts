import type {
  PopularityEvaluationResult,
  PopularityMetric,
  PopularityGenre,
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
 * 文の長さのバリエーションとテンポ感
 */
function analyzePacing(text: string): PopularityMetric {
  const sentences = splitSentences(text);
  if (sentences.length < 5) {
    return { score: 50, detail: "文数が少なすぎて判定困難" };
  }

  const lengths = sentences.map((s) => s.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  // 標準偏差を計算（バリエーションの指標）
  const variance =
    lengths.reduce((acc, l) => acc + (l - avgLength) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // 変動係数（平均に対するばらつき）
  const cv = avgLength > 0 ? stdDev / avgLength : 0;

  let score = 50;
  const details: string[] = [];

  // 適度なバリエーション（CV 0.4-0.8が理想）
  if (cv >= 0.4 && cv <= 0.8) {
    score += 25;
    details.push("文の長さに適度な緩急がある");
  } else if (cv >= 0.3 && cv <= 1.0) {
    score += 15;
    details.push("文の長さにやや緩急がある");
  } else if (cv < 0.3) {
    details.push("文の長さが均一でテンポが単調");
  } else {
    score += 5;
    details.push("文の長さのばらつきがやや大きい");
  }

  // 短文（20文字以下）の割合
  const shortRatio = lengths.filter((l) => l <= 20).length / lengths.length;
  if (shortRatio >= 0.2 && shortRatio <= 0.5) {
    score += 15;
    details.push("短文が効果的に使われている");
  } else if (shortRatio > 0.5) {
    score += 5;
    details.push("短文が多すぎる傾向");
  }

  // 平均文長（日本語小説では30-50文字が読みやすい）
  if (avgLength >= 25 && avgLength <= 55) {
    score += 10;
    details.push(`平均文長${Math.round(avgLength)}文字で適切`);
  } else if (avgLength > 70) {
    score -= 10;
    details.push(`平均文長${Math.round(avgLength)}文字でやや長い`);
  }

  return { score: clamp(score), detail: details.join("。") };
}

/**
 * 会話比率を評価
 * 40%前後が理想
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

  // 理想は35-45%
  if (ratio >= 0.35 && ratio <= 0.45) {
    score = 90;
    details.push(`会話比率${percentage}%で理想的`);
  } else if (ratio >= 0.25 && ratio <= 0.55) {
    score = 70;
    details.push(`会話比率${percentage}%でほぼ良好`);
  } else if (ratio >= 0.15 && ratio <= 0.65) {
    score = 50;
    details.push(`会話比率${percentage}%でやや偏りがある`);
  } else if (ratio < 0.15) {
    score = 30;
    details.push(`会話比率${percentage}%で地の文が多すぎる`);
  } else {
    score = 30;
    details.push(`会話比率${percentage}%で会話が多すぎる`);
  }

  // 会話の数も考慮
  if (dialogues.length > 0) {
    const avgDialogueLength =
      dialogueText.length / dialogues.length;
    if (avgDialogueLength > 100) {
      score -= 10;
      details.push("一つの台詞が長すぎる傾向");
    }
  } else {
    score = 20;
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
  // デフォルト（女性向けファンタジー寄り）
  const base: MetricWeights = {
    hookStrength: 15,
    pacing: 12,
    dialogueRatio: 13,
    innerMonologue: 10,
    cliffhanger: 13,
    emotionalArc: 15,
    sensoryDescription: 10,
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

  const suggestions: Record<string, string[]> = {
    hookStrength: [
      "冒頭に疑問文や短い衝撃的な文を入れてみてください",
      "最初の3行で読者の感情を動かす描写を追加しましょう",
    ],
    pacing: [
      "長文と短文を意識的に使い分けてリズムを作りましょう",
      "アクションシーンでは短文を、心理描写では長文を使うと効果的です",
    ],
    dialogueRatio: [
      "会話と地の文のバランスを40%前後に調整してみてください",
      "会話で情報を伝えつつ、地の文で心情や状況を補完しましょう",
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
      "喜怒哀楽の起伏を意識的に配置しましょう",
      "後半にクライマックスを設けると読後感が良くなります",
    ],
    sensoryDescription: [
      "視覚・聴覚だけでなく、触覚・嗅覚・味覚も取り入れましょう",
      "各シーンに最低1つの五感描写を入れると臨場感が増します",
    ],
    readability: [
      "1文を短めにし、読点は1文に2つまでを目安にしましょう",
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

// ─── メインの分析関数 ───

/**
 * 小説テキストの人気評価を実行する
 * @param text - 分析対象のテキスト
 * @param genre - ジャンル（任意。重み付けに影響）
 */
export function analyzePopularity(
  text: string,
  genre?: PopularityGenre
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
    strengths,
    improvements,
    summary,
  };
}
