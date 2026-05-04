/**
 * L9 Render: prompt composer v2
 *
 * panel (storyboard) + resolved_refs + bible.style_directives →
 *   gpt-image-2 / RenderAdapter に渡す英語プロンプト + image_inputs paths
 *
 * 重要:
 * - capability.ref_role_tagging=false なので image_inputs はフラット配列
 * - inline label を prompt に書く (capability.ref_role_tagging_note 通り「弱いが読まれる」)
 * - dialogue/narration/sfx は L10 SVG overlay で重ねるので画像内テキストは生成しない
 */
import type {
  PanelV2,
  ResolvedRefPacket,
  StoryboardPageV2,
  BibleSnapshotV2,
} from "../schemas-v2";

type ComposeArgs = {
  panel?: PanelV2;            // panel スコープ
  page?: StoryboardPageV2;    // page_one_shot スコープ
  packet: ResolvedRefPacket;
  bible: BibleSnapshotV2;
  pageDimensions: { width: number; height: number };
};

function characterRefDescription(panel: PanelV2, bible: BibleSnapshotV2): string {
  const lines: string[] = [];
  for (const ch of panel.entities.characters) {
    const c = bible.characters.find((x) => x.id === ch.character_id);
    if (!c) continue;
    const spec = c.spec ?? {};
    lines.push(
      `- ${c.name} (${ch.role}, ${ch.on_screen_via}): expression=${ch.expression}, ${spec.hair?.color ?? ""} ${spec.hair?.style ?? ""} hair, ${spec.eyes?.color ?? ""} ${spec.eyes?.shape ?? ""} eyes, wearing ${spec.outfit_default?.outerwear ?? "default outfit"}`
    );
  }
  return lines.join("\n");
}

function locationDescription(panel: PanelV2, bible: BibleSnapshotV2): string {
  const l = bible.locations.find((x) => x.id === panel.entities.location_id);
  if (!l) return "";
  return `Location: ${l.name}. ${l.spec.atmosphere ?? ""} Lighting: ${l.spec.lighting_default ?? ""}`;
}

function styleHeader(bible: BibleSnapshotV2): string {
  return [
    bible.style_directives.global,
    `Scene tone overrides available: ${Object.keys(bible.style_directives.scene_overrides).join(", ")}.`,
  ].join("\n");
}

function negativesBlock(): string {
  return [
    "NEGATIVES (must avoid):",
    "- NO color, NO airbrushed soft skin gradients, NO 3D-render shading, NO photorealistic shading",
    "- NO speech bubbles, NO dialogue text, NO sound effect text, NO narration boxes drawn IN the image (these are added later as SVG overlay)",
    "- NO page numbers, NO signatures, NO watermarks, NO studio logos",
    "- Hands and fingers must look natural; render no more than five fingers per hand",
    "- Backgrounds MINIMAL. Use the FEWEST lines needed. Empty white space is intentional.",
  ].join("\n");
}

export function composePanelPrompt(args: ComposeArgs): { prompt: string; refImagePaths: string[] } {
  if (!args.panel) throw new Error("composePanelPrompt requires panel");
  const p = args.panel;
  const inlineLabels = args.packet.refs
    .map((r, i) => `<ref#${i + 1}> (${r.role}${r.target_entity_id ? ` for ${r.target_entity_id}` : ""}, weight ${r.weight.toFixed(2)})`)
    .join("\n");

  const sections = [
    `B6 portrait Japanese seinen manga PANEL (${args.pageDimensions.width}x${args.pageDimensions.height} px), single panel in BLACK AND WHITE only with screentone and hatching.`,
    "",
    "ART STYLE:",
    styleHeader(args.bible),
    "",
    "REFERENCE IMAGES (passed via image_inputs in this order):",
    inlineLabels,
    "",
    `SHOT: ${p.shot_type} / camera=${p.camera}${p.bleed ? " / BLEED edges" : ""}${p.silence ? " / SILENT atmospheric" : ""}, importance=${p.importance}/5`,
    "",
    "CHARACTERS IN PANEL:",
    characterRefDescription(p, args.bible),
    "",
    locationDescription(p, args.bible),
    "",
    `Action: ${p.action}`,
    `Visual focus: ${p.key_visual}`,
    "",
    "MUST PRESERVE invariants from continuity refs (face geometry, outfit details, location layout). Match line weight and screentone density of refs.",
    "",
    negativesBlock(),
  ];

  return {
    prompt: sections.filter(Boolean).join("\n"),
    refImagePaths: args.packet.refs.map((r) => r.path),
  };
}

export function composePagePrompt(args: ComposeArgs): { prompt: string; refImagePaths: string[] } {
  if (!args.page) throw new Error("composePagePrompt requires page");
  const page = args.page;
  const inlineLabels = args.packet.refs
    .map((r, i) => `<ref#${i + 1}> (${r.role}${r.target_entity_id ? ` for ${r.target_entity_id}` : ""}, weight ${r.weight.toFixed(2)})`)
    .join("\n");

  const panelLines = page.panels.map((p, idx) => {
    const cs = p.entities.characters.map((c) => {
      const ent = args.bible.characters.find((x) => x.id === c.character_id);
      return `${ent?.name ?? c.character_id} (${c.role}, ${c.on_screen_via}, expr=${c.expression})`;
    }).join("; ");
    const loc = args.bible.locations.find((x) => x.id === p.entities.location_id)?.name ?? p.entities.location_id;
    return [
      `PANEL #${p.panel_no} (reading order ${p.reading_order}, ${p.shot_type}, ${p.camera}${p.bleed ? ", BLEED" : ""}${p.silence ? ", SILENT" : ""}):`,
      `  Characters: ${cs || "none"}.`,
      `  Location: ${loc}.`,
      `  Action: ${p.action}.`,
      `  Visual focus: ${p.key_visual}.`,
    ].join("\n");
  }).join("\n\n");

  const sections = [
    `B6 portrait Japanese seinen manga PAGE (${args.pageDimensions.width}x${args.pageDimensions.height} px), single page in BLACK AND WHITE only with screentone and hatching.`,
    "",
    "ART STYLE:",
    styleHeader(args.bible),
    "",
    "REFERENCE IMAGES (passed via image_inputs in this order):",
    inlineLabels,
    "",
    `PAGE LAYOUT: ${page.panels.length} panels, RTL reading order, page_role=${page.page_role}.`,
    "",
    panelLines,
    "",
    "MUST PRESERVE invariants from continuity refs across all panels of this page (same character face/outfit, same location layout).",
    "",
    negativesBlock(),
  ];

  return {
    prompt: sections.filter(Boolean).join("\n"),
    refImagePaths: args.packet.refs.map((r) => r.path),
  };
}
