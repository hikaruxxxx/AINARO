/**
 * Phase A: 評価ベンチ予選 (3モデル × 5コマ = 15枚)
 *
 * 目的: episode-01.md の代表5コマを Flux 2 Pro / Qwen-Image 2.0 / gpt-image-2 で生成し、
 *       画風/線質/AIらしさの初期評価で上位2モデルを選抜する。
 *
 * 代表5コマ:
 *   1. Page 01.5 ヴェルガ立ち姿 (panel_tall)
 *   2. Page 03.5 奏が刀を抜く (panel_landscape)
 *   3. Page 04.3 刃の交差 (panel_square)
 *   4. Page 05.4 奏の驚愕 (panel_tall)
 *   5. Page 08.1 見開き相当 (spread)
 *
 * 出力:
 *   - data/manga/feasibility-week0/eval-bench/output/{provider}/phase-a/{idx}.{ext}
 *
 * 実行:
 *   npx tsx scripts/manga/eval-bench/run-phase-a.ts
 *
 * 環境変数:
 *   - REPLICATE_API_TOKEN (Flux 2 Pro用)
 *   - FAL_KEY (Qwen-Image 2.0用)
 *   - gpt-image-2 は Codex CLI 経由 (ChatGPT Pro定額枠)
 */

import "../_env";
import { runReplicateExperiment, type ReplicatePromptInput } from "./runner-replicate";
import { runFalExperiment, type FalPromptInput } from "./runner-fal";
import { runExperiment, type ExperimentPrompt } from "../feasibility-week0/runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

const COMMON_BW = [
  "Japanese shounen manga panel in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient, NO airbrush.",
  "Bold confident black ink outlines with variable line weight, decisive solid blacks (beta), screentone (halftone dots) for mid-tones.",
  "Aesthetic of Weekly Shounen Jump / Magazine.",
].join(" ");

const KANADE_DESC = [
  "Kanzaki Kanade — 17-year-old Japanese male, isekai swordsman known as 'the Sword Saint'.",
  "Tall lean build, short jet-black hair, sharp narrow eyes, angular jaw, calm intense expression.",
  "Wearing white robe and black hakama (Japanese style), katana sheathed at his left hip.",
].join(" ");

const VERGA_DESC = [
  "Verga — tall man with long silver hair, wearing pitch-black ornate armor with shoulder spikes.",
  "Wearing a featureless white mask covering his face. Two-handed great sword.",
].join(" ");

const SETTING = [
  "Setting: a ruined ancient castle's duel ground at sunset just after rain.",
  "Cracked stone pavement with shallow puddles, thunderclouds in the sky, mood is tense and elegiac.",
].join(" ");

const NO_TEXT = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols.",
  "Do NOT include watermarks, signatures, page numbers, panel borders, or studio logos.",
  "Output a single isolated panel illustration only.",
].join(" ");

type PanelDef = {
  idx: number;
  label: string;
  promptCore: string;
  /** GPT用 size */
  gptSize: { width: number; height: number };
  /** Replicate aspect_ratio */
  replicateAspect: string;
  /** fal image_size */
  falImageSize:
    | "square_hd"
    | "portrait_4_3"
    | "portrait_16_9"
    | "landscape_4_3"
    | "landscape_16_9";
};

const PANELS: PanelDef[] = [
  {
    idx: 1,
    label: "p01_05_verga_standing",
    promptCore: [
      VERGA_DESC,
      SETTING,
      "Composition: full body shot, low angle, Verga standing in a wide stance with his great sword's tip thrust into the cracked stone floor.",
      "Pose: imposing presence, looming, dramatic backlight from the dusk sky behind him.",
    ].join(" "),
    gptSize: MANGA_SIZE_PRESETS.panel_tall,
    replicateAspect: "2:3",
    falImageSize: "portrait_4_3",
  },
  {
    idx: 2,
    label: "p03_05_kanade_drawing_sword",
    promptCore: [
      KANADE_DESC,
      SETTING,
      "Composition: medium-wide three-quarter shot from the side, Kanade in the middle of drawing his katana, blade catching the dusk light.",
      "Pose: dynamic, the white blade flashes against the dark background. Determined expression.",
    ].join(" "),
    gptSize: MANGA_SIZE_PRESETS.panel_landscape,
    replicateAspect: "3:2",
    falImageSize: "landscape_4_3",
  },
  {
    idx: 3,
    label: "p04_03_blade_clash",
    promptCore: [
      KANADE_DESC,
      VERGA_DESC,
      SETTING,
      "Composition: extreme close-up where Kanade's katana and Verga's great sword clash directly in the center of the frame.",
      "Visible impact sparks, motion blur, the two blades forming an X-shape. Both characters' arms are partially visible.",
    ].join(" "),
    gptSize: MANGA_SIZE_PRESETS.panel_square,
    replicateAspect: "1:1",
    falImageSize: "square_hd",
  },
  {
    idx: 4,
    label: "p05_04_kanade_shock",
    promptCore: [
      KANADE_DESC,
      "Composition: tight close-up on Kanade's face, eyes wide open in shock, pupils dilated, his hand trembling on the katana hilt.",
      "Background: blurred dark void with focus lines emanating outward, intense screentone for tension.",
      "Mood: this is the moment he realizes the masked enemy is his lost friend.",
    ].join(" "),
    gptSize: MANGA_SIZE_PRESETS.panel_tall,
    replicateAspect: "2:3",
    falImageSize: "portrait_4_3",
  },
  {
    idx: 5,
    label: "p08_01_spread_clash",
    promptCore: [
      KANADE_DESC,
      VERGA_DESC,
      SETTING,
      "Composition: SPREAD-PAGE wide shot. Both warriors mid-air, their swords clashing at the dead center of the frame, blinding flash of light at the impact point that whitens out the background.",
      "Diagonal composition with Kanade rising from the bottom-right, Verga descending from the top-left.",
      "Maximum dynamism, speed lines, motion blur, ink splatter, this is the climax shot of the entire chapter.",
    ].join(" "),
    gptSize: MANGA_SIZE_PRESETS.spread,
    replicateAspect: "16:9",
    falImageSize: "landscape_16_9",
  },
];

function fullPrompt(panel: PanelDef): string {
  return [COMMON_BW, panel.promptCore, NO_TEXT].join("\n\n");
}

async function runGptImage2Phase(): Promise<void> {
  const prompts: ExperimentPrompt[] = PANELS.map((p) => ({
    idx: p.idx,
    label: p.label,
    prompt: fullPrompt(p),
    size: p.gptSize,
  }));
  await runExperiment({
    stage: "main", // eval-bench は main ステージとして扱う
    experiment: "phase-a-gpt-image-2",
    prompts,
    outputBaseDir:
      (process.env.AINARO_REPO_ROOT ?? process.cwd()) +
      "/data/manga/feasibility-week0/eval-bench/output/gpt-image-2",
  });
}

async function runReplicatePhase(): Promise<void> {
  const prompts: ReplicatePromptInput[] = PANELS.map((p) => ({
    idx: p.idx,
    label: p.label,
    prompt: fullPrompt(p),
    aspectRatio: p.replicateAspect,
  }));
  await runReplicateExperiment({
    experiment: "phase-a",
    prompts,
  });
}

async function runFalPhase(): Promise<void> {
  const prompts: FalPromptInput[] = PANELS.map((p) => ({
    idx: p.idx,
    label: p.label,
    prompt: fullPrompt(p),
    imageSize: p.falImageSize,
  }));
  await runFalExperiment({
    experiment: "phase-a",
    prompts,
  });
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? "all";
  console.log(`[phase-a] target=${target} (all | gpt | replicate | fal)\n`);

  if (target === "all" || target === "gpt") {
    console.log("=== gpt-image-2 (Codex CLI) ===");
    await runGptImage2Phase();
  }
  if (target === "all" || target === "replicate") {
    console.log("\n=== Flux 2 Pro (Replicate) ===");
    await runReplicatePhase();
  }
  if (target === "all" || target === "fal") {
    console.log("\n=== Qwen-Image 2.0 (fal) ===");
    await runFalPhase();
  }

  console.log("\n=========================================");
  console.log("[phase-a] DONE");
  console.log("次: Niji 7 は Discord 手動投入で代表5コマ生成");
  console.log("    その後 scoresheet.md で評価し、上位2モデルを Phase B に進める");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[phase-a] FAILED:", err);
  process.exit(1);
});
