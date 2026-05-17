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
import {
  activeCostumeFor,
  sceneOverrideTextFor,
  summarizeCharacterForEpisode,
  summarizeLocationForScene,
  summarizeMotifForPanel,
  summarizeWorldRulesForScene,
} from "../bible/broker";
import {
  activeCostumeForV3FromV2,
  sceneOverrideTextForV3FromV2,
  summarizeCharacterForEpisodeV3FromV2,
  summarizeLocationForSceneV3FromV2,
  summarizeMotifForPanelV3FromV2,
  summarizeWorldRulesForSceneV3FromV2,
} from "../bible/broker-v3";
import {
  scanPrompt,
  scanText,
} from "../compliance/scanner";
import type {
  Blocklist,
  ComplianceFinding,
  FalsePositives,
} from "../compliance/types";
import type { Scene } from "../scene-graph/schema";

const PAGE_W = 1748;
const PAGE_H = 2480;
const MAX_PROMPT_CHARS = 8000;

type BibleTier = "deep" | "medium" | "minimal";
type PromptScene = Pick<
  Scene,
  | "beat_type"
  | "location_id"
  | "mode"
  | "key_visual_intent"
  | "time_axis"
  | "cast"
  | "wardrobe_state"
  | "world_rules_active"
  | "props_in_play"
> & {
  visual_motif_anchors?: Array<{
    motif_id?: string;
    motif_name?: string;
    intensity?: number;
  }>;
  theme_subtext?: Scene["theme_subtext"] | string;
};

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
  /** Phase 0-5: panel text compliance hard fail を有効にする場合のみ渡す */
  compliance?: { blocklist: Blocklist; fp: FalsePositives };
  /** bible broker 用。未指定時は episode 1 として圧縮要約を作る */
  episodeNo?: number;
  /** scene graph 由来の文脈。panel スコープでは undefined OK */
  scene?: PromptScene;
  /** bible broker summary tier。未指定時は minimal */
  bibleTier?: BibleTier;
  /**
   * page_one_shot 用。未指定時 / "embed" の場合は既定挙動 (画像内に台詞テキストを描かせる)。
   * "shells_only" の場合は台詞本文を prompt に出さず、空の吹き出し/ナレーション枠/SFX outline
   * のみ生成させる (後段 post-typeset 層が text 合成する前提)。
   */
  typesetMode?: "embed" | "shells_only";
};

type ComposeResult = {
  prompt: string;
  refImagePaths: string[];
  tierUsed?: BibleTier;
};

function useBibleV3(): boolean {
  return process.env.USE_BIBLE_V3 !== "false";
}

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
        "BACKGROUND DIRECTIVE (atmospheric_fade — CRITICAL, NON-NEGOTIABLE):",
        "",
        "This panel is a manga 'atmospheric fade' / '抜きコマ' panel. The world drops away around the subject. ≥90% of the panel area MUST be blank white paper or simple screentone — NOT a drawn environment.",
        "",
        "ABSOLUTELY DO NOT DRAW:",
        "- Walls (interior or exterior), ceilings, floors, doorframes, windows",
        "- Room interiors (furniture, fixtures, posters, decorations)",
        "- Building exteriors, street scenes, urban silhouettes",
        "- Distant scenery (skyline, horizon, landscape, ground plane)",
        "- Architectural details of any kind (tiles, panels, beams, lighting fixtures)",
        "- Crowds, NPCs, or any background characters",
        "",
        "FAILURE EXAMPLES (these will be REJECTED by quality control):",
        "- Drawing a doorframe behind the character → REJECT",
        "- Drawing wall posters, signs, or decorations → REJECT",
        "- Drawing ceiling tiles or floor patterns → REJECT",
        "- Drawing a 'busy' detailed indoor environment → REJECT",
        "- Filling >10% of background with environment detail → REJECT",
        "",
        "ALLOWED IN BACKGROUND (use sparingly):",
        "- White/blank paper (this should be the dominant treatment)",
        "- Sparse speedlines (集中線) radiating from or around the subject",
        "- Screentone bursts (small clusters of dots, max 2-3 areas)",
        "- Radial focus lines pointing inward to the subject",
        "- 1-2 minimal silhouette HINTS touching the subject area only (e.g., a single short line suggesting an edge), NOT a full silhouette",
        "",
        "POSITIVE INSTRUCTION:",
        "- Think '寄りコマ' (close-up with the world cropped away) or '抜きコマ' (subject extracted onto blank paper).",
        "- The subject (character or object) is the ONLY fully drawn element.",
        "- The eye should rest on the subject; the background should fade INSTANTLY to white/tone.",
        "- Less is more. Empty space is the point — it amplifies emotion and reading rhythm.",
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

function compactBackgroundDirective(t: BackgroundTreatment | undefined): string | null {
  switch (t) {
    case "detailed_bg":
      return "BACKGROUND: draw clear location detail; match ref screentone density if provided.";
    case "atmospheric_fade":
      return "BACKGROUND: atmospheric fade / 抜きコマ. Keep >=90% blank white or sparse tone; no walls, furniture, architecture, crowds, or scenery.";
    case "tone_back":
      return "BACKGROUND: solid screentone only; no drawn environment.";
    case "solid_white":
      return "BACKGROUND: pure white paper; subject only.";
    case "solid_black":
      return "BACKGROUND: pure black void; minimal subject silhouette/text only.";
    case "floating_ui":
      return "BACKGROUND: panel is the UI/HUD/SNS/news artifact itself; no surrounding character/location.";
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

function characterRefDescription(
  panel: PanelV2,
  bible: BibleSnapshotV2,
  args: { episodeNo: number; tier?: BibleTier },
): string {
  const blocks: string[] = [];
  for (const ch of panel.entities.characters) {
    const summary = useBibleV3()
      ? summarizeCharacterForEpisodeV3FromV2(
          bible,
          args.episodeNo,
          ch.character_id,
          { tier: args.tier ?? "minimal" },
        )
      : summarizeCharacterForEpisode(
          bible,
          args.episodeNo,
          ch.character_id,
          { tier: args.tier ?? "minimal" },
        );
    blocks.push(`- ${summary} (role=${ch.role}, on_screen_via=${ch.on_screen_via}, expression=${ch.expression})`);
  }
  return blocks.join("\n");
}

function locationSceneForPanel(panel: PanelV2, scene?: PromptScene): Pick<Scene, "location_id" | "mode" | "beat_type"> {
  return {
    location_id: scene?.location_id ?? panel.entities.location_id,
    mode: scene?.mode ?? "dialogue",
    beat_type: scene?.beat_type ?? "setup",
  };
}

function locationDescription(panel: PanelV2, bible: BibleSnapshotV2, scene?: PromptScene, tier: BibleTier = "minimal"): string {
  return useBibleV3()
    ? summarizeLocationForSceneV3FromV2(bible, locationSceneForPanel(panel, scene), { tier })
    : summarizeLocationForScene(bible, locationSceneForPanel(panel, scene), { tier });
}

function styleOverrideBlock(scene: Pick<Scene, "mode" | "beat_type"> | undefined, bible: BibleSnapshotV2): string {
  // 2026-05-12: digest があれば優先、無ければ global (full text) にフォールバック
  const base = (bible.style_directives.digest && bible.style_directives.digest.trim().length > 0)
    ? bible.style_directives.digest
    : bible.style_directives.global;
  const blocks = [base];
  if (scene) {
    const override = useBibleV3()
      ? sceneOverrideTextForV3FromV2(bible, scene)
      : sceneOverrideTextFor(bible, scene);
    if (override) blocks.push(override);
  }
  return blocks.filter((block) => block.trim().length > 0).join("\n");
}

function motifBlock(
  scene: Pick<Scene, "beat_type" | "location_id" | "mode" | "key_visual_intent"> & {
    visual_motif_anchors?: PromptScene["visual_motif_anchors"];
  } | undefined,
  bible: BibleSnapshotV2,
  tier: BibleTier = "minimal",
  panel: { panel_no: number },
): string | null {
  if (!scene) return null;
  const summary = useBibleV3()
    ? summarizeMotifForPanelV3FromV2(bible, panel, scene, { tier })
    : summarizeMotifForPanel(bible, panel, scene, { tier });
  if (!summary) return null;
  return [
    "RECURRING VISUAL MOTIFS (must include):",
    summary,
  ].join("\n");
}

function costumeBlock(
  panel: PanelV2,
  episodeNo: number,
  bible: BibleSnapshotV2,
  tier: BibleTier = "minimal",
): string | null {
  const lines: string[] = [];
  for (const ch of panel.entities.characters) {
    const active = useBibleV3()
      ? activeCostumeForV3FromV2(bible, episodeNo, ch.character_id)
      : activeCostumeFor(bible, episodeNo, ch.character_id);
    if (active.source === "costume" && active.spec) {
      const outfit = [active.spec.outerwear, active.spec.top].filter(Boolean).join(" ");
      const state = tier === "minimal"
        ? firstChars(active.spec.state_description ?? "", 70)
        : active.spec.state_description ?? "";
      lines.push(`- ${ch.character_id} wears ${outfit} (state: ${state})`);
    }
  }
  if (lines.length === 0) return null;
  return [
    "ACTIVE COSTUMES (override outfit_default):",
    ...lines,
  ].join("\n");
}

function worldRuleBlock(
  scene: Pick<Scene, "location_id" | "beat_type" | "mode" | "time_axis"> | undefined,
  bible: BibleSnapshotV2,
  tier: BibleTier = "minimal",
): string | null {
  if (!scene) return null;
  const summary = useBibleV3()
    ? summarizeWorldRulesForSceneV3FromV2(bible, scene, { tier })
    : summarizeWorldRulesForScene(bible, scene, { tier });
  if (!summary) return null;
  return [
    "WORLD CONSTRAINTS:",
    summary,
  ].join("\n");
}

function wardrobeStateBlock(
  scene: PromptScene | undefined,
  bible: BibleSnapshotV2,
  panel: PanelV2,
  tier: BibleTier = "minimal",
): string | null {
  if (!scene?.wardrobe_state || scene.wardrobe_state.length === 0) return null;
  const panelCharIds = new Set(panel.entities.characters.map((c) => c.character_id));
  const maxEntries = tier === "minimal" ? 3 : tier === "medium" ? 5 : scene.wardrobe_state.length;
  const entries = scene.wardrobe_state
    .filter((ws) => panelCharIds.has(ws.character_id))
    .slice(0, maxEntries)
    .map((ws) => {
      const costume = bible.costumes.find((c) => c.id === ws.costume_id);
      const charName = bible.characters.find((c) => c.id === ws.character_id)?.name ?? ws.character_id;
      const outfit = costume?.spec
        ? [costume.spec.outerwear, costume.spec.top].filter(Boolean).join(" ")
        : ws.costume_id;
      return `- ${charName} (${ws.character_id}): ${firstChars(outfit || ws.costume_id, 90)}`;
    });
  if (entries.length === 0) return null;
  return ["SCENE WARDROBE STATE (must match):", ...entries].join("\n");
}

function activeWorldRulesBlock(
  scene: PromptScene | undefined,
  tier: BibleTier = "minimal",
): string | null {
  if (!scene?.world_rules_active || scene.world_rules_active.length === 0) return null;
  const limit = tier === "minimal" ? 2 : tier === "medium" ? 3 : 4;
  const rules = scene.world_rules_active.slice(0, limit).map((rule) => firstChars(rule, 140));
  return [
    "ACTIVE WORLD RULES IN THIS SCENE (must respect; do not contradict):",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}

function propsInPlayBlock(
  scene: PromptScene | undefined,
  bible: BibleSnapshotV2,
  panel: PanelV2,
): string | null {
  if (!scene?.props_in_play || scene.props_in_play.length === 0) return null;
  const panelCharIds = new Set(panel.entities.characters.map((c) => c.character_id));
  const entries = scene.props_in_play.slice(0, 4).map((p) => {
    const prop = bible.props.find((bp) => bp.id === p.prop_id);
    const propName = prop?.name ?? p.prop_id;
    const propDesc = prop?.spec.visual_description
      ? firstChars(prop.spec.visual_description, 80)
      : "";
    const heldByName = p.held_by && panelCharIds.has(p.held_by)
      ? bible.characters.find((c) => c.id === p.held_by)?.name ?? p.held_by
      : null;
    const holderText = heldByName ? ` (held by ${heldByName})` : "";
    return `- ${propName}${holderText}${propDesc ? `: ${propDesc}` : ""}`;
  });
  return ["PROPS IN PLAY (include if visually relevant):", ...entries].join("\n");
}

function themeSubtextBlock(scene: PromptScene | undefined): string | null {
  if (!scene?.theme_subtext) return null;
  const ts = scene.theme_subtext;
  const text = typeof ts === "string" ? ts : ts.how_it_surfaces;
  if (!text || !text.trim()) return null;
  return [
    "SCENE EMOTIONAL THEME (subtext, render to convey this mood):",
    `- ${firstChars(text, 160)}`,
  ].join("\n");
}

function compactPageBibleContext(
  panel: PanelV2,
  bible: BibleSnapshotV2,
  args: { episodeNo: number; scene?: PromptScene; tier: BibleTier; maxChars: number },
): string {
  const characters = firstChars(
    characterRefDescription(panel, bible, { episodeNo: args.episodeNo, tier: args.tier }).replace(/\n/gu, " / "),
    Math.max(70, Math.floor(args.maxChars * 0.35)),
  );
  const location = firstChars(
    locationDescription(panel, bible, args.scene, args.tier),
    Math.max(45, Math.floor(args.maxChars * 0.18)),
  );
  const costume = firstChars(
    (costumeBlock(panel, args.episodeNo, bible, args.tier) ?? "").replace(/\n/gu, " / "),
    Math.max(0, Math.floor(args.maxChars * 0.12)),
  );
  const motif = firstChars(
    (motifBlock(args.scene, bible, args.tier, { panel_no: panel.panel_no }) ?? "")
      .replace("RECURRING VISUAL MOTIFS (must include):", "")
      .replace(/\n/gu, " / "),
    Math.max(90, Math.floor(args.maxChars * 0.25)),
  );

  return firstChars(
    [
      `PANEL #${panel.panel_no} BIBLE:`,
      `Characters: ${characters}`,
      `Location: ${location}`,
      motif ? `Motif: ${motif}` : null,
      costume ? `Costume: ${costume}` : null,
    ].filter((line): line is string => line !== null).join("\n"),
    args.maxChars,
  );
}

function warnIfPromptTooLarge(prompt: string): void {
  if (prompt.length > MAX_PROMPT_CHARS) {
    console.warn(
      `[prompt-composer-v2] prompt size ${prompt.length} exceeds threshold ${MAX_PROMPT_CHARS}. Consider tier="minimal".`,
    );
  }
}

function warnTierDowngrade(tier: BibleTier, promptLength: number): void {
  console.warn(
    `[prompt-composer-v2] tier=${tier} size=${promptLength} > ${MAX_PROMPT_CHARS}, downgrading`,
  );
}

function composeWithSizeFallback(
  args: ComposeArgs,
  composeCore: (args: ComposeArgs) => ComposeResult,
): ComposeResult {
  const tiers: BibleTier[] = args.bibleTier ? [args.bibleTier, "minimal"] : ["minimal"];
  const seen = new Set<BibleTier>();
  let last: ComposeResult | null = null;

  for (const tier of tiers) {
    if (seen.has(tier)) continue;
    seen.add(tier);
    const result = composeCore({ ...args, bibleTier: tier });
    last = { ...result, tierUsed: tier };
    if (result.prompt.length <= MAX_PROMPT_CHARS) return last;
    if (tier !== "minimal") warnTierDowngrade(tier, result.prompt.length);
  }

  return last ?? { ...composeCore({ ...args, bibleTier: "minimal" }), tierUsed: "minimal" };
}

function firstChars(text: string, max: number): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function mangaTechniqueMandatoryBlock(): string {
  return [
    "MANGA TECHNIQUE (MANDATORY — do NOT relax):",
    "- Black ink linework with weight modulation; visible screentone/hatching; no soft or smooth tonal gradients.",
    "- Hard white highlights and strong black/white contrast. Vary screentone density by panel emotion; avoid uniform grey pages.",
  ].join("\n");
}

function negativesBlock(): string {
  return [
    "NEGATIVES (must avoid):",
    "- No color, 3D shading, photorealism, page numbers, signatures, watermarks, or logos.",
    "- Natural hands only, max five fingers per hand. No English dialogue; all in-panel text must be Japanese manga lettering.",
    "- Background density follows scene role: establishing/world panels can be moderate; dialogue-only panels stay minimal.",
  ].join("\n");
}

export type PanelTextValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      severity: "fatal" | "warn";
      findings?: ComplianceFinding[];
    };

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
  options?: {
    /** 既定 false。true にすると forbidden_terms_global 違反を fatal severity で返す。 */
    treatForbiddenAsFatal?: boolean;
  },
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
            severity: options?.treatForbiddenAsFatal ? "fatal" : "warn",
          };
        }
      }
    }
  }
  return { ok: true };
}

function textComplianceEntries(panel: PanelV2): Array<{ fieldPath: string; text: string }> {
  return [
    ...panel.dialogue.map((d, index) => ({
      fieldPath: `panel.${panel.panel_id}.dialogue[${index}]`,
      text: d.text,
    })),
    ...panel.monologue.map((m, index) => ({
      fieldPath: `panel.${panel.panel_id}.monologue[${index}]`,
      text: m.text,
    })),
    ...panel.narration.map((text, index) => ({
      fieldPath: `panel.${panel.panel_id}.narration[${index}]`,
      text,
    })),
    ...panel.sfx.map((text, index) => ({
      fieldPath: `panel.${panel.panel_id}.sfx[${index}]`,
      text,
    })),
  ];
}

function complianceResult(
  findings: ComplianceFinding[],
  options?: { treatAsFatal?: boolean },
): PanelTextValidationResult {
  if (findings.length === 0) return { ok: true };

  const hasFatal = findings.some((finding) => finding.severity === "fatal");
  const severity = hasFatal && options?.treatAsFatal !== false ? "fatal" : "warn";
  const summary = findings
    .slice(0, 3)
    .map((finding) => `${finding.field_path}: ${finding.matched_term} (${finding.category})`)
    .join("; ");
  const suffix = findings.length > 3 ? `; +${findings.length - 3} more` : "";
  return {
    ok: false,
    severity,
    reason: `compliance ${severity}: ${summary}${suffix}`,
    findings,
  };
}

export function validateAgainstCompliance(
  panel: PanelV2,
  bible: BibleSnapshotV2,
  blocklist: Blocklist,
  fp: FalsePositives,
  options?: {
    /** false にすると warn 相当のみ (test/dev 用)、既定 true で fatal stop */
    treatAsFatal?: boolean;
  },
): PanelTextValidationResult {
  void bible;
  const findings = textComplianceEntries(panel).flatMap((entry) =>
    scanText(entry.text, blocklist, fp, { fieldPath: entry.fieldPath })
  );
  return complianceResult(findings, options);
}

export function validatePromptAgainstCompliance(
  prompt: string,
  blocklist: Blocklist,
  fp: FalsePositives,
  options?: { treatAsFatal?: boolean },
): PanelTextValidationResult {
  return complianceResult(
    scanPrompt(prompt, blocklist, fp, { fieldPath: "render_prompt" }),
    options,
  );
}

function panelTextValidationWarning(
  panel: PanelV2,
  bible: BibleSnapshotV2,
  compliance?: { blocklist: Blocklist; fp: FalsePositives },
): string | null {
  const validation = validatePanelText(panel, bible);
  if (compliance) {
    const complianceValidation = validateAgainstCompliance(
      panel,
      bible,
      compliance.blocklist,
      compliance.fp,
      { treatAsFatal: true },
    );
    if (!complianceValidation.ok && complianceValidation.severity === "fatal") {
      throw new Error(
        `[prompt-composer-v2] panel ${panel.panel_id}: COMPLIANCE FATAL — ${complianceValidation.reason}`,
      );
    }
  }

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
    "Geometry (panel# = importance/5, row col, area W%xH%, tags):",
  ];

  // 2026-05-13 圧縮: 旧 1 行 130-170字 → 記号化で 50-70字に。
  // row: TOP/MIDDLE/BOTTOM → T/M/B、col: LEFT/RIGHT/CENTER/FULL_WIDTH → L/R/C/FW、
  // size: FULL-PAGE SPLASH/LARGE/medium/SMALL inset → XL/L/M/S。
  const shortRow = (r: string) => r === "TOP" ? "T" : r === "MIDDLE" ? "M" : r === "BOTTOM" ? "B" : r;
  const shortCol = (c: string) => c === "LEFT" ? "L" : c === "RIGHT" ? "R" : c === "CENTER" ? "C" : c === "FULL_WIDTH" ? "FW" : c;
  for (const s of slots) {
    const polyTag = s.poly > 4 ? `,poly${s.poly}` : "";
    const bleedTag = (s.bleed || s.bleedPoly) ? ",bleed" : "";
    const tiltTag = (s.tilt && Math.abs(s.tilt) >= 1) ? `,tilt${s.tilt > 0 ? "+" : ""}${s.tilt}°` : "";
    const borderlessTag = s.borderless ? ",borderless" : "";
    const heroTag = s.isHero ? " HERO" : "";
    const sizeWord = s.areaPct >= 50 ? "XL" : s.areaPct >= 25 ? "L" : s.areaPct >= 12 ? "M" : "S";
    lines.push(
      `- ${panelLabel(s)} ${s.imp}/5${heroTag} ${shortRow(s.row)}${shortCol(s.col)} ${sizeWord} ${s.wPct}x${s.hPct}${polyTag}${tiltTag}${bleedTag}${borderlessTag}`,
    );
  }

  const flow = slots.map(panelLabel).join(" → ");
  lines.push("");
  lines.push(`READING FLOW (RTL, top→bottom): ${flow}.`);
  lines.push("");
  // 2026-05-13 圧縮: 汎用ルール (gutter / hero支配 / grid 回避) は CONSTRAINTS に
  // 集約して page ごとには出さない。panel 固有 (polygon / bleed) のみ条件出力。
  const polyPanels = slots.filter((s) => s.poly > 4);
  if (polyPanels.length > 0) {
    lines.push(`- ${polyPanels.map(panelLabel).join(", ")}: non-rectangular border (angled cut / slanted edge / bleeding into adjacent panel).`);
  }
  const bleedPanels = slots.filter((s) => s.bleed || s.bleedPoly);
  if (bleedPanels.length > 0) {
    lines.push(`- ${bleedPanels.map(panelLabel).join(", ")}: artwork bleeds to the page edge on bleed side (no margin).`);
  }

  return lines.join("\n");
}

/**
 * panel.dialogue / monologue / narration / sfx を「画像内に直接描く」指示文に変換。
 * 吹き出し・ナレーション枠・擬音を AI 側で typeset させる方針 (旧 SVG overlay は撤回)。
 */
function inPanelTextBlock(
  panel: PanelV2,
  bible: BibleSnapshotV2,
  compliance?: { blocklist: Blocklist; fp: FalsePositives },
): string | null {
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
  const warning = panelTextValidationWarning(panel, bible, compliance);
  if (warning) lines.push(warning);

  if (panel.dialogue.length > 0) {
    lines.push("Speech bubbles (rounded oval bubbles with tail pointing to speaker, Japanese vertical text right-to-left):");
    for (const d of panel.dialogue) {
      const shapeTag = d.bubble_shape ? ` [bubble: ${d.bubble_shape}]` : "";
      const tailTag = d.tail_direction ? ` [tail toward ${d.tail_direction}]` : "";
      lines.push(`  - ${charName(d.character_id)}: 「${d.text}」${shapeTag}${tailTag}`);
    }
  }
  if (panel.monologue.length > 0) {
    lines.push("Inner monologue (square/angular bubbles WITHOUT tail, or thought-cloud, vertical Japanese text):");
    for (const m of panel.monologue) {
      const shapeTag = m.bubble_shape ? ` [bubble: ${m.bubble_shape}]` : "";
      lines.push(`  - ${charName(m.character_id)} (thinks): 「${m.text}」${shapeTag}`);
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
    "Each dialogue / monologue / narration / sfx item is associated with EXACTLY ONE panel (the one listed above). Do NOT duplicate the same bubble or caption across multiple panels — each speech bubble appears ONLY in its assigned panel.",
    "All text MUST be drawn INSIDE the image. Use authentic Japanese manga lettering style. Do NOT translate to English. Do NOT leave blank balloons.",
  );
  return lines.join("\n");
}

function composePanelPromptCore(args: ComposeArgs): ComposeResult {
  if (!args.panel) throw new Error("composePanelPrompt requires panel");
  const p = args.panel;
  const episodeNo = args.episodeNo ?? 1;
  const bibleTier = args.bibleTier ?? "minimal";
  const screentoneTag = p.screentone_intensity ? `, screentone=${p.screentone_intensity}` : "";
  const inlineLabels = args.packet.refs
    .map((r, i) => `<ref#${i + 1}> (${r.role}${r.target_entity_id ? ` for ${r.target_entity_id}` : ""}, weight ${r.weight.toFixed(2)})`)
    .join("\n");

  const sections = [
    `B6 portrait Japanese light novel comicalization PANEL (${args.pageDimensions.width}x${args.pageDimensions.height} px), single panel in BLACK AND WHITE only with screentone and hatching. Style tradition: Young Ace / Comic Walker / カドコミ系 narou-kei comicalization (expressive character-driven art, large emotive eyes, light novel cover lineage), NOT seinen-realism.`,
    "",
    "ART STYLE:",
    styleOverrideBlock(args.scene, args.bible),
    "",
    "REFERENCE IMAGES (passed via image_inputs in this order):",
    inlineLabels,
    "",
    `SHOT: ${p.shot_type} / camera=${p.camera}${p.bleed ? " / BLEED edges" : ""}${p.silence ? " / SILENT atmospheric" : ""}, importance=${p.importance}/5${screentoneTag}`,
    "",
    "CHARACTERS IN PANEL:",
    characterRefDescription(p, args.bible, { episodeNo, tier: bibleTier }),
    "",
    locationDescription(p, args.bible, args.scene, bibleTier),
    "",
    costumeBlock(p, episodeNo, args.bible, bibleTier),
    "",
    worldRuleBlock(args.scene, args.bible, bibleTier),
    "",
    motifBlock(args.scene, args.bible, bibleTier, { panel_no: p.panel_no }),
    "",
    wardrobeStateBlock(args.scene, args.bible, p, bibleTier),
    "",
    activeWorldRulesBlock(args.scene, bibleTier),
    "",
    propsInPlayBlock(args.scene, args.bible, p),
    "",
    themeSubtextBlock(args.scene),
    "",
    `Action: ${p.action}`,
    `Visual focus: ${p.key_visual}`,
    "",
    backgroundDirective(args.backgroundTreatment),
    "",
    inPanelTextBlock(p, args.bible, args.compliance),
    "",
    "MUST PRESERVE invariants from continuity refs (face geometry, outfit details, location layout). Match line weight and screentone density of refs.",
    "",
    userInstructionsBlock(args.userInstructions),
    mangaTechniqueMandatoryBlock(),
    negativesBlock(),
  ];
  const prompt = sections.filter(Boolean).join("\n");
  warnIfPromptTooLarge(prompt);

  return {
    prompt,
    refImagePaths: args.packet.refs.map((r) => r.path),
  };
}

export function composePanelPrompt(args: ComposeArgs): ComposeResult {
  return composeWithSizeFallback(args, composePanelPromptCore);
}

// page_one_shot 専用ヘルパー (panel スコープには影響しない)
function buildLocalPanelNumbers(page: StoryboardPageV2): Map<string, number> {
  const map = new Map<string, number>();
  page.panels.forEach((p, idx) => {
    map.set(p.panel_id, idx + 1);
  });
  return map;
}

function formatRefLabel(
  r: ResolvedRefPacket["refs"][number],
  index: number,
): string {
  // 2026-05-13 圧縮: "<ref#1> (style)" → "ref1=style"、weight=1.0 は省略
  const target = r.target_entity_id ? `:${r.target_entity_id}` : "";
  const weight = r.weight >= 0.999 ? "" : `@${r.weight.toFixed(2)}`;
  return `ref${index + 1}=${r.role}${target}${weight}`;
}

function buildPageSceneContextBlock(
  scene: PromptScene | undefined,
  bible: BibleSnapshotV2,
  representativePanel: PanelV2 | undefined,
  tier: BibleTier,
): string | null {
  if (!scene) return null;
  // 2026-05-13 圧縮: 旧 5 sub-block (各 100-200字) を 1 行ずつに集約。
  // SCENE WARDROBE STATE は CONTINUITY (Active costumes) と被るので削除。
  // World rules / Active rules は長文 1 件 130字 × 2 → 70字 × 2 に切り詰め。
  const lines: string[] = [];

  // World rules (worldRuleBlock のヘッダーを剥がし bullet を 1 行ずつ truncate)
  const wr = worldRuleBlock(scene, bible, tier);
  if (wr) {
    const bullets = wr.split("\n").filter((l) => l.startsWith("- "));
    const truncated = bullets.slice(0, 2).map((b) => firstChars(b, 90));
    if (truncated.length > 0) lines.push(`World rules:\n${truncated.join("\n")}`);
  }

  // Active world rules
  const awr = activeWorldRulesBlock(scene, tier);
  if (awr) {
    const bullets = awr.split("\n").filter((l) => l.startsWith("- "));
    const truncated = bullets.slice(0, 2).map((b) => firstChars(b, 90));
    if (truncated.length > 0) lines.push(`Active rules this scene:\n${truncated.join("\n")}`);
  }

  // Props (元から短い、1-2 行)
  if (representativePanel) {
    const props = propsInPlayBlock(scene, bible, representativePanel);
    if (props) {
      const bullets = props.split("\n").filter((l) => l.startsWith("- "));
      if (bullets.length > 0) lines.push(`Props: ${bullets.map((b) => b.replace(/^- /, "")).join("; ")}`);
    }
  }

  // Theme (1 行)
  const theme = themeSubtextBlock(scene);
  if (theme) {
    const body = theme.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- /, "")).join(" / ");
    if (body) lines.push(`Theme: ${body}`);
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}

function renderPageShellsOnlyText(
  panel: PanelV2,
  bible: BibleSnapshotV2,
): string[] {
  const lines: string[] = [];
  const charName = (id: string) => bible.characters.find((c) => c.id === id)?.name ?? id;
  if (panel.dialogue.length > 0) {
    const list = panel.dialogue.map((d, i) => `${charName(d.character_id)} bubble #${i + 1}`).join(", ");
    lines.push(`- Speech bubble shells: ${panel.dialogue.length} (${list}) — empty interior, no text`);
  }
  if (panel.monologue.length > 0) {
    const list = panel.monologue.map((m, i) => `${charName(m.character_id)} thought #${i + 1}`).join(", ");
    lines.push(`- Inner monologue shells: ${panel.monologue.length} (${list}) — empty interior, no text`);
  }
  if (panel.narration.length > 0) {
    lines.push(`- Narration frame outlines: ${panel.narration.length} (rectangular outline only, no text inside)`);
  }
  if (panel.sfx.length > 0) {
    lines.push(`- SFX glyph outlines: ${panel.sfx.length} (effect shape only, no katakana/hiragana letters)`);
  }
  return lines;
}

function renderPageEmbedText(
  panel: PanelV2,
  bible: BibleSnapshotV2,
): string[] {
  // 2026-05-13 圧縮: 旧 4 ヘッダー行を 1 行ずつ短縮 (style 系説明は STYLE digest と
  // CONSTRAINTS で扱い済み)。
  const lines: string[] = [];
  const charName = (id: string) => bible.characters.find((c) => c.id === id)?.name ?? id;
  if (panel.dialogue.length > 0) {
    lines.push(`- Speech:`);
    for (const d of panel.dialogue) lines.push(`  - ${charName(d.character_id)}: 「${d.text}」`);
  }
  if (panel.monologue.length > 0) {
    lines.push(`- Monologue:`);
    for (const m of panel.monologue) lines.push(`  - ${charName(m.character_id)}: 「${m.text}」`);
  }
  if (panel.narration.length > 0) {
    lines.push(`- Narration:`);
    for (const n of panel.narration) lines.push(`  - ${n}`);
  }
  if (panel.sfx.length > 0) {
    lines.push(`- SFX: ${panel.sfx.join(", ")}`);
  }
  return lines;
}

/**
 * 2026-05-13: page 内の全 panel で entities (characters + location) が完全同一なら
 * page-shared header に括り出して panel block の冗長を削る。
 * 比較キー: character の (id, role, on_screen_via) tuple set + location_id。
 * expression は panel ごとに変わるので shared 判定から除外し panel block に残す。
 */
type PageSharedEntities = {
  characters: Array<{ character_id: string; role: string; on_screen_via: string; name: string }>;
  location_id: string;
  location_name: string;
};

function computePageSharedEntities(
  page: StoryboardPageV2,
  bible: BibleSnapshotV2,
): PageSharedEntities | null {
  if (page.panels.length < 2) return null;
  const keyOf = (p: PanelV2) =>
    p.entities.characters
      .map((c) => `${c.character_id}|${c.role}|${c.on_screen_via}`)
      .sort()
      .join(",");
  const firstKey = keyOf(page.panels[0]);
  const firstLoc = page.panels[0].entities.location_id;
  for (let i = 1; i < page.panels.length; i += 1) {
    if (keyOf(page.panels[i]) !== firstKey) return null;
    if (page.panels[i].entities.location_id !== firstLoc) return null;
  }
  return {
    characters: page.panels[0].entities.characters.map((c) => ({
      character_id: c.character_id,
      role: c.role,
      on_screen_via: c.on_screen_via,
      name: bible.characters.find((x) => x.id === c.character_id)?.name ?? c.character_id,
    })),
    location_id: firstLoc,
    location_name: bible.locations.find((x) => x.id === firstLoc)?.name ?? firstLoc,
  };
}

function renderPageSharedEntitiesHeader(s: PageSharedEntities): string {
  const charList = s.characters
    .map((c) => `${c.name} (${c.role}, ${c.on_screen_via})`)
    .join("; ");
  return [
    "(All panels on this page share these characters and location; expressions vary per panel.)",
    `- Shared characters: ${charList}`,
    `- Shared location: ${s.location_name}`,
  ].join("\n");
}

function renderPagePanelBlock(args: {
  panel: PanelV2;
  localNo: number;
  bible: BibleSnapshotV2;
  bgTreatment: BackgroundTreatment | undefined;
  typesetMode: "embed" | "shells_only";
  compliance?: { blocklist: Blocklist; fp: FalsePositives };
  sharedEntities?: PageSharedEntities | null;
}): string {
  const { panel, localNo, bible, bgTreatment, typesetMode, compliance, sharedEntities } = args;
  const screentoneTag = panel.screentone_intensity ? `, screentone=${panel.screentone_intensity}` : "";
  const lines: string[] = [
    // 2026-05-13 圧縮: "reading_order=N" → "ro=N"、長い ", " 区切りを単一空白に
    `### panel#${localNo} (ro=${panel.reading_order} ${panel.shot_type} ${panel.camera}${panel.bleed ? " BLEED" : ""}${panel.silence ? " SILENT" : ""}${screentoneTag})`,
  ];
  if (sharedEntities) {
    // shared 経路: expression のみ panel に出す (Characters/Location は page-shared header に集約済み)
    const expr = panel.entities.characters
      .map((c) => {
        const name = bible.characters.find((x) => x.id === c.character_id)?.name ?? c.character_id;
        return `${name}=${c.expression}`;
      })
      .join(", ");
    if (expr) lines.push(`- Expressions: ${expr}`);
  } else {
    const cs = panel.entities.characters
      .map((c) => {
        const ent = bible.characters.find((x) => x.id === c.character_id);
        return `${ent?.name ?? c.character_id} (${c.role}, ${c.on_screen_via}, expr=${c.expression})`;
      })
      .join("; ");
    const loc = bible.locations.find((x) => x.id === panel.entities.location_id)?.name ?? panel.entities.location_id;
    lines.push(`- Characters: ${cs || "none"}`);
    lines.push(`- Location: ${loc}`);
  }
  lines.push(`- Action: ${panel.action}`);
  // 2026-05-13: Action と Visual focus が同一文字列のとき重複出力を抑制
  // (a07 ep01 で 5 panel 全部同値ケース多発、storyboard 上流の variation 不足が真因)
  if (panel.key_visual.trim() !== panel.action.trim()) {
    lines.push(`- Visual focus: ${panel.key_visual}`);
  }
  const warning = panelTextValidationWarning(panel, bible, compliance);
  if (warning) lines.push(`- ${warning.replace(/\n/g, "\n  ")}`);
  const textLines = typesetMode === "shells_only"
    ? renderPageShellsOnlyText(panel, bible)
    : renderPageEmbedText(panel, bible);
  for (const l of textLines) lines.push(l);
  const bgLine = compactBackgroundDirective(bgTreatment);
  if (bgLine) lines.push(`- ${bgLine}`);
  return lines.join("\n");
}

/**
 * 2026-05-13: page-level CONTINUITY block (NovelAI V4 base+character 方式)。
 * page 内 unique character_id ごとに 1 回 summary、location は最初の panel から、
 * motif は scene_graph から page-level に 1 回。
 * panel 数だけ反復していた旧方式に比べ ~50-70% の文字数削減を狙う。
 */
function buildPageContinuityBlock(
  page: StoryboardPageV2,
  bible: BibleSnapshotV2,
  scene: PromptScene | undefined,
  tier: BibleTier,
  episodeNo: number,
): string {
  const lines: string[] = [];

  // unique characters (panel 横断で character_id を集約)
  const seenIds = new Set<string>();
  const uniqueChars: { character_id: string; firstPanel: PanelV2 }[] = [];
  for (const p of page.panels) {
    for (const c of p.entities.characters) {
      if (!seenIds.has(c.character_id)) {
        seenIds.add(c.character_id);
        uniqueChars.push({ character_id: c.character_id, firstPanel: p });
      }
    }
  }
  if (uniqueChars.length > 0) {
    lines.push("Characters (face/outfit invariants across this page):");
    for (const { character_id, firstPanel } of uniqueChars) {
      const tempPanel: PanelV2 = {
        ...firstPanel,
        entities: {
          ...firstPanel.entities,
          characters: firstPanel.entities.characters.filter((c) => c.character_id === character_id),
        },
      };
      const summary = characterRefDescription(tempPanel, bible, { episodeNo, tier });
      // 2026-05-13: 1 キャラあたり 200 字以内に truncate (顔/服の継続性 anchor として
      // 必要な要素は冒頭にあるので末尾を切っても継続性ハッシュとして機能する)
      lines.push(firstChars(summary.replace(/\n/g, " / "), 200));
    }
  }

  // location: 最初の panel から 1 回 (panel-shared の場合はこれが唯一の location)
  const firstPanelLoc = locationDescription(page.panels[0], bible, scene, tier);
  if (firstPanelLoc) lines.push(`Location: ${firstPanelLoc}`);

  // costume: 全 panel で active costume を 1 回ずつ集約 (panel ごと反復しない)
  const costumeLines = new Set<string>();
  for (const p of page.panels) {
    const c = costumeBlock(p, episodeNo, bible, tier);
    if (c) {
      // costumeBlock は "ACTIVE COSTUMES (override outfit_default):\n- ..." を返す
      // header 行を除いて bullet だけ集約
      const bullets = c.split("\n").filter((l) => l.startsWith("- "));
      for (const b of bullets) costumeLines.add(b);
    }
  }
  if (costumeLines.size > 0) {
    lines.push("Active costumes:");
    for (const b of costumeLines) lines.push(b);
  }

  // motif: page 単位 1 回。最初の panel の panel_no を代表値として渡す。
  const motif = motifBlock(scene, bible, tier, { panel_no: page.panels[0].panel_no });
  if (motif) lines.push(motif);

  return lines.join("\n");
}

function buildPageConstraintsBlock(opts: { typesetMode: "embed" | "shells_only" }): string {
  // 2026-05-13 圧縮: 旧 5 行 689 字 → 3 行 ~300 字。
  // manga lettering 行は STYLE digest と被るので削除、background density は SCENE/panel BG に集約。
  // STRICT LAYOUT CONSTRAINTS から移動した汎用ルール (gutter / hero / grid) を 1 行に統合。
  const lines = [
    "Render: black ink linework + screentone + hatching, hard B/W contrast. Vary tone density by panel emotion.",
    "Layout: reproduce panel sizes above (do NOT default to uniform grid); HERO panel dominates; non-bleed panels separated by >=30px white gutter.",
    "Avoid: color, 3D shading, photorealism, page numbers, signatures, watermarks, English in-panel text, >5 fingers per hand.",
  ];
  if (opts.typesetMode === "shells_only") {
    lines.push("Draw EMPTY speech bubble shells, narration outlines, SFX outlines only — no text inside (post-typeset adds it).");
  }
  return lines.join("\n");
}

/**
 * MANGA CRAFT DIRECTIVES (v6 lessons)
 *
 * 2026-05-17 追加。a07-novel manga_pilot_v5 で発生した「絵本的・吹き出し希薄・背景一律詳細・
 * キャラ芝居静止」の問題を構造的に解消するための appendix。L9 全プロンプトに付与される。
 *
 * 由来:
 * - v5 で 1P あたり吹き出し平均 4.2 個 (商業漫画標準 8-15 個の半分以下)
 * - スタイル参照は線質には効くが「漫画文法 (吹き出し配置/コマ割り/背景省略)」までは伝わらない
 * - ref 静止画では「視線下に逃がす」「指が一拍止まる」のような芝居が出ない
 *
 * したがってプロンプト側で明示的に補完する。
 */
const MANGA_CRAFT_DIRECTIVES_V6 = `The following directives apply to ALL panels on this page, supplementing the per-panel specs above.

### Bubble density (REQUIRED)
- This page must contain at minimum 8 speech bubbles / inner-thought bubbles / SFX combined; aim for 10-15 on conversation pages.
- Each panel must contain at least one of: speech bubble, inner thought bubble, off-frame voice, SFX, or environmental sound.
- Empty (zero-text) panels are reserved exclusively for explicit "TAME" panels (max 1 per page).

### Bubble shape taxonomy (use deliberately, do NOT default to all rounded)
- Speech: rounded smooth bubble.
- Inner thought: cloud / wavy bubble.
- Shout / exclamation: jagged spike bubble.
- Radio / transmission: rough rectangular bubble.
- TV broadcast: rounded with broadcast bar on top.
- Off-frame voice: thin small rectangular.
- Use varied shapes within the same page.

### Background mer-hari (mandatory variation)
- Expression close-up panels: WHITE background or single screentone only. NO detailed setting.
- Pure object / TAME panels: WHITE background only. NO setting elements.
- Establishing / wide shots: detailed background matching location refs.
- Information panels (signage, documents, props CU): detailed background where relevant.
- DO NOT render every panel at uniform background density. The reader needs visual rhythm.

### Character acting (dynamic, not static)
- Each panel showing a character must include at least one micro-acting beat:
  - eyes drift down briefly
  - hand grips an object one beat too long
  - mouth half-opens before deciding not to speak
  - shoulders drop before face shows recognition
  - service-smile holds, then releases when off-camera
- Static "neutral expression matching ref" is NOT sufficient by itself.

### TAME panel requirement
- At least one panel per page must be a TAME panel:
  - pure object close-up (no character)
  - OR pure character expression close-up with NO background and NO text
- TAME panels function as "breath" between information-dense panels.

### Panel size variation (CRITICAL)
- Within a 5-panel page, panel area sizes must span: smallest <= 12%, largest >= 35%.
- Uniform 15-20% panels across the page are PROHIBITED; they produce "picture book" feel, not manga.

### Style refs interpretation
- Style ref images attached are MANGA PAGE COMPOSITION references, NOT pure-illustration style guides.
- Extract: line weight variation, screentone density, bubble-to-image area ratio.
- If style refs show ~30-40% bubble area coverage, the generated page should match that density.`;

function composePagePromptCore(args: ComposeArgs): ComposeResult {
  if (!args.page) throw new Error("composePagePrompt requires page");
  const page = args.page;
  const episodeNo = args.episodeNo ?? 1;
  const bibleTier = args.bibleTier ?? "minimal";
  const typesetMode: "embed" | "shells_only" = args.typesetMode ?? "embed";
  const localPanelNoByPanelId = buildLocalPanelNumbers(page);

  const geometryBlock: string | null = args.pagePlanPage
    ? buildLayoutGeometryBlock(args.pagePlanPage, localPanelNoByPanelId)
    : null;

  const inlineLabels = args.packet.refs
    .map((r, i) => formatRefLabel(r, i))
    .join("\n");

  // 2026-05-13: NovelAI V4 base+character 方式に再設計。
  // 旧: 各 panel に同じキャラ summary を反復 (panel 数だけ重複) → ~1500字
  // 新: page 内 unique character ごとに 1 回 summary (顔/服/役割) + location 1 回 + motif 1 回 → ~500-700字
  const continuityBlocks = buildPageContinuityBlock(page, args.bible, args.scene, bibleTier, episodeNo);

  const representativePanel = page.panels[0];
  const sceneBlock = buildPageSceneContextBlock(args.scene, args.bible, representativePanel, bibleTier);

  // 2026-05-13: page 内全 panel で characters + location が完全同一なら page-shared
  // header に括り出し panel block では expression だけ出す。a07 ep01 で全 panel 同値
  // ケースが多発 (page 17 で 5 panel 完全同値) → -800〜1500 字 / page 期待。
  const sharedEntities = computePageSharedEntities(page, args.bible);
  const sharedHeader = sharedEntities ? renderPageSharedEntitiesHeader(sharedEntities) : null;

  const panelBlocks = page.panels.map((p) => {
    const localNo = localPanelNoByPanelId.get(p.panel_id) ?? p.panel_no;
    const bg = args.pageBackgroundTreatments?.get(p.panel_id);
    return renderPagePanelBlock({
      panel: p,
      localNo,
      bible: args.bible,
      bgTreatment: bg,
      typesetMode,
      compliance: args.compliance,
      sharedEntities,
    });
  }).join("\n\n");

  const editorBlock = args.userInstructions && args.userInstructions.trim()
    ? `## EDITOR\n${args.userInstructions.trim()}`
    : null;

  const sections: Array<string | null> = [
    `# PAGE`,
    `B6 portrait B&W manga page, ${args.pageDimensions.width}x${args.pageDimensions.height} px, narou-kei comicalization style (screentone + hatching, NOT seinen-realism).`,
    "",
    "## STYLE",
    styleOverrideBlock(args.scene, args.bible),
    "",
    "## REFERENCES",
    inlineLabels,
    "",
    "## LAYOUT",
    `${page.panels.length} panels, RTL reading order, page_role=${page.page_role}.`,
    geometryBlock,
    "",
    sceneBlock ? "## SCENE" : null,
    sceneBlock,
    sceneBlock ? "" : null,
    "## CONTINUITY",
    continuityBlocks,
    "",
    "## PANELS",
    sharedHeader,
    sharedHeader ? "" : null,
    panelBlocks,
    "",
    editorBlock,
    editorBlock ? "" : null,
    "## CONSTRAINTS",
    buildPageConstraintsBlock({ typesetMode }),
    "",
    "## MANGA CRAFT DIRECTIVES",
    MANGA_CRAFT_DIRECTIVES_V6,
  ];
  const prompt = sections
    .filter((s): s is string => s !== null && s !== undefined)
    .join("\n");
  warnIfPromptTooLarge(prompt);

  return {
    prompt,
    refImagePaths: args.packet.refs.map((r) => r.path),
  };
}

export function composePagePrompt(args: ComposeArgs): ComposeResult {
  return composeWithSizeFallback(args, composePagePromptCore);
}
