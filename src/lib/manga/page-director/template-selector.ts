/**
 * テンプレ選択器（ルールベース）
 *
 * 入力: ページの抽象コンテキスト (page_role / visual_density / dialogue_density /
 *       panel_count / page_side) + RenderConstraints
 * 出力: スコア順の候補テンプレリスト
 *
 * Month 1 段階では LLM 不要のルールベース。後で LLM 補強可能な構造を保つ。
 *
 * スコアリング:
 *   panel_count 完全一致      : +5
 *   panel_count ±1            : +3
 *   panel_count ±2            : +1
 *   page_role 一致            : +5
 *   visual_density 一致       : +3
 *   dialogue_density 一致     : +2
 *   page_side hint 一致       : +2
 *   role_hint 重要枠あり      : +1
 * 失格条件:
 *   panel_count > constraints.max_panels_per_page
 *   いずれかの slot.size_class が allowed_size_classes 外
 *   page_role==='action' かつ allow_action_pages===false
 */

import { TEMPLATES } from "./layout-templates";
import type {
  DialogueDensity,
  LayoutTemplate,
  PageRole,
  PageSide,
  RenderConstraints,
  VisualDensity,
} from "./types";

/** テンプレ選択時のページ抽象コンテキスト */
export type PageSelectionContext = {
  page_role: PageRole;
  visual_density: VisualDensity;
  dialogue_density: DialogueDensity;
  /** ページに割り当てたいコマ数 */
  panel_count: number;
  /** 見開き内左右（あれば） */
  page_side?: PageSide;
};

export type TemplateScore = {
  template: LayoutTemplate;
  score: number;
  /** デバッグ用、スコア内訳 */
  breakdown: Record<string, number>;
};

/**
 * 1テンプレに対するスコア計算。失格時は score=-Infinity を返す。
 */
function scoreTemplate(
  t: LayoutTemplate,
  ctx: PageSelectionContext,
  constraints: RenderConstraints
): TemplateScore {
  const breakdown: Record<string, number> = {};

  // === 失格条件 ===
  if (t.panel_count > constraints.max_panels_per_page) {
    return {
      template: t,
      score: Number.NEGATIVE_INFINITY,
      breakdown: { reject: -1, reason_max_panels: 1 },
    };
  }
  for (const slot of t.slots) {
    if (!constraints.allowed_size_classes.includes(slot.size_class)) {
      return {
        template: t,
        score: Number.NEGATIVE_INFINITY,
        breakdown: { reject: -1, reason_size_class: 1 },
      };
    }
  }
  if (ctx.page_role === "action" && !constraints.allow_action_pages) {
    return {
      template: t,
      score: Number.NEGATIVE_INFINITY,
      breakdown: { reject: -1, reason_action_disallowed: 1 },
    };
  }

  let score = 0;

  // panel_count 一致度
  const dPanels = Math.abs(t.panel_count - ctx.panel_count);
  if (dPanels === 0) {
    score += 5;
    breakdown.panel_count_exact = 5;
  } else if (dPanels === 1) {
    score += 3;
    breakdown.panel_count_off1 = 3;
  } else if (dPanels === 2) {
    score += 1;
    breakdown.panel_count_off2 = 1;
  } else {
    breakdown.panel_count_far = 0;
  }

  // page_role 一致
  if (t.fits_page_roles.includes(ctx.page_role)) {
    score += 5;
    breakdown.page_role = 5;
  }

  // visual_density 一致
  if (t.fits_visual_density.includes(ctx.visual_density)) {
    score += 3;
    breakdown.visual_density = 3;
  }

  // dialogue_density 一致
  if (t.fits_dialogue_density.includes(ctx.dialogue_density)) {
    score += 2;
    breakdown.dialogue_density = 2;
  }

  // page_side hint（特殊テンプレへのボーナス）
  if (ctx.page_side === "right" && t.id === "right_page_cliffhanger") {
    score += 2;
    breakdown.page_side_right = 2;
  }
  if (ctx.page_side === "left" && t.id === "left_page_aftermath") {
    score += 2;
    breakdown.page_side_left = 2;
  }

  // role_hint を持つ slot（大ゴマ）があるテンプレは reveal/cliffhanger/action で +1
  if (
    (ctx.page_role === "reveal" ||
      ctx.page_role === "cliffhanger" ||
      ctx.page_role === "action") &&
    t.slots.some((s) => s.role_hint)
  ) {
    score += 1;
    breakdown.has_role_hint_slot = 1;
  }

  return { template: t, score, breakdown };
}

/**
 * 全テンプレを評価し、スコア降順で返す。失格は除外。
 */
export function rankTemplates(
  ctx: PageSelectionContext,
  constraints: RenderConstraints
): TemplateScore[] {
  const scored = TEMPLATES.map((t) => scoreTemplate(t, ctx, constraints));
  const survived = scored.filter((s) => Number.isFinite(s.score));
  // tie-breaker: panel_count exact match を優先、次に panel_count 多い方
  survived.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aExact = a.template.panel_count === ctx.panel_count ? 1 : 0;
    const bExact = b.template.panel_count === ctx.panel_count ? 1 : 0;
    if (bExact !== aExact) return bExact - aExact;
    return b.template.panel_count - a.template.panel_count;
  });
  return survived;
}

/**
 * 最適テンプレ1つを返す。失格しか残らないときは null。
 */
export function selectBestTemplate(
  ctx: PageSelectionContext,
  constraints: RenderConstraints
): LayoutTemplate | null {
  const ranked = rankTemplates(ctx, constraints);
  if (ranked.length === 0) return null;
  return ranked[0].template;
}
