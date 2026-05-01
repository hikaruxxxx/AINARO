/**
 * Week 0 追加 Pilot: style-mimic-pilot (3枚) — 蔵書画風寄せ検証
 *
 * 目的: kindle-test-1「現代ダンジョンで最強になる物語 (缶詰ガチャ)」の画風を
 *       参照画像 6枚として注入し、作品3「東京迷宮」のシーンを生成。
 *       商業ラノベコミカライズ画風に寄せられるかを実測。
 *
 * 参照画像 6枚 (data/manga/feasibility-week0/refs/style-mimic/):
 *   1. ref-01-conversation       — 現代会話 (画風の地の力)
 *   2. ref-02-protagonist        — 主人公単独アップ
 *   3. ref-03-skill-activation   — スキル発動・立ち姿+手のひら
 *   4. ref-04-awakened-character — 現代日常+覚醒者キャラ
 *   5. ref-05-skill-ui           — スキルUI+鑑定眼 ⭐ HUD参照
 *   6. ref-06-city-dungeon       — 都市×ダンジョン×モンスター ⭐ 新宿系参照
 *
 * 3ページ (modern-dungeon-pilot と同じシーン3つ):
 *   1. shibuya_mimic   — 1巻クライマックス (新宿覚醒)
 *   2. daily_mimic     — 1巻冒頭 (派遣→ダンジョン)
 *   3. status_mimic    — 覚醒シーン (HUD出現)
 *
 * 比較:
 *   - modern-dungeon-pilot/{01,02,03}.png (refs なし、過剰書き込み)
 *   - minimalism-pilot/{01,02,03}.png (refs なし、省略型プロンプト)
 *   - style-mimic-pilot/{01,02,03}.png (refs あり、商業画風寄せ) ← 本Pilot
 *
 * 著作権: 私的Kindle蔵書からのスタイル参照解析は著作権法30条の4 (情報解析) の範疇。
 *         生成物が原作の構図・キャラデザを直接複製しないことを目視確認する。
 *
 * 出力: data/manga/feasibility-week0/pilot/style-mimic-pilot/{01-03}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-style-mimic.ts
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

const STYLE_MIMIC_DIRECTIVE = [
  "STRICT STYLE REFERENCE: 6 reference manga pages are provided. These are pages from a published commercial Japanese light novel manga adaptation (modern dungeon genre, similar to the work being created).",
  "",
  "Your output MUST match these references in:",
  "  - Line work density and weight (refined, restrained, NOT over-rendered)",
  "  - Screentone usage (moderate, varied by surface, NOT uniform across the page)",
  "  - Beta (solid black) placement (specific to hair shadow and clothing folds, NOT decorative)",
  "  - Character face proportions (light novel adaptation aesthetic — large expressive eyes but proportionate, NOT idealized symmetry)",
  "  - Background treatment (suggested, partial, white space dominant — NOT fully detailed)",
  "  - Panel composition rhythm (varied density across panels — NOT every panel equally busy)",
  "",
  "Match the COMMERCIAL PUBLISHED MANGA feel of the references — handcrafted, professionally edited, restrained.",
  "Avoid the 'AI illustration' look (over-detailed, idealized, uniform density).",
].join("\n");

const STYLE = [
  "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
  "Light novel manga adaptation aesthetic for modern dungeon genre.",
].join(" ");

const LAYOUT = [
  "Compose a complete manga page with multiple panels in Japanese reading order (RIGHT-TO-LEFT, top-to-bottom).",
  "Use thick black panel borders (gutters) between panels.",
  "Each panel must be clearly delineated by visible borders.",
  "Keep some negative space within panels for future speech bubble placement.",
].join(" ");

const NO_TEXT = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols anywhere on the page.",
  "Bubbles will be added later as SVG overlays.",
  "Do NOT include page numbers, watermarks, signatures, or studio logos.",
].join(" ");

const ANTI_AI = [
  "Do NOT use airbrush, glossy doll-skin shading, or 3D rendering.",
  "Hand-drawn imperfection is required.",
].join(" ");

const PROTAGONIST = [
  "Protagonist: Tachibana Riku — a 24-year-old male Japanese protagonist.",
  "Lean build, average height, short messy black hair, sharp tired eyes.",
  "Wearing modern Japanese street fashion: dark hooded jacket over a plain shirt, dark slim jeans, worn sneakers.",
  "An unremarkable temp worker by day — until something inside him awakens.",
].join(" ");

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "shibuya_mimic",
    prompt: [
      STYLE,
      STYLE_MIMIC_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume climax — 5 panels, awakening sequence at Shibuya intersection at night.",
      "Top tier (one wide panel): Shibuya Scramble Crossing at night with a glowing magical portal tearing the sky open, monsters as silhouette swarm pouring out, panicking civilians in foreground (gestural, not detailed).",
      "Middle tier left: tight close-up on Tachibana Riku's face from below, eyes glowing white with awakened power.",
      "Middle tier right: a swarm of 5 monsters mid-leap, claws extended.",
      "Bottom tier left: Riku's hand outstretched, magical sigil forming on his palm with delicate ink.",
      "Bottom tier right: wide shot — Riku alone amid scattered monster corpses, a TV news drone hovering. Strong silhouette with portal rim light.",
      "REMEMBER: match the published manga aesthetic of the 6 reference pages. Restrained line work, varied panel density, white space dominant where appropriate.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "style_mimic", refs: 6, source: "kindle-test-1" },
  },
  {
    idx: 2,
    label: "daily_mimic",
    prompt: [
      STYLE,
      STYLE_MIMIC_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume opening — 6 panels, contrast of mundane modern life and dungeon entry.",
      "Top tier: establishing shot of a temp staffing dispatch center, Riku in line with other workers, fluorescent lights, vending machines, wall clock 6:00 AM.",
      "Middle tier (3 small panels): Riku checking smartphone gig app; eating 100yen onigiri on park bench; descending into subway station marked 'Dungeon Entrance Lv.1-3 Authorized Hunters Only'.",
      "Bottom tier left: Riku descending an escalator from modern subway concrete to organic stone dungeon corridor — architectural shift mid-frame.",
      "Bottom tier right: Riku at the bottom with cheap dagger and basket, other low-rank hunters in similar shabby gear pass by.",
      "REMEMBER: match the published manga aesthetic. Strong density variation between mundane top half and supernatural bottom half.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "style_mimic", refs: 6, source: "kindle-test-1" },
  },
  {
    idx: 3,
    label: "status_mimic",
    prompt: [
      STYLE,
      STYLE_MIMIC_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: pivotal awakening moment — 4 panels, intimate scene of Riku's hidden skill activating.",
      "Top tier: Riku pinned against dungeon stone wall by a wolf-like monster's claw, blood from shoulder, dying expression.",
      "Middle tier left: extreme close-up on Riku's eye, pupil with hexagonal sigil pattern forming — visible moment of awakening.",
      "Middle tier right: a transparent floating status window UI rectangular frame appearing, empty interior, soft halo of light.",
      "Bottom tier: Riku's whole body lit with inner glow, monster recoiling, dungeon corridor trembling. Eyes wide, mouth open — transformation moment.",
      "REMEMBER: match the published manga aesthetic. The status window must look like the UI references in ref-05 — clean modern HUD with thin borders, NOT over-decorated.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: { test: "style_mimic", refs: 6, source: "kindle-test-1" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "style-mimic-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-style-mimic] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: kindle-test-1 の商業画風に寄せられたか目視判定");
  console.log("特に: modern-dungeon-pilot/01,02,03 (refs なし) と style-mimic-pilot/01,02,03 (refs あり) を並べて比較");
  console.log("仮説: 商業漫画 refs 6枚注入で B- → A- に近づく (LoRA代替策)");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-style-mimic] FAILED:", err);
  process.exit(1);
});
