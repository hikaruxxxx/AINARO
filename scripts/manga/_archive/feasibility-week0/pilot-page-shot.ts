/**
 * Week 0 Pilot 実験 4: page-shot-pilot (3枚) — F-2 (ページ一発生成)
 *
 * 目的: gpt-image-2 でマンガ「ページ全体」(コマ割り含む) を一発生成できるかを実測。
 *       L1.4 ramp-down の余地を測る最重要実験。
 *
 * 合格基準: 1/3 以上が「漫画として読める」(コマ割り破綻していない / 読み順が成立する)
 *
 * 出力: data/manga/feasibility-week0/pilot/page-shot-pilot/{01-03}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-page-shot.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

const CHARACTER_DESCRIPTION = [
  "Subject: Shinozaki Kanade — a 16-year-old Japanese male high school student, kendo club captain.",
  "Tall lean build, short jet-black hair, sharp narrow eyes, black gakuran uniform.",
].join(" ");

const COMMON_BW_DIRECTIVE = [
  "Japanese shounen manga page in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient.",
  "Bold black ink, decisive beta, screentone for mid-tones, in the aesthetic of Weekly Shounen Jump.",
].join(" ");

const PAGE_LAYOUT_DIRECTIVE = [
  "Compose a complete manga page with multiple panels in Japanese reading order (RIGHT-TO-LEFT, top-to-bottom).",
  "Use thick black panel borders (gutters) between panels.",
  "Each panel must be clearly delineated by visible borders.",
  "Keep some negative space within panels for future speech bubble placement.",
].join(" ");

const NO_TEXT_DIRECTIVE = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols anywhere on the page.",
  "Bubbles will be added later as SVG overlays.",
  "Do NOT include page numbers, watermarks, signatures, or studio logos.",
].join(" ");

const ANTI_AI = [
  "Do NOT use airbrush, glossy doll-skin shading, or 3D rendering.",
  "Hand-drawn imperfection is required.",
].join(" ");

function buildPagePrompt(scenarioDirective: string): string {
  return [
    COMMON_BW_DIRECTIVE,
    PAGE_LAYOUT_DIRECTIVE,
    CHARACTER_DESCRIPTION,
    `Page scenario: ${scenarioDirective}`,
    NO_TEXT_DIRECTIVE,
    ANTI_AI,
  ].join("\n\n");
}

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "page_5panels_dialogue",
    prompt: buildPagePrompt(
      [
        "5 panels in 3 tiers. Top tier: one wide panel — establishing shot of the dojo at dusk.",
        "Middle tier: two equal panels — Kanade's face in profile (left), then a younger student kneeling in seiza looking up at him (right).",
        "Bottom tier: two panels — close-up on Kanade's hand on the student's shoulder (left), then a wider shot of both with Kanade looking away (right).",
        "Tone: quiet emotional beat, mentor-pupil moment.",
      ].join(" ")
    ),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { panel_count: 5, page_role: "dialogue" },
  },
  {
    idx: 2,
    label: "page_6panels_action",
    prompt: buildPagePrompt(
      [
        "6 panels in 3 tiers, T-split layout. Top tier: tall vertical panel on the right showing Kanade in mid-strike with shinai (full body, low angle).",
        "Top tier left side: stacked two small panels — opponent's reaction face (top), shinai blocking (bottom).",
        "Middle tier: one wide panel — both swords clashing with impact lines.",
        "Bottom tier: two panels — Kanade's intense eye close-up (right), opponent stumbling back (left).",
        "Tone: peak action, kinetic energy.",
      ].join(" ")
    ),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { panel_count: 6, page_role: "action" },
  },
  {
    idx: 3,
    label: "page_4panels_reveal_cliffhanger",
    prompt: buildPagePrompt(
      [
        "4 panels with a final big panel for cliffhanger.",
        "Top tier: two panels — Kanade looking at his phone screen (left), close-up on the phone showing a black silhouette of a person (right).",
        "Middle tier: one panel — Kanade's stunned face, dropping the phone.",
        "Bottom tier: one large panel taking the full lower half — wide shot of a mysterious masked figure standing in the dojo doorway, backlit silhouette.",
        "Tone: reveal + cliffhanger, dramatic page turn.",
      ].join(" ")
    ),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { panel_count: 4, page_role: "cliffhanger" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "page-shot-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-page-shot] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: 各ページが「漫画として読める」か (コマ割り破綻なし / 読み順成立 / 同一人物)");
  console.log(
    `合格基準: ${ok >= 1 ? "✅" : "❌"} ${ok}/3 以上 → F-2 戦略の成立可能性: ${ok >= 1 ? "あり (ハイブリッド検討)" : "なし (F-1中心)"}`
  );
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-page-shot] FAILED:", err);
  process.exit(1);
});
