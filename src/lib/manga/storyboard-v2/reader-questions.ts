/**
 * ReaderQuestionSchedule: 読者の問い open/close スケジュール。
 *
 * 読者は出来事ではなく「未解決の問い」でページをめくる。
 * 巻全体でどの問いを開け、どれを閉じ、どれを次巻持ち越すかを構造化管理する。
 *
 * Codex + Claude 議論 (2026-05-20) で 4 ドメイン契約の Domain A として確定。
 * 詳細: /Users/hikarumori/.claude/plans/10-90-codex-wild-goblet.md Section 3.2
 */

export type ReaderQuestionPayoffType =
  | "answer"
  | "reversal"
  | "bigger_question"
  | "emotional_payoff";

export type ReaderQuestionHeatRole =
  | "main_buy_question"
  | "episode_pull"
  | "mystery_layer"
  | "relationship_tension";

export type ReaderQuestionEntry = {
  /** "Q01" 形式、巻内ユニーク */
  question_id: string;
  /** 問いの本文 60-120字 */
  question: string;
  opened_in_episode: number;
  escalated_in_episodes: number[];
  answered_in_episode?: number;
  carried_to_next_volume: boolean;
  payoff_type: ReaderQuestionPayoffType;
  heat_role: ReaderQuestionHeatRole;
};

export type ReaderQuestionSchedule = ReaderQuestionEntry[];

export type ReaderQuestionWarning = string;

/**
 * ReaderQuestionSchedule の整合性検証。
 * 制約:
 * - main_buy_question は exactly 1 個
 * - 巻全体で 5-9 個
 * - 各 episode で最低 1 個解消 (answered_in_episode が当該 episode を指す)
 * - 巻末未解決 ≤ 4 (carried_to_next_volume=true のうち answered_in_episode が未設定のもの)
 */
export function validateReaderQuestionSchedule(
  schedule: ReaderQuestionSchedule | undefined,
  episodesCount: number,
): ReaderQuestionWarning[] {
  const warnings: ReaderQuestionWarning[] = [];
  if (!schedule || schedule.length === 0) {
    warnings.push("reader_question_schedule が未設定 (Domain A 違反)");
    return warnings;
  }
  if (schedule.length < 5 || schedule.length > 9) {
    warnings.push(
      `reader_question_schedule の件数が範囲外 (${schedule.length} 件、推奨 5-9 件)`,
    );
  }
  const mainBuyCount = schedule.filter((q) => q.heat_role === "main_buy_question").length;
  if (mainBuyCount !== 1) {
    warnings.push(
      `main_buy_question は exactly 1 個必要 (現在 ${mainBuyCount} 個)`,
    );
  }
  // 各 episode で最低 1 個解消
  for (let ep = 1; ep <= episodesCount; ep++) {
    const answeredHere = schedule.filter((q) => q.answered_in_episode === ep);
    if (answeredHere.length === 0) {
      warnings.push(`ep${ep} で解消される question が 0 個 (各 episode で 1 個以上推奨)`);
    }
  }
  // 巻末未解決数
  const unresolvedAtVolEnd = schedule.filter(
    (q) => q.carried_to_next_volume && q.answered_in_episode === undefined,
  ).length;
  if (unresolvedAtVolEnd > 4) {
    warnings.push(`巻末未解決 question が多すぎる (${unresolvedAtVolEnd} 個、上限 4 個)`);
  }
  // question_id 一意性
  const ids = new Set<string>();
  for (const q of schedule) {
    if (ids.has(q.question_id)) {
      warnings.push(`question_id 重複: ${q.question_id}`);
    }
    ids.add(q.question_id);
  }
  return warnings;
}
