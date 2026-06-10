/**
 * 一回限り: a07 ep01 P2/P3 を panel_composite ではなく page_one_shot 戦略で生成し、
 * コマ単位生成 + L09b 合成 (`p{NN}_composed_v5.png`) と比較する。
 *
 * 既存パイプラインは触らない:
 *   - page_plan.json の render_strategy は panel_composite のまま
 *   - resolved_refs.json の packets["page_2/3"] は存在しないので、
 *     panel packet を束ねて page packet を on-the-fly 合成する
 *   - 出力は renders/p{NN}_pageshot[_<tag>].png の独立スロット
 *   - bubble / effect-line overlay は意図的に省略 (codex 内描画のみで素の比較)
 *
 * Usage:
 *   npx tsx scripts/manga/_oneoff-pageshot-p2-3.ts                      # tag=baseline, pages=2,3
 *   npx tsx scripts/manga/_oneoff-pageshot-p2-3.ts --pages 2 --tag try1
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  resolvedRefsPath,
  rendersDir,
} from "./layers/_paths";
import { generateMangaImage } from "../../src/lib/manga/generate/codex-image";
import { composePagePrompt } from "../../src/lib/manga/render-v2/prompt-composer-v2";
import type {
  BackgroundTreatment,
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
  PagePlanPanel,
  ResolvedRefs,
  ResolvedRef,
  ResolvedRefPacket,
  StoryboardPageV2,
  PanelV2,
} from "../../src/lib/manga/schemas-v2";

const SLUG = "a07-modern-dungeon";
const EPISODE = 1;
const PAGE_W = 1748;
const PAGE_H = 2480;
const GEN_W = 1024; // gpt-image-2 portrait
const GEN_H = 1536;

type Variant = "tilt_action" | "mega_splash" | "polygon_zigzag" | "vertical_slits" | "black_void";
const ALL_VARIANTS: Variant[] = ["tilt_action", "mega_splash", "polygon_zigzag", "vertical_slits", "black_void"];

const PATTERN_DICT_PATH = "/Users/hikarumori/Developer/AINARO/data/manga/layout_patterns/v1.json";
type PatternSlot = {
  slot_id: string;
  reading_order: number;
  role_hint: string;
  size_class: string;
  polygon: [number, number][];
  is_borderless: boolean;
  bleed: boolean;
  background_treatment: string;
};
type PatternEntry = {
  id: string;
  name: string;
  panel_count: number;
  page_role_hints: string[];
  subtype_hints: string[];
  purpose_summary: string;
  trigger_conditions: string;
  features: string[];
  slots: PatternSlot[];
};

/** 26 patterns selected for visual diversity across panel_count buckets */
const PATTERN_SET_FIRST_26 = [
  // panel_count=1 (extreme: full-page splash, isolation)
  "pat_005_full_bleed_single",
  "pat_032_chapter_title_overlay_full_1",
  "pat_033_solitary_dread_isolation_1",
  // panel_count=2 (slanted/iconic two-shot)
  "pat_002_diag_split_two_shot_1",
  "pat_013_two_shot_iconic_2",
  "pat_018_diagonal_skewed_panel_2",
  // panel_count=3 (close emotion, tilt combat, radial, cinematic)
  "pat_009_extreme_close_emotion_3",
  "pat_010_diag_speedline_combat_3",
  "pat_020_radial_speedline_focus_3",
  "pat_034_pillarbox_cinematic_3",
  "pat_048_diagonal_confrontation_3",
  "pat_051_silhouette_loot_discovery_3",
  // panel_count=4 (info dense, atmospheric text, monster bleed, time strip, polygon slash)
  "pat_007_information_dense_complex",
  "pat_014_atmospheric_text_background_4",
  "pat_019_monster_silhouette_bleed_3",
  "pat_024_temporal_compression_strip_4",
  "pat_030_polygon_slash_combat_4",
  // panel_count=5 (3tier dialogue, L-inset, screentone anchor, zigzag, explosion+silence, status, zoom burst, chibi observer)
  "pat_001_3tier_dialogue_5",
  "pat_011_l_shape_inset_5",
  "pat_021_screentone_info_anchor_5",
  "pat_025_zigzag_dialogue_5",
  "pat_026_explosive_top_calm_bottom_5",
  "pat_028_status_inset_action_5",
  "pat_037_zoom_burst_dialogue_5",
  "pat_044_bishoujo_chibi_observer_inset_5",
  // panel_count=6 (only 1 in dict)
  "pat_022_aftermath_triumph_5",
];

type Args = { pages: number[]; tag: string; injectLayout: boolean; variants: Variant[] | null; patterns: string[] | null };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let pages = [2, 3];
  let tag = "baseline";
  let injectLayout = false;
  let variants: Variant[] | null = null;
  let patterns: string[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pages") pages = argv[++i].split(",").map((s) => Number(s));
    else if (a === "--tag") tag = argv[++i];
    else if (a === "--inject-layout") injectLayout = true;
    else if (a === "--variant") variants = [argv[++i] as Variant];
    else if (a === "--variants") {
      const v = argv[++i];
      variants = v === "all" ? ALL_VARIANTS : (v.split(",") as Variant[]);
    } else if (a === "--patterns") {
      const v = argv[++i];
      patterns = v === "first_26" ? PATTERN_SET_FIRST_26 : v.split(",");
    }
  }
  return { pages, tag, injectLayout, variants, patterns };
}

/**
 * pattern.panel_count に応じて a07 ep01 のどの源ページを使うか決定する。
 *  - 1: P10 を 1 panel に trim (establishing shot のコンテンツを単独 splash 化)
 *  - 2: P1 を直接利用 (a07 P1 が 2 panels)
 *  - 3-5: P10 を trim (中盤 5-panel ページ)
 *  - 6: P5 を直接利用
 *  - 7+: skip (a07 にない)
 */
function selectSourcePage(panelCount: number): number {
  if (panelCount === 1) return 10;
  if (panelCount === 2) return 1;
  if (panelCount >= 3 && panelCount <= 5) return 10;
  if (panelCount === 6) return 5;
  throw new Error(`unsupported pattern panel_count=${panelCount}`);
}

/**
 * pattern.slots を page_plan の panels に貼り直す。panel_id / 既存 importance は
 * 源ページから引き継ぎ、rect / polygon / bg_treatment / is_borderless / bleed_polygon は
 * pattern slot 由来で上書き。
 */
function applyPatternToPagePlan(
  pattern: PatternEntry,
  sourcePlanPage: PagePlanV2["pages"][number]
): PagePlanV2["pages"][number] {
  // BUG FIX: pattern.slots は dict 配列順 (reading_order 昇順とは限らない) なので、
  // reading_order をキーにして storyboard panels と紐付ける必要がある。
  const sourcePanelsByRo = new Map(
    sourcePlanPage.panels.map((p) => [p.reading_order, p])
  );
  const sortedPanelsByRo = [...sourcePlanPage.panels].sort((a, b) => a.reading_order - b.reading_order);
  const newPanels: PagePlanPanel[] = pattern.slots.map((slot) => {
    // slot.reading_order に対応する source panel を取得 (なければ最後の panel をフォールバック)
    const src = sourcePanelsByRo.get(slot.reading_order) ?? sortedPanelsByRo[sortedPanelsByRo.length - 1];
    const xs = slot.polygon.map((p) => p[0]);
    const ys = slot.polygon.map((p) => p[1]);
    const rect = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
    return {
      ...src,
      slot_id: slot.slot_id,
      rect,
      polygon: slot.polygon,
      reading_order: slot.reading_order,
      background_treatment: slot.background_treatment as BackgroundTreatment,
      is_borderless: slot.is_borderless,
      bleed_polygon: slot.bleed,
      tilt_deg: undefined,
    };
  });
  return { ...sourcePlanPage, panels: newPanels, render_strategy: "page_one_shot" as const };
}

/**
 * storyboard.page を pattern.panel_count に合わせて trim/拡張する。
 * panel が足りない場合は最終 panel を複製。多すぎる場合は trim。
 */
function applyPatternToStoryboardPage(
  pattern: PatternEntry,
  sourceStoryboardPage: StoryboardPageV2
): StoryboardPageV2 {
  // BUG FIX: reading_order キーで紐付け (pattern.slots は dict 配列順なので index 一致は保証されない)
  const sourcePanelsByRo = new Map(
    sourceStoryboardPage.panels.map((p) => [p.reading_order, p])
  );
  const sortedPanels = [...sourceStoryboardPage.panels].sort((a, b) => a.reading_order - b.reading_order);
  const newPanels: PanelV2[] = pattern.slots.map((slot) => {
    const src = sourcePanelsByRo.get(slot.reading_order) ?? sortedPanels[sortedPanels.length - 1];
    return { ...src, reading_order: slot.reading_order };
  });
  return { ...sourceStoryboardPage, panels: newPanels };
}

function buildPatternDirectives(pattern: PatternEntry): string[] {
  const out: string[] = [
    `PATTERN: ${pattern.name} (${pattern.id})`,
    `PURPOSE: ${pattern.purpose_summary}`,
  ];
  if (pattern.features.length > 0) {
    out.push(`FEATURES: ${pattern.features.join(", ")}`);
  }
  if (pattern.page_role_hints.length > 0) {
    out.push(`ROLE HINTS: ${pattern.page_role_hints.join(", ")}`);
  }
  return out;
}

/**
 * variant ごとに page_plan を変形する。RTL reading_order は維持、
 * rect / polygon / tilt_deg / bleed_polygon / is_borderless / bg_treatment を上書き。
 * 5コマ前提 (P3 を素材に固定)。
 */
function transformForVariant(
  variant: Variant,
  planPage: PagePlanV2["pages"][number]
): { planPage: PagePlanV2["pages"][number]; extraDirectives: string[] } {
  const panels = planPage.panels;
  if (variant === "tilt_action") {
    const tiltByRo = new Map<number, number>([[1, -12], [2, 8], [3, -18], [4, 14], [5, -6]]);
    return {
      planPage: { ...planPage, panels: panels.map((p) => ({ ...p, tilt_deg: tiltByRo.get(p.reading_order) ?? 0 })) },
      extraDirectives: [
        "ACTION TILT MODE: Each panel frame is rotated/skewed at a different angle (-18° to +14°) to convey kinetic motion.",
        "Diagonal panel borders, no horizontal/vertical alignment between adjacent panels — gutters are slanted.",
        "Speed lines, motion blur, or impact lines bridge across tilted panel edges. This is a high-action / fight / chase page.",
      ],
    };
  }
  if (variant === "mega_splash") {
    const corners: Record<number, { x: number; y: number; w: number; h: number }> = {
      1: { x: 1340, y: 60, w: 348, h: 348 },
      2: { x: 60, y: 60, w: 348, h: 348 },
      4: { x: 1340, y: 2072, w: 348, h: 348 },
      5: { x: 60, y: 2072, w: 348, h: 348 },
    };
    return {
      planPage: {
        ...planPage,
        panels: panels.map((p) => {
          if (p.reading_order === 3) {
            return { ...p, rect: { x: 0, y: 0, w: PAGE_W, h: PAGE_H }, polygon: undefined, bleed_polygon: true, is_borderless: true };
          }
          return { ...p, rect: corners[p.reading_order]!, polygon: undefined };
        }),
      },
      extraDirectives: [
        "MEGA SPLASH MODE: panel#3 is a SINGLE FULL-PAGE SPLASH covering all 4 page edges (full bleed, no border, no gutter).",
        "Other panels (#1, #2, #4, #5) are SMALL FLOATING INSET frames at the four corners (~18% × 14%) — they OVERLAY on top of the splash artwork with white background and thin black frame.",
        "The splash dominates 100% of visual space; insets are reaction beats popping off the splash.",
      ],
    };
  }
  if (variant === "polygon_zigzag") {
    const wave = 50;
    return {
      planPage: {
        ...planPage,
        panels: panels.map((p) => {
          const r = p.rect;
          const poly: [number, number][] = [
            [r.x, r.y],
            [r.x + r.w * 0.25, r.y - wave * 0.5],
            [r.x + r.w * 0.5, r.y + wave * 0.7],
            [r.x + r.w * 0.75, r.y - wave * 0.4],
            [r.x + r.w, r.y],
            [r.x + r.w + wave * 0.3, r.y + r.h * 0.5],
            [r.x + r.w, r.y + r.h],
            [r.x + r.w * 0.5, r.y + r.h - wave * 0.6],
            [r.x, r.y + r.h],
            [r.x - wave * 0.3, r.y + r.h * 0.5],
          ];
          return { ...p, polygon: poly };
        }),
      },
      extraDirectives: [
        "ZIGZAG POLYGON MODE: Every panel border is a JAGGED IRREGULAR POLYGON (~10 vertices) — no straight horizontal/vertical edges anywhere.",
        "Panel boundaries warp, curve, dip, and crest like a torn paper edge or shockwave ripple.",
        "Use this layout for dream / hallucination / instability / supernatural eruption.",
      ],
    };
  }
  if (variant === "vertical_slits") {
    const slitW = 306;
    const slitH = PAGE_H - 120;
    return {
      planPage: {
        ...planPage,
        panels: panels.map((p) => ({
          ...p,
          // RTL: reading_order=1 が一番右、=5 が一番左
          rect: { x: 60 + (5 - p.reading_order) * (slitW + 16), y: 60, w: slitW, h: slitH },
          polygon: undefined,
          tilt_deg: undefined,
        })),
      },
      extraDirectives: [
        "VERTICAL SLITS MODE: 5 NARROW VERTICAL STRIP panels arranged side-by-side (RTL: panel#1 rightmost → panel#5 leftmost).",
        "Each panel is tall and narrow (~17% width × 95% height) like cinematic frames in a tracking shot.",
        "Convey rapid time progression, continuous motion, or a single action broken across moments — like 5 frames of a film strip.",
      ],
    };
  }
  if (variant === "black_void") {
    const bottomSlots: Record<number, { x: number; y: number; w: number; h: number }> = {
      1: { x: 1290, y: 1620, w: 390, h: 800 },
      2: { x: 880, y: 1620, w: 390, h: 800 },
      4: { x: 470, y: 1620, w: 390, h: 800 },
      5: { x: 60, y: 1620, w: 390, h: 800 },
    };
    return {
      planPage: {
        ...planPage,
        panels: panels.map((p) => {
          if (p.reading_order === 3) {
            return {
              ...p,
              rect: { x: 60, y: 60, w: 1628, h: 1500 },
              polygon: undefined,
              background_treatment: "solid_black" as const,
            };
          }
          return { ...p, rect: bottomSlots[p.reading_order]!, polygon: undefined };
        }),
      },
      extraDirectives: [
        "BLACK VOID MODE: panel#3 is a MASSIVE TOP PANEL (~93% width × 60% height) filled with PURE BLACK void background.",
        "Only minimal silhouette / single character outline / single object visible against the void — most of panel#3 is solid black ink.",
        "Bottom strip has 4 small panels in a row (RTL: panel#1 rightmost → panel#5 leftmost).",
        "Conveys shock, despair, revelation, or void/nothingness moment.",
      ],
    };
  }
  // unreachable but keep TS happy
  return { planPage, extraDirectives: [] };
}

/**
 * Lv1 調整: page_plan の rect / polygon / importance / bg_treatment から
 * 「LAYOUT GEOMETRY」プロンプトブロックを構築する。
 * composePagePrompt は panel_no と shot_type しか渡してないので、AI に
 * 「このページは均一グリッドじゃない」「panel#3 が最大の見せ場」などの
 * 構図情報を明示する。
 */
function buildLayoutGeometryBlock(
  planPage: PagePlanV2["pages"][number],
  extraDirectives: string[] = []
): string {
  type Slot = { ro: number; pid: string; col: string; row: string; wPct: number; hPct: number; areaPct: number; poly: number; bleed: boolean; imp: number; bg: string | undefined; isHero: boolean; tilt: number | undefined; borderless: boolean; bleedPoly: boolean };
  const slots: Slot[] = planPage.panels.map((pp: PagePlanPanel) => {
    const wPct = (pp.rect.w / PAGE_W) * 100;
    const hPct = (pp.rect.h / PAGE_H) * 100;
    const areaPct = (pp.rect.w * pp.rect.h) / (PAGE_W * PAGE_H) * 100;
    const cx = pp.rect.x + pp.rect.w / 2;
    const cy = pp.rect.y + pp.rect.h / 2;
    const col = wPct >= 85 ? "FULL_WIDTH"
      : cx < PAGE_W * 0.4 ? "LEFT"
      : cx > PAGE_W * 0.6 ? "RIGHT"
      : "CENTER";
    const row = cy < PAGE_H * 0.33 ? "TOP"
      : cy < PAGE_H * 0.66 ? "MIDDLE"
      : "BOTTOM";
    const poly = pp.polygon?.length ?? 4;
    const bleed = pp.rect.x < 30 || pp.rect.y < 30 || (pp.rect.x + pp.rect.w) > PAGE_W - 30 || (pp.rect.y + pp.rect.h) > PAGE_H - 30;
    return {
      ro: pp.reading_order,
      pid: pp.panel_id,
      col, row,
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
  const sortedByPriority = [...slots].sort((a, b) => (b.imp * 10 + b.areaPct) - (a.imp * 10 + a.areaPct));
  if (sortedByPriority[0]) {
    const hero = slots.find((s) => s.ro === sortedByPriority[0].ro);
    if (hero) hero.isHero = true;
  }

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
    const sizeWord = s.areaPct >= 50 ? "FULL-PAGE SPLASH"
      : s.areaPct >= 25 ? "LARGE"
      : s.areaPct >= 12 ? "medium"
      : "SMALL inset";
    lines.push(
      `- panel#${s.ro} (importance ${s.imp}/5${heroTag}): ${s.row} ${s.col}, ${sizeWord} (${s.wPct}% width × ${s.hPct}% height)${polyTag}${tiltTag}${bleedTag}${borderlessTag}.${s.bg ? ` bg_treatment=${s.bg}.` : ""}`
    );
  }

  const flow = slots.map((s) => `panel#${s.ro}`).join(" → ");
  lines.push("");
  lines.push(`READING FLOW (RTL, top→bottom): ${flow}.`);
  lines.push("");
  lines.push("STRICT LAYOUT CONSTRAINTS:");
  lines.push("- Panel SIZES vary deliberately. Reproduce the relative widths/heights above. Do NOT default to a regular 2x3 or 3x2 grid.");
  lines.push("- HERO panel must visibly dominate the page (largest area, most rendered detail).");
  lines.push("- SMALL insets must stay small — they are beat/reaction frames, not equal-weight panels.");
  const polyPanels = slots.filter((s) => s.poly > 4);
  if (polyPanels.length > 0) {
    lines.push(`- Panels with IRREGULAR POLYGON edges (${polyPanels.map((s) => `panel#${s.ro}`).join(", ")}) should have non-rectangular borders (angled cut, slanted edge, or bleeding into adjacent panel).`);
  }
  const bleedPanels = slots.filter((s) => s.bleed && s.imp >= 4);
  if (bleedPanels.length > 0) {
    lines.push(`- BLEED panels (${bleedPanels.map((s) => `panel#${s.ro}`).join(", ")}) extend artwork to the page edge with no white margin on the bleed side.`);
  }
  lines.push("- Maintain consistent gutter (white space) of ~3-5% page width between non-bleed panels.");

  if (extraDirectives.length > 0) {
    lines.push("");
    lines.push("VARIANT-SPECIFIC DIRECTIVES (override defaults above):");
    for (const d of extraDirectives) lines.push(`- ${d}`);
  }

  return lines.join("\n");
}

/**
 * composePagePrompt の出力に LAYOUT GEOMETRY ブロックを注入。
 * 既存の "PAGE LAYOUT: N panels, RTL reading order, page_role=..." 行の直後に挿入。
 */
function injectLayoutGeometry(prompt: string, geometryBlock: string): string {
  const marker = /^(PAGE LAYOUT: \d+ panels, RTL reading order, page_role=[^\n]+)$/m;
  if (!marker.test(prompt)) {
    console.warn("[pageshot] WARNING: PAGE LAYOUT marker not found, appending geometry block at end of prompt");
    return prompt + "\n\n" + geometryBlock;
  }
  return prompt.replace(marker, `$1\n\n${geometryBlock}`);
}

/**
 * page 内の全 panel packet の refs を union → dedupe して page packet を作る。
 * 重複キー: path + role + target_entity_id。weight は max を採用。
 */
function synthesizePagePacket(
  panelIds: string[],
  resolved: ResolvedRefs
): ResolvedRefPacket {
  const seen = new Map<string, ResolvedRef>();
  const warnings: string[] = [];
  const unresolved = new Set<string>();
  let usedSum = 0;
  let maxBudget = 0;
  let optimalSum = 0;

  for (const pid of panelIds) {
    const pkt = resolved.packets[pid];
    if (!pkt) {
      warnings.push(`panel packet missing: ${pid}`);
      continue;
    }
    for (const r of pkt.refs) {
      const key = `${r.role}::${r.target_entity_id ?? ""}::${r.path}`;
      const prev = seen.get(key);
      if (!prev || r.weight > prev.weight) seen.set(key, r);
    }
    for (const u of pkt.unresolved_entities) unresolved.add(u);
    for (const w of pkt.warnings) warnings.push(`[${pid}] ${w}`);
    usedSum += pkt.budget.used;
    maxBudget = Math.max(maxBudget, pkt.budget.max);
    optimalSum = Math.max(optimalSum, pkt.budget.optimal);
  }

  const refs = Array.from(seen.values()).sort((a, b) => {
    // style → character_face → location → others の順で並べる
    const order = (r: ResolvedRef) =>
      r.role === "style" ? 0 : r.role === "character_face" ? 1 : r.role === "location" ? 2 : 3;
    return order(a) - order(b) || b.weight - a.weight;
  });

  return {
    scope: "page",
    refs,
    budget: { max: maxBudget, optimal: optimalSum, used: refs.length },
    truncated: refs.length > maxBudget && maxBudget > 0,
    unresolved_entities: Array.from(unresolved),
    warnings,
  };
}

async function generateOnePage(opts: {
  pageNo: number;
  tag: string;
  injectLayout: boolean;
  variant?: Variant;
  pattern?: PatternEntry;
  outBasename?: string;
  bible: BibleSnapshotV2;
  storyboard: EpisodeStoryboardV2;
  pagePlan: PagePlanV2;
  resolved: ResolvedRefs;
}): Promise<void> {
  const { pageNo, tag, injectLayout, variant, pattern, outBasename, bible, storyboard, pagePlan, resolved } = opts;
  const sourceSbPage = storyboard.pages.find((p) => p.page_no === pageNo);
  const originalPlanPage = pagePlan.pages.find((p) => p.page_no === pageNo);
  if (!sourceSbPage || !originalPlanPage) throw new Error(`page ${pageNo} not found`);

  // variant / pattern 指定時は page_plan / storyboard を変形
  let planPage = originalPlanPage;
  let sbPage = sourceSbPage;
  let extraDirectives: string[] = [];
  if (variant) {
    const transformed = transformForVariant(variant, originalPlanPage);
    planPage = transformed.planPage;
    extraDirectives = transformed.extraDirectives;
    console.log(`[pageshot] p${pageNo}: variant=${variant} applied (panels rect/polygon/tilt overridden)`);
  } else if (pattern) {
    planPage = applyPatternToPagePlan(pattern, originalPlanPage);
    sbPage = applyPatternToStoryboardPage(pattern, sourceSbPage);
    extraDirectives = buildPatternDirectives(pattern);
    console.log(`[pageshot] p${pageNo}: pattern=${pattern.id} applied (n_panels=${pattern.panel_count}, slots=${pattern.slots.length})`);
  }

  // 1st: page-level packet (page_N) を優先。L07 が page_one_shot ページに対して
  //       直接 page packet を生成済みのケース (resolved_refs.json 最新形式)
  // 2nd: なければ panel-level packet を union (legacy / panel_composite ページの初期状態)
  let packet: ResolvedRefPacket;
  const pageKey = `page_${pageNo}`;
  if (resolved.packets[pageKey]) {
    packet = resolved.packets[pageKey];
    console.log(
      `[pageshot] p${pageNo}: using existing page-level packet → refs=${packet.refs.length}`
    );
  } else {
    const panelIds = planPage.panels.map((p) => p.panel_id);
    packet = synthesizePagePacket(panelIds, resolved);
    console.log(
      `[pageshot] p${pageNo}: synthesized page packet from ${panelIds.length} panels → refs=${packet.refs.length} (warnings=${packet.warnings.length})`
    );
  }
  if (packet.refs.length === 0) {
    throw new Error(`p${pageNo}: no refs available (page packet missing AND panel-level union empty)`);
  }

  const pageBgMap = new Map(
    planPage.panels
      .map((pp) => [pp.panel_id, pp.background_treatment] as const)
      .filter(([, v]) => v !== undefined) as [string, NonNullable<typeof planPage.panels[0]["background_treatment"]>][]
  );

  let { prompt, refImagePaths } = composePagePrompt({
    page: sbPage,
    packet,
    bible,
    pageDimensions: { width: PAGE_W, height: PAGE_H },
    pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
  });

  // variant / pattern 指定時は inject-layout を強制 (効果は LAYOUT GEOMETRY 経由でしか伝わらない)
  if (injectLayout || variant || pattern) {
    const geom = buildLayoutGeometryBlock(planPage, extraDirectives);
    prompt = injectLayoutGeometry(prompt, geom);
    console.log(`[pageshot] p${pageNo}: layout geometry injected (+${geom.length} chars${variant ? `, variant=${variant}` : pattern ? `, pattern=${pattern.id}` : ""})`);
  }

  const outDir = rendersDir(SLUG, EPISODE);
  await fs.mkdir(outDir, { recursive: true });
  const pn = String(pageNo).padStart(2, "0");
  const baseName = outBasename ?? `p${pn}_pageshot_${tag}`;
  const outPath = path.join(outDir, `${baseName}.png`);
  const tmpPath = outPath + ".raw.png";
  const promptPath = path.join(outDir, `${baseName}.prompt.txt`);

  await fs.writeFile(promptPath, prompt + "\n\n--- REF IMAGE PATHS ---\n" + refImagePaths.join("\n"), "utf-8");
  console.log(`[pageshot] p${pageNo}: prompt saved → ${promptPath} (chars=${prompt.length}, refs=${refImagePaths.length})`);

  console.log(`[pageshot] p${pageNo}: generating ${GEN_W}x${GEN_H} via codex...`);
  await generateMangaImage({
    prompt,
    outputPath: tmpPath,
    size: { width: GEN_W, height: GEN_H },
    referenceImagePaths: refImagePaths,
    timeoutMs: 15 * 60 * 1000,
    maxRetries: 1,
  });

  await sharp(tmpPath).resize({ width: PAGE_W, height: PAGE_H, fit: "fill" }).png().toFile(outPath);
  try {
    await fs.unlink(tmpPath);
  } catch {}

  console.log(`[pageshot] p${pageNo}: DONE → ${outPath}`);
  if (!pattern && !variant) {
    console.log(`[pageshot] p${pageNo}: 比較対象: p${pn}_composed_v5.png (panel_composite 版)`);
  }
}

(async () => {
  const args = parseArgs();
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(SLUG), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(SLUG, EPISODE), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(SLUG, EPISODE), "utf-8")) as PagePlanV2;
  const resolved = JSON.parse(await fs.readFile(resolvedRefsPath(SLUG, EPISODE), "utf-8")) as ResolvedRefs;

  if (args.patterns) {
    const dict = JSON.parse(await fs.readFile(PATTERN_DICT_PATH, "utf-8")) as { patterns: PatternEntry[] };
    const byId = new Map(dict.patterns.map((p) => [p.id, p]));
    console.log(`[pageshot] PATTERNS MODE: count=${args.patterns.length}`);
    for (const pid of args.patterns) {
      const pattern = byId.get(pid);
      if (!pattern) {
        console.error(`[pageshot] pattern ${pid} not found in dict — skip`);
        continue;
      }
      let sourcePage: number;
      try {
        sourcePage = selectSourcePage(pattern.panel_count);
      } catch (e) {
        console.error(`[pageshot] pattern ${pid} (n=${pattern.panel_count}) → ${(e as Error).message} — skip`);
        continue;
      }
      const outBasename = `pat_${pattern.id}`;
      try {
        await generateOnePage({
          pageNo: sourcePage,
          tag: pattern.id,
          injectLayout: true,
          pattern,
          outBasename,
          bible, storyboard, pagePlan, resolved,
        });
      } catch (e) {
        console.error(`[pageshot] pattern ${pid} FAIL: ${(e as Error).message}`);
      }
    }
  } else if (args.variants) {
    console.log(`[pageshot] VARIANTS MODE: pages=[${args.pages.join(",")}] variants=[${args.variants.join(",")}]`);
    for (const pageNo of args.pages) {
      for (const variant of args.variants) {
        try {
          await generateOnePage({ pageNo, tag: variant, injectLayout: true, variant, bible, storyboard, pagePlan, resolved });
        } catch (e) {
          console.error(`[pageshot] p${pageNo} variant=${variant} FAIL: ${(e as Error).message}`);
        }
      }
    }
  } else {
    console.log(`[pageshot] slug=${SLUG} ep=${EPISODE} pages=[${args.pages.join(",")}] tag=${args.tag} inject_layout=${args.injectLayout}`);
    for (const pageNo of args.pages) {
      try {
        await generateOnePage({ pageNo, tag: args.tag, injectLayout: args.injectLayout, bible, storyboard, pagePlan, resolved });
      } catch (e) {
        console.error(`[pageshot] p${pageNo} FAIL: ${(e as Error).message}`);
      }
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
