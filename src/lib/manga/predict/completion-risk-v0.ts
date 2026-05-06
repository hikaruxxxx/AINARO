/**
 * KU 完読率リスク分類器 v0 (Phase Y WY-5)
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WY-5
 *   - Codex 修正: 「予測ではなくリスク分類器として運用」(実 KENP データ取得まで proxy 教師は使わない)
 *
 * 役割:
 *   - L11 audit findings + name_audit findings (Phase X 新ルール) + L5.5 engagement_audit +
 *     編集判断カード適用履歴 を集約して、当該 episode/作品の「KU 完読率」を高/中/低 リスクに分類
 *   - 実 ML モデルは Phase Z で実 KENP データ取得後に学習 (predict-completion v1)
 *
 * 設計上の制約:
 *   - 教師なし。ヒューリスティック (各因子の重み合計) で分類
 *   - 各因子は audit-rules.ts と engagement-audit.ts と editorial-cards/ から自動取得
 *   - kill 判定はせず、人間判断/編集の入口情報として表示する
 */

export type CompletionRiskLevel = "low" | "medium" | "high";

export type CompletionRiskFactor = {
  /** 因子名 (UI 表示用) */
  name: string;
  /** ペナルティスコア (0-100、高いほどリスク↑) */
  penalty: number;
  /** 観測値 (例: "narration_dominant 5件", "drop_off_risk 60") */
  observed: string;
  /** 修正方向ヒント */
  hint: string;
};

export type CompletionRiskInput = {
  /** L11 audit findings (機械検査) の全体 */
  audit_findings_total?: number;
  audit_findings_error?: number;
  /** name_audit findings (Phase X 新ルール) の数 */
  name_audit_new_rule_findings?: number;
  /** L5.5 engagement_audit の overall_drop_off_risk (0-100) */
  engagement_overall_drop_off_risk?: number;
  /** L5.5 engagement_audit の boring page 数 */
  engagement_boring_pages?: number;
  /** L5.5 engagement_audit の human_review_required */
  engagement_human_review_required?: boolean;
  /** L5.5 character_arcs で has_significant_drop=true なキャラ数 */
  engagement_character_drops?: number;
  /** L5.5 reward_interval.gap_warning */
  engagement_reward_gap_warning?: boolean;
  /** 編集判断カード適用数 (高いほどリスク↓ → 改善が回ってる) */
  editorial_cards_applied_count?: number;
};

export type CompletionRiskAssessment = {
  schema_version: 1;
  generated_at: string;
  level: CompletionRiskLevel;
  total_penalty: number;
  /** 主要因子 (penalty 降順、最大5件) */
  top_factors: CompletionRiskFactor[];
  /** UI 表示用の一言評価 */
  summary: string;
  /** 修正アクション提案 (UI 用) */
  recommended_actions: string[];
};

const RISK_THRESHOLDS = {
  /** total_penalty >= high_threshold で high */
  high: 60,
  /** total_penalty >= medium_threshold で medium */
  medium: 30,
};

/**
 * ヒューリスティック計算: 各因子の penalty を加算して total_penalty 算出 → 閾値で3クラス分類。
 * 因子は audit findings / engagement_audit / editorial_cards / 等から自動収集される想定。
 */
export function assessCompletionRisk(input: CompletionRiskInput): CompletionRiskAssessment {
  const factors: CompletionRiskFactor[] = [];

  // 1. engagement audit (主指標、最重要)
  if (input.engagement_overall_drop_off_risk !== undefined) {
    const r = input.engagement_overall_drop_off_risk;
    if (r >= 50) {
      factors.push({
        name: "engagement_drop_off_risk_high",
        penalty: Math.min(40, Math.round(r * 0.5)),
        observed: `LLM 採点 overall_drop_off_risk = ${r.toFixed(0)}/100`,
        hint: "L5.5 engagement_audit.json の worst_page を確認 → L4.1 hook / L4.5 narration / L4.9 cliffhanger の再生成検討",
      });
    } else if (r >= 30) {
      factors.push({
        name: "engagement_drop_off_risk_medium",
        penalty: Math.round(r * 0.3),
        observed: `LLM 採点 overall_drop_off_risk = ${r.toFixed(0)}/100`,
        hint: "中リスク帯。boring_pages の修正で改善余地あり",
      });
    }
  }

  // 2. boring pages
  if (input.engagement_boring_pages && input.engagement_boring_pages > 0) {
    factors.push({
      name: "boring_pages",
      penalty: Math.min(20, input.engagement_boring_pages * 4),
      observed: `${input.engagement_boring_pages}件の boring page`,
      hint: "boring_pages の各 page を L4 storyboard 再生成で改善",
    });
  }

  // 3. character likability drops
  if (input.engagement_character_drops && input.engagement_character_drops > 0) {
    factors.push({
      name: "character_likability_drops",
      penalty: Math.min(15, input.engagement_character_drops * 5),
      observed: `${input.engagement_character_drops}キャラで好感度急落`,
      hint: "character_arcs.drop_reason を確認 → 該当キャラの dialogue/monologue 修正 (EC-0009 / EC-0011 参照)",
    });
  }

  // 4. reward gap warning
  if (input.engagement_reward_gap_warning) {
    factors.push({
      name: "reward_gap_warning",
      penalty: 12,
      observed: "報酬間隔が 20p 以上空いている",
      hint: "EC-0004 (戦闘直後に「相棒との温度ある会話」panel 差し込み) を適用",
    });
  }

  // 5. name_audit Phase X 新ルール検出
  if (input.name_audit_new_rule_findings && input.name_audit_new_rule_findings > 0) {
    factors.push({
      name: "phase_x_audit_findings",
      penalty: Math.min(20, input.name_audit_new_rule_findings * 3),
      observed: `Phase X 新ルール ${input.name_audit_new_rule_findings}件検出 (narration_dominant / recovery_beat_missing 等)`,
      hint: "Console「品質改善」view から該当 patches を採用",
    });
  }

  // 6. L11 audit error 重大度
  if (input.audit_findings_error && input.audit_findings_error > 0) {
    factors.push({
      name: "audit_errors",
      penalty: Math.min(20, input.audit_findings_error * 5),
      observed: `audit error ${input.audit_findings_error}件`,
      hint: "render 不可 (bubble 不在 / 寸法エラー等)。L11 audit log 確認 → L12 repair",
    });
  }

  // 7. 編集判断カード適用効果 (改善が回っていれば penalty 軽減)
  let cardsBonus = 0;
  if (input.editorial_cards_applied_count && input.editorial_cards_applied_count > 0) {
    cardsBonus = Math.min(15, input.editorial_cards_applied_count * 3);
    factors.push({
      name: "editorial_cards_applied",
      penalty: -cardsBonus,
      observed: `編集判断カード ${input.editorial_cards_applied_count}件適用済`,
      hint: "改善が回っている。Phase Z で outcome (実 KENP) 計測予定",
    });
  }

  // 8. human_review_required (engagement_audit で flagged) は強制的に medium 以上
  let baseFloor = 0;
  if (input.engagement_human_review_required) {
    baseFloor = Math.max(baseFloor, RISK_THRESHOLDS.medium);
    factors.push({
      name: "engagement_human_review_required",
      penalty: 0,
      observed: "L5.5 が人間レビュー必須と判定",
      hint: "engagement_audit.json の per_page_scores を Console で確認",
    });
  }

  const totalPenalty = Math.max(
    baseFloor,
    factors.reduce((s, f) => s + f.penalty, 0),
  );

  let level: CompletionRiskLevel;
  if (totalPenalty >= RISK_THRESHOLDS.high) level = "high";
  else if (totalPenalty >= RISK_THRESHOLDS.medium) level = "medium";
  else level = "low";

  // top_factors: penalty 降順 (絶対値)、最大5件
  const topFactors = [...factors]
    .sort((a, b) => Math.abs(b.penalty) - Math.abs(a.penalty))
    .slice(0, 5);

  const summary = (() => {
    if (level === "low") return "KU 完読率リスク低 (現状の品質で出版可能ライン)";
    if (level === "medium") return "KU 完読率リスク中 (改善余地あり、人間レビュー後 patches 適用推奨)";
    return "KU 完読率リスク高 (要修正、出版前に Hook / Cliffhanger / engagement の改善必須)";
  })();

  const recommendedActions: string[] = [];
  for (const f of topFactors) {
    if (f.penalty > 0 && f.hint) {
      recommendedActions.push(f.hint);
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    level,
    total_penalty: totalPenalty,
    top_factors: topFactors,
    summary,
    recommended_actions: recommendedActions,
  };
}
