/**
 * L5 Page Director v3 — page_role + importance + 右綴じ読順を反映したレイアウト
 *
 * v2 (panel_count → grid だけ) からの主な変更点:
 * 1. importance ≥ 4 のパネルは独占行 (big row) を取る
 * 2. importance ≤ 3 のパネルは 2 つで共有行 (右綴じ: reading_order 小=右)
 * 3. page_role ごとに hero panel を強調する templates を選択
 *    - opening_hook: 最初 (もしくは max importance) を hero
 *    - cliffhanger:  最後を hero (引きの強調)
 *    - reveal:       単一 hero
 *    - establishing: 帯状の横長 1 + 残り
 * 4. layout_template_id を `tmpl_role_{role}_n{count}_v3` 形式で出力
 *
 * 出力 rect は B6 1748×2480 px ベース。
 *
 * SSoT: ~/.claude/plans/manga-pipeline-v2.md (L5 強化)
 */
import type { CapabilityProfile } from "../capability/capability";
import type {
  EpisodeStoryboardV2,
  PagePlanPage,
  PagePlanPanel,
  PagePlanV2,
  PageRoleV2,
  PanelV2,
  RenderStrategy,
} from "../schemas-v2";

const PAGE_W = 1748;
const PAGE_H = 2480;
const MARGIN = 60;
const GUTTER = 20; // panel 間隔

type Rect = { x: number; y: number; w: number; h: number };

/** 1 行に乗せるパネル群 (1個 or 2個)。reading_order 昇順で渡される */
type RowPlan = {
  panels: PanelV2[]; // reading_order 昇順 (右綴じでは 1個目が右、2個目が左)
  height_weight: number; // 行高さの相対比 (importance 重み付け用)
};

/**
 * panels を行に分割する。
 * - importance >= 4 → 独占行
 * - importance <= 3 → 隣接 2 つで共有行
 *
 * 端数や hero 指定で共有相手が居ない場合は単独行にする。
 *
 * height_weight は max importance + 1 を採用 (1..6)、独占行は更に +1 加算。
 */
function planRows(panels: PanelV2[], heroIdx?: number): RowPlan[] {
  const rows: RowPlan[] = [];
  let i = 0;
  while (i < panels.length) {
    const cur = panels[i];
    const isHero = heroIdx !== undefined && i === heroIdx;
    const big = isHero || cur.importance >= 4;
    if (big) {
      rows.push({
        panels: [cur],
        height_weight: cur.importance + (isHero ? 2 : 1),
      });
      i++;
      continue;
    }
    const next = panels[i + 1];
    if (next && next.importance <= 3 && (heroIdx === undefined || i + 1 !== heroIdx)) {
      // 2 個共有行
      rows.push({
        panels: [cur, next],
        height_weight: Math.max(cur.importance, next.importance) + 1,
      });
      i += 2;
    } else {
      // 単独行 (相手不在 or 次が hero)
      rows.push({
        panels: [cur],
        height_weight: cur.importance + 1,
      });
      i++;
    }
  }
  return rows;
}

/** RowPlan を rect 配列に変換 */
function layoutRows(rows: RowPlan[]): Map<string, Rect> {
  const innerW = PAGE_W - MARGIN * 2;
  const innerH = PAGE_H - MARGIN * 2;
  const totalWeight = rows.reduce((s, r) => s + r.height_weight, 0);
  const totalGutterH = (rows.length - 1) * GUTTER;
  const usableH = innerH - totalGutterH;

  const result = new Map<string, Rect>();
  let y = MARGIN;
  for (const row of rows) {
    const h = (usableH * row.height_weight) / totalWeight;
    if (row.panels.length === 1) {
      result.set(row.panels[0].panel_id, {
        x: MARGIN,
        y,
        w: innerW,
        h,
      });
    } else {
      // 右綴じ: reading_order 小 (panels[0]) が右、reading_order 大 (panels[1]) が左
      const colW = (innerW - GUTTER) / 2;
      result.set(row.panels[0].panel_id, {
        x: MARGIN + colW + GUTTER,
        y,
        w: colW,
        h,
      });
      result.set(row.panels[1].panel_id, {
        x: MARGIN,
        y,
        w: colW,
        h,
      });
    }
    y += h + GUTTER;
  }
  return result;
}

/**
 * page_role ごとに hero index を決める。
 * - opening_hook: max importance のパネル (同点なら最初)
 * - cliffhanger:  最後のパネル
 * - reveal:       max importance のパネル (同点なら最初)
 * - aftermath / dialogue / action / buildup / establishing: hero なし (importance 任せ)
 */
function pickHeroIndex(panels: PanelV2[], pageRole: PageRoleV2): number | undefined {
  if (panels.length === 0) return undefined;
  if (pageRole === "cliffhanger") return panels.length - 1;
  if (pageRole === "opening_hook" || pageRole === "reveal") {
    let best = 0;
    for (let i = 1; i < panels.length; i++) {
      if (panels[i].importance > panels[best].importance) best = i;
    }
    return best;
  }
  // establishing は establishing shot を hero に (見つからなければ undefined)
  if (pageRole === "establishing") {
    const idx = panels.findIndex((p) => p.shot_type === "establishing");
    return idx >= 0 ? idx : 0;
  }
  return undefined;
}

function chooseRenderStrategy(
  panelCount: number,
  bleedCount: number,
  capability: CapabilityProfile
): RenderStrategy {
  if (capability.recommended_strategy === "panel_composite") return "panel_composite";
  if (capability.recommended_strategy === "page_one_shot") return "page_one_shot";
  // hybrid: panel_count <= 4 もしくは bleed あり → page_one_shot
  if (panelCount <= 4 || bleedCount >= 1) return "page_one_shot";
  return "panel_composite";
}

function templateId(panelCount: number, role: PageRoleV2, hasHero: boolean): string {
  return `tmpl_role_${role}_n${panelCount}${hasHero ? "_hero" : ""}_v3`;
}

/**
 * SSoT 設計原則 #3 (Hard fail over silent skip) に従い、
 * storyboard の不正を L5 で hard fail する。
 *
 * - panels が 0 個のページ (=空ページ): error
 * - reading_order が 1..N の連番でない (重複/飛び番/0以下): error
 *
 * これにより L8.6 audit に届く前に異常を停止できる。
 */
function validateStoryboardForLayout(storyboard: EpisodeStoryboardV2): void {
  const errors: string[] = [];
  for (const page of storyboard.pages) {
    if (page.panels.length === 0) {
      errors.push(`page ${page.page_no}: panels is empty`);
      continue;
    }
    const orders = page.panels.map((p) => p.reading_order).sort((a, b) => a - b);
    const expected = Array.from({ length: orders.length }, (_, i) => i + 1);
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== expected[i]) {
        errors.push(
          `page ${page.page_no}: reading_order must be 1..${orders.length} contiguous, got [${orders.join(",")}]`
        );
        break;
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `[L5 v3] storyboard validation failed (${errors.length} error${errors.length > 1 ? "s" : ""}):\n` +
      errors.map((e) => `  - ${e}`).join("\n")
    );
  }
}

export function buildPagePlanFromStoryboardV3(args: {
  storyboard: EpisodeStoryboardV2;
  capability: CapabilityProfile;
}): PagePlanV2 {
  validateStoryboardForLayout(args.storyboard);
  const pages: PagePlanPage[] = args.storyboard.pages.map((page) => {
    // reading_order 昇順に並べる (mapper は reading_order を信頼する)
    const sorted = [...page.panels].sort((a, b) => a.reading_order - b.reading_order);
    const heroIdx = pickHeroIndex(sorted, page.page_role);
    const rows = planRows(sorted, heroIdx);
    const rectByPanelId = layoutRows(rows);

    const planPanels: PagePlanPanel[] = sorted.map((panel, idx) => {
      const rect = rectByPanelId.get(panel.panel_id) ?? {
        x: MARGIN, y: MARGIN, w: PAGE_W - MARGIN * 2, h: PAGE_H - MARGIN * 2,
      };
      return {
        panel_id: panel.panel_id,
        slot_id: `slot_${idx + 1}`,
        rect,
        reading_order: panel.reading_order,
        importance: panel.importance,
        continuity_group_ids: panel.continuity_group_ids,
      };
    });

    const bleedCount = page.panels.filter((p) => p.bleed).length;
    const strategy = chooseRenderStrategy(page.panels.length, bleedCount, args.capability);
    const hasHero = heroIdx !== undefined;

    return {
      page_no: page.page_no,
      layout_template_id: templateId(page.panels.length, page.page_role, hasHero),
      page_role: page.page_role,
      render_strategy: strategy,
      panels: planPanels,
    };
  });

  return {
    schema_version: 2,
    episode_id: args.storyboard.episode_id,
    capability_profile_id: args.capability.profile_id,
    pages,
  };
}
