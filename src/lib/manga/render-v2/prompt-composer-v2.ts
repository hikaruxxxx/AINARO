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
  BackgroundTreatment,
  PanelV2,
  PagePlanPage,
  PagePlanPanel,
  ResolvedRefPacket,
  StoryboardPageV2,
  BibleSnapshotV2,
} from "../schemas-v2";

const PAGE_W = 1748;
const PAGE_H = 2480;

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
  /**
   * 2026-05-06 追加。panel スコープでは単一値、page_one_shot スコープでは
   * panel_id → BackgroundTreatment の Map。両方 undefined OK (現行挙動)。
   * RULE 11 と整合した「背景描き込みの粒度」を prompt に直接書き込む。
   */
  backgroundTreatment?: BackgroundTreatment;
  pageBackgroundTreatments?: Map<string, BackgroundTreatment>;
  /** page_one_shot 用。指定時は LAYOUT GEOMETRY セクションをプロンプトに注入 */
  pagePlanPage?: PagePlanPage;
};

/**
 * background_treatment 別のプロンプト直接指示。pattern dictionary 由来の slot
 * メタ + RULE 11 の ref 抑制と一致した「LLM への描画指令」を出す。
 */
function backgroundDirective(t: BackgroundTreatment | undefined): string | null {
  switch (t) {
    case "detailed_bg":
      return "BACKGROUND DIRECTIVE: Draw the location/environment with clear, iconographic background detail (interior fixtures, dungeon walls, urban silhouettes, etc.). Match the screentone density of the location reference if provided.";
    case "atmospheric_fade":
      return [
        "BACKGROUND DIRECTIVE (atmospheric_fade — STRICT):",
        "- DO NOT draw walls, ceilings, floors, room interiors, building exteriors, or distant scenery as a fully filled environment.",
        "- The character/subject is the ONLY fully drawn element. Around it, leave white paper, sparse speedlines, screentone bursts, or simple radial focus lines.",
        "- If you would normally draw a room or street, replace 80%+ of that area with WHITE/SCREENTONE NEGATIVE SPACE. Only suggest the location with 1-2 minimal silhouette hints touching the subject area, NOT a full background fill.",
        "- This is a manga 'atmospheric fade' panel — like the inside of a dialogue close-up where the world drops away. Less is more.",
      ].join("\n");
    case "tone_back":
      return "BACKGROUND DIRECTIVE: SOLID SCREENTONE ONLY. No drawn environment, no walls, no scenery, no horizon line. The entire background is a flat tone (uniform dot pattern or simple gradient) used to convey emotion or pause. The subject (character/object) is the only drawn element on top of the tone.";
    case "solid_white":
      return "BACKGROUND DIRECTIVE: PURE WHITE paper background. No drawing in the background area at all. Only the subject is rendered.";
    case "solid_black":
      return "BACKGROUND DIRECTIVE: PURE BLACK void as background. No drawn environment. Only minimal subject silhouette or text on the black field.";
    case "floating_ui":
      return "BACKGROUND DIRECTIVE: This panel IS a UI/HUD/SNS/news artifact (status screen, app interface, posted message, etc.). Render the UI element ITSELF as the entire panel content. Do NOT include character or location around the UI; the UI is the picture.";
    case "unspecified":
    case undefined:
      return null;
  }
}

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

export type PanelTextValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function extractForbiddenKeywords(term: string): string[] {
  const withoutNotes = term.replace(/[（(].*?[）)]/g, "");
  return withoutNotes
    .split(/[／/]/)
    .map((part) => part.replace(/[『』「」【】]/g, "").trim())
    .filter(Boolean);
}

export function validatePanelText(
  panel: PanelV2,
  bible: BibleSnapshotV2,
): PanelTextValidationResult {
  const forbidden = bible.world.lexicon?.forbidden_terms_global ?? [];
  const textEntries: Array<{ field: string; text: string }> = [
    ...panel.dialogue.map((d) => ({ field: "dialogue", text: d.text })),
    ...panel.monologue.map((m) => ({ field: "monologue", text: m.text })),
    ...panel.narration.map((text) => ({ field: "narration", text })),
    ...panel.sfx.map((text) => ({ field: "sfx", text })),
  ];

  for (const entry of textEntries) {
    for (const term of forbidden) {
      for (const keyword of extractForbiddenKeywords(term)) {
        if (entry.text.includes(keyword)) {
          return {
            ok: false,
            reason: `forbidden term in ${entry.field}: ${term}`,
          };
        }
      }
    }
  }
  return { ok: true };
}

function panelTextValidationWarning(
  panel: PanelV2,
  bible: BibleSnapshotV2,
): string | null {
  const validation = validatePanelText(panel, bible);
  if (validation.ok) return null;
  const message = `[prompt-composer-v2] panel ${panel.panel_id}: ${validation.reason}. Storyboard L4 text should be regenerated or corrected before render.`;
  console.warn(message);
  return [
    "TEXT QUALITY WARNING:",
    `- ${message}`,
    "- Do not normalize or preserve this forbidden wording in final in-panel text. Fix the storyboard upstream before production render.",
  ].join("\n");
}

/**
 * page_plan の rect / polygon 情報を page_one_shot prompt に注入する。
 * panel#N は Storyboard 側の panel_no と一致させる。
 */
function buildLayoutGeometryBlock(
  pagePlanPage: PagePlanPage,
  panelNoByPanelId: Map<string, number>,
): string {
  type Slot = {
    ro: number;
    panelNo: number;
    col: string;
    row: string;
    wPct: number;
    hPct: number;
    areaPct: number;
    poly: number;
    bleed: boolean;
    imp: number;
    bg: string | undefined;
    isHero: boolean;
    tilt: number | undefined;
    borderless: boolean;
    bleedPoly: boolean;
  };

  const slots: Slot[] = pagePlanPage.panels.map((pp: PagePlanPanel) => {
    const wPct = (pp.rect.w / PAGE_W) * 100;
    const hPct = (pp.rect.h / PAGE_H) * 100;
    const areaPct = ((pp.rect.w * pp.rect.h) / (PAGE_W * PAGE_H)) * 100;
    const cx = pp.rect.x + pp.rect.w / 2;
    const cy = pp.rect.y + pp.rect.h / 2;
    const col = wPct >= 85
      ? "FULL_WIDTH"
      : cx < PAGE_W * 0.4
        ? "LEFT"
        : cx > PAGE_W * 0.6
          ? "RIGHT"
          : "CENTER";
    const row = cy < PAGE_H * 0.33
      ? "TOP"
      : cy < PAGE_H * 0.66
        ? "MIDDLE"
        : "BOTTOM";
    const poly = pp.polygon?.length ?? 4;
    const bleed =
      pp.rect.x < 30 ||
      pp.rect.y < 30 ||
      pp.rect.x + pp.rect.w > PAGE_W - 30 ||
      pp.rect.y + pp.rect.h > PAGE_H - 30;
    return {
      ro: pp.reading_order,
      panelNo: panelNoByPanelId.get(pp.panel_id) ?? pp.reading_order,
      col,
      row,
      wPct: Math.round(wPct),
      hPct: Math.round(hPct),
      areaPct: Math.round(areaPct),
      poly,
      bleed,
      imp: pp.importance,
      bg: pp.background_treatment,
      isHero: false,
      tilt: pp.tilt_deg,
      borderless: !!pp.is_borderless,
      bleedPoly: !!pp.bleed_polygon,
    };
  }).sort((a, b) => a.ro - b.ro);

  // hero 判定: importance + areaPct 上位1コマ
  const sortedByPriority = [...slots].sort(
    (a, b) => (b.imp * 10 + b.areaPct) - (a.imp * 10 + a.areaPct),
  );
  if (sortedByPriority[0]) {
    const hero = slots.find((s) => s.ro === sortedByPriority[0].ro);
    if (hero) hero.isHero = true;
  }

  const panelLabel = (s: Slot) => `panel#${s.panelNo}`;
  const lines: string[] = [
    "## LAYOUT GEOMETRY (CRITICAL — page is NOT a uniform grid):",
    "",
  ];

  for (const s of slots) {
    const polyTag = s.poly > 4 ? `, IRREGULAR ${s.poly}-SIDED POLYGON edge` : "";
    const bleedTag = (s.bleed || s.bleedPoly) ? ", BLEEDS to page edge (no margin)" : "";
    const tiltTag = (s.tilt && Math.abs(s.tilt) >= 1) ? `, TILTED ${s.tilt > 0 ? "+" : ""}${s.tilt}° (slanted frame)` : "";
    const borderlessTag = s.borderless ? ", BORDERLESS (no frame line)" : "";
    const heroTag = s.isHero ? " ← HERO PANEL (largest, most prominent)" : "";
    const sizeWord = s.areaPct >= 50
      ? "FULL-PAGE SPLASH"
      : s.areaPct >= 25
        ? "LARGE"
        : s.areaPct >= 12
          ? "medium"
          : "SMALL inset";
    lines.push(
      `- ${panelLabel(s)} (importance ${s.imp}/5${heroTag}): ${s.row} ${s.col}, ${sizeWord} (${s.wPct}% width × ${s.hPct}% height)${polyTag}${tiltTag}${bleedTag}${borderlessTag}.${s.bg ? ` bg_treatment=${s.bg}.` : ""}`,
    );
  }

  const flow = slots.map(panelLabel).join(" → ");
  lines.push("");
  lines.push(`READING FLOW (RTL, top→bottom): ${flow}.`);
  lines.push("");
  lines.push("STRICT LAYOUT CONSTRAINTS:");
  lines.push("- Panel SIZES vary deliberately. Reproduce the relative widths/heights above. Do NOT default to a regular 2x3 or 3x2 grid.");
  lines.push("- HERO panel must visibly dominate the page (largest area, most rendered detail).");
  lines.push("- SMALL insets must stay small — they are beat/reaction frames, not equal-weight panels.");
  const polyPanels = slots.filter((s) => s.poly > 4);
  if (polyPanels.length > 0) {
    lines.push(`- Panels with IRREGULAR POLYGON edges (${polyPanels.map(panelLabel).join(", ")}) should have non-rectangular borders (angled cut, slanted edge, or bleeding into adjacent panel).`);
  }
  const bleedPanels = slots.filter((s) => s.bleed || s.bleedPoly);
  if (bleedPanels.length > 0) {
    lines.push(`- BLEED panels (${bleedPanels.map(panelLabel).join(", ")}) extend artwork to the page edge with no white margin on the bleed side.`);
  }
  lines.push("- Maintain consistent gutter (white space) of ~3-5% page width between non-bleed panels.");

  return lines.join("\n");
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
  const warning = panelTextValidationWarning(panel, bible);
  if (warning) lines.push(warning);

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
    backgroundDirective(args.backgroundTreatment),
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
  const geometryBlock: string | null = args.pagePlanPage
    ? buildLayoutGeometryBlock(
      args.pagePlanPage,
      new Map(page.panels.map((p) => [p.panel_id, p.panel_no])),
    )
    : null;
  const inlineLabels = args.packet.refs
    .map((r, i) => `<ref#${i + 1}> (${r.role}${r.target_entity_id ? ` for ${r.target_entity_id}` : ""}, weight ${r.weight.toFixed(2)})`)
    .join("\n");

  const charName = (id: string) => args.bible!.characters.find((c) => c.id === id)?.name ?? id;
  const panelLines = page.panels.map((p) => {
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
    const warning = panelTextValidationWarning(p, args.bible);
    if (warning) lines.push(`  ${warning.replace(/\n/g, "\n  ")}`);
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
    // 2026-05-06 追加: panel ごとの bg_treatment 指示 (page_one_shot 用)
    const bg = args.pageBackgroundTreatments?.get(p.panel_id);
    const bgLine = backgroundDirective(bg);
    if (bgLine) lines.push(`  ${bgLine}`);
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
    geometryBlock,
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
