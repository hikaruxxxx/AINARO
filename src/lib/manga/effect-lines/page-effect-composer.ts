import type { EpisodeStoryboardV2, PagePlanV2 } from "../schemas-v2";
import { detectEffectLines } from "./detector";
import { renderEffectLineOverlay } from "./svg-overlay";

export type PageEffectInput = {
  pagePlanPage: PagePlanV2["pages"][number];
  storyboardPage: EpisodeStoryboardV2["pages"][number];
  pageWidth: number;
  pageHeight: number;
};

export function composePageEffects(input: PageEffectInput): {
  svg: string;
  effectCount: number;
  warnings: string[];
} {
  const { pagePlanPage, storyboardPage, pageWidth, pageHeight } = input;
  const warnings: string[] = [];
  const groups: string[] = [];
  let effectCount = 0;

  for (let i = 0; i < pagePlanPage.panels.length; i++) {
    const pp = pagePlanPage.panels[i];
    const sbPanel =
      storyboardPage.panels.find((panel) => panel.panel_id === pp.panel_id) ??
      storyboardPage.panels[i];

    if (!sbPanel) {
      warnings.push(`panel ${pp.panel_id}: storyboard panel not found`);
      continue;
    }

    const spec = detectEffectLines(sbPanel);
    if (!spec) continue;

    const clipPolygon = toPanelLocalPolygon(pp);
    const fragment = renderEffectLineOverlay(spec, pp.rect.w, pp.rect.h, clipPolygon);
    groups.push(
      `<g data-panel-id="${escapeXml(pp.panel_id)}" transform="translate(${pp.rect.x}, ${pp.rect.y})">${fragment}</g>`
    );
    effectCount++;
  }

  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" width="${pageWidth}" height="${pageHeight}">`,
      groups.join(""),
      "</svg>",
    ].join(""),
    effectCount,
    warnings,
  };
}

function toPanelLocalPolygon(pp: PagePlanV2["pages"][number]["panels"][number]): [number, number][] {
  if (pp.polygon && pp.polygon.length >= 3) {
    return pp.polygon.map(([x, y]) => [x - pp.rect.x, y - pp.rect.y]);
  }
  return [
    [0, 0],
    [pp.rect.w, 0],
    [pp.rect.w, pp.rect.h],
    [0, pp.rect.h],
  ];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
