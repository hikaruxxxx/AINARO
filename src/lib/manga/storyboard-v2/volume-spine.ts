/**
 * VolumeSpine: 巻論理契約。
 *
 * 巻プロットの「説明文」(volume_theme) ではなく「読者が次巻を買う理由」を
 * 独立フィールドで明示するための top-level contract。
 *
 * Codex + Claude 議論 (2026-05-20) で 4 ドメイン契約の Domain A として確定。
 * 詳細: /Users/hikarumori/.claude/plans/10-90-codex-wild-goblet.md Section 3
 */

export type VolumeSpine = {
  /** この巻で読者が追う中心の問い 80-150字 */
  central_reader_question: string;
  /** 主人公がこの巻で踏む不可逆な選択 80-120字 */
  protagonist_irreversible_choice: string;
  /** その選択で主人公が払う代償 60-100字 */
  price_paid: string;
  /** 巻末時点での新しい現状 80-120字 */
  new_status_quo: string;
  /** 次巻を買う理由としての問い 60-100字 */
  volume_end_buy_question: string;
};

export type VolumeSpineWarning = string;

/**
 * VolumeSpine の整合性検証。
 * 全フィールドが埋まり、各文字数下限を満たすか。warning 配列を返す (空 = OK)。
 */
export function validateVolumeSpine(spine: VolumeSpine | undefined): VolumeSpineWarning[] {
  const warnings: VolumeSpineWarning[] = [];
  if (!spine) {
    warnings.push("volume_spine が未設定 (4 ドメイン契約 Domain A 違反)");
    return warnings;
  }
  const checks: Array<[keyof VolumeSpine, number]> = [
    ["central_reader_question", 80],
    ["protagonist_irreversible_choice", 80],
    ["price_paid", 60],
    ["new_status_quo", 80],
    ["volume_end_buy_question", 60],
  ];
  for (const [key, minLen] of checks) {
    const value = spine[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      warnings.push(`volume_spine.${key} が空 (Domain A 違反)`);
    } else if (value.trim().length < minLen) {
      warnings.push(`volume_spine.${key} が短い (${value.trim().length} 字、下限 ${minLen} 字)`);
    }
  }
  return warnings;
}
