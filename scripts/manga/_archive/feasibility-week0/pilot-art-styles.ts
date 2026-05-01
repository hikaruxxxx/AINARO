/**
 * Week 0 追加 Pilot: art-styles-pilot (5枚)
 *
 * 目的: 実装した5つの art_style がそれぞれ異なる画風として再現できるかを実測。
 *       同じキャラ・同じポーズ・同じシーンで5画風を比較生成し、画風差を視覚評価。
 *
 * 5画風:
 *   1. manga_bw_shounen        (集英社少年漫画系)
 *   2. manga_bw_seinen         (青年誌・大人ドラマ系)
 *   3. manga_bw_seinen_dark    (Berserk/Vagabond 劇画系) — ダンジョン探索向け
 *   4. manga_bw_shoujo_classic (Rose of Versailles 系) — 転生貴族向け
 *   5. manga_bw_seinen_urban   (Tokyo Ghoul 系) — 現代ダンジョン向け
 *
 * 統一シーン: 同一キャラの立ち姿、中立表情、室内設定 — 画風差のみが変数
 *
 * 出力: data/manga/feasibility-week0/pilot/art-styles-pilot/{01-05}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-art-styles.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

const SUBJECT = [
  "Subject: a 17-year-old male protagonist, standing facing the viewer in medium shot.",
  "Black hair (medium length), thoughtful expression, neutral mouth, clear eyes.",
  "Wearing era-appropriate attire for the depicted style (school uniform, fantasy garb, noble outfit, modern jacket as fitting).",
  "Standing in a setting that fits the genre (school hallway / dungeon entrance / castle interior / modern street, choose what fits the style).",
].join(" ");

const PANEL_SAFETY = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols.",
  "Do NOT include watermarks, signatures, page numbers, panel borders, or studio logos.",
  "Output is a single panel illustration only — no panel grid, no page layout.",
  "Hands must look natural; no more than five fingers per hand.",
].join(" ");

const ANTI_AI = [
  "Do NOT use airbrushed soft skin gradients, glossy plastic-doll surfaces, or 3D-render shading.",
  "Do NOT use perfectly symmetrical glamour-shot composition or generic anime-template proportions.",
  "Do NOT use photorealistic rendering or cinematic lens flares.",
].join(" ");

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "manga_bw_shounen",
    prompt: [
      "Japanese shounen manga page in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient, NO airbrush, NO smooth shading.",
      "Bold confident black ink outlines with variable line weight; decisive solid blacks (beta) for hair shadow, clothing, and silhouette.",
      "Screentone (halftone dot pattern) for mid-tones — VISIBLE dot grid pattern.",
      "Speed lines, focus lines, impact lines, and motion blur for action and emphasis.",
      "Dynamic kinetic poses; exaggerated facial expressions when appropriate.",
      "Aesthetic of Weekly Shounen Jump / Shounen Magazine — hand-drawn imperfection, brush-pen ink texture.",
      SUBJECT,
      "Setting: school hallway with lockers, fluorescent overhead light.",
      PANEL_SAFETY,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { art_style: "manga_bw_shounen", genre_target: "general" },
  },
  {
    idx: 2,
    label: "manga_bw_seinen",
    prompt: [
      "Japanese seinen manga page in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient, NO airbrush.",
      "Fine detailed line work with subtle line-weight variation; densely packed screentone for atmosphere, texture, and material rendering.",
      "Realistic anatomy and proportions; restrained naturalistic facial expressions and body language.",
      "Heavy use of solid black (beta) for shadow and mood; dramatic chiaroscuro lighting via beta + screentone overlap.",
      "Aesthetic of Big Comic / Morning / Afternoon / Young Magazine — adult drama, mature sensibility.",
      SUBJECT,
      "Setting: quiet dimly lit indoor space, late evening light through a window.",
      PANEL_SAFETY,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { art_style: "manga_bw_seinen", genre_target: "general" },
  },
  {
    idx: 3,
    label: "manga_bw_seinen_dark",
    prompt: [
      "Japanese dark fantasy seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
      "Dense detailed ink work with heavy hatching and cross-hatching for shadow rendering.",
      "Line weight varies dramatically — fine details for faces, thick decisive strokes for silhouettes and background.",
      "Extensive use of solid black (beta) for environmental shadow and oppressive atmosphere.",
      "Realistic mature anatomy with weight and gravitas.",
      "Screentone sparingly used — primarily for stone texture, fog, and gradient atmosphere. Hand-hatched gradation preferred.",
      "Aesthetic of Berserk / Vagabond / Battle Angel Alita / Bastard!! — gothic fantasy, brooding tone.",
      SUBJECT.replace("school uniform, fantasy garb, noble outfit, modern jacket as fitting", "fantasy adventurer outfit (leather/cloth, with worn travel cloak)"),
      "Setting: crumbling stone dungeon corridor lit by a single torch, deep shadows, mossy stone walls.",
      PANEL_SAFETY,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { art_style: "manga_bw_seinen_dark", genre_target: "dungeon_exploration" },
  },
  {
    idx: 4,
    label: "manga_bw_shoujo_classic",
    prompt: [
      "Japanese classic-style shoujo manga page in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
      "Fine delicate line work with consistent thin lines.",
      "Intricate decorative detail for hair flow, fabric folds, ornamental motifs (roses, ribbons, lace).",
      "Large expressive eyes with starburst highlights and detailed iris reflection. Slim elegant body proportions.",
      "Extensive screentone usage — gradient tones for clothing fabric, sky, and emotional atmosphere. Multiple tone densities layered.",
      "Light beta usage — only for hair shadow and accent contrast. Page should feel light, airy, lyrical.",
      "Aesthetic of Rose of Versailles / Yona of the Dawn / classic Hakusensha shoujo — aristocratic settings, period costume.",
      SUBJECT.replace("school uniform, fantasy garb, noble outfit, modern jacket as fitting", "ornate medieval European noble's attire (waistcoat, cravat, tailcoat)"),
      "Setting: grand castle interior — marble floor, tall arched windows, oil paintings on walls, soft afternoon light.",
      PANEL_SAFETY,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { art_style: "manga_bw_shoujo_classic", genre_target: "noble_territory" },
  },
  {
    idx: 5,
    label: "manga_bw_seinen_urban",
    prompt: [
      "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
      "Confident realistic line work with fluid weight variation.",
      "Modern cityscapes drawn with architectural precision (buildings, signs, train stations, dungeon entrance overlays).",
      "Photorealistic anatomy and contemporary fashion.",
      "Strong use of beta for night scenes, shadow on faces, and dramatic mood.",
      "Screentone for daytime sky, concrete texture, and dungeon interior gradient.",
      "Aesthetic of Solo Leveling (adapted to monochrome JP manga) / Tokyo Ghoul / Ajin — modern Japan with supernatural intrusion.",
      SUBJECT.replace("school uniform, fantasy garb, noble outfit, modern jacket as fitting", "modern casual jacket over hoodie, dark jeans, sneakers — contemporary Japanese street fashion"),
      "Setting: Tokyo street at dusk — Shibuya-style intersection, neon signs visible but unlit, an unnatural dungeon portal glowing in the background.",
      PANEL_SAFETY,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.panel_portrait,
    meta: { art_style: "manga_bw_seinen_urban", genre_target: "modern_dungeon" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "art-styles-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-art-styles] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: 5画風がそれぞれ異なる作風として描き分けられているか目視確認");
  console.log("特に: shounen vs seinen vs seinen_dark の劇画寄り差分、shoujo_classic の細線・大瞳、seinen_urban の現代背景");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-art-styles] FAILED:", err);
  process.exit(1);
});
