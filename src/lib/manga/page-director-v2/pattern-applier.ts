import type { PagePlanPanel } from "../schemas-v2";
import type { Pattern } from "./pattern-loader";

type Rect = PagePlanPanel["rect"];
type Point = [number, number];

function polygonBbox(polygon: Point[]): Rect {
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

export function applyPattern(args: {
  panels: PagePlanPanel[];
  pattern: Pattern;
}): { planPanels: PagePlanPanel[]; appliedCount: number } {
  const panelsByOrder = [...args.panels].sort((a, b) => a.reading_order - b.reading_order);
  const slotsByOrder = [...args.pattern.slots].sort((a, b) => a.reading_order - b.reading_order);
  const appliedByPanelId = new Map<string, PagePlanPanel>();
  const nApply = Math.min(panelsByOrder.length, slotsByOrder.length);

  for (let i = 0; i < nApply; i++) {
    const panel = panelsByOrder[i];
    const slot = slotsByOrder[i];
    const polygon = slot.polygon.map(([x, y]) => [x, y] as Point);

    const newPanel: PagePlanPanel = {
      ...panel,
      slot_id: slot.slot_id,
      polygon,
      rect: polygonBbox(polygon),
    };
    if (slot.is_borderless) newPanel.is_borderless = true;
    if (slot.bleed) newPanel.bleed_polygon = true;
    appliedByPanelId.set(panel.panel_id, newPanel);
  }

  return {
    planPanels: args.panels.map((panel) => appliedByPanelId.get(panel.panel_id) ?? panel),
    appliedCount: nApply,
  };
}
