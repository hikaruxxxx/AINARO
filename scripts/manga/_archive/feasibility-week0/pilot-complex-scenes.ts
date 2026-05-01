/**
 * Week 0 追加 Pilot: complex-scenes-pilot (4枚) — F-2 ページ一発生成
 *
 * 目的: 複数キャラ + 複雑背景の漫画ページが gpt-image-2 で出せるかを実測。
 *       3作品ジャンルそれぞれの「最も複雑になりそうなシーン」+ アクション多人数 を検証。
 *
 * 4ページ:
 *   1. dungeon_party_battle  — ダンジョン探索: 4人パーティ vs 大型モンスター (manga_bw_seinen_dark)
 *   2. royal_audience        — 転生貴族: 王の謁見シーン、玉座+王+主人公+騎士複数 (manga_bw_shoujo_classic)
 *   3. modern_dungeon_raid   — 現代ダンジョン: 街中の異変、主人公+仲間+一般人パニック (manga_bw_seinen_urban)
 *   4. crowd_action          — シリーズ汎用: 群衆+主人公アクション、画面情報量max (manga_bw_seinen)
 *
 * 合格基準: 4ページ中 2/4 以上が「漫画として読める」(コマ割り+読み順+キャラ判別+背景情報量) 成立
 *
 * 出力: data/manga/feasibility-week0/pilot/complex-scenes-pilot/{01-04}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-complex-scenes.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

const PAGE_LAYOUT_DIRECTIVE = [
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

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "dungeon_party_battle",
    prompt: [
      "Japanese dark fantasy seinen manga page in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
      "Aesthetic of Berserk / Vagabond — heavy hatching, dense ink, gothic dungeon atmosphere, brooding tone, screentone for stone/fog gradient.",
      PAGE_LAYOUT_DIRECTIVE,
      "Page scenario: 5 panels in 3 tiers, action-driven layout.",
      "Top tier: one wide panel — establishing shot of a 4-person adventurer party (a tall male warrior with sword, a hooded female mage with staff, a short male thief with daggers, a tall female cleric with a hammer) entering a vast dungeon hall, mossy stone walls, single torchlight.",
      "Middle tier left: a giant minotaur monster lunging from shadows, claws extended (dramatic close-up).",
      "Middle tier right: the warrior raising his sword to block, gritted teeth, sweat-drop, heavy beta.",
      "Bottom tier left: the mage casting a glowing spell symbol (magic circle hand-drawn), focused expression.",
      "Bottom tier right: the thief darting behind the monster's leg with daggers ready, motion lines.",
      "Important: all 4 party members must be clearly distinguishable across panels (different hair, height, weapon).",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { genre: "dungeon_exploration", complexity: "5char_action" },
  },
  {
    idx: 2,
    label: "royal_audience",
    prompt: [
      "Japanese classic-style shoujo manga page in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
      "Aesthetic of Rose of Versailles / Yona of the Dawn — fine delicate line work, intricate decorative detail (roses, lace, fabric folds), large expressive eyes with starburst highlights, multiple screentone densities, light beta usage.",
      PAGE_LAYOUT_DIRECTIVE,
      "Page scenario: 4 panels — political audience scene at the royal court.",
      "Top tier: one wide panel — establishing shot of a vast throne room with marble columns, tall arched windows, ornate chandelier, the king seated on an elevated throne, four royal guards flanking him in armor.",
      "Middle tier left: close-up on the king's stern face — middle-aged with a beard and crown, an evaluating gaze.",
      "Middle tier right: the protagonist (a young noble in tailored aristocratic attire — waistcoat, cravat, tailcoat) kneeling on one knee, head bowed in formal greeting.",
      "Bottom tier: one wide panel — the protagonist looking up to meet the king's eyes, a moment of mutual recognition. Two princesses stand to the king's side observing with intrigue.",
      "Important: 7+ characters present. The protagonist, king, two princesses, four guards must all be distinguishable.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { genre: "noble_territory", complexity: "7char_court" },
  },
  {
    idx: 3,
    label: "modern_dungeon_raid",
    prompt: [
      "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
      "Aesthetic of Solo Leveling (monochrome adaptation) / Tokyo Ghoul / Ajin — confident realistic line work, modern cityscapes with architectural precision, contemporary fashion, strong beta for shadow.",
      PAGE_LAYOUT_DIRECTIVE,
      "Page scenario: 5 panels — a modern Tokyo street suddenly disrupted by a dungeon outbreak.",
      "Top tier: one wide panel — establishing shot of a Shibuya-like crowded intersection, modern buildings with billboards, suddenly a glowing portal tearing open in mid-air, dark mist seeping out.",
      "Middle tier left: a panicking crowd running, salaryman in suit dropping his bag, a young woman screaming, an elderly person stumbling.",
      "Middle tier right: a young male protagonist (modern jacket, hood up, sharp eyes) standing calmly amid the chaos, facing the portal, hand reaching for an unseen weapon.",
      "Bottom tier left: a partner character (a serious woman with short black hair, government-agency-style coat, holding a tactical sidearm) appearing beside the protagonist.",
      "Bottom tier right: monsters (low-tier goblin-like creatures with modern-era flesh distortion) emerging from the portal, clawed hands first.",
      "Important: balance modern Japan elements (architecture, fashion, signage style) with supernatural horror. 6+ visible characters.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { genre: "modern_dungeon", complexity: "6char_supernatural" },
  },
  {
    idx: 4,
    label: "crowd_action",
    prompt: [
      "Japanese seinen manga page in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
      "Aesthetic of Big Comic / Morning — fine detailed line work, dense screentone, realistic anatomy, dramatic chiaroscuro.",
      PAGE_LAYOUT_DIRECTIVE,
      "Page scenario: 4 panels — high-information-density action sequence.",
      "Top tier: one large panel — a busy market square seen from a high angle, dozens of background figures (merchants, shoppers, street performers), the lone protagonist (a serious-faced young man in dark coat) cutting through the crowd toward a confrontation.",
      "Middle tier left: tight on the protagonist's intense eyes, his hand on a hidden weapon under his coat.",
      "Middle tier right: an antagonist (older man with scar, intimidating stance) standing 10 meters away across the square, two thugs flanking him.",
      "Bottom tier: one wide panel — the protagonist sprinting forward through the crowd that parts in surprise, motion lines, the antagonist drawing a blade in response, multiple bystanders' shocked faces visible in the background.",
      "Important: maintain crowd density without losing the focal characters. 15+ visible figures total. The protagonist must be clearly identifiable in every panel.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { genre: "general", complexity: "15char_crowd" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "complex-scenes-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-complex-scenes] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: 4ページ中で『漫画として読める + キャラ判別可能 + 背景情報量適正』が何枚あるか目視判定");
  console.log("特に: 多人数の描き分け / 複雑背景の破綻有無 / アクション混雑時の視線誘導 / ジャンル別画風適合性");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-complex-scenes] FAILED:", err);
  process.exit(1);
});
