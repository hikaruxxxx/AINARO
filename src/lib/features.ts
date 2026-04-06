/**
 * テキスト構造的特徴量の抽出
 * scripts/self-learning-loop.ts から移植・lib化
 * パターン抽出エンジンと品質分析で使用
 */

// --- 感情語辞書 ---

const POSITIVE_EMOTIONS = [
  "嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し",
  "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく",
  "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ",
];

const NEGATIVE_EMOTIONS = [
  "悲しい", "悲し", "泣い", "泣き", "涙", "辛い",
  "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖",
  "不安", "心配", "焦り", "焦っ", "怒り", "怒っ",
  "悔し", "絶望", "寂し", "孤独",
];

const TENSION_WORDS = ["しかし", "だが", "その時", "まさか", "突然", "……", "――", "？"];

// --- 特徴量の型定義 ---

export interface ExtendedFeatures {
  // 基本
  avgSentenceLength: number;
  sentenceLengthCV: number;        // 文長の変動係数
  dialogueRatio: number;           // 会話比率
  shortSentenceRatio: number;      // 短文（20字以下）の割合
  emotionDensity: number;          // 感情語密度
  questionRatio: number;           // 疑問文の割合
  exclamationRatio: number;        // 感嘆文の割合
  burstRatio: number;              // 文長のバースト度

  // 構成力
  paragraphLengthCV: number;       // 段落長の変動係数
  avgParagraphLength: number;
  longSentenceRatio: number;       // 長文（50字以上）の割合
  sentenceLengthRange: number;     // 文長レンジ / 平均
  dialogueAvgLength: number;       // 平均セリフ長

  // 感情の質
  emotionPolarity: number;         // 感情極性 (-1〜+1)
  emotionSwing: number;            // 前半/後半の感情反転度
  uniqueEmotionRatio: number;      // 感情表現の多様性

  // テキスト構造
  commaPerSentence: number;        // 1文あたりの読点数
  sceneBreakCount: number;         // シーン転換数
  openingLength: number;           // 冒頭3文の合計文字数
  endingQuestionOrTension: number; // 末尾が緊張/疑問で終わるか (0 or 1)

  // キャラ関連
  speakerVariety: number;          // 推定発話者数
  innerMonologueRatio: number;     // （）独白比率

  // 情報密度
  uniqueKanjiRatio: number;        // ユニーク漢字比率
  katakanaRatio: number;           // カタカナ比率
  punctuationVariety: number;      // 記号の種類数
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * テキストから25種の構造的特徴量を抽出する
 * @param text エピソード本文
 * @returns 特徴量オブジェクト、テキストが短すぎる場合はnull
 */
export function extractExtendedFeatures(text: string): ExtendedFeatures | null {
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
  const sceneBreaks = (text.match(/\n\s*\n\s*\n/g) || []).length
    + (text.match(/\n\s*[＊*]{3,}\s*\n/g) || []).length
    + (text.match(/\n\s*[─―]{3,}\s*\n/g) || []).length;

  // 冒頭
  const opening3 = sentences.slice(0, 3);
  const openingLen = opening3.reduce((acc, s) => acc + s.length, 0);

  // 末尾
  const lastSentences = sentences.slice(-3);
  const endingTension = lastSentences.some(s => TENSION_WORDS.some(w => s.includes(w))) ? 1 : 0;

  // 発話者多様性
  const speakerContexts = new Set<string>();
  const dialogueRegex = /([^\n「」]{0,10})「[^」]+」/g;
  let match;
  while ((match = dialogueRegex.exec(text)) !== null) {
    speakerContexts.add(match[1].trim().slice(-5));
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
    uniqueEmotionRatio: round(totalEmotion > 0
      ? new Set([
        ...POSITIVE_EMOTIONS.filter(w => text.includes(w)),
        ...NEGATIVE_EMOTIONS.filter(w => text.includes(w)),
      ]).size / totalEmotion
      : 0),

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
