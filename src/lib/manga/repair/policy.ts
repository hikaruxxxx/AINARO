/**
 * Repair Policy (純関数)
 *
 * SSoT: ~/.claude/plans/codex-swift-kettle.md "Month 3 repair policy 最小実装"
 *
 * 役割:
 *   1. face_consistency 計測結果から「再生成すべきか」を判定 (judgePanelRepair)
 *   2. 再試行カウントを踏まえて escalation 戦略を返す (planEscalation)
 *   3. パネルが「manual_review 対象」かを判定 (isImportantPanel)
 *
 * Phase 1 範囲:
 *   - Continuity fail のみカバー (face_consistency 主導)
 *   - Layout / Composition / Style fail は Phase 2 (bubble overlap 計測などが揃ったあと)
 *
 * 再試行ルール (SSoT 準拠):
 *   - 通常コマ: 最大 2 回再試行
 *   - 重要コマ: 最大 3 回再試行
 *   - 上限到達後は manual_review に回す
 */

import type { PagePanel, MangaPagePlan } from "../page-director/types";
import type { ShotlistPanelEntry } from "../schemas";
import type {
  FaceConsistencyVerdict,
  FaceConsistencyDecision,
} from "../qa/face-consistency";

// ============================================================
// 重要コマ判定
// ============================================================

export type ImportantPanelReason =
  | "page_largest_panel" // ページ最大コマ (importance >= 4 or splash)
  | "page_last_panel" // ページ末コマ (反応・引きの最後)
  | "first_appearance" // キャラ初登場
  | "cliffhanger" // 引きコマ
  | "hard_fail"; // 直近 verdict が hard_fail

export type ImportantPanelCheck = {
  important: boolean;
  reasons: ImportantPanelReason[];
};

/**
 * panel が「ページ最大コマ」か (= ページ内で importance が最大、もしくは extra_large/splash)
 */
function isPageLargestPanel(
  panel: PagePanel,
  page: MangaPagePlan
): boolean {
  if (
    panel.render_size_class === "extra_large" ||
    panel.render_size_class === "splash"
  ) {
    return true;
  }
  const maxImp = Math.max(...page.panels.map((p) => p.importance));
  return panel.importance === maxImp && panel.importance >= 4;
}

/**
 * panel が「ページ末コマ」か (page.panels[] の reading_order 最後)
 */
function isPageLastPanel(panel: PagePanel, page: MangaPagePlan): boolean {
  const maxOrder = Math.max(...page.panels.map((p) => p.reading_order));
  return panel.reading_order === maxOrder;
}

/**
 * panel が「キャラ初登場」を含むか
 *
 * 判定: そのキャラ (character_id) が、当エピソードの今回 panel が初出かどうか。
 * shotlist.panels を idx 順に走査して、character_id が初めて現れる panel を初登場とする。
 */
function buildFirstAppearanceMap(
  shotlistPanels: ShotlistPanelEntry[]
): Map<number, string[]> {
  const seen = new Set<string>();
  const result = new Map<number, string[]>();
  for (const sb of shotlistPanels) {
    const debuts: string[] = [];
    for (const charId of sb.characters ?? []) {
      if (!seen.has(charId)) {
        seen.add(charId);
        debuts.push(charId);
      }
    }
    if (debuts.length > 0) result.set(sb.idx, debuts);
  }
  return result;
}

/**
 * panel が「cliffhanger」コマか
 * (page.page_role === 'cliffhanger' かつ panel が page 末尾、もしくは
 *  ShotlistPanelEntry.role === 'cliffhanger')
 */
function isCliffhangerPanel(
  panel: PagePanel,
  page: MangaPagePlan,
  shotlistPanel: ShotlistPanelEntry | undefined
): boolean {
  if (page.page_role === "cliffhanger" && isPageLastPanel(panel, page)) {
    return true;
  }
  if (shotlistPanel?.role === "cliffhanger") return true;
  return false;
}

export type IsImportantPanelArgs = {
  /** 判定対象の panel */
  panel: PagePanel;
  /** その panel が属する page */
  page: MangaPagePlan;
  /** 対応する ShotlistPanelEntry (任意。あれば role / 初登場判定に使う) */
  shotlistPanel?: ShotlistPanelEntry;
  /** エピソード全体の shotlist (初登場判定用) */
  shotlistPanels?: ShotlistPanelEntry[];
  /** 直近の verdict (hard_fail かどうか判定) */
  lastVerdict?: FaceConsistencyVerdict;
  /** firstAppearance map (事前計算済みなら渡す。なければ shotlistPanels から構築) */
  firstAppearanceByIdx?: Map<number, string[]>;
};

export function isImportantPanel(args: IsImportantPanelArgs): ImportantPanelCheck {
  const reasons: ImportantPanelReason[] = [];

  if (isPageLargestPanel(args.panel, args.page)) {
    reasons.push("page_largest_panel");
  }
  if (isPageLastPanel(args.panel, args.page)) {
    reasons.push("page_last_panel");
  }
  if (args.shotlistPanel && args.shotlistPanels) {
    const map =
      args.firstAppearanceByIdx ?? buildFirstAppearanceMap(args.shotlistPanels);
    if ((map.get(args.shotlistPanel.idx) ?? []).length > 0) {
      reasons.push("first_appearance");
    }
  }
  if (isCliffhangerPanel(args.panel, args.page, args.shotlistPanel)) {
    reasons.push("cliffhanger");
  }
  if (args.lastVerdict?.decision === "hard_fail") {
    reasons.push("hard_fail");
  }

  return { important: reasons.length > 0, reasons };
}

// ============================================================
// Repair 判定
// ============================================================

export type RepairAction =
  | "accept" // verdict pass — そのまま採用
  | "retry_stronger_ref" // continuity fail 1回目: 参照画像を増やす
  | "retry_silhouette" // continuity fail 2回目: シルエット/遠景化で逃がす
  | "manual_review" // 再試行上限到達 or hard_fail (重要コマ以外でも) — 人手レビュー
  | "skip"; // 計測自体が不能 (例: ファイル無し)

export type RepairJudgement = {
  action: RepairAction;
  reason: string;
  retryAttempt: number;
  maxRetries: number;
  important: boolean;
};

export type JudgePanelRepairArgs = {
  /** 直近 verdict (face_consistency 計測結果) */
  verdict: FaceConsistencyVerdict;
  /** これまでに試行した再生成回数 (0 = まだ再生成していない) */
  attempts: number;
  /** この panel が重要コマか */
  important: boolean;
};

/**
 * face_consistency verdict + 再試行回数 → 次のアクション
 *
 * SSoT:
 *   - face_consistency < 0.70 (= warn/reroll/hard_fail) → 再試行候補
 *   - 通常 2 回 / 重要 3 回まで → 上限到達で manual_review
 *   - 1回目: stronger_ref / 2回目以降: silhouette
 *   - hard_fail はカテゴリにかかわらず重要コマと同じ上限 (3回)
 *
 *   pass の場合は accept 即時返却。
 */
export function judgePanelRepair(args: JudgePanelRepairArgs): RepairJudgement {
  const { verdict, attempts, important } = args;
  const isHardFail = verdict.decision === "hard_fail";
  // hard_fail は重要扱いに昇格 (再試行枠を広げ、上限後は必ず manual_review)
  const effectiveImportant = important || isHardFail;
  const maxRetries = effectiveImportant ? 3 : 2;

  if (verdict.decision === "pass") {
    return {
      action: "accept",
      reason: `pass (score=${verdict.score.toFixed(2)})`,
      retryAttempt: attempts,
      maxRetries,
      important: effectiveImportant,
    };
  }

  if (attempts >= maxRetries) {
    return {
      action: "manual_review",
      reason: `${verdict.decision} after ${attempts}/${maxRetries} retries — escalate to manual review`,
      retryAttempt: attempts,
      maxRetries,
      important: effectiveImportant,
    };
  }

  // 再試行戦略: 1回目 stronger_ref → 2回目以降 silhouette
  const action: RepairAction =
    attempts === 0 ? "retry_stronger_ref" : "retry_silhouette";
  return {
    action,
    reason: `${verdict.decision} (score=${verdict.score.toFixed(2)}) → ${action}`,
    retryAttempt: attempts,
    maxRetries,
    important: effectiveImportant,
  };
}

// ============================================================
// Escalation: 再生成プロンプトに追加するヒント
// ============================================================

export type EscalationDirective = {
  /** prompt-composer のプロンプトに追加する英語 hint */
  promptAddition: string;
  /** 参照画像を増やすか (registry から expr_anger / expr_sad など追加) */
  addExtraReferences: boolean;
  /** カメラを silhouette/far にスイッチするか */
  forceSilhouetteOrFar: boolean;
};

export function planEscalation(action: RepairAction): EscalationDirective | null {
  switch (action) {
    case "retry_stronger_ref":
      return {
        promptAddition:
          "STRICT consistency: this is a retry attempt because the previous render did not match the canonical character design. Match the reference images EXACTLY for hair color, hairstyle, eye shape, and outfit silhouette. Do not invent variations.",
        addExtraReferences: true,
        forceSilhouetteOrFar: false,
      };
    case "retry_silhouette":
      return {
        promptAddition:
          "Render the character at LONG SHOT or in SILHOUETTE / partial obscuration (e.g., backlit, hooded, partial frame, far distance). Avoid close-up of facial features. The composition must still convey the same panel intent (camera, emotion, narrative function).",
        addExtraReferences: true,
        forceSilhouetteOrFar: true,
      };
    default:
      return null;
  }
}

// ============================================================
// 一括判定ヘルパー (CLI 用)
// ============================================================

export type PanelRepairPlan = {
  panel_idx: number;
  judgement: RepairJudgement;
  important_check: ImportantPanelCheck;
};

/**
 * 1 panel について、importance + verdict + attempts から RepairPlan を作る。
 */
export function buildRepairPlan(args: {
  panelIdx: number;
  verdict: FaceConsistencyVerdict;
  attempts: number;
  panel: PagePanel;
  page: MangaPagePlan;
  shotlistPanel?: ShotlistPanelEntry;
  shotlistPanels?: ShotlistPanelEntry[];
  firstAppearanceByIdx?: Map<number, string[]>;
}): PanelRepairPlan {
  const important_check = isImportantPanel({
    panel: args.panel,
    page: args.page,
    shotlistPanel: args.shotlistPanel,
    shotlistPanels: args.shotlistPanels,
    lastVerdict: args.verdict,
    firstAppearanceByIdx: args.firstAppearanceByIdx,
  });
  const judgement = judgePanelRepair({
    verdict: args.verdict,
    attempts: args.attempts,
    important: important_check.important,
  });
  return {
    panel_idx: args.panelIdx,
    judgement,
    important_check,
  };
}

/**
 * 集計サマリ (CLI ログ用)
 */
export type RepairPlanSummary = {
  total: number;
  by_action: Record<RepairAction, number>;
  important_panels: number;
};

export function summarizeRepairPlans(plans: PanelRepairPlan[]): RepairPlanSummary {
  const by_action: Record<RepairAction, number> = {
    accept: 0,
    retry_stronger_ref: 0,
    retry_silhouette: 0,
    manual_review: 0,
    skip: 0,
  };
  let important = 0;
  for (const p of plans) {
    by_action[p.judgement.action]++;
    if (p.important_check.important) important++;
  }
  return {
    total: plans.length,
    by_action,
    important_panels: important,
  };
}

// ============================================================
// (testing) buildFirstAppearanceMap を export
// ============================================================

export { buildFirstAppearanceMap };
