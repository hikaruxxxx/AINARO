import type { DensityProfile, PagePlanPanel } from "../schemas-v2";
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
  densityProfile?: DensityProfile;
}): { planPanels: PagePlanPanel[]; appliedCount: number; warnings?: string[] } {
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
    if (slot.background_treatment) newPanel.background_treatment = slot.background_treatment;
    appliedByPanelId.set(panel.panel_id, newPanel);
  }

  const planPanels = args.panels.map((panel) => appliedByPanelId.get(panel.panel_id) ?? panel);
  const warnings = buildDensityWarnings(planPanels, args.densityProfile);

  return {
    planPanels,
    appliedCount: nApply,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function buildDensityWarnings(
  panels: PagePlanPanel[],
  densityProfile: DensityProfile | undefined,
): string[] {
  if (!densityProfile) return [];

  const pageLabel = inferPageLabel(panels);
  const detailedCount = panels.filter((panel) => panel.background_treatment === "detailed_bg").length;
  const atmosphericOrToneCount = panels.filter((panel) =>
    panel.background_treatment === "atmospheric_fade" ||
    panel.background_treatment === "tone_back"
  ).length;

  const warnings: string[] = [];
  const maxDetailed = densityProfile.policy.max_detailed_bg_per_page;
  if (detailedCount > maxDetailed) {
    warnings.push(`${pageLabel} exceeds detailed_bg policy: ${detailedCount}>${maxDetailed}`);
  }
  if (
    densityProfile.policy.require_atmospheric_or_tone_each_page &&
    atmosphericOrToneCount === 0
  ) {
    warnings.push(`${pageLabel} lacks atmospheric_fade/tone_back`);
  }
  return warnings;
}

function inferPageLabel(panels: PagePlanPanel[]): string {
  for (const panel of panels) {
    const match = panel.panel_id.match(/(?:^|[_-])p(?:age)?0*(\d+)(?:[_-]|$)/i);
    if (match) return `page_${Number(match[1])}`;
  }
  return "page_unknown";
}
