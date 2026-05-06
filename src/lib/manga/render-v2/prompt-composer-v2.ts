/**
 * L9 Render: prompt composer v2
 *
 * panel (storyboard) + resolved_refs + bible.style_directives →
 *   gpt-image-2 / RenderAdapter に渡す英語プロンプト + image_inputs paths
 *
 * 重要:
 * - capability.ref_role_tagging=false なので image_inputs はフラット配列
 * - inline label を prompt に書く (capability.ref_role_tagging_note 通り「弱いが読まれる」)
 * - dialogue/monologue/narration/sfx は **画像内に直接描画** する (吹き出しごと, ナレーション枠ごと, 擬音ごと)
 *   旧 SVG overlay 方式は撤回。AI に typesetting/レイアウトを任せる。
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
  /**
   * Phase C: 修正指示 UI から渡されるユーザー追加指示。
   * 指定時は negatives 直前に "ADDITIONAL DIRECTIVE FROM EDITOR" として注入。
   * 既存 prompt 構造には影響しないので、未指定時は v2 出力と完全一致。
   */
  userInstructions?: string;
};

function userInstructionsBlock(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  return [
    "## ADDITIONAL DIRECTIVE FROM EDITOR (override conflicting defaults above):",
    s.trim(),
  ].join("\n");
}

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
    "- NO color, NO 3D-render shading, NO photorealistic shading",
    "- NO page numbers, NO signatures, NO watermarks, NO studio logos",
    "- Hands and fingers must look natural; render no more than five fingers per hand",
    "- Background density should match the scene: establishing/dungeon/world-intro panels can have moderate fantasy/setting iconography (torches, stone walls, magic circles, urban signage); dialogue-only panels stay minimal",
    "- NO English dialogue. All in-panel text must be Japanese (kanji/kana) using a typical Japanese manga font.",
  ].join("\n");
}

/**
 * panel.dialogue / monologue / narration / sfx を「画像内に直接描く」指示文に変換。
 * 吹き出し・ナレーション枠・擬音を AI 側で typeset させる方針 (旧 SVG overlay は撤回)。
 */
function inPanelTextBlock(panel: PanelV2, bible: BibleSnapshotV2): string | null {
  const hasAny =
    panel.dialogue.length > 0 ||
    panel.monologue.length > 0 ||
    panel.narration.length > 0 ||
    panel.sfx.length > 0;
  if (!hasAny) return null;

  const charName = (id: string) => bible.characters.find((c) => c.id === id)?.name ?? id;
  const lines: string[] = [
    "IN-PANEL TEXT (must be drawn INSIDE the image as part of the manga page):",
  ];

  if (panel.dialogue.length > 0) {
    lines.push("Speech bubbles (rounded oval bubbles with tail pointing to speaker, Japanese vertical text right-to-left):");
    for (const d of panel.dialogue) {
      lines.push(`  - ${charName(d.character_id)}: 「${d.text}」`);
    }
  }
  if (panel.monologue.length > 0) {
    lines.push("Inner monologue (square/angular bubbles WITHOUT tail, or thought-cloud, vertical Japanese text):");
    for (const m of panel.monologue) {
      lines.push(`  - ${charName(m.character_id)} (thinks): 「${m.text}」`);
    }
  }
  if (panel.narration.length > 0) {
    lines.push("Narration boxes (rectangular caption boxes, typically top or bottom of panel, vertical Japanese):");
    for (const n of panel.narration) {
      lines.push(`  - ${n}`);
    }
  }
  if (panel.sfx.length > 0) {
    lines.push("Sound effects / onomatopoeia (hand-drawn katakana/hiragana, dynamic shape, integrated into the artwork):");
    for (const s of panel.sfx) {
      lines.push(`  - ${s}`);
    }
  }
  lines.push(
    "All text MUST be drawn INSIDE the image. Use authentic Japanese manga lettering style. Do NOT translate to English. Do NOT leave blank balloons.",
  );
  return lines.join("\n");
}

export function composePanelPrompt(args: ComposeArgs): { prompt: string; refImagePaths: string[] } {
  if (!args.panel) throw new Error("composePanelPrompt requires panel");
  const p = args.panel;
  const inlineLabels = args.packet.refs
    .map((r, i) => `<ref#${i + 1}> (${r.role}${r.target_entity_id ? ` for ${r.target_entity_id}` : ""}, weight ${r.weight.toFixed(2)})`)
    .join("\n");

  const sections = [
    `B6 portrait Japanese light novel comicalization PANEL (${args.pageDimensions.width}x${args.pageDimensions.height} px), single panel in BLACK AND WHITE only with screentone and hatching. Style tradition: Young Ace / Comic Walker / カドコミ系 narou-kei comicalization (expressive character-driven art, large emotive eyes, light novel cover lineage), NOT seinen-realism.`,
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
    inPanelTextBlock(p, args.bible),
    "",
    "MUST PRESERVE invariants from continuity refs (face geometry, outfit details, location layout). Match line weight and screentone density of refs.",
    "",
    userInstructionsBlock(args.userInstructions),
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

  const charName = (id: string) => args.bible!.characters.find((c) => c.id === id)?.name ?? id;
  const panelLines = page.panels.map((p, idx) => {
    const cs = p.entities.characters.map((c) => {
      const ent = args.bible.characters.find((x) => x.id === c.character_id);
      return `${ent?.name ?? c.character_id} (${c.role}, ${c.on_screen_via}, expr=${c.expression})`;
    }).join("; ");
    const loc = args.bible.locations.find((x) => x.id === p.entities.location_id)?.name ?? p.entities.location_id;
    const lines = [
      `PANEL #${p.panel_no} (reading order ${p.reading_order}, ${p.shot_type}, ${p.camera}${p.bleed ? ", BLEED" : ""}${p.silence ? ", SILENT" : ""}):`,
      `  Characters: ${cs || "none"}.`,
      `  Location: ${loc}.`,
      `  Action: ${p.action}.`,
      `  Visual focus: ${p.key_visual}.`,
    ];
    if (p.dialogue.length > 0) {
      lines.push(`  Speech bubbles (oval bubble + tail pointing to speaker, Japanese vertical text):`);
      for (const d of p.dialogue) lines.push(`    - ${charName(d.character_id)}: 「${d.text}」`);
    }
    if (p.monologue.length > 0) {
      lines.push(`  Inner monologue (square/thought bubble, vertical Japanese):`);
      for (const m of p.monologue) lines.push(`    - ${charName(m.character_id)} (thinks): 「${m.text}」`);
    }
    if (p.narration.length > 0) {
      lines.push(`  Narration boxes (rectangular caption, vertical Japanese):`);
      for (const n of p.narration) lines.push(`    - ${n}`);
    }
    if (p.sfx.length > 0) {
      lines.push(`  Sound effects (hand-drawn katakana/hiragana, integrated into artwork):`);
      for (const s of p.sfx) lines.push(`    - ${s}`);
    }
    return lines.join("\n");
  }).join("\n\n");

  const sections = [
    `B6 portrait Japanese light novel comicalization PAGE (${args.pageDimensions.width}x${args.pageDimensions.height} px), single page in BLACK AND WHITE only with screentone and hatching. Style tradition: Young Ace / Comic Walker / カドコミ系 narou-kei comicalization (expressive character-driven art, large emotive eyes, light novel cover lineage), NOT seinen-realism.`,
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
    userInstructionsBlock(args.userInstructions),
    negativesBlock(),
  ];

  return {
    prompt: sections.filter(Boolean).join("\n"),
    refImagePaths: args.packet.refs.map((r) => r.path),
  };
}
