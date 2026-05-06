import type { EpisodeStoryboardV2, PagePlanV2 } from "../schemas-v2";
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
};

export function composePageBubbles(input: PageBubbleInput): PageBubbleOutput {
  const { pagePlanPage, storyboardPage, pageWidth, pageHeight } = input;
  const warnings: string[] = [];
  const groups: string[] = [];
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
    });

    if (placed.length === 0) continue;

    const panelSvg = renderBubbleOverlay({
      panelWidth: pageWidth,
      panelHeight: pageHeight,
      bubbles: placed.map((b) => ({
        position: b.position,
        text: b.text,
        bubble_type: b.bubble_type,
        reading_order: b.reading_order,
      })),
      clipPolygon: pp.polygon,
      clipPathId: `bubble-clip-p${pagePlanPage.page_no}-${pp.panel_id.replace(/[^A-Za-z0-9_-]/g, "_")}`,
    });

    groups.push(`<g data-panel-id="${escapeXml(pp.panel_id)}">${innerSvg(panelSvg)}</g>`);
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
  };
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
