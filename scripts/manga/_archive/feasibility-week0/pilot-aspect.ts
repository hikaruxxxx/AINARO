/**
 * Week 0 Pilot 実験 2: aspect-pilot (8枚)
 *
 * 目的: 同一キャラ・同一シーンで 4種アスペクトを 2枚ずつ生成し、
 *       gpt-image-2 がどのアスペクト比をどこまで対応するかを実測する。
 *
 * 合格基準: 任意比対応の有無確定 (出力サイズが指定通りか / ストレッチ歪みが起きないか)
 *
 * 出力: data/manga/feasibility-week0/pilot/aspect-pilot/{01-08}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-aspect.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import {
  MANGA_SIZE_PRESETS,
  type MangaImageSize,
} from "@/lib/manga/generate/codex-image";

const CHARACTER_DESCRIPTION = [
  "Subject: Shinozaki Kanade — a 16-year-old Japanese male high school student.",
  "Tall and lean (180cm), short jet-black hair, sharp narrow eyes, angular jaw.",
  "Wearing a black gakuran (Japanese school uniform with stand-up collar).",
  "Quiet, focused captain of the kendo club.",
].join(" ");

const COMMON_BW_DIRECTIVE = [
  "Japanese shounen manga page in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient.",
  "Bold confident black ink outlines, decisive solid blacks, screentone for mid-tones.",
  "Aesthetic of Weekly Shounen Jump.",
].join(" ");

const PANEL_SAFETY = [
  "Do NOT render any speech bubbles, dialogue text, captions, or written symbols.",
  "Do NOT include watermarks, page numbers, panel borders, or studio logos.",
  "Output a single panel illustration only.",
].join(" ");

const SCENE_DESCRIPTION =
  "Scene: Kanade in a school dojo at evening, holding a shinai (bamboo sword), serious expression.";

function buildPrompt(framingDirective: string): string {
  return [
    COMMON_BW_DIRECTIVE,
    CHARACTER_DESCRIPTION,
    SCENE_DESCRIPTION,
    `Framing for this aspect: ${framingDirective}`,
    PANEL_SAFETY,
  ].join("\n\n");
}

const SIZE_2K_TALL: MangaImageSize = { width: 1024, height: 1792 };
const SIZE_2K_WIDE: MangaImageSize = { width: 1792, height: 1024 };

const PROMPTS: ExperimentPrompt[] = [
  // 1024×1024 (square) × 2
  {
    idx: 1,
    label: "square_close_face",
    prompt: buildPrompt("Tight close-up on his face, eyes only, intense focus."),
    size: MANGA_SIZE_PRESETS.panel_square,
    meta: { aspect: "1024x1024", target_aspect: "square" },
  },
  {
    idx: 2,
    label: "square_hands_grip",
    prompt: buildPrompt("Close-up on his hands gripping the shinai handle."),
    size: MANGA_SIZE_PRESETS.panel_square,
    meta: { aspect: "1024x1024", target_aspect: "square" },
  },
  // 1024×1536 (portrait/tall) × 2
  {
    idx: 3,
    label: "portrait_full_body",
    prompt: buildPrompt(
      "Full body standing pose with shinai held vertically, low-angle hero shot."
    ),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { aspect: "1024x1536", target_aspect: "portrait" },
  },
  {
    idx: 4,
    label: "tall_dramatic_pose",
    prompt: buildPrompt(
      "Tall dynamic kendo strike pose, shinai mid-swing, motion lines, top-to-bottom emphasis."
    ),
    size: MANGA_SIZE_PRESETS.panel_tall,
    meta: { aspect: "1024x1536", target_aspect: "tall" },
  },
  // 1536×1024 (landscape/spread) × 2
  {
    idx: 5,
    label: "landscape_dojo_establishing",
    prompt: buildPrompt(
      "Wide establishing shot of the dojo from a side angle, Kanade as a small figure on the right, room dominates the frame."
    ),
    size: MANGA_SIZE_PRESETS.panel_landscape,
    meta: { aspect: "1536x1024", target_aspect: "landscape" },
  },
  {
    idx: 6,
    label: "spread_action",
    prompt: buildPrompt(
      "Wide horizontal action — Kanade and an opponent (silhouette) facing each other in the dojo, mirrored composition for a spread."
    ),
    size: MANGA_SIZE_PRESETS.spread,
    meta: { aspect: "1536x1024", target_aspect: "spread" },
  },
  // 任意比 (2K) × 2 — gpt-image-2 が極端アスペクト比を扱えるか
  {
    idx: 7,
    label: "extreme_tall_2k",
    prompt: buildPrompt(
      "Extremely tall vertical composition — head at top, full body extending down, shinai rests vertically along his side."
    ),
    size: SIZE_2K_TALL,
    meta: { aspect: "1024x1792", target_aspect: "extreme_tall" },
  },
  {
    idx: 8,
    label: "extreme_wide_2k",
    prompt: buildPrompt(
      "Extremely wide horizontal composition — Kanade on the far left, the empty dojo extending dramatically to the right."
    ),
    size: SIZE_2K_WIDE,
    meta: { aspect: "1792x1024", target_aspect: "extreme_wide" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "aspect-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-aspect] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log(
    "判定基準: 出力サイズが指定通りか / ストレッチ歪みなしか / 極端比が成立するか を目視確認"
  );
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-aspect] FAILED:", err);
  process.exit(1);
});
