/**
 * Week 0 Pilot 実験 1: style-pilot (8枚)
 *
 * 目的: 単一キャラ・標準ポーズで gpt-image-2 の白黒漫画スタイル再現性を確認。
 *       線質/ベタ/トーン/AIらしさの傾向を把握し、prompt matrix を調整する。
 *
 * 合格基準: 8枚中 5枚以上「使える」(キャラ崩れなし / 白黒漫画として違和感少 /
 *           吹き出しを置ける / 同一作品に見える)
 *
 * 出力: data/manga/feasibility-week0/pilot/style-pilot/{01-08}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-style.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

/**
 * テスト用キャラ（仮）: 篠崎奏 (Shinozaki Kanade)
 *   - 16歳男子高校生
 *   - 黒髪短髪 / 切れ長の鋭い目 / 鋭角的な顎
 *   - 痩身、長身 (180cm)
 *   - 制服: 学ラン (詰襟、黒、銀ボタン)
 *   - 表情のデフォルト: 無表情・口を結んでいる
 *   - 性格: 寡黙、剣道部主将、内に熱を秘める
 */
const CHARACTER_DESCRIPTION = [
  "Subject: Shinozaki Kanade — a 16-year-old Japanese male high school student.",
  "Tall and lean (180cm), short jet-black hair with side-swept bangs, sharp narrow eyes,",
  "angular jaw, naturally serious expression with closed mouth.",
  "Wearing a black gakuran (Japanese school uniform with stand-up collar, silver buttons).",
  "Personality reads as quiet, focused, captain of the kendo club, restrained but intense underneath.",
].join(" ");

const COMMON_BW_DIRECTIVE = [
  "Japanese shounen manga page in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient, NO airbrush.",
  "Bold confident black ink outlines with variable line weight; decisive solid blacks (beta) for hair shadow, clothing, and silhouette.",
  "Screentone (halftone dot pattern) for mid-tones — VISIBLE dot grid, not smooth gradient.",
  "Aesthetic of Weekly Shounen Jump / Shounen Magazine — hand-drawn imperfection, brush-pen ink texture.",
].join(" ");

const PANEL_SAFETY = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols.",
  "Do NOT include watermarks, signatures, page numbers, panel borders, or studio logos.",
  "Hands must look natural; no more than five fingers per hand.",
  "Output must be a single panel illustration only — no panel grid, no page layout.",
].join(" ");

const ANTI_AI_NEGATIVES = [
  "Do NOT use airbrushed soft skin gradients, glossy plastic-doll surfaces, or 3D-render shading.",
  "Do NOT use perfectly symmetrical glamour-shot composition or generic anime-template proportions.",
  "Do NOT use photorealistic rendering, depth-of-field bokeh, or cinematic lens flares.",
].join(" ");

function buildPrompt(args: {
  pose: string;
  variationDirective: string;
}): string {
  return [
    COMMON_BW_DIRECTIVE,
    CHARACTER_DESCRIPTION,
    `Pose / framing: ${args.pose}`,
    `Style variation focus: ${args.variationDirective}`,
    "Background: minimal — a hint of the school dojo or empty room, not detailed.",
    PANEL_SAFETY,
    ANTI_AI_NEGATIVES,
  ].join("\n\n");
}

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "baseline_standing",
    prompt: buildPrompt({
      pose: "Medium shot, standing straight facing the viewer, arms at sides, neutral expression.",
      variationDirective:
        "Standard balance — moderate beta and screentone. This is the reference baseline.",
    }),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { variation: "baseline" },
  },
  {
    idx: 2,
    label: "heavy_beta",
    prompt: buildPrompt({
      pose: "Medium shot, standing in a doorway with strong backlight, half his body in shadow.",
      variationDirective:
        "Maximize solid black (beta) usage — heavy black for clothing, hair, and shadow side; minimal screentone. Dramatic chiaroscuro.",
    }),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { variation: "heavy_beta" },
  },
  {
    idx: 3,
    label: "heavy_screentone",
    prompt: buildPrompt({
      pose: "Medium shot, standing in an outdoor school courtyard with afternoon ambience.",
      variationDirective:
        "Maximize screentone usage — densely packed dot patterns for sky/atmosphere, gradient tone for clothing fabric, multiple tone densities. Light beta usage.",
    }),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { variation: "heavy_screentone" },
  },
  {
    idx: 4,
    label: "fine_lines",
    prompt: buildPrompt({
      pose: "Close-up on the upper body, slight three-quarter angle, gazing off-frame to the right.",
      variationDirective:
        "Fine, delicate line work — thin consistent lines, minimal weight variation, subtle screentone. Closer to seinen aesthetic than shounen.",
    }),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { variation: "fine_lines" },
  },
  {
    idx: 5,
    label: "focus_lines_intensity",
    prompt: buildPrompt({
      pose: "Tight close-up on the face, intense gritted-teeth expression, glaring forward.",
      variationDirective:
        "Strong focus lines (shuuchu-sen) radiating from face center. Sharp angular ink strokes, kinetic energy. High contrast beta on hair.",
    }),
    size: MANGA_SIZE_PRESETS.panel_square,
    meta: { variation: "focus_lines" },
  },
  {
    idx: 6,
    label: "extreme_emotion",
    prompt: buildPrompt({
      pose: "Extreme close-up on one eye and part of the face, sweat drop, intense determination.",
      variationDirective:
        "Exaggerated shounen emotional treatment — vein-pop on temple, sweat-drop, eye-shine highlights, gritted teeth visible. Heavy beta around the face frame.",
    }),
    size: MANGA_SIZE_PRESETS.panel_square,
    meta: { variation: "extreme_emotion" },
  },
  {
    idx: 7,
    label: "silhouette_backlit",
    prompt: buildPrompt({
      pose: "Wide shot, full body, standing with his back to a strong light source (window or sunset), figure mostly silhouetted.",
      variationDirective:
        "Heavy silhouette treatment — figure rendered almost entirely in solid black, light rim only. Screentone gradient for the bright background.",
    }),
    size: MANGA_SIZE_PRESETS.panel_landscape,
    meta: { variation: "silhouette" },
  },
  {
    idx: 8,
    label: "splash_composition",
    prompt: buildPrompt({
      pose: "Splash-page composition, full body in dynamic kendo stance with shinai (bamboo sword) raised, low angle looking up.",
      variationDirective:
        "Splash-page energy — strong silhouette, decisive ink strokes, speed lines, dramatic perspective. Heavy beta + selective screentone for atmosphere.",
    }),
    size: MANGA_SIZE_PRESETS.panel_tall,
    meta: { variation: "splash" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "style-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-style] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log(`合格基準: ${ok >= 5 ? "✅ 5/8以上" : "❌ 5/8未満"} → ${ok >= 5 ? "本実験へ進出可能" : "prompt matrix 再調整"}`);
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-style] FAILED:", err);
  process.exit(1);
});
