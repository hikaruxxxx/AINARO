import type { EpisodeStoryboardV2, PagePlanV2 } from "../schemas-v2";
import type { DialogueInput } from "./placer";

export type BreakoutCandidate = {
  panel_id: string;
  reading_order: number;
  source_panel_polygon: [number, number][];
  target_panel_id: string;
  target_panel_polygon: [number, number][];
  /** 越境方向: source の枠から target 内側へ突き出す方向 (上下左右) */
  direction: "top" | "bottom" | "left" | "right";
};

type Panel = PagePlanV2["pages"][number]["panels"][number];
type BBox = { x: number; y: number; w: number; h: number };

const DEFAULT_MAX_PER_PAGE = 2;
const GUTTER_TOLERANCE_PX = 24;

export function detectBreakouts(args: {
  pagePlanPage: PagePlanV2["pages"][number];
  storyboardPage: EpisodeStoryboardV2["pages"][number];
  maxPerPage?: number;
}): BreakoutCandidate[] {
  const maxPerPage = args.maxPerPage ?? DEFAULT_MAX_PER_PAGE;
  if (maxPerPage <= 0) return [];

  const candidates: BreakoutCandidate[] = [];
  const storyboardById = new Map(args.storyboardPage.panels.map((p) => [p.panel_id, p]));

  const sourcePanels = args.pagePlanPage.panels
    .slice()
    .sort((a, b) => a.reading_order - b.reading_order)
    .filter((panel) => {
      const storyboardPanel = storyboardById.get(panel.panel_id);
      return panel.importance >= 4 && (storyboardPanel?.dialogue.length ?? 0) > 0;
    });

  for (const source of sourcePanels) {
    const storyboardPanel = storyboardById.get(source.panel_id);
    const dialogues = toDialogueInputs(storyboardPanel?.dialogue ?? []);
    if (dialogues.length === 0) continue;

    const target = args.pagePlanPage.panels
      .slice()
      .sort((a, b) => a.reading_order - b.reading_order)
      .find((panel) => panel.panel_id !== source.panel_id && panel.importance <= 3 && areAdjacent(source, panel));

    if (!target) continue;

    candidates.push({
      panel_id: source.panel_id,
      reading_order: dialogues[dialogues.length - 1].reading_order,
      source_panel_polygon: panelPolygon(source),
      target_panel_id: target.panel_id,
      target_panel_polygon: panelPolygon(target),
      direction: breakoutDirection(source, target),
    });

    if (candidates.length >= maxPerPage) break;
  }

  return candidates;
}

function toDialogueInputs(
  dialogue: EpisodeStoryboardV2["pages"][number]["panels"][number]["dialogue"]
): DialogueInput[] {
  return dialogue.map((d, index) => ({
    speaker_id: d.character_id,
    text: d.text,
    bubble_type: "normal",
    reading_order: index + 1,
  }));
}

function areAdjacent(a: Panel, b: Panel): boolean {
  const ab = bbox(panelPolygon(a));
  const bb = bbox(panelPolygon(b));
  const verticalOverlap = rangesOverlap(ab.y, ab.y + ab.h, bb.y, bb.y + bb.h);
  const horizontalOverlap = rangesOverlap(ab.x, ab.x + ab.w, bb.x, bb.x + bb.w);

  const rightGap = Math.abs(ab.x + ab.w - bb.x);
  const leftGap = Math.abs(bb.x + bb.w - ab.x);
  const bottomGap = Math.abs(ab.y + ab.h - bb.y);
  const topGap = Math.abs(bb.y + bb.h - ab.y);

  return (
    (verticalOverlap && (rightGap <= GUTTER_TOLERANCE_PX || leftGap <= GUTTER_TOLERANCE_PX)) ||
    (horizontalOverlap && (bottomGap <= GUTTER_TOLERANCE_PX || topGap <= GUTTER_TOLERANCE_PX))
  );
}

function breakoutDirection(source: Panel, target: Panel): BreakoutCandidate["direction"] {
  const s = bbox(panelPolygon(source));
  const t = bbox(panelPolygon(target));
  const sourceCx = s.x + s.w / 2;
  const sourceCy = s.y + s.h / 2;
  const targetCx = t.x + t.w / 2;
  const targetCy = t.y + t.h / 2;

  if (Math.abs(targetCx - sourceCx) >= Math.abs(targetCy - sourceCy)) {
    return targetCx >= sourceCx ? "right" : "left";
  }
  return targetCy >= sourceCy ? "bottom" : "top";
}

function panelPolygon(panel: Panel): [number, number][] {
  if (panel.polygon && panel.polygon.length >= 3) return panel.polygon;
  const { x, y, w, h } = panel.rect;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function bbox(points: [number, number][]): BBox {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    w: Math.max(...xs) - minX,
    h: Math.max(...ys) - minY,
  };
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.max(a1, b1) <= Math.min(a2, b2);
}
