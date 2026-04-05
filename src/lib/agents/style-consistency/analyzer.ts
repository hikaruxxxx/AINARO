import type {
  StyleConsistencyResult,
  StyleParam,
} from "@/types/agents";

// --- ユーティリティ ---

/** テキストを文単位に分割 */
function splitSentences(text: string): string[] {
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

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// --- 文体パラメータ型 ---

export interface StyleProfile {
  sentenceLengthAvg: number; // 平均文長（文字数）
  dialogueRatio: number; // 会話比率 0-1
  innerMonologueRatio: number; // 内面独白比率 0-1
  tempo: "slow" | "medium" | "fast"; // テンポ
  lineBreakFrequency: "sparse" | "normal" | "frequent"; // 改行頻度
}

/** デフォルトのスタイルプロファイル（_style.mdが未指定の場合） */
const DEFAULT_PROFILE: StyleProfile = {
  sentenceLengthAvg: 30,
  dialogueRatio: 0.4,
  innerMonologueRatio: 0.15,
  tempo: "medium",
  lineBreakFrequency: "normal",
};

// --- 各パラメータの分析 ---

function analyzeSentenceLength(
  sentences: string[],
  target: number
): StyleParam {
  if (sentences.length < 3) {
    return {
      name: "平均文長",
      target,
      actual: 0,
      deviation: 50,
      detail: "文数が少なすぎて判定不能",
    };
  }

  const lengths = sentences.map((s) => s.length);
  const actual = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);

  // 乖離度: 目標との差をパーセントで計算し、0-100に変換
  const diff = Math.abs(actual - target) / target;
  const deviation = clamp(diff * 100);

  let detail: string;
  if (deviation <= 10) {
    detail = `目標${target}字に対し実測${actual}字。ほぼ一致`;
  } else if (deviation <= 25) {
    detail = `目標${target}字に対し実測${actual}字。やや乖離あり`;
  } else {
    detail = `目標${target}字に対し実測${actual}字。大きく乖離`;
  }

  return { name: "平均文長", target, actual, deviation, detail };
}

function analyzeDialogueRatio(
  text: string,
  target: number
): StyleParam {
  const dialogues = extractDialogue(text);
  const dialogueText = dialogues.join("");
  const totalLength = text.replace(/\s/g, "").length;

  if (totalLength === 0) {
    return {
      name: "会話比率",
      target: `${Math.round(target * 100)}%`,
      actual: "0%",
      deviation: 100,
      detail: "テキストが空",
    };
  }

  const actual = dialogueText.length / totalLength;
  const diff = Math.abs(actual - target);
  // 0.1の差 = 乖離度25として変換
  const deviation = clamp(diff * 250);

  const targetPct = Math.round(target * 100);
  const actualPct = Math.round(actual * 100);

  let detail: string;
  if (deviation <= 10) {
    detail = `目標${targetPct}%に対し実測${actualPct}%。理想的`;
  } else if (deviation <= 30) {
    detail = `目標${targetPct}%に対し実測${actualPct}%。許容範囲`;
  } else {
    detail = `目標${targetPct}%に対し実測${actualPct}%。調整が必要`;
  }

  return {
    name: "会話比率",
    target: `${targetPct}%`,
    actual: `${actualPct}%`,
    deviation,
    detail,
  };
}

function analyzeInnerMonologueRatio(
  text: string,
  target: number
): StyleParam {
  const monologues = extractInnerMonologue(text);
  const monologueText = monologues.join("");
  const totalLength = text.replace(/\s/g, "").length;

  if (totalLength === 0) {
    return {
      name: "内面独白比率",
      target: `${Math.round(target * 100)}%`,
      actual: "0%",
      deviation: 100,
      detail: "テキストが空",
    };
  }

  const actual = monologueText.length / totalLength;
  const diff = Math.abs(actual - target);
  const deviation = clamp(diff * 250);

  const targetPct = Math.round(target * 100);
  const actualPct = Math.round(actual * 100);

  let detail: string;
  if (deviation <= 10) {
    detail = `目標${targetPct}%に対し実測${actualPct}%。理想的`;
  } else if (deviation <= 30) {
    detail = `目標${targetPct}%に対し実測${actualPct}%。許容範囲`;
  } else {
    detail = `目標${targetPct}%に対し実測${actualPct}%。調整が必要`;
  }

  return {
    name: "内面独白比率",
    target: `${targetPct}%`,
    actual: `${actualPct}%`,
    deviation,
    detail,
  };
}

function analyzeTempo(
  sentences: string[],
  target: "slow" | "medium" | "fast"
): StyleParam {
  if (sentences.length < 5) {
    return {
      name: "テンポ",
      target,
      actual: "判定不能",
      deviation: 50,
      detail: "文数が少なすぎて判定不能",
    };
  }

  const lengths = sentences.map((s) => s.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const shortRatio = lengths.filter((l) => l <= 20).length / lengths.length;

  // テンポの推定
  // fast: 平均文長短い + 短文多い
  // slow: 平均文長長い + 短文少ない
  let actual: "slow" | "medium" | "fast";
  if (avgLength <= 25 && shortRatio >= 0.3) {
    actual = "fast";
  } else if (avgLength >= 45 || shortRatio < 0.15) {
    actual = "slow";
  } else {
    actual = "medium";
  }

  const tempoMap = { slow: 0, medium: 1, fast: 2 };
  const diff = Math.abs(tempoMap[actual] - tempoMap[target]);
  const deviation = diff === 0 ? 0 : diff === 1 ? 35 : 75;

  const tempoLabel = { slow: "遅い", medium: "普通", fast: "速い" };

  let detail = `目標「${tempoLabel[target]}」に対し実測「${tempoLabel[actual]}」`;
  detail += `（平均文長${Math.round(avgLength)}字、短文率${Math.round(shortRatio * 100)}%）`;

  return { name: "テンポ", target: tempoLabel[target], actual: tempoLabel[actual], deviation, detail };
}

function analyzeLineBreakFrequency(
  text: string,
  target: "sparse" | "normal" | "frequent"
): StyleParam {
  const totalChars = text.replace(/\s/g, "").length;
  const lineBreaks = (text.match(/\n/g) || []).length;

  if (totalChars === 0) {
    return {
      name: "改行頻度",
      target,
      actual: "判定不能",
      deviation: 50,
      detail: "テキストが空",
    };
  }

  const charsPerBreak = totalChars / Math.max(lineBreaks, 1);

  // 改行頻度の推定
  let actual: "sparse" | "normal" | "frequent";
  if (charsPerBreak <= 80) {
    actual = "frequent";
  } else if (charsPerBreak <= 200) {
    actual = "normal";
  } else {
    actual = "sparse";
  }

  const freqMap = { sparse: 0, normal: 1, frequent: 2 };
  const diff = Math.abs(freqMap[actual] - freqMap[target]);
  const deviation = diff === 0 ? 0 : diff === 1 ? 35 : 75;

  const freqLabel = { sparse: "少なめ", normal: "普通", frequent: "多め" };

  return {
    name: "改行頻度",
    target: freqLabel[target],
    actual: freqLabel[actual],
    deviation,
    detail: `目標「${freqLabel[target]}」に対し実測「${freqLabel[actual]}」（${Math.round(charsPerBreak)}字/改行）`,
  };
}

// --- ガイドライン違反チェック ---

function checkGuidelineViolations(text: string, sentences: string[]): string[] {
  const violations: string[] = [];

  // 読点は1文に2つまで
  const overPunctuated = sentences.filter((s) => {
    const commas = (s.match(/、/g) || []).length;
    return commas > 2;
  });
  if (overPunctuated.length > 0) {
    violations.push(
      `読点過多の文が${overPunctuated.length}文あります（1文に2つまでが目安）`
    );
  }

  // 同じ表現の近接反復（3文以内に同語彙）
  // 4文字以上のngram重複を簡易チェック
  const ngramLen = 4;
  for (let i = 0; i < sentences.length - 1; i++) {
    const end = Math.min(i + 3, sentences.length);
    const currentChars = [...sentences[i]];
    if (currentChars.length < ngramLen) continue;

    const currentNgrams = new Set<string>();
    for (let j = 0; j <= currentChars.length - ngramLen; j++) {
      currentNgrams.add(currentChars.slice(j, j + ngramLen).join(""));
    }

    for (let k = i + 1; k < end; k++) {
      const nextChars = [...sentences[k]];
      if (nextChars.length < ngramLen) continue;
      for (let j = 0; j <= nextChars.length - ngramLen; j++) {
        const ngram = nextChars.slice(j, j + ngramLen).join("");
        if (currentNgrams.has(ngram)) {
          // 一般的な表現（助詞や接続詞等）を除外
          const commonPatterns = ["ている", "ていた", "のだった", "ではない", "かもしれ", "ことがで"];
          if (!commonPatterns.some((p) => ngram.includes(p))) {
            violations.push(`近接反復: 「${ngram}」が${i + 1}文目と${k + 1}文目で重複`);
            break;
          }
        }
      }
    }
  }

  // 近接反復が多すぎる場合は上位5件に制限
  const repetitionViolations = violations.filter((v) => v.startsWith("近接反復"));
  if (repetitionViolations.length > 5) {
    const otherViolations = violations.filter((v) => !v.startsWith("近接反復"));
    const trimmed = repetitionViolations.slice(0, 5);
    trimmed.push(`…他${repetitionViolations.length - 5}件の近接反復あり`);
    violations.length = 0;
    violations.push(...otherViolations, ...trimmed);
  }

  // 1話4,000字チェック
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars < 3500) {
    violations.push(`文字数が${totalChars}字で目安（3,500〜4,500字）を下回っています`);
  } else if (totalChars > 4500) {
    violations.push(`文字数が${totalChars}字で目安（3,500〜4,500字）を上回っています`);
  }

  // シーン転換チェック（空行2行以上 or ＊＊＊等の区切り）
  const sceneBreaks = text.match(/\n\s*\n\s*\n|\n\s*[＊*]{3,}\s*\n|\n\s*[─―]{3,}\s*\n/g);
  const sceneCount = sceneBreaks ? sceneBreaks.length : 0;
  if (sceneCount > 2) {
    violations.push(`シーン転換が${sceneCount}回あります（最大2回が目安）`);
  }

  return violations;
}

// --- グレード判定 ---

function determineGrade(score: number): StyleConsistencyResult["grade"] {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

// --- メイン分析関数 ---

/**
 * テキストの文体一貫性を分析する
 * @param text - 分析対象テキスト
 * @param profile - _style.mdから解析したスタイルプロファイル（省略時はデフォルト）
 */
export function analyzeStyleConsistency(
  text: string,
  profile: Partial<StyleProfile> = {}
): StyleConsistencyResult {
  const p = { ...DEFAULT_PROFILE, ...profile };
  const sentences = splitSentences(text);

  const params = {
    sentenceLength: analyzeSentenceLength(sentences, p.sentenceLengthAvg),
    dialogueRatio: analyzeDialogueRatio(text, p.dialogueRatio),
    innerMonologueRatio: analyzeInnerMonologueRatio(text, p.innerMonologueRatio),
    tempo: analyzeTempo(sentences, p.tempo),
    lineBreakFrequency: analyzeLineBreakFrequency(text, p.lineBreakFrequency),
  };

  const guidelineViolations = checkGuidelineViolations(text, sentences);

  // 総合スコア: 各パラメータの一致度（100 - deviation）の平均
  const paramScores = Object.values(params).map((p) => 100 - p.deviation);
  const avgParamScore = paramScores.reduce((a, b) => a + b, 0) / paramScores.length;

  // ガイドライン違反によるペナルティ（1件あたり-5点、最大-25点）
  const violationPenalty = Math.min(guidelineViolations.length * 5, 25);

  const overallScore = clamp(Math.round(avgParamScore - violationPenalty));
  const grade = determineGrade(overallScore);

  const summary = generateSummary(overallScore, grade, params, guidelineViolations);

  return { overallScore, grade, params, guidelineViolations, summary };
}

function generateSummary(
  score: number,
  grade: StyleConsistencyResult["grade"],
  params: StyleConsistencyResult["params"],
  violations: string[]
): string {
  let summary = `文体一貫性スコア${score}点（${grade}ランク）。`;

  // 乖離の大きいパラメータを指摘
  const highDeviation = Object.values(params).filter((p) => p.deviation >= 40);
  if (highDeviation.length > 0) {
    const names = highDeviation.map((p) => p.name).join("・");
    summary += `${names}に目標との乖離があります。`;
  } else {
    summary += "各パラメータは目標に近い値です。";
  }

  if (violations.length > 0) {
    summary += `ガイドライン違反が${violations.length}件あります。`;
  }

  return summary;
}
