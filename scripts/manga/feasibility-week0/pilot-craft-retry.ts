/**
 * craft-pilot/01 リトライ — タイムアウト拡張版 (10分)
 *
 * 元 pilot-craft.ts のうち #1 (tokyo_meikyu_opening_craft) のみ再実行。
 * timeoutMs を 5分 → 10分に伸ばして、長時間タスクの完走確率を上げる。
 *
 * 出力: data/manga/feasibility-week0/pilot/craft-pilot/01.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-craft-retry.ts
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

const MINIMALISM = [
  "DRAWING DISCIPLINE — 'Drawing what NOT to draw is also drawing.' Published commercial manga, NOT AI illustration.",
  "Backgrounds MINIMAL. Crowd figures as silhouettes/line gestures (NEVER detailed faces). Use FEWEST lines needed.",
  "Vary panel density: at least one panel must be 50%+ pure white. At least one panel must be the dramatic focal point. NO uniform density.",
  "Reference: Inio Asano (Goodnight Punpun), Naoki Urasawa (Monster). NOT generic AI illustration.",
].join(" ");

const STYLE_MIMIC = [
  "STRICT STYLE REFERENCE: 6 reference manga pages provided from a published commercial Japanese light novel manga adaptation (modern dungeon genre).",
  "Match the references in: line work density, screentone usage, beta placement, character face proportions (light novel adaptation aesthetic).",
].join(" ");

const RTL = [
  "READING ORDER — Japanese manga reads RIGHT-TO-LEFT, top-to-bottom.",
  "When panels share a tier, the RIGHT panel is read FIRST, the LEFT panel SECOND.",
  "The numbered 'panel #N' notation reflects the RTL reading order — panel #1 first, #2 second, etc.",
  "Within a horizontal tier with 2+ panels: the FIRST numbered panel goes RIGHT, the next goes to its LEFT.",
].join(" ");

const MANGA_CRAFT = [
  "MANGA CRAFT (CRITICAL — this is the difference between AI illustration and published manga):",
  "1) PANEL PURPOSE: Each panel = protagonist's emotional beat + 1 information. NEVER a mere scene-fragment.",
  "2) MONOLOGUE: Each panel includes the protagonist's inner monologue OR overheard line.",
  "3) CHARACTER INTRO BOX: Include a small bordered box with Japanese text '立花 陸 / 24歳 / 派遣社員 / D級探索者' as a stylistic element.",
  "4) DENSITY RHYTHM: At least one panel 50%+ pure white. At least one panel densely-rendered focal.",
  "5) GAP: Include one moment of expectation-vs-reality contrast.",
  "6) ESTABLISHING: When transitioning location, FIRST panel must be a wide establishing shot.",
  "7) INDIRECT EMOTION: Use close-ups of feet, hands, or back of head (NOT face) for tense or quiet moments.",
  "8) CROWD AS SILHOUETTE: Background characters MUST be silhouettes, never detailed faces.",
].join("\n");

const STYLE = "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush. Light novel manga adaptation aesthetic for modern dungeon genre.";
const LAYOUT = "Compose a complete manga page with multiple panels. Use thick black panel borders. Each panel clearly delineated. Keep negative space for SVG speech bubbles.";
const NO_TEXT = "Do NOT render readable speech bubble text, dialogue, sound effects, captions. EXCEPTION: a small character intro box with the protagonist's name in Japanese is allowed as a decorative panel element.";
const ANTI_AI = "Do NOT use airbrush, glossy doll-skin shading, or 3D rendering. Hand-drawn imperfection required.";

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "tokyo_meikyu_opening_craft",
    prompt: [
      STYLE,
      MINIMALISM,
      STYLE_MIMIC,
      RTL,
      LAYOUT,
      MANGA_CRAFT,
      "",
      "===== CHARACTER =====",
      "Tachibana Riku, 24-year-old male Japanese, lean build, short messy black hair, sharp tired eyes, dark hooded jacket + plain shirt + dark jeans + worn sneakers. Looks like an unremarkable temp worker.",
      "Background coworkers: silhouettes only.",
      "",
      "===== PAGE: 1巻冒頭 (5 panels, 3 tiers) =====",
      "Goal: introduce Riku as low-tier temp worker through his emotional arc — apathy → overheard glamour → silent reaction → resolve → descent.",
      "",
      "Panel #1 (top tier, FULL WIDTH, ESTABLISHING):",
      "  Wide shot of a temp staffing dispatch office at 6 AM. Fluorescent lights, vending machines, wall clock 6:00. Line of workers as SILHOUETTES. Riku at front of line, face visible, flat apathetic expression.",
      "  Lower-right corner: small bordered intro box with Japanese '立花 陸 / 24歳 / 派遣社員 / D級探索者'.",
      "  Density: MEDIUM.",
      "",
      "Panel #2 (middle tier, RIGHT, read FIRST):",
      "  Two coworker silhouettes from behind, gestural figures. Empty speech bubble (for SVG, implying overheard talk about high-rank explorers).",
      "  Density: LOW (50%+ white).",
      "",
      "Panel #3 (middle tier, LEFT, read SECOND):",
      "  Extreme close-up: Riku's eyes only, cropped face. Subtle reaction — flicker of something. NO speech bubble.",
      "  Density: LOW (50%+ pure white, eyes float in negative space).",
      "",
      "Panel #4 (bottom tier, RIGHT, read FIRST):",
      "  Riku from behind walking toward subway entrance on a Tokyo street. Sign above entrance is a BLANK rectangle (text added later as SVG). Other commuters as silhouettes.",
      "  Density: MEDIUM.",
      "",
      "Panel #5 (bottom tier, LEFT, read SECOND, DRAMATIC FOCAL):",
      "  Riku at the edge of staircase down to the dungeon. Slightly low angle, silhouetted profile against cold morning light. Strong beta on coat shadow and staircase. Screentone for morning light.",
      "  Density: HIGH (the page's most rendered panel).",
      "",
      "Story flow (RTL): #1 (apathy) → #2 (overheard) → #3 (silent reaction) → #4 (decision, walking) → #5 (resolve at staircase).",
      NO_TEXT,
      ANTI_AI,
    ].join("\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "manga_craft_v2_retry" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "craft-pilot",
    prompts: PROMPTS,
    timeoutMs: 10 * 60 * 1000, // 10分に拡張
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-craft-retry] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価対象: 1巻冒頭 panel物語駆動が商業A級か");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-craft-retry] FAILED:", err);
  process.exit(1);
});
