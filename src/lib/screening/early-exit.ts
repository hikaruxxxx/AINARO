// LLM評価の前に決定論的に明らかな失格作品を弾く軽量フィルタ。
// LLM 6軸採点コストを大幅に削減する。

import { countChars } from "./wordcount";

export interface EarlyExitResult {
  pass: boolean;
  reason?: string;
  metrics: {
    charCount: number;
    dialogueRatio: number;
    repetitionRate: number;
    properNounCount: number;
  };
}

/** 軽量決定論フィルタ。pass=falseならLLM評価をスキップ */
export function earlyExitCheck(text: string): EarlyExitResult {
  const charCount = countChars(text);
  const dialogueRatio = computeDialogueRatio(text);
  const repetitionRate = computeRepetitionRate(text);
  const properNounCount = countProperNouns(text);

  const metrics = { charCount, dialogueRatio, repetitionRate, properNounCount };

  if (charCount < 3000) {
    return { pass: false, reason: `charCount<3000 (${charCount})`, metrics };
  }
  if (dialogueRatio < 0.05) {
    return { pass: false, reason: `dialogueRatio<5% (${dialogueRatio.toFixed(2)})`, metrics };
  }
  if (dialogueRatio > 0.7) {
    return { pass: false, reason: `dialogueRatio>70% (${dialogueRatio.toFixed(2)})`, metrics };
  }
  if (repetitionRate > 0.3) {
    return { pass: false, reason: `repetitionRate>30% (${repetitionRate.toFixed(2)})`, metrics };
  }
  if (properNounCount === 0) {
    return { pass: false, reason: "properNounCount=0", metrics };
  }
  return { pass: true, metrics };
}

/** 「」で囲まれた文字数 / 全体文字数 */
function computeDialogueRatio(text: string): number {
  const total = countChars(text);
  if (total === 0) return 0;
  const dialogueChars = (text.match(/「[^」]*」/g) ?? [])
    .map((s) => countChars(s))
    .reduce((a, b) => a + b, 0);
  return dialogueChars / total;
}

/** 同一文（句点で区切る）の重複率 */
function computeRepetitionRate(text: string): number {
  const sentences = text
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  if (sentences.length === 0) return 0;
  const seen = new Map<string, number>();
  for (const s of sentences) {
    seen.set(s, (seen.get(s) ?? 0) + 1);
  }
  const dup = [...seen.values()].filter((c) => c >= 2).reduce((a, b) => a + b, 0);
  return dup / sentences.length;
}

/** カタカナ連続2文字以上 + 漢字+「家/王国/国」系を簡易に固有名詞数とする */
function countProperNouns(text: string): number {
  const katakana = text.match(/[ァ-ヴー]{2,}/g) ?? [];
  const placeNames = text.match(/[一-龥]{1,4}(王国|帝国|公国|侯爵家|公爵家|伯爵家|村|町|城)/g) ?? [];
  return new Set([...katakana, ...placeNames]).size;
}
