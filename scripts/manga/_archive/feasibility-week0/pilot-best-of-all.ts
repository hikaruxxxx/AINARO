/**
 * Week 0 究極ハイブリッド Pilot: best-of-all-pilot (2枚) — 全戦略の組み合わせ検証
 *
 * 三位一体戦略:
 *   1. MINIMALISM_DIRECTIVE — 描き込み過剰抑制 (silence_panel A評価の要素)
 *   2. 蔵書 refs 6枚注入 — キャラ顔軽快化 + 画風統一 (status_mimic A-評価の要素)
 *   3. 画像反転 (LTR生成 → 水平反転 → RTL読み順) — コマ順序破綻の最終解決策
 *
 * 2ページ (style-mimic/01,02 と rtl-fix/01,02 で苦戦したシーン):
 *   1. shibuya_best  — 1巻クライマックス、新宿覚醒
 *   2. daily_best    — 1巻冒頭、派遣→ダンジョン
 *
 * 出力:
 *   - data/manga/feasibility-week0/pilot/best-of-all-pilot/{01-02}.png (LTR元画像)
 *   - data/manga/feasibility-week0/pilot/best-of-all-pilot/{01-02}_rtl.png (反転後 = RTL読み順)
 *
 * 反転コマンド: macOS `sips -f horizontal` で水平反転
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-best-of-all.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

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

// === 戦略1: 描き込み抑制 ===
const MINIMALISM = [
  "DRAWING DISCIPLINE — 'Drawing what NOT to draw is also drawing.' Published commercial manga, NOT AI illustration.",
  "Backgrounds MINIMAL — only sketch essential elements with the fewest possible lines. Empty white space required and intentional.",
  "Crowd figures should be reduced to silhouettes or simple line gestures, NOT individually rendered faces.",
  "Use the FEWEST lines needed — confident decisive strokes, NOT over-rendered hatching.",
  "Vary panel density: at least one panel per page must be LOW density (50%+ pure white background). At least one panel must be HIGH density (the dramatic focal). Do NOT make all panels equally busy.",
  "Reference: Inio Asano (Goodnight Punpun) for crowd silhouette work, Naoki Urasawa (Monster) for background restraint, NOT generic AI illustration.",
].join(" ");

// === 戦略2: 蔵書画風寄せ ===
const STYLE_MIMIC = [
  "STRICT STYLE REFERENCE: 6 reference manga pages provided. These are pages from a published commercial Japanese light novel manga adaptation (modern dungeon genre).",
  "Match the references in: line work density (refined, restrained), screentone usage (moderate, varied), beta placement (specific, NOT decorative), character face proportions (light novel adaptation aesthetic — large expressive eyes but proportionate).",
  "Match the COMMERCIAL PUBLISHED MANGA feel — handcrafted, professionally edited.",
].join(" ");

// === 戦略3: LTR順で書く (反転後にRTL になる) ===
// プロンプトは英語LTR順で書く。生成後に水平反転で物理的にRTL化する。
// AI に「RTL」と言わない方が結果が安定 (left/right の英語バイアスに従う)。
const LTR_NOTICE = [
  "Note: this image will be horizontally flipped after generation. Compose it as if reading LEFT-to-RIGHT — the AI's natural orientation. The flip will convert it to Japanese RIGHT-to-LEFT reading order.",
].join(" ");

const STYLE = [
  "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
  "Light novel manga adaptation aesthetic for modern dungeon genre.",
].join(" ");

const LAYOUT = [
  "Compose a complete manga page with multiple panels.",
  "Use thick black panel borders (gutters) between panels.",
  "Each panel must be clearly delineated.",
  "Keep some negative space within panels for SVG speech bubble overlays added later.",
].join(" ");

const NO_TEXT = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, written symbols, or readable signage anywhere on the page.",
  "When a sign or screen is depicted, leave its surface BLANK or use unreadable abstract marks (NEVER readable text — text would be mirrored after the flip).",
  "Do NOT include page numbers, watermarks, signatures, or studio logos.",
].join(" ");

const ANTI_AI =
  "Do NOT use airbrush, glossy doll-skin shading, or 3D rendering. Hand-drawn imperfection required.";

const PROTAGONIST = [
  "Protagonist: Tachibana Riku — a 24-year-old male Japanese protagonist.",
  "Lean build, average height, short messy black hair, sharp tired eyes.",
  "Wearing modern Japanese street fashion: dark hooded jacket, plain shirt, dark slim jeans, worn sneakers.",
].join(" ");

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "shibuya_best",
    prompt: [
      STYLE,
      MINIMALISM,
      STYLE_MIMIC,
      LTR_NOTICE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume climax — 5 panels in 3 tiers (read left-to-right; will be flipped to RTL).",
      "",
      "Panel #1 (top tier, FULL WIDTH): Shibuya Scramble Crossing at night. A glowing magical portal tearing the sky. Monsters as silhouette swarm. Panicking civilians as gestural silhouettes (NO detailed faces). Buildings suggested with simple line silhouettes — NOT detailed, with white sky behind portal.",
      "",
      "Middle tier (read left to right after flip becomes right to left):",
      "Panel #2 (middle tier, LEFT slot — will become RIGHT after flip, read first in RTL): tight close-up on Tachibana Riku's face from below, eyes glowing white. Background: PURE WHITE with only speed lines radiating outward. NO detailed background.",
      "Panel #3 (middle tier, RIGHT slot — will become LEFT after flip, read second in RTL): a swarm of 4-5 monsters mid-leap. THIS IS THE PAGE'S DENSEST PANEL — concentrate detail here.",
      "",
      "Bottom tier:",
      "Panel #4 (bottom tier, LEFT slot — will become RIGHT after flip, read first in RTL): close-up of Riku's hand outstretched palm-out, magical sigil hand-drawn on his palm. Background: white space with sparse particle effects.",
      "Panel #5 (bottom tier, RIGHT slot — will become LEFT after flip, read second in RTL): wide shot — Riku silhouetted alone amid scattered monster shapes. Sky and white space dominant. Few civilian silhouettes watching.",
      "",
      "Story sequence (read order LEFT-to-RIGHT before flip): #1 → #2 → #3 → #4 → #5.",
      "After flip becomes RTL: #1 (top), #2 (middle right, awakening) → #3 (middle left, monsters) → #4 (bottom right, power unleashed) → #5 (bottom left, aftermath).",
      "",
      "CRITICAL: do NOT include any readable text, signage, or symbols on buildings/billboards/screens — they would mirror unintelligibly after the flip.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "best_of_all", strategies: ["minimalism", "refs6", "ltr_then_flip"] },
  },
  {
    idx: 2,
    label: "daily_best",
    prompt: [
      STYLE,
      MINIMALISM,
      STYLE_MIMIC,
      LTR_NOTICE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume opening — 6 panels in 4 tiers (read left-to-right; will be flipped to RTL).",
      "",
      "Panel #1 (top tier, FULL WIDTH): temp staffing dispatch center at 6 AM, fluorescent lights, vending machines, wall clock. Riku in foreground. Other workers as background silhouettes (NO detailed faces). Background details suggested with single-stroke lines.",
      "",
      "Middle upper tier (3 small panels, all LOW density, all white background):",
      "Panel #2 (middle upper, LEFT slot — RIGHT after flip, read first): close-up of a hand holding a smartphone. White background, only the phone and hand detailed.",
      "Panel #3 (middle upper, CENTER slot): close-up of a 100-yen onigiri held by fingers. White background, only the food detailed.",
      "Panel #4 (middle upper, RIGHT slot — LEFT after flip, read third): close-up of a governmental signage post. The signage is a BLANK bordered rectangle (NO readable text — text added later as SVG). White background.",
      "",
      "Bottom tier:",
      "Panel #5 (bottom tier, LEFT slot — RIGHT after flip, read fourth): Riku descending an escalator. TOP HALF of panel = modern subway concrete walls; BOTTOM HALF transitions to organic stone dungeon corridor — visible architectural shift.",
      "Panel #6 (bottom tier, RIGHT slot — LEFT after flip, read fifth): Riku at the bottom of the escalator, holding a dagger and basket. Other low-rank hunters as background silhouettes.",
      "",
      "Story sequence (read LEFT-to-RIGHT before flip): #1 → #2 → #3 → #4 → #5 → #6.",
      "After flip becomes RTL story: dispatch center → smartphone → onigiri → signage → escalator descent → dungeon arrival.",
      "",
      "CRITICAL: signage on panel #4 must be a BLANK bordered rectangle (text would mirror unintelligibly). All other text-bearing surfaces also blank.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "best_of_all", strategies: ["minimalism", "refs6", "ltr_then_flip"] },
  },
];

async function flipHorizontally(inputPath: string): Promise<string> {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, ".png");
  const outputPath = path.join(dir, `${base}_rtl.png`);
  // sips は macOS 標準。元画像はそのまま、flipped は別ファイルに保存
  await execFileAsync("sips", [
    "-f",
    "horizontal",
    inputPath,
    "--out",
    outputPath,
  ]);
  return outputPath;
}

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "best-of-all-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("[best-of-all] 水平反転 (LTR → RTL) を実行中...");

  for (const r of results) {
    if (r.ok && r.outputPath) {
      try {
        const flipped = await flipHorizontally(r.outputPath);
        console.log(`  反転完了: ${path.basename(flipped)}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  反転失敗: ${path.basename(r.outputPath)} - ${message}`);
      }
    }
  }

  console.log("");
  console.log("=========================================");
  console.log(`[pilot-best-of-all] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価対象: {01,02}_rtl.png (反転後 = 日本RTL読み順)");
  console.log("仮説: MINIMALISM + 蔵書refs + 反転 で B- → A 級到達");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-best-of-all] FAILED:", err);
  process.exit(1);
});
