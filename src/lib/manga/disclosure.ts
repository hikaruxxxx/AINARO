/**
 * AI 開示テキスト生成 / KDP公式 5 区分との変換
 *
 * Codex レビュー (2026-05-04) で指摘された致命点への対応:
 *   - 自由文の ai_disclosure_text は KDP 規約上不十分
 *   - text/images/translation/cover/interior の 5 区分でチェックリスト化必須
 *
 * KDP 公式区分 (2025年以降):
 *   1. AI Generated  — AI が出力した内容を実質そのまま使用
 *   2. AI Assisted   — AI 出力に対し人手で大幅な編集を実施
 *   3. None          — AI を使用していない
 *
 * AINARO はピボット後 (2026-04-30) は full_ai (gpt-image-2 + 著者編集) が標準。
 */
import type { AiDisclosureFlags } from "./schemas-v2";

/** ai_usage_level (Supabase manga_works.ai_usage_level の enum と一致) */
export type AiUsageLevel = "full_ai" | "ai_assisted" | "human";

/** KDP 申告区分 (KDP管理画面のラジオボタンに対応) */
export type KdpAiDisclosureType = "ai_generated" | "ai_assisted" | "ai_translated" | "none";

/**
 * ai_usage_level → KDP 申告区分 (各5フィールド単位)。
 * カスタム翻訳が混じった場合は呼び出し側で `translation: 'ai_translated'` 等に上書き可。
 */
export function disclosureFlagsToKdpType(
  flags: AiDisclosureFlags,
  usageLevel: AiUsageLevel,
): Record<keyof AiDisclosureFlags, KdpAiDisclosureType> {
  const baseType: KdpAiDisclosureType =
    usageLevel === "full_ai" ? "ai_generated" :
    usageLevel === "ai_assisted" ? "ai_assisted" :
    "none";
  return {
    text:        flags.text        ? baseType : "none",
    images:      flags.images      ? baseType : "none",
    translation: flags.translation ? "ai_translated" : "none",
    cover:       flags.cover       ? baseType : "none",
    interior:    flags.interior    ? baseType : "none",
  };
}

/** 奥付に印刷する開示テキスト (人間可読) */
export function renderDisclosureText(
  flags: AiDisclosureFlags,
  usageLevel: AiUsageLevel,
  toolsUsed: string[],
): string {
  const tools = toolsUsed.length > 0 ? toolsUsed.join(" / ") : "AI モデル";
  if (usageLevel === "human") {
    return "本書は AI 生成を含みません。";
  }
  const parts: string[] = [];
  parts.push(usageLevel === "full_ai"
    ? `本書には ${tools} による AI 生成コンテンツが含まれています。`
    : `本書は ${tools} の補助を受けて制作されました。最終的な編集は著者が行っています。`);

  const tagged: string[] = [];
  if (flags.text) tagged.push("本文テキスト");
  if (flags.images) tagged.push("内側の画像");
  if (flags.cover) tagged.push("表紙画像");
  if (flags.interior) tagged.push("ページレイアウト");
  if (flags.translation) tagged.push("翻訳");
  if (tagged.length > 0) {
    parts.push(`AI が関与した範囲: ${tagged.join(" / ")}。`);
  }
  parts.push("AI が既存の著作物を直接複製することのないよう設計上配慮しています。お気づきの点はご連絡ください。");
  return parts.join(" ");
}

/** デフォルト (AINARO 標準: full_ai gpt-image-2 + 人手編集) */
export const DEFAULT_AI_DISCLOSURE_FLAGS: AiDisclosureFlags = {
  text: true,
  images: true,
  translation: false,
  cover: true,
  interior: true,
};

export const DEFAULT_AI_USAGE_LEVEL: AiUsageLevel = "full_ai";
export const DEFAULT_AI_TOOLS_USED = ["gpt-image-2", "claude-opus-4-7"];

/** A1-4: AI開示が KDP 入稿に必要な最低条件を満たすか検査 */
export function validateAiDisclosure(
  flags: AiDisclosureFlags | undefined,
  usageLevel: AiUsageLevel | undefined,
  toolsUsed: string[] | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!flags) return { ok: false, reason: "ai_disclosure (5区分) が未設定。KDP 入稿不可。" };
  if (!usageLevel) return { ok: false, reason: "ai_usage_level が未設定。KDP 申告区分を決定不能。" };
  // human なら全て false が期待値
  if (usageLevel === "human") {
    const anyTrue = flags.text || flags.images || flags.translation || flags.cover || flags.interior;
    if (anyTrue) return { ok: false, reason: "ai_usage_level=human だが ai_disclosure に true があり矛盾。" };
  } else {
    // full_ai / ai_assisted ならツール宣言が必要
    if (!toolsUsed || toolsUsed.length === 0) {
      return { ok: false, reason: `ai_usage_level=${usageLevel} だが ai_tools_used が空。最低1モデルの宣言が必要。` };
    }
    const anyTrue = flags.text || flags.images || flags.cover || flags.interior;
    if (!anyTrue) return { ok: false, reason: `ai_usage_level=${usageLevel} だが ai_disclosure 5区分が全て false。区分が決まっていない。` };
  }
  return { ok: true };
}
