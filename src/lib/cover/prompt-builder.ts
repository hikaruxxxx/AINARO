/**
 * gpt-image 用の英語プロンプト構築ロジック
 *
 * novel メタ（タイトル、サブタイトル、著者、ジャンル、キャラ情報、舞台）と、
 * `genre-typography.ts` のサブジャンル別 typography パターンを統合して、
 * 商業ラノベ表紙レベルの画像を生成する英語プロンプトを返す。
 *
 * このモジュールは LLM を呼ばない。テンプレ的なロジックで完結させる。
 */

import {
  getTypographySpec,
  inferSubgenreFromGenre,
  type Subgenre,
} from "./genre-typography";

/** プロンプト構築の入力 */
export type CoverPromptInput = {
  title: string;
  subtitle?: string | null;
  author: string;
  /** DBの genre 値（例: "isekai_tensei_cheat", "villainess"） */
  genre: string;
  /** キャラ・舞台情報（自由記述、英語または日本語） */
  characterDescription?: string;
  /** 舞台・世界観の英語記述 */
  settingDescription?: string;
  /** 強制的にサブジャンルを指定（推定をオーバーライド） */
  subgenreOverride?: Subgenre;
  /** 画像にタイトル文字を含めるか（trueなら含める＝Aバージョン、falseなら背景のみ） */
  includeTitleInImage?: boolean;
};

export type BuiltPrompt = {
  prompt: string;
  subgenre: Subgenre;
  /** 出力サイズ */
  size: { width: number; height: number };
};

/**
 * 商業ラノベ表紙風の gpt-image プロンプトを構築する。
 * デフォルトはタイトル文字込み（A版）。
 */
export function buildCoverPrompt(input: CoverPromptInput): BuiltPrompt {
  const subgenre =
    input.subgenreOverride ?? inferSubgenreFromGenre(input.genre, input.title);
  const spec = getTypographySpec(subgenre);

  const includeTitle = input.includeTitleInImage ?? true;

  // === 共通パーツ ===
  const baseStyle = [
    "Japanese commercial light novel cover illustration in the style of best-selling fantasy light novel paperbacks.",
    `Art style: ${spec.artStyle}.`,
    `Overall palette and mood: ${spec.paletteMood}.`,
    "Vertical book cover format (1024 wide x 1536 tall). Clean composition suitable for thumbnail viewing.",
  ].join(" ");

  // === キャラ・舞台 ===
  const charBlock = input.characterDescription
    ? `Main character / subject: ${input.characterDescription}.`
    : "Main subject: a single character appropriate for the story (no specific description provided).";

  const settingBlock = input.settingDescription
    ? `Setting / background: ${input.settingDescription}.`
    : "";

  // === タイトル文字描画指示 ===
  let titleBlock = "";
  if (includeTitle) {
    const subtitlePart = input.subtitle
      ? ` Below the title, smaller subtitle text "${input.subtitle}" rendered in the same logo family but smaller and slightly lighter.`
      : "";
    const authorPart = ` At the very bottom, small author credit "${input.author}" rendered subtly.`;

    titleBlock = [
      `Render the Japanese title text "${input.title}" prominently at the ${spec.titlePosition} of the canvas.`,
      `Title typography: ${spec.titleLogoStyle}.`,
      `Title color: ${spec.titleColorMain}.`,
      "The title MUST be rendered as accurate, legible Japanese characters — do not garble, abbreviate, or substitute characters.",
      subtitlePart,
      authorPart,
      `Decorative elements: ${spec.decoration}.`,
    ].join(" ");
  } else {
    // タイトル領域を空けるが、文字は描画しない（B版＝SVG後合成用）
    titleBlock = [
      `Leave the top 25% of the canvas visually clear and uncluttered for later title placement (sky / soft gradient / negative space).`,
      "Do NOT render any text, title, logo, or writing of any kind in the image.",
    ].join(" ");
  }

  // === 否定指示（共通） ===
  const negatives = [
    "Do not invent fake sales numbers, fake awards, fake series titles, or hype copy that was not provided.",
    "Do not include English-language title duplicates or romanized text.",
    "No watermarks, no signatures, no QR codes, no barcodes.",
    "Do not place any small unrelated supporting characters (sub-cast tiles) — focus on the single main subject.",
  ].join(" ");

  const prompt = [
    baseStyle,
    charBlock,
    settingBlock,
    titleBlock,
    negatives,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    prompt,
    subgenre,
    size: { width: 1024, height: 1536 },
  };
}
