/**
 * Week 0 追加 Pilot: minimalism-pilot (4枚) — 「描かないことが描くこと」検証
 *
 * 目的: AIっぽさの根本原因と推定される「描き込み過剰」「画面情報密度の均一性」を、
 *       プロンプト工夫だけで解消できるかを実測。同じシーンを「省略型プロンプト」で
 *       再生成し、既存 modern-dungeon-pilot と並べて比較する。
 *
 * 4ページ (modern-dungeon-pilot と同じシーン3つ + 新規1つ):
 *   1. shibuya_minimal      — 1巻クライマックス再生成 (省略型) — modern-dungeon-pilot/01 と比較
 *   2. daily_life_minimal   — 1巻冒頭再生成 (省略型) — modern-dungeon-pilot/02 と比較
 *   3. status_window_minimal — 覚醒シーン再生成 (省略型) — modern-dungeon-pilot/03 と比較
 *   4. silence_panel        — 「無音」「余白支配」のテストページ (新規シーン)
 *
 * 出力: data/manga/feasibility-week0/pilot/minimalism-pilot/{01-04}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-minimalism.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

/**
 * 「描かないこと」を強制するプロンプト (本Pilotの主要変数)
 */
const MINIMALISM_DIRECTIVE = [
  "CRITICAL DRAWING PHILOSOPHY: 'Drawing what NOT to draw is drawing.' This is a published commercial manga page, not an AI-generated illustration.",
  "",
  "Density control:",
  "  - Backgrounds must be MINIMAL — only sketch the essential elements with the fewest possible lines.",
  "  - Empty WHITE SPACE is required in every panel. The reader's eye must rest somewhere.",
  "  - Each panel has DIFFERENT density — close-up panels have nearly empty backgrounds; establishing panels have moderate detail; never EVERY panel densely rendered.",
  "  - Crowd figures should be reduced to silhouettes or simple line gestures, not individually rendered faces.",
  "",
  "Line economy:",
  "  - Use the FEWEST lines needed to convey form. Confident decisive strokes, not over-rendered hatching.",
  "  - For a face/character: 80% of lines define silhouette and key features; trust the reader to fill the rest.",
  "  - For backgrounds: suggest with single strokes or partial lines (a window frame may be just two parallel lines, no glass detail).",
  "",
  "Negative restrictions:",
  "  - Do NOT pack every corner of every panel with detail.",
  "  - Do NOT render every brick of a wall, every leaf of a tree, every face of a crowd.",
  "  - Do NOT use uniform screentone density across the page — vary it deliberately.",
  "  - Do NOT make all panels equally 'busy'; some panels should feel empty by design.",
  "",
  "Reference: think Inio Asano (Goodnight Punpun) for crowd silhouette work, Naoki Urasawa (Monster) for background restraint, classic Tezuka for empty space, NOT generic AI illustration art.",
].join("\n");

const STYLE_URBAN = [
  "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
  "Aesthetic: confident realistic line work, BUT with disciplined economy — Solo Leveling adapted to Japanese commercial manga sensibility (less rendered, more suggested).",
  "Strong use of beta for true shadow only (not decorative). Screentone reserved for distinct surfaces (sky, concrete, dungeon stone) — NOT applied uniformly across the page.",
].join(" ");

const STYLE_SEINEN = [
  "Japanese seinen manga in PURE BLACK-AND-WHITE — fine detailed line work but with disciplined economy.",
  "Heavy use of solid black (beta) for shadow and mood, BUT only where dramatically necessary. Restrained naturalistic facial expressions.",
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
  "Do NOT make every face an idealized symmetric beauty — give characters individuality through asymmetry, slight imperfection, varied face shapes.",
  "Hand-drawn imperfection is required.",
].join(" ");

const PROTAGONIST = [
  "Protagonist: Tachibana Riku — a 24-year-old male Japanese protagonist.",
  "Lean build, average height, short messy black hair, sharp tired eyes that hint at hidden potential.",
  "Wearing modern Japanese street fashion: dark hooded jacket over a plain shirt, dark slim jeans, worn sneakers.",
  "An unremarkable temp worker by day — until something inside him awakens.",
].join(" ");

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "shibuya_minimal",
    prompt: [
      STYLE_URBAN,
      MINIMALISM_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume climax — 5 panels, awakening sequence at Shibuya intersection at night.",
      "Top tier (one wide panel, MEDIUM density): Shibuya Scramble Crossing at night, but render with restraint — suggest the buildings with simple silhouettes, the portal with bold dark mass, monsters as a SWARM SHADOW (not individually drawn). Foreground civilians as gestures only (not detailed faces).",
      "Middle tier left (LOW density): tight close-up on Tachibana Riku's face from below, eyes glowing white. Background: completely empty white space with just speed lines radiating outward. NO detailed background.",
      "Middle tier right (HIGH density only here): one detailed swarm of monsters — this is the only densely rendered panel on the page.",
      "Bottom tier left (LOW density): Riku's hand outstretched, palm with hand-drawn magic sigil. Background: empty white space with sparse particle effects.",
      "Bottom tier right (MEDIUM density): wide shot — Riku silhouetted, a few suggested civilian shapes watching, the portal as an ink mass behind. Most of the panel: sky, white space, atmospheric.",
      "CRITICAL: ensure visual rhythm of LOW → MEDIUM → HIGH → LOW → MEDIUM densities. Reader's eye should travel comfortably with rest stops.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { test: "minimalism", compares_with: "modern-dungeon-pilot/01.png" },
  },
  {
    idx: 2,
    label: "daily_life_minimal",
    prompt: [
      STYLE_URBAN,
      MINIMALISM_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: 1-volume opening — 6 panels, contrast of mundane modern life and dungeon entry, with extreme density variation.",
      "Top tier (MEDIUM density): establishing shot of a temp staffing dispatch center. Suggest fluorescent lights with two parallel lines, a wall clock as a circle with two hands, a few line-drawn workers in line. NO detailed faces in the line of workers — just gestural figures with one or two detail accents (briefcases, posture). Riku in foreground rendered with more line detail.",
      "Middle tier (3 small panels, ALL LOW density): panel 1 — Riku's hand holding smartphone (close-up, white background); panel 2 — a 100yen onigiri held in hand (close-up of just the food and fingers, white background); panel 3 — a single signage detail (just the sign 'Dungeon Entrance Lv.1-3' as the focal element, surrounding white).",
      "Bottom tier left (LOW-MEDIUM density): the architectural transition — escalator from modern to dungeon. Suggest both halves with minimal line work, focus on the JOINT line where modern concrete becomes stone. Riku as silhouette descending.",
      "Bottom tier right (MEDIUM density): Riku at the bottom, holding cheap dagger and basket. Other low-rank hunters as background silhouettes (no detailed faces). Stone wall with just a few suggestion strokes.",
      "CRITICAL: 3 small middle-tier panels must each have only ONE focal element on white background — no clutter.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { test: "minimalism", compares_with: "modern-dungeon-pilot/02.png" },
  },
  {
    idx: 3,
    label: "status_window_minimal",
    prompt: [
      STYLE_URBAN,
      MINIMALISM_DIRECTIVE,
      LAYOUT,
      PROTAGONIST,
      "Page scenario: pivotal awakening moment — 4 panels, intimate scene with extreme density contrast.",
      "Top tier (HIGH density only here): Riku pinned against dungeon stone wall by a monster's claw — this is the page's only dense panel, rendered with detailed beta and hatching for menace. Stone wall with cracking detail.",
      "Middle tier left (LOW density): extreme close-up on Riku's eye, pupil with hexagonal sigil pattern forming. Surroundings: pure white space. Just the eye and one curve of facial outline.",
      "Middle tier right (LOW density): a transparent floating status window UI rectangular frame. Empty interior (for SVG overlay later). Surrounding: white space with a soft halo of light suggested by curved lines, NOT screentone gradient.",
      "Bottom tier (MEDIUM density): Riku's whole body lit from within, monster recoiling. Dungeon corridor partially visible, but FOCUS should be on Riku's silhouette and the monster's withdrawal — surrounding stone simplified.",
      "CRITICAL: Top tier vs middle tier creates extreme density contrast. White space in middle panels must feel intentional, not empty by mistake.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { test: "minimalism", compares_with: "modern-dungeon-pilot/03.png" },
  },
  {
    idx: 4,
    label: "silence_panel",
    prompt: [
      STYLE_SEINEN,
      MINIMALISM_DIRECTIVE,
      LAYOUT,
      "Page scenario: a quiet aftermath scene — 4 panels, almost no action, demonstrating mastery of NEGATIVE SPACE.",
      "Top tier (MEDIUM-LOW density): one wide panel — a young man sitting alone on a park bench at dusk, viewed from medium distance. Background: only a single tree silhouette, the bench, suggestion of sky. Empty white space dominates the panel. NO crowd, NO buildings detailed, NO clutter.",
      "Middle tier left (LOW density): close-up of his hands resting on his knees, suggestion of fabric folds, no background.",
      "Middle tier right (LOW density): close-up of his face looking up at something off-frame. Single hair strand, a suggestion of the eye's reflection, no detailed background.",
      "Bottom tier (MEDIUM density): wide shot — same scene as top tier, but now a single bird (or leaf, or paper) drifts past in foreground. The background of the entire bottom panel: 70% empty sky, 30% suggested ground. Most lines are absent. Beta only on the silhouette of the man and the single drifting object.",
      "CRITICAL: This page must demonstrate that the AI understands SILENCE in manga. The whitespace is the content. Resist any urge to add detail anywhere.",
      "Every panel: at LEAST 50% of pixel area must be PURE WHITE.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    meta: { test: "minimalism", compares_with: "(new scene)" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "minimalism-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-minimalism] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: 'AIっぽさ' (描き込み過剰・均一密度) が解消されたか目視判定");
  console.log("特に: modern-dungeon-pilot/01,02,03.png と minimalism-pilot/01,02,03.png を並べて比較");
  console.log("仮説: プロンプトに『描かないこと』を強制すれば B- → A- に近づく");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-minimalism] FAILED:", err);
  process.exit(1);
});
