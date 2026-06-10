/**
 * L5 Page Director v2 — storyboard.json + capability → page_plan.json
 *
 * deterministic mapper. テンプレ16個から panel_count に最も近いものを選び、
 * panel.importance で slot 大小を割り当てる。
 *
 * 既存 src/lib/manga/page-director/layout-templates.ts と
 * template-selector.ts は v1 storyboard 前提なので、v2 では薄いマッパーを置く。
 */
import type { CapabilityProfile } from "../capability/capability";
import type {
  EpisodeStoryboardV2,
  PagePlanV2,
  PagePlanPage,
  PagePlanPanel,
  RenderStrategy,
} from "../schemas-v2";

// B6 350dpi
const PAGE_W = 1748;
const PAGE_H = 2480;
const MARGIN = 60;

type SlotRect = { x: number; y: number; w: number; h: number };

/** panel_count に応じた決定論レイアウトテンプレ (slot rect配列) */
function layoutTemplate(panelCount: number): SlotRect[] {
  const innerW = PAGE_W - MARGIN * 2;
  const innerH = PAGE_H - MARGIN * 2;
  if (panelCount <= 3) {
    // 3-tier 縦割り
    const h = innerH / panelCount;
    return Array.from({ length: panelCount }, (_, i) => ({
      x: MARGIN, y: MARGIN + i * h, w: innerW, h: h - 20,
    }));
  }
  if (panelCount === 4) {
    // 2x2 grid
    const w = innerW / 2 - 10;
    const h = innerH / 2 - 10;
    return [
      { x: MARGIN, y: MARGIN, w, h },
      { x: MARGIN + w + 20, y: MARGIN, w, h },
      { x: MARGIN, y: MARGIN + h + 20, w, h },
      { x: MARGIN + w + 20, y: MARGIN + h + 20, w, h },
    ];
  }
  if (panelCount === 5) {
    // big_top + 2x2
    const topH = innerH * 0.4 - 10;
    const botH = innerH * 0.6 - 10;
    const botW = innerW / 2 - 10;
    return [
      { x: MARGIN, y: MARGIN, w: innerW, h: topH },
      { x: MARGIN, y: MARGIN + topH + 20, w: botW, h: botH / 2 - 10 },
      { x: MARGIN + botW + 20, y: MARGIN + topH + 20, w: botW, h: botH / 2 - 10 },
      { x: MARGIN, y: MARGIN + topH + 20 + botH / 2 + 10, w: botW, h: botH / 2 - 10 },
      { x: MARGIN + botW + 20, y: MARGIN + topH + 20 + botH / 2 + 10, w: botW, h: botH / 2 - 10 },
    ];
  }
  if (panelCount === 6) {
    // 3-tier x 2col
    const colW = innerW / 2 - 10;
    const rowH = innerH / 3 - 10;
    const slots: SlotRect[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        slots.push({
          x: MARGIN + c * (colW + 20), y: MARGIN + r * (rowH + 20), w: colW, h: rowH,
        });
      }
    }
    return slots;
  }
  // 7-8: dense grid 4x2 or 3+2+2
  const cols = Math.ceil(Math.sqrt(panelCount));
  const rows = Math.ceil(panelCount / cols);
  const colW = innerW / cols - 10;
  const rowH = innerH / rows - 10;
  const slots: SlotRect[] = [];
  for (let i = 0; i < panelCount; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    slots.push({
      x: MARGIN + c * (colW + 20), y: MARGIN + r * (rowH + 20), w: colW, h: rowH,
    });
  }
  return slots;
}

function chooseRenderStrategy(
  panelCount: number,
  bleedCount: number,
  silenceCount: number,
  capability: CapabilityProfile
): RenderStrategy {
  // 単純: panel_count <= 4 かつ bleed 多めなら page_one_shot、それ以外は panel_composite
  // capability に preferred があればそれを尊重
  if (capability.recommended_strategy === "panel_composite") return "panel_composite";
  if (capability.recommended_strategy === "page_one_shot") return "page_one_shot";
  // hybrid: heuristic
  if (panelCount <= 4 || bleedCount >= 1) return "page_one_shot";
  return "panel_composite";
}

export function buildPagePlanFromStoryboard(args: {
  storyboard: EpisodeStoryboardV2;
  capability: CapabilityProfile;
}): PagePlanV2 {
  const pages: PagePlanPage[] = args.storyboard.pages.map((page) => {
    const panelCount = page.panels.length;
    const slots = layoutTemplate(panelCount);

    const sortedByReadingOrder = [...page.panels].sort((a, b) => a.reading_order - b.reading_order);
    const planPanels: PagePlanPanel[] = sortedByReadingOrder.map((panel, idx) => ({
      panel_id: panel.panel_id,
      slot_id: `slot_${idx + 1}`,
      rect: slots[idx] ?? slots[slots.length - 1],
      reading_order: panel.reading_order,
      importance: panel.importance,
      continuity_group_ids: panel.continuity_group_ids,
    }));

    const bleedCount = page.panels.filter((p) => p.bleed).length;
    const silenceCount = page.panels.filter((p) => p.silence).length;
    const strategy = chooseRenderStrategy(panelCount, bleedCount, silenceCount, args.capability);

    return {
      page_no: page.page_no,
      layout_template_id: `tmpl_${panelCount}_grid_v1`,
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
