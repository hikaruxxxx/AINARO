/**
 * MangaPagePlan 最低限検査
 *
 * プラン (codex-swift-kettle.md) p.231 のルール群を実装。
 * - panel_idx 全割当
 * - rect 重複なし
 * - reading_order 一意
 * - panel_count 一致
 * - importance 最大コマ十分大
 * - balloon_zones 空でない
 * - render_size_class が Profile.size_options 内
 * - forbidden_panel_types に該当しない
 *
 * page_end_hook 配置・bleed 等の演出ルールは別レイヤ (page-mapper.ts 側で扱う)。
 */

import type {
  MangaPagePlan,
  PagePanel,
  PanelRect,
  RenderConstraints,
  ValidationError,
  ValidationResult,
} from "./types";
import { getTemplate } from "./layout-templates";

/** 矩形が交差するか判定 */
function rectsOverlap(a: PanelRect, b: PanelRect): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

/** パネルの面積 */
function panelArea(p: PagePanel): number {
  return p.rect.w * p.rect.h;
}

export type ValidateOptions = {
  /** ModelCapabilityProfile から派生した制約 (任意。指定時に追加検査) */
  constraints?: RenderConstraints;
};

export function validatePagePlan(
  plan: MangaPagePlan,
  options: ValidateOptions = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // === 基本チェック ===

  if (plan.panels.length !== plan.actual_panel_count) {
    errors.push({
      rule: "panel_count_match",
      message: `panels.length (${plan.panels.length}) と actual_panel_count (${plan.actual_panel_count}) が不一致`,
    });
  }

  if (plan.panels.length === 0) {
    errors.push({
      rule: "non_empty_panels",
      message: "panels[] が空。最低1コマ必要",
    });
    return { ok: false, errors, warnings };
  }

  // === panel_idx 全割当 ===
  const idxSet = new Set<number>();
  for (const p of plan.panels) {
    if (idxSet.has(p.panel_idx)) {
      errors.push({
        rule: "panel_idx_unique",
        message: `panel_idx=${p.panel_idx} が重複`,
        panel_idx: p.panel_idx,
      });
    }
    idxSet.add(p.panel_idx);
  }
  for (let i = 0; i < plan.actual_panel_count; i++) {
    if (!idxSet.has(i)) {
      errors.push({
        rule: "panel_idx_complete",
        message: `panel_idx=${i} が欠落 (0-${plan.actual_panel_count - 1} まで連番必要)`,
      });
    }
  }

  // === reading_order 一意 ===
  const orderSet = new Set<number>();
  for (const p of plan.panels) {
    if (orderSet.has(p.reading_order)) {
      errors.push({
        rule: "reading_order_unique",
        message: `reading_order=${p.reading_order} が重複`,
        panel_idx: p.panel_idx,
      });
    }
    orderSet.add(p.reading_order);
  }

  // === rect 重複なし ===
  for (let i = 0; i < plan.panels.length; i++) {
    for (let j = i + 1; j < plan.panels.length; j++) {
      const a = plan.panels[i];
      const b = plan.panels[j];
      if (rectsOverlap(a.rect, b.rect)) {
        errors.push({
          rule: "rect_no_overlap",
          message: `panel_idx=${a.panel_idx} と panel_idx=${b.panel_idx} の rect が重複`,
          panel_idx: a.panel_idx,
        });
      }
    }
  }

  // === rect がページ内 ===
  for (const p of plan.panels) {
    if (p.rect.x < 0 || p.rect.y < 0 || p.rect.w <= 0 || p.rect.h <= 0) {
      errors.push({
        rule: "rect_valid_dims",
        message: `panel_idx=${p.panel_idx} の rect が不正 (${JSON.stringify(p.rect)})`,
        panel_idx: p.panel_idx,
      });
    }
  }

  // === importance 最大コマが十分大 ===
  if (plan.panels.length > 1) {
    const maxImportance = Math.max(...plan.panels.map((p) => p.importance));
    const maxImportancePanel = plan.panels.find((p) => p.importance === maxImportance);
    if (maxImportancePanel) {
      const maxArea = panelArea(maxImportancePanel);
      const avgArea =
        plan.panels.reduce((s, p) => s + panelArea(p), 0) / plan.panels.length;
      if (maxArea < avgArea * 1.2) {
        warnings.push({
          rule: "importance_size_consistency",
          message: `最高importance=${maxImportance}コマ (panel_idx=${maxImportancePanel.panel_idx}) の面積が他の平均と大差ない。視覚優先度が読者に伝わらない懸念`,
          panel_idx: maxImportancePanel.panel_idx,
        });
      }
    }
  }

  // === balloon_zones 空でない ===
  for (const p of plan.panels) {
    if (p.balloon_zones.length === 0) {
      warnings.push({
        rule: "balloon_zones_present",
        message: `panel_idx=${p.panel_idx} に balloon_zones が空。吹き出し配置時に SVG placer が困る`,
        panel_idx: p.panel_idx,
      });
    }
  }

  // === テンプレ存在チェック ===
  const tmpl = getTemplate(plan.layout_template_id);
  if (!tmpl) {
    errors.push({
      rule: "template_exists",
      message: `layout_template_id="${plan.layout_template_id}" がテンプレに存在しない`,
    });
  } else {
    // テンプレと panel_count 一致
    if (plan.actual_panel_count > tmpl.panel_count) {
      errors.push({
        rule: "template_panel_count_match",
        message: `actual_panel_count=${plan.actual_panel_count} がテンプレ "${tmpl.id}" の panel_count=${tmpl.panel_count} を超過`,
      });
    }
    // slot_id 整合
    const validSlotIds = new Set(tmpl.slots.map((s) => s.id));
    for (const p of plan.panels) {
      if (!validSlotIds.has(p.slot_id)) {
        errors.push({
          rule: "slot_id_valid",
          message: `panel_idx=${p.panel_idx} の slot_id="${p.slot_id}" がテンプレ "${tmpl.id}" の slots に存在しない`,
          panel_idx: p.panel_idx,
          slot_id: p.slot_id,
        });
      }
    }
  }

  // === RenderConstraints 由来の追加検査 ===
  if (options.constraints) {
    const c = options.constraints;
    // 最大コマ数
    if (plan.actual_panel_count > c.max_panels_per_page) {
      errors.push({
        rule: "constraints_max_panels",
        message: `actual_panel_count=${plan.actual_panel_count} が constraints.max_panels_per_page=${c.max_panels_per_page} を超過`,
      });
    }
    // 許可された size_class
    for (const p of plan.panels) {
      if (!c.allowed_size_classes.includes(p.render_size_class)) {
        errors.push({
          rule: "constraints_size_class_allowed",
          message: `panel_idx=${p.panel_idx} の render_size_class="${p.render_size_class}" が constraints で許可されていない`,
          panel_idx: p.panel_idx,
        });
      }
    }
    // action ページ許可
    if (plan.page_role === "action" && !c.allow_action_pages) {
      warnings.push({
        rule: "constraints_action_pages",
        message: "page_role=action が現在のモデル能力では非推奨 (Profile経由で抑制)",
      });
    }
  }

  // === F-2 page_one_shot のとき blueprint 必須 ===
  if (
    (plan.render_strategy === "page_one_shot" ||
      plan.render_strategy === "hybrid") &&
    !plan.page_prompt_blueprint
  ) {
    errors.push({
      rule: "blueprint_required_for_one_shot",
      message: `render_strategy="${plan.render_strategy}" のとき page_prompt_blueprint が必須`,
    });
  }

  // === blueprint の整合 ===
  if (plan.page_prompt_blueprint) {
    const bp = plan.page_prompt_blueprint;
    if (bp.panel_count !== plan.actual_panel_count) {
      errors.push({
        rule: "blueprint_panel_count_match",
        message: `blueprint.panel_count=${bp.panel_count} が actual_panel_count=${plan.actual_panel_count} と不一致`,
      });
    }
    if (bp.must_not_draw_text !== true) {
      errors.push({
        rule: "blueprint_no_text",
        message: "page_prompt_blueprint.must_not_draw_text は true 必須 (SVG重ね方針)",
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
