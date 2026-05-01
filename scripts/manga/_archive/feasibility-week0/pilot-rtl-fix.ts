/**
 * Week 0 追加 Pilot: rtl-fix-pilot (2枚) — RTL読み順厳守の効果検証
 *
 * 目的: style-mimic-pilot/01,02 で「コマの順番おかしい」と指摘された問題を、
 *       プロンプトに RTL 読み順厳守ディレクティブ + panel#番号 を明示することで
 *       解消できるかを実測。
 *
 * 2ページ (style-mimic-pilot/01,02 と同じシーンを再生成):
 *   1. shibuya_rtl  — 1巻クライマックス、新宿覚醒 (RTL強調版)
 *   2. daily_rtl    — 1巻冒頭、派遣→ダンジョン (RTL強調版)
 *
 * 比較: style-mimic-pilot/{01,02}.png (順序破綻) vs rtl-fix-pilot/{01,02}.png (順序修正)
 *
 * 出力: data/manga/feasibility-week0/pilot/rtl-fix-pilot/{01-02}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-rtl-fix.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";
import path from "path";

const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? process.cwd();
const REFS_DIR = path.join(
  REPO_ROOT,
  "data",
  "manga",
  "feasibility-week0",
  "refs",
  "style-mimic"
);

const REFS_ALL = [
  path.join(REFS_DIR, "ref-01-conversation.png"),
  path.join(REFS_DIR, "ref-02-protagonist.png"),
  path.join(REFS_DIR, "ref-03-skill-activation.png"),
  path.join(REFS_DIR, "ref-04-awakened-character.png"),
  path.join(REFS_DIR, "ref-05-skill-ui.png"),
  path.join(REFS_DIR, "ref-06-city-dungeon.png"),
];

const RTL_DIRECTIVE = [
  "READING ORDER — Japanese manga reads RIGHT-TO-LEFT, top-to-bottom.",
  "When panels share a tier (row), the panel on the RIGHT side is read FIRST, the LEFT side is read SECOND.",
  "Story flow within a tier MUST progress right→left. Do not arrange panels as if reading left-to-right (English convention).",
  "The numbered 'panel #N' notation reflects the reading order — panel #1 first, panel #2 second, panel #3 third, etc.",
  "Within a horizontal tier with 2+ panels: the FIRST numbered panel goes RIGHT, the next goes to its LEFT, etc.",
  "Within a horizontal tier with 3 panels: panel order RIGHT → CENTER → LEFT.",
].join(" ");

const STYLE = [
  "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
  "Light novel manga adaptation aesthetic for modern dungeon genre.",
].join(" ");

const STYLE_MIMIC = [
  "STRICT STYLE REFERENCE: 6 reference manga pages provided. Match line work density, screentone usage, character face proportions of these published commercial manga references.",
].join(" ");

const MINIMALISM = [
  "DRAWING DISCIPLINE — Backgrounds MINIMAL, empty white space required. Crowd figures as silhouettes, NOT individual faces. Vary panel density across the page.",
].join(" ");

const LAYOUT = [
  "Compose a complete manga page with multiple panels.",
  "Use thick black panel borders (gutters) between panels.",
  "Each panel must be clearly delineated.",
  "Keep some negative space within panels for future SVG speech bubble overlays.",
].join(" ");

const NO_TEXT = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols anywhere on the page.",
  "Do NOT include page numbers, watermarks, signatures, or studio logos.",
].join(" ");

const ANTI_AI = "Do NOT use airbrush, glossy doll-skin shading, or 3D rendering. Hand-drawn imperfection required.";

const PROTAGONIST = [
  "Protagonist: Tachibana Riku — a 24-year-old male Japanese protagonist.",
  "Lean build, average height, short messy black hair, sharp tired eyes.",
  "Wearing modern Japanese street fashion: dark hooded jacket, plain shirt, dark slim jeans, worn sneakers.",
].join(" ");

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "shibuya_rtl",
    prompt: [
      STYLE,
      MINIMALISM,
      STYLE_MIMIC,
      RTL_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume climax — 5 panels arranged in 3 tiers, awakening sequence at Shibuya intersection at night.",
      "",
      "Panel #1 (top tier, FULL WIDTH wide panel): Shibuya Scramble Crossing at night. A glowing magical portal tearing the sky open. Monsters as silhouette swarm pouring out. Panicking civilians as gestural foreground figures (NOT detailed faces).",
      "",
      "Middle tier — panel #2 (RIGHT side, read FIRST in tier): tight close-up on Tachibana Riku's face from below, eyes glowing white with awakened power. White space background, only speed lines radiating outward.",
      "Middle tier — panel #3 (LEFT side, read SECOND in tier): a swarm of 5 monsters mid-leap toward the camera, claws extended. THIS IS THE ONLY DENSELY RENDERED PANEL.",
      "",
      "Bottom tier — panel #4 (RIGHT side, read FIRST in tier): Riku's hand outstretched palm-out, magical sigil hand-drawn on his palm. White space surrounding the hand.",
      "Bottom tier — panel #5 (LEFT side, read SECOND in tier): wide shot — Riku silhouetted alone amid scattered monster corpses. Few civilians as suggested shapes watching. Portal as ink mass behind. Sky and white space dominant.",
      "",
      "Story flow (RTL reading): #1 (city under attack) → #2 (Riku awakens) → #3 (monsters charge) → #4 (Riku unleashes power) → #5 (aftermath, alone amid corpses).",
      NO_TEXT,
      ANTI_AI,
    ].join("\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "rtl_fix", compares_with: "style-mimic-pilot/01.png" },
  },
  {
    idx: 2,
    label: "daily_rtl",
    prompt: [
      STYLE,
      MINIMALISM,
      STYLE_MIMIC,
      RTL_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume opening — 6 panels arranged in 4 tiers, contrast of mundane modern life and dungeon entry.",
      "",
      "Panel #1 (top tier, FULL WIDTH): establishing shot of a temp staffing dispatch center at 6:00 AM, fluorescent lights, vending machines, wall clock. Riku in foreground; other workers as background SILHOUETTES (no detailed faces).",
      "",
      "Middle upper tier — 3 small panels left-to-right reading order is RIGHT first:",
      "Middle upper — panel #2 (RIGHT slot, read FIRST in tier): close-up of Riku's hand holding a smartphone showing a delivery gig app. White background.",
      "Middle upper — panel #3 (CENTER slot, read SECOND in tier): close-up of a 100yen onigiri held in fingers. White background.",
      "Middle upper — panel #4 (LEFT slot, read THIRD in tier): close-up of a governmental signage 'Dungeon Entrance Lv.1-3 Authorized Hunters Only'. White background, the sign is the only detail.",
      "",
      "Bottom tier — panel #5 (RIGHT side, read FIRST in tier): Riku descending an escalator. The TOP HALF of the panel is modern subway concrete; the BOTTOM HALF transitions to organic stone dungeon corridor — the joint visible mid-frame.",
      "Bottom tier — panel #6 (LEFT side, read SECOND in tier): Riku at the bottom of the escalator, holding a cheap dagger and basket. Other low-rank hunters as background SILHOUETTES passing by.",
      "",
      "Story flow (RTL reading): #1 (mundane dispatch) → #2 (gig app) → #3 (cheap meal) → #4 (signage discovery/transition) → #5 (descending into dungeon, modern→fantasy shift) → #6 (arrived at dungeon floor, looking unimpressive).",
      NO_TEXT,
      ANTI_AI,
    ].join("\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "rtl_fix", compares_with: "style-mimic-pilot/02.png" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "rtl-fix-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-rtl-fix] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: コマ順序がストーリー流れと整合するか");
  console.log("特に: style-mimic-pilot/01,02 (順序破綻) vs rtl-fix-pilot/01,02 (順序修正)");
  console.log("仮説: panel# 番号 + 位置明示 + RTL 強調で順序問題を解消できる");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-rtl-fix] FAILED:", err);
  process.exit(1);
});
