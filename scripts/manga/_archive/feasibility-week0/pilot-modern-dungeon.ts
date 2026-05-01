/**
 * Week 0 追加 Pilot: modern-dungeon-pilot (3枚) — 作品3 現代ダンジョン特化
 *
 * 目的: Phase A 作品3「東京迷宮: 最弱探索者の覚醒」の代表的な漫画ページを
 *       gpt-image-2 (F-2) で生成し、作品としての画作りの方向性を確認。
 *
 * 3ページ:
 *   1. shibuya_awakening    — 1巻クライマックス: 新宿駅前モンスター群制圧、覚醒した主人公
 *   2. daily_life_routine   — 1巻冒頭: 派遣社員の日常 (現代日本リアル) → ダンジョン入口へ
 *   3. status_window_reveal — 主人公スキル覚醒の瞬間 (現代UI×異世界エフェクト)
 *
 * 出力: data/manga/feasibility-week0/pilot/modern-dungeon-pilot/{01-03}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-modern-dungeon.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

const STYLE = [
  "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
  "Aesthetic of Solo Leveling (monochrome adaptation) / Tokyo Ghoul / Ajin — confident realistic line work, modern cityscape architectural precision, contemporary fashion, strong beta for shadow and night scenes, screentone for daytime sky and concrete texture.",
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
  "Lean build, average height, short messy black hair, sharp tired eyes that hint at hidden potential.",
  "Wearing modern Japanese street fashion: dark hooded jacket over a plain shirt, dark slim jeans, worn sneakers.",
  "He looks like an unremarkable temp worker by day — until something inside him awakens.",
].join(" ");

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "shibuya_awakening",
    prompt: [
      STYLE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume climax — 5 panels, awakening sequence at Shibuya intersection at night.",
      "Top tier: one wide panel — Shibuya Scramble Crossing at night with massive billboards (unlit due to power outage from dungeon outbreak), a glowing magical portal tearing the sky open above the intersection, dozens of horde monsters (goblin/wolf hybrids with twisted modern-flesh anatomy) pouring out, panicking civilians fleeing in foreground, smoke and debris.",
      "Middle tier left: tight close-up on Tachibana Riku's face from below, his eyes suddenly glowing white with awakened power, a transparent floating UI window (status screen — empty rectangular frame) appearing beside his head.",
      "Middle tier right: a swarm of 5+ monsters mid-leap toward the camera, claws extended, fanged maws open.",
      "Bottom tier left: Riku's hand outstretched, palm facing the camera, a magical sigil/circle hand-drawn forming on his palm with delicate ink lines and dot pattern (no text inside the sigil).",
      "Bottom tier right: a wide shot — Riku standing alone amid scattered monster corpses, the surviving civilians watching in disbelief from behind, a TV news camera drone hovering above with its red recording light visible. Strong silhouette with rim light from the still-glowing portal.",
      "Important: balance modern Tokyo elements (skyscrapers, signage style, Western/Japanese billboards, traffic lights, paved roads with white lines) with the supernatural intrusion. Keep all text WITHIN signs unreadable/blurred (we add SVG overlays later).",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { genre: "modern_dungeon", scene: "climax_awakening" },
  },
  {
    idx: 2,
    label: "daily_life_routine",
    prompt: [
      STYLE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume opening — 6 panels, contrast of mundane modern life and dungeon entry.",
      "Top tier: one wide panel — establishing shot of a typical Tokyo office building's basement (派遣会社 / temp staffing dispatch center), Riku in his hoodie standing in line with other temp workers waiting for assignment, fluorescent lights, vending machines, a wall clock showing 6:00 AM.",
      "Middle tier (3 small panels equal): panel 1 — Riku checking a smartphone screen showing a generic delivery app (low-budget gig); panel 2 — Riku eating a 100yen convenience store rice ball (onigiri) on a park bench; panel 3 — Riku ducking into a non-descript subway station entrance, but the sign on the staircase says 'Dungeon Entrance Lv. 1-3 Authorized Hunters Only' in stylized Japanese governmental signage.",
      "Bottom tier left: Riku descending a long underground escalator that transitions from modern subway concrete to an organic stone dungeon corridor — the architectural shift visible mid-frame.",
      "Bottom tier right: a wide shot — Riku at the bottom of the escalator, equipped only with a cheap-looking dagger and a basket. Other low-rank hunters in similar shabby gear pass him by. He looks unimpressive — exactly like the protagonist before awakening.",
      "Important: emphasize the visual contrast — top half = mundane modern Tokyo realism, bottom half = subtle introduction of dungeon elements. The reader should feel 'this is just an ordinary day' until the architectural shift on the escalator panel.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { genre: "modern_dungeon", scene: "opening_daily_life" },
  },
  {
    idx: 3,
    label: "status_window_reveal",
    prompt: [
      STYLE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: pivotal awakening moment — 4 panels, intimate scene of Riku's hidden skill activating for the first time.",
      "Top tier: one wide panel — Riku pinned against a dungeon stone wall by a massive monster's claw (wolf-like creature with extra limbs), blood from his shoulder, dying gasp expression, deep beta around the scene for menace. The wall behind him cracked from the impact.",
      "Middle tier left: extreme close-up on Riku's eye, pupil dilating, a faint geometric pattern (a hexagon with internal grid) forming over his iris — the visible moment of skill awakening.",
      "Middle tier right: a transparent floating status window UI (like a video game HUD) suddenly appearing in the air beside him — rectangular frame with horizontal lines representing data fields (empty for now, no text), a soft halo of light around it.",
      "Bottom tier: one large panel — Riku's whole body lit up with an inner glow, the monster recoiling in shock, the dungeon corridor visibly trembling around them. Riku's expression shifts from dying to awakening — eyes wide, mouth slightly open, transformation moment.",
      "Important: the status window must look like a clean modern HUD (UI design language: minimalist rectangles, thin borders) while everything else maintains the gothic dungeon aesthetic — this contrast is the genre's signature visual style. NO text inside the status window (SVG overlay later).",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { genre: "modern_dungeon", scene: "skill_awakening_intimate" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "modern-dungeon-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-modern-dungeon] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: 作品3「東京迷宮」の世界観・主人公・覚醒シーンが商業漫画として成立するか目視判定");
  console.log("特に: 現代Tokyo要素 vs 異世界要素のコントラスト / UI×ファンタジー融合 / 主人公の魅力");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-modern-dungeon] FAILED:", err);
  process.exit(1);
});
