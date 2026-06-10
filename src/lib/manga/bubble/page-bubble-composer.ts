import type { EpisodeStoryboardV2, PagePlanV2 } from "../schemas-v2";
import { detectBreakouts, type BreakoutCandidate } from "./breakout-detector";
import { placeBubbles, type DialogueInput } from "./placer";
import { renderBubbleOverlay } from "./svg-overlay";

export type PageBubbleInput = {
  pagePlanPage: PagePlanV2["pages"][number];
  storyboardPage: EpisodeStoryboardV2["pages"][number];
  pageWidth: number;
  pageHeight: number;
};

export type PageBubbleOutput = {
  svg: string;
  bubbleCount: number;
  warnings: string[];
  breakouts: BreakoutCandidate[];
  breakoutMasks: Array<{
    panel_id: string;
    target_panel_id: string;
    rect: { x: number; y: number; w: number; h: number };
  }>;
};

export function composePageBubbles(input: PageBubbleInput): PageBubbleOutput {
  const { pagePlanPage, storyboardPage, pageWidth, pageHeight } = input;
  const warnings: string[] = [];
  const groups: string[] = [];
  const breakouts = detectBreakouts({ pagePlanPage, storyboardPage });
  const breakoutsByPanel = new Map(breakouts.map((b) => [b.panel_id, b]));
  const breakoutMasks: PageBubbleOutput["breakoutMasks"] = [];
  let bubbleCount = 0;

  for (let i = 0; i < pagePlanPage.panels.length; i++) {
    const pp = pagePlanPage.panels[i];
    const sbPanel =
      storyboardPage.panels.find((p) => p.panel_id === pp.panel_id) ??
      storyboardPage.panels[i];

    if (!sbPanel) {
      warnings.push(`panel ${pp.panel_id}: storyboard panel not found`);
      continue;
    }

    const dialogue = sbPanel.dialogue ?? [];
    if (dialogue.length === 0) {
      warnings.push(`panel ${pp.panel_id}: dialogue empty`);
      continue;
    }

    const panelCharacterIds = new Set(
      (sbPanel.entities?.characters ?? []).map((c) => c.character_id)
    );
    const dialogues: DialogueInput[] = [];

    for (let j = 0; j < dialogue.length; j++) {
      const d = dialogue[j];
      if (!d.character_id) {
        warnings.push(`panel ${pp.panel_id}: dialogue #${j + 1} speaker_id unresolved`);
        continue;
      }
      if (panelCharacterIds.size > 0 && !panelCharacterIds.has(d.character_id)) {
        warnings.push(`panel ${pp.panel_id}: speaker ${d.character_id} not listed in panel entities`);
      }
      dialogues.push({
        speaker_id: d.character_id,
        text: d.text,
        bubble_type: "normal",
        reading_order: j + 1,
      });
    }

    if (dialogues.length === 0) continue;

    const placed = placeBubbles({
      panelWidth: pp.rect.w,
      panelHeight: pp.rect.h,
      dialogues,
      pageOriginX: pp.rect.x,
      pageOriginY: pp.rect.y,
    }).map((bubble) => ({
      ...bubble,
      position: { ...bubble.position },
    }));

    if (placed.length === 0) continue;

    const breakout = breakoutsByPanel.get(pp.panel_id);
    const breakoutIndex = breakout
      ? findBreakoutBubbleIndex(placed, breakout.reading_order)
      : -1;
    if (breakout && breakoutIndex >= 0) {
      const position = placed[breakoutIndex].position;
      applyBreakoutShift(position, breakout.direction);
      breakoutMasks.push({
        panel_id: breakout.panel_id,
        target_panel_id: breakout.target_panel_id,
        rect: expandedRect(position, 8),
      });
    }

    const clipPolygon = breakout
      ? unionBBoxPolygon(breakout.source_panel_polygon, breakout.target_panel_polygon)
      : pp.polygon;

    const panelSvg = renderBubbleOverlay({
      panelWidth: pageWidth,
      panelHeight: pageHeight,
      bubbles: placed.map((b) => ({
        position: b.position,
        text: b.text,
        bubble_type: b.bubble_type,
        reading_order: b.reading_order,
      })),
      clipPolygon,
      clipPathId: `bubble-clip-p${pagePlanPage.page_no}-${pp.panel_id.replace(/[^A-Za-z0-9_-]/g, "_")}`,
    });

    const breakoutAttrs = breakout
      ? ` data-breakout-target="${escapeXml(breakout.target_panel_id)}" data-breakout-direction="${breakout.direction}"`
      : "";
    groups.push(`<g data-panel-id="${escapeXml(pp.panel_id)}"${breakoutAttrs}>${innerSvg(panelSvg)}</g>`);
    bubbleCount += placed.length;
  }

  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" width="${pageWidth}" height="${pageHeight}">`,
      groups.join(""),
      "</svg>",
    ].join(""),
    bubbleCount,
    warnings,
    breakouts,
    breakoutMasks,
  };
}

function findBreakoutBubbleIndex(
  placed: ReturnType<typeof placeBubbles>,
  readingOrder: number
): number {
  const exact = placed.findIndex((bubble) => bubble.reading_order === readingOrder);
  return exact >= 0 ? exact : placed.length - 1;
}

function applyBreakoutShift(
  position: { x: number; y: number; width: number; height: number },
  direction: BreakoutCandidate["direction"]
): void {
  const ratio = 0.3;
  if (direction === "top") position.y -= Math.round(position.height * ratio);
  if (direction === "bottom") position.y += Math.round(position.height * ratio);
  if (direction === "left") position.x -= Math.round(position.width * ratio);
  if (direction === "right") position.x += Math.round(position.width * ratio);
}

function expandedRect(
  position: { x: number; y: number; width: number; height: number },
  pad: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(position.x - pad),
    y: Math.round(position.y - pad),
    w: Math.round(position.width + pad * 2),
    h: Math.round(position.height + pad * 2),
  };
}

function unionBBoxPolygon(...polygons: [number, number][][]): [number, number][] {
  const points = polygons.flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

function innerSvg(svg: string): string {
  return svg.replace(/^<svg\b[^>]*>/, "").replace(/<\/svg>$/, "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
