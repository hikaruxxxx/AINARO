import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  NarrationKind,
  PagePlanV2,
} from "../schemas-v2";
import type { BubbleType } from "../types";
import { detectBreakouts, type BreakoutCandidate } from "./breakout-detector";
import { placeBubbles, type DialogueInput } from "./placer";
import { renderBubbleOverlay } from "./svg-overlay";

type StoryboardPanel = EpisodeStoryboardV2["pages"][number]["panels"][number];

/** shells_only branch 内で source 種別を保持するための拡張型 */
type SpeechItem = DialogueInput & {
  source: "dialogue" | "monologue" | "narration" | "sfx";
};

export type PageBubbleInput = {
  pagePlanPage: PagePlanV2["pages"][number];
  storyboardPage: EpisodeStoryboardV2["pages"][number];
  pageWidth: number;
  pageHeight: number;
  /**
   * "embed" (default): 既存挙動 (dialogue のみ shape + 横書き text overlay)
   * "shells_only" (Sprint 23): dialogue/monologue/narration/sfx 全てに shape + 縦書き text overlay
   */
  typesetMode?: "embed" | "shells_only";
  /** typesetMode="shells_only" 時に character role / 名前解決に使用。embed では未参照 OK */
  bible?: BibleSnapshotV2;
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

    const isShellsOnly = input.typesetMode === "shells_only";
    const speechItems: SpeechItem[] = isShellsOnly
      ? collectAllSpeechItems(sbPanel, pp.panel_id, warnings)
      : collectDialogueOnly(sbPanel, pp.panel_id, warnings).map((d) => ({ ...d, source: "dialogue" as const }));

    if (speechItems.length === 0) continue;

    const orderToSource = new Map(speechItems.map((s) => [s.reading_order, s.source]));
    const dialogues: DialogueInput[] = speechItems.map(({ source: _source, ...rest }) => rest);

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
      bubbles: placed.map((b) => {
        const source = orderToSource.get(b.reading_order);
        const isSfx = source === "sfx";
        return {
          position: b.position,
          text: b.text,
          bubble_type: b.bubble_type,
          reading_order: b.reading_order,
          // shells_only mode: sfx 以外は縦書き、sfx は katakana 単体 (writing_mode は無視される)
          writing_mode: isShellsOnly && !isSfx ? ("vertical" as const) : ("horizontal" as const),
          is_sfx: isShellsOnly && isSfx,
        };
      }),
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

/**
 * embed mode (既存挙動): dialogue のみを拾い、すべて bubble_type="normal" で配置する。
 * 既存テスト regression を避けるため warning メッセージも従来通り保持する。
 */
function collectDialogueOnly(
  sbPanel: StoryboardPanel,
  panelId: string,
  warnings: string[]
): DialogueInput[] {
  const dialogue = sbPanel.dialogue ?? [];
  if (dialogue.length === 0) {
    warnings.push(`panel ${panelId}: dialogue empty`);
    return [];
  }
  const panelCharacterIds = new Set(
    (sbPanel.entities?.characters ?? []).map((c) => c.character_id)
  );
  const out: DialogueInput[] = [];
  for (let j = 0; j < dialogue.length; j++) {
    const d = dialogue[j];
    if (!d.character_id) {
      warnings.push(`panel ${panelId}: dialogue #${j + 1} speaker_id unresolved`);
      continue;
    }
    if (panelCharacterIds.size > 0 && !panelCharacterIds.has(d.character_id)) {
      warnings.push(`panel ${panelId}: speaker ${d.character_id} not listed in panel entities`);
    }
    out.push({
      speaker_id: d.character_id,
      text: d.text,
      bubble_type: "normal",
      reading_order: j + 1,
    });
  }
  return out;
}

/**
 * shells_only mode (Sprint 23): dialogue / monologue / narration / sfx をすべて拾い、
 * bubble_shape / narration_kind / source 種別から BubbleType を推定する。
 * reading_order は dialogue → monologue → narration → sfx の順で 1-indexed に振り直す。
 * source 種別は SpeechItem.source で後段に伝搬し、composePageBubbles 側で writing_mode / is_sfx を決定する。
 */
function collectAllSpeechItems(
  sbPanel: StoryboardPanel,
  panelId: string,
  warnings: string[]
): SpeechItem[] {
  const out: SpeechItem[] = [];
  let order = 0;

  const dialogue = sbPanel.dialogue ?? [];
  for (let j = 0; j < dialogue.length; j++) {
    const d = dialogue[j];
    if (!d.character_id) {
      warnings.push(`panel ${panelId}: dialogue #${j + 1} speaker_id unresolved`);
      continue;
    }
    order += 1;
    out.push({
      source: "dialogue",
      speaker_id: d.character_id,
      text: d.text,
      bubble_type: inferBubbleType("dialogue", d.bubble_shape, undefined),
      reading_order: order,
    });
  }

  const monologue = sbPanel.monologue ?? [];
  for (let j = 0; j < monologue.length; j++) {
    const m = monologue[j];
    if (!m.text) continue;
    order += 1;
    out.push({
      source: "monologue",
      speaker_id: m.character_id ?? null,
      text: m.text,
      bubble_type: inferBubbleType("monologue", m.bubble_shape, undefined),
      reading_order: order,
    });
  }

  const narration = sbPanel.narration ?? [];
  const narrationKinds = sbPanel.narration_kinds ?? [];
  for (let j = 0; j < narration.length; j++) {
    const text = narration[j];
    if (!text) continue;
    order += 1;
    out.push({
      source: "narration",
      speaker_id: null,
      text,
      bubble_type: inferBubbleType("narration", undefined, narrationKinds[j]),
      reading_order: order,
    });
  }

  const sfx = sbPanel.sfx ?? [];
  for (let j = 0; j < sfx.length; j++) {
    const text = sfx[j];
    if (!text) continue;
    order += 1;
    out.push({
      source: "sfx",
      speaker_id: null,
      text,
      bubble_type: inferBubbleType("sfx", undefined, undefined),
      reading_order: order,
    });
  }

  return out;
}

/**
 * storyboard の発話アイテムを SVG 描画用 BubbleType に変換する。
 *
 * 優先順位:
 *   1. bubble_shape が明示されていればそれを優先 (設計者の意図を尊重)
 *   2. narration の narration_kind から推定
 *   3. source 種別 (monologue は雲型 default)
 *   4. fallback = "normal"
 *
 * sfx は shape を持たない (Commit 3 で paint-order halo 付き text-only として別経路へ)。
 * 暫定的に "normal" を返すが、svg-overlay 側で sfx-specific 描画に切り替える前提。
 */
function inferBubbleType(
  source: "dialogue" | "monologue" | "narration" | "sfx",
  bubbleShape: string | undefined,
  narrationKind: NarrationKind | undefined
): BubbleType {
  if (bubbleShape === "thought_cloud") return "thought";
  if (bubbleShape === "narration_box") return "narration";
  if (bubbleShape === "rounded_square") return "normal";
  if (bubbleShape === "oval") return "normal";
  if (source === "sfx") return "normal";
  if (source === "monologue") return "thought";
  if (source === "narration") {
    if (narrationKind === "protagonist_monologue" || narrationKind === "thought_bubble") {
      return "thought";
    }
    return "narration";
  }
  return "normal";
}
