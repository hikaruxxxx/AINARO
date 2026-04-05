import type {
  SettingsConsistencyResult,
  CharacterConsistency,
} from "@/types/agents";

// --- 設定データ型 ---

export interface CharacterSetting {
  name: string; // キャラクター名
  speechPatterns: string[]; // 口調の特徴的な表現（例: 「〜ですわ」「〜ではなくて？」）
  innerSpeechPatterns?: string[]; // 独白の特徴的な表現（例: 「マジで」「無理」）
  traits?: string[]; // 性格・行動の特徴（例: 「冷静」「ツッコミ」）
}

export interface WorldBuildingSetting {
  terms: string[]; // 固有名詞（地名・組織名等）
  rules: string[]; // 世界のルール（自然言語テキスト）
}

export interface SettingsInput {
  characters: CharacterSetting[];
  worldBuilding?: WorldBuildingSetting;
  plotNotes?: string[]; // プロット指示（テンポ・シーン構成等のテキスト）
}

// --- ユーティリティ ---

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** 「」で囲まれたセリフとその直前テキストを抽出 */
function extractDialoguesWithContext(text: string): { speaker: string; dialogue: string }[] {
  const results: { speaker: string; dialogue: string }[] = [];

  // 「セリフ」の直前にあるキャラ名的なテキストを探す
  const regex = /([^\n「」]{0,30})「([^」]+)」/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      speaker: match[1].trim(),
      dialogue: match[2],
    });
  }

  return results;
}

/** （）で囲まれた内面独白を抽出 */
function extractInnerMonologues(text: string): string[] {
  const matches = text.match(/（[^）]+）/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
}

// --- キャラクター整合性チェック ---

function analyzeCharacter(
  text: string,
  character: CharacterSetting,
  dialoguesWithContext: { speaker: string; dialogue: string }[]
): CharacterConsistency {
  const issues: string[] = [];

  // 1. キャラ名がテキストに登場するか
  const found = text.includes(character.name);

  if (!found) {
    return {
      name: character.name,
      found: false,
      speechPatternMatch: 0,
      issues: [`「${character.name}」がテキスト内に登場しません`],
    };
  }

  // 2. そのキャラのセリフを特定（キャラ名がセリフ前のコンテキストに含まれるもの）
  const characterDialogues = dialoguesWithContext
    .filter((d) => d.speaker.includes(character.name))
    .map((d) => d.dialogue);

  if (characterDialogues.length === 0 && character.speechPatterns.length > 0) {
    // セリフが見つからない場合、全セリフからパターンマッチで推定
    // （名前が直前にない書き方の場合もあるため）
    return {
      name: character.name,
      found: true,
      speechPatternMatch: 50, // 判定不能なので中間値
      issues: [`「${character.name}」のセリフが特定できませんでした（名前がセリフ直前にない可能性）`],
    };
  }

  // 3. 口調パターンの一致チェック
  let patternMatchCount = 0;
  const totalPatterns = character.speechPatterns.length;

  if (totalPatterns > 0 && characterDialogues.length > 0) {
    const allDialogue = characterDialogues.join(" ");
    for (const pattern of character.speechPatterns) {
      if (allDialogue.includes(pattern)) {
        patternMatchCount++;
      }
    }
  }

  const speechPatternMatch = totalPatterns > 0
    ? clamp(Math.round((patternMatchCount / totalPatterns) * 100))
    : 50;

  // 口調パターンの不一致を報告
  if (totalPatterns > 0 && speechPatternMatch < 50) {
    const missingPatterns = character.speechPatterns
      .filter((p) => !characterDialogues.some((d) => d.includes(p)));
    if (missingPatterns.length > 0) {
      issues.push(
        `口調パターン不一致: 「${missingPatterns.slice(0, 3).join("」「")}」が見られません`
      );
    }
  }

  // 4. 内面独白パターンチェック（主人公の場合）
  if (character.innerSpeechPatterns && character.innerSpeechPatterns.length > 0) {
    const monologues = extractInnerMonologues(text);
    const allMonologue = monologues.join(" ");

    let innerMatchCount = 0;
    for (const pattern of character.innerSpeechPatterns) {
      if (allMonologue.includes(pattern)) {
        innerMatchCount++;
      }
    }

    const innerMatch = clamp(
      Math.round((innerMatchCount / character.innerSpeechPatterns.length) * 100)
    );

    if (innerMatch < 30) {
      issues.push("内面独白の口調が設定と乖離しています");
    }
  }

  return {
    name: character.name,
    found,
    speechPatternMatch,
    issues,
  };
}

// --- 世界観整合性チェック ---

function checkWorldBuilding(
  text: string,
  worldBuilding?: WorldBuildingSetting
): string[] {
  const issues: string[] = [];
  if (!worldBuilding) return issues;

  // 固有名詞のタイポ・表記揺れチェック（簡易版）
  // ここでは設定にある用語がテキスト中で使われているかだけ確認
  const unusedTerms = worldBuilding.terms.filter((term) => !text.includes(term));

  // 全用語が未使用なら問題ない（単にその話で言及しないだけ）
  // 一部だけ未使用で、類似語が使われている場合は表記揺れの可能性
  for (const term of unusedTerms) {
    // 1文字違いの表現がないか簡易チェック
    if (term.length >= 3) {
      const partialMatch = text.includes(term.slice(0, -1)) || text.includes(term.slice(1));
      if (partialMatch) {
        issues.push(`表記揺れの可能性: 「${term}」が見当たらず、類似表現があります`);
      }
    }
  }

  return issues;
}

// --- プロット整合性チェック ---

function checkPlotConsistency(
  text: string,
  plotNotes?: string[]
): string[] {
  const issues: string[] = [];
  if (!plotNotes || plotNotes.length === 0) return issues;

  // プロットノートに含まれるキーワードがテキストに反映されているか
  for (const note of plotNotes) {
    // 「テンポ: fast」等の指示は文体チェック側で対応するのでスキップ
    if (note.match(/^テンポ:/)) continue;

    // シーン指示に含まれる場所・登場人物のキーワードを抽出
    const keywords = note.match(/[ぁ-んァ-ヶー一-龠]{2,}/g);
    if (!keywords) continue;

    // 重要そうなキーワード（3文字以上）がテキストに反映されているかチェック
    const importantKeywords = keywords.filter((k) => k.length >= 3);
    const missingKeywords = importantKeywords.filter((k) => !text.includes(k));

    // 半数以上のキーワードが欠如していたら警告
    if (importantKeywords.length >= 3 && missingKeywords.length > importantKeywords.length / 2) {
      issues.push(`プロット指示の反映が不十分: 「${note.slice(0, 40)}…」`);
    }
  }

  return issues;
}

// --- メイン分析関数 ---

/**
 * テキストと設定ファイルの整合性をチェックする
 */
export function analyzeSettingsConsistency(
  text: string,
  settings: SettingsInput
): SettingsConsistencyResult {
  const dialoguesWithContext = extractDialoguesWithContext(text);

  // キャラクター整合性
  const characters = settings.characters.map((c) =>
    analyzeCharacter(text, c, dialoguesWithContext)
  );

  // 世界観整合性
  const worldBuildingIssues = checkWorldBuilding(text, settings.worldBuilding);

  // プロット整合性
  const plotConsistencyIssues = checkPlotConsistency(text, settings.plotNotes);

  // 総合スコア計算
  const foundChars = characters.filter((c) => c.found);
  const avgSpeechMatch = foundChars.length > 0
    ? foundChars.reduce((sum, c) => sum + c.speechPatternMatch, 0) / foundChars.length
    : 0;

  const totalIssues =
    characters.reduce((sum, c) => sum + c.issues.length, 0) +
    worldBuildingIssues.length +
    plotConsistencyIssues.length;

  // ベーススコア = キャラ口調一致度
  // 問題数に応じてペナルティ
  const penalty = Math.min(totalIssues * 8, 40);
  const overallScore = clamp(Math.round(avgSpeechMatch - penalty));

  const summary = generateSummary(overallScore, characters, worldBuildingIssues, plotConsistencyIssues);

  return {
    overallScore,
    characters,
    worldBuildingIssues,
    plotConsistencyIssues,
    summary,
  };
}

function generateSummary(
  score: number,
  characters: CharacterConsistency[],
  worldIssues: string[],
  plotIssues: string[]
): string {
  const parts: string[] = [`設定整合性スコア${score}点。`];

  const foundChars = characters.filter((c) => c.found);
  const missingChars = characters.filter((c) => !c.found);

  if (foundChars.length > 0) {
    const avgMatch = Math.round(
      foundChars.reduce((s, c) => s + c.speechPatternMatch, 0) / foundChars.length
    );
    parts.push(`登場キャラ${foundChars.length}名の口調一致度は平均${avgMatch}%。`);
  }

  if (missingChars.length > 0) {
    parts.push(`${missingChars.map((c) => c.name).join("・")}が未登場。`);
  }

  const charIssues = characters.reduce((sum, c) => sum + c.issues.length, 0);
  if (charIssues > 0) {
    parts.push(`キャラクター関連の問題${charIssues}件。`);
  }

  if (worldIssues.length > 0) {
    parts.push(`世界観の整合性問題${worldIssues.length}件。`);
  }

  if (plotIssues.length > 0) {
    parts.push(`プロット整合性問題${plotIssues.length}件。`);
  }

  if (charIssues === 0 && worldIssues.length === 0 && plotIssues.length === 0) {
    parts.push("設定との矛盾は検出されませんでした。");
  }

  return parts.join("");
}
