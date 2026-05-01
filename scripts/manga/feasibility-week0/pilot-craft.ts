/**
 * Week 0 究極ハイブリッド v2 Pilot: pilot-craft (2枚)
 *
 * 目的: kindle-test-1 全156ページ精読で抽出した漫画作法 (manga_craft_guide.md v2)
 *       を完全に反映したプロンプトで作品3「東京迷宮」冒頭1ページを生成し、
 *       商業漫画として通用する A 級品質に到達するか検証。
 *
 * 比較対象:
 *   - rtl-fix-pilot/02.png (D 評価。シーン羅列、漫画作法欠如)
 *   - pilot-craft/01.png (A 級目標。本ガイド準拠で panel物語駆動)
 *
 * 同じシナリオ (作品3 1巻冒頭、派遣社員→ダンジョン) を、
 *   旧設計: シーン羅列 (派遣会社→スマホ→おにぎり→看板→エスカレーター→ダンジョン底)
 *   新設計: panel物語駆動 (各panelに主人公感情ビート + 1情報、3段ティア構成)
 * で比較し、漫画作法の効果を実証する。
 *
 * 戦略:
 *   - MINIMALISM (描き込み抑制 + 50%白背景panel必須)
 *   - 蔵書 refs 6枚注入 (画風統一)
 *   - 漫画作法 (panel物語駆動・キャラ紹介ボックス・温度差・主人公独白)
 *   - RTL指示 + panel#番号 + 物理オブジェクト記述
 *
 * 出力: data/manga/feasibility-week0/pilot/craft-pilot/{01-02}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-craft.ts
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

// === 戦略1: 描き込み抑制 ===
const MINIMALISM = [
  "DRAWING DISCIPLINE — 'Drawing what NOT to draw is also drawing.' Published commercial manga, NOT AI illustration.",
  "Backgrounds MINIMAL. Crowd figures as silhouettes/line gestures (NEVER detailed faces). Use FEWEST lines needed.",
  "Vary panel density: at least one panel must be 50%+ pure white. At least one panel must be the dramatic focal point. NO uniform density.",
  "Reference: Inio Asano (Goodnight Punpun), Naoki Urasawa (Monster). NOT generic AI illustration.",
].join(" ");

// === 戦略2: 蔵書画風寄せ ===
const STYLE_MIMIC = [
  "STRICT STYLE REFERENCE: 6 reference manga pages provided from a published commercial Japanese light novel manga adaptation (modern dungeon genre).",
  "Match the references in: line work density, screentone usage, beta placement, character face proportions (light novel adaptation aesthetic).",
  "Match the COMMERCIAL PUBLISHED MANGA feel — handcrafted, professionally edited.",
].join(" ");

// === 戦略3: RTL読み順 ===
const RTL = [
  "READING ORDER — Japanese manga reads RIGHT-TO-LEFT, top-to-bottom.",
  "When panels share a tier, the RIGHT panel is read FIRST, the LEFT panel SECOND.",
  "The numbered 'panel #N' notation reflects the RTL reading order — panel #1 first, #2 second, etc.",
  "Within a horizontal tier with 2+ panels: the FIRST numbered panel goes RIGHT, the next goes to its LEFT.",
].join(" ");

// === 戦略4: 漫画作法 (新規・本Pilotの中核) ===
const MANGA_CRAFT = [
  "MANGA CRAFT (CRITICAL — this is the difference between AI illustration and published manga):",
  "",
  "1) PANEL PURPOSE — Each panel must convey the protagonist's emotional beat + 1 information (NEVER a mere scene-fragment).",
  "   AVOID: panel-as-pamphlet (e.g., 'office → smartphone → onigiri → sign → escalator' is forbidden).",
  "   USE: panel-as-emotional-progression (e.g., 'office shows protagonist's apathy → he overhears coworkers → he decides → he walks → he stops at the entrance, deciding')",
  "",
  "2) MONOLOGUE — Each panel should include the protagonist's inner monologue OR an overheard line that reveals the world.",
  "   Show the world through CASUAL CHARACTER DIALOGUE, NOT via narration boxes.",
  "",
  "3) CHARACTER INTRO BOX — When the protagonist is first shown clearly, include a small bordered box with 'Tachibana Riku / Age 24 / Temp Worker / D-Rank Explorer' (rendered as part of the page layout — but the text inside the box should be drawn as recognizable Japanese characters; this is a stylistic element of the genre).",
  "",
  "4) DENSITY RHYTHM — At least one panel must be 50%+ pure white (silence/breath). At least one panel must be the densely-rendered focal point. NEVER uniform density.",
  "",
  "5) GAP — Include one moment of expectation-vs-reality contrast (e.g., glamorous overheard talk about high-rank explorers vs. the protagonist's grim reality).",
  "",
  "6) ESTABLISHING — When transitioning location, the FIRST panel of the new location must be a wide establishing shot.",
  "",
  "7) INDIRECT EMOTION — For tense or quiet moments, use close-ups of feet, hands, or back of head (NOT face) to convey emotion indirectly.",
  "",
  "8) CROWD AS SILHOUETTE — Background characters MUST be silhouettes or simple line gestures, never detailed faces.",
].join("\n");

const STYLE = [
  "Japanese contemporary urban seinen manga in PURE BLACK-AND-WHITE — NO color, NO grayscale gradient, NO airbrush.",
  "Light novel manga adaptation aesthetic for modern dungeon genre.",
].join(" ");

const LAYOUT = [
  "Compose a complete manga page with multiple panels.",
  "Use thick black panel borders (gutters) between panels.",
  "Each panel must be clearly delineated.",
  "Keep negative space within panels for SVG speech bubble overlays added later.",
].join(" ");

const NO_TEXT = [
  "Do NOT render readable speech bubble text, dialogue text, sound effects, captions, or written symbols.",
  "EXCEPTION: a small character intro box (with the protagonist's name and attributes) is allowed, written in Japanese as a decorative panel element.",
  "Bubbles and most text will be added later as SVG overlays.",
  "Do NOT include page numbers, watermarks, signatures, or studio logos.",
].join(" ");

const ANTI_AI = "Do NOT use airbrush, glossy doll-skin shading, or 3D rendering. Hand-drawn imperfection required.";

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "tokyo_meikyu_opening_craft",
    prompt: [
      STYLE,
      MINIMALISM,
      STYLE_MIMIC,
      RTL,
      LAYOUT,
      MANGA_CRAFT,
      "",
      "===== CHARACTER CAST =====",
      "Protagonist: Tachibana Riku, 24-year-old male Japanese, lean build, average height, short messy black hair, sharp tired eyes, wearing dark hooded jacket over plain shirt + dark slim jeans + worn sneakers. Looks like an unremarkable temp worker; subtle hidden potential in his eyes.",
      "Background coworkers: silhouettes only. NO detailed faces. They are wallpaper.",
      "",
      "===== PAGE 1: 1-VOLUME OPENING (作品3 東京迷宮 1話冒頭) =====",
      "Page goal: introduce Tachibana Riku as a low-tier temp worker who moonlights as a D-class explorer. Read the world's apathy through his face. End with him deciding to descend.",
      "Density rhythm: 5 panels, 3 tiers. Tier 1 dense (establishing), Tier 2 balanced (dialogue + reaction), Tier 3 contains a 50%+ white panel (silence) AND a closer dramatic shot.",
      "",
      "Panel #1 (top tier, FULL WIDTH, ESTABLISHING + INTRO):",
      "  Wide establishing shot of a temp staffing dispatch office at 6 AM. Fluorescent lights overhead, vending machines, a wall clock showing 6:00. A line of temp workers waits — drawn as SILHOUETTES (no detailed faces). Tachibana Riku stands at the front of the line, slightly turned, his face visible — a flat, apathetic expression.",
      "  In the panel's lower-right corner: a small bordered intro box with the Japanese text '立花 陸 / 24歳 / 派遣社員 / D級探索者' (Tachibana Riku / age 24 / temp worker / D-rank explorer). This intro box is INTENTIONAL stylistic element, drawn as part of the layout.",
      "  Density: MEDIUM (background suggested with single-stroke lines, focus on Riku's face).",
      "",
      "Middle tier (panels share dialogue):",
      "Panel #2 (middle tier, RIGHT side, read FIRST):",
      "  Close-up on two background coworker silhouettes at the front desk, drawn from behind/shoulder. A small thought bubble or speech bubble (LEFT BLANK for SVG) hovers — the implied content is overheard chatter about high-rank explorers' fortunes (the gap reality).",
      "  Density: LOW (mostly white space, only silhouette outlines).",
      "Panel #3 (middle tier, LEFT side, read SECOND):",
      "  Tight close-up on Tachibana Riku's eyes only (cropped face, just eyes and a sliver of brow). His expression registers the overheard conversation — a flicker of something unreadable. NO speech bubble; this is silent reaction.",
      "  Density: LOW (50%+ white, just the eyes float in negative space).",
      "",
      "Bottom tier (transition + decision):",
      "Panel #4 (bottom tier, RIGHT side, read FIRST):",
      "  Riku from behind, walking down a crowded morning Tokyo street toward a subway entrance. Above the entrance, a SIGN: a blank-bordered rectangle (text added later as SVG, depicting 'Dungeon Entrance Lv.1-3 Authorized Hunters Only'). Other commuters as silhouettes.",
      "  Density: MEDIUM (street suggested, Riku's back as the dominant element).",
      "Panel #5 (bottom tier, LEFT side, read SECOND, DRAMATIC FOCAL):",
      "  Riku stands at the very edge of the staircase down to the dungeon entrance. He is shown from a slightly low angle — silhouetted against a cold morning light, looking down at the staircase. We see his profile and the shadow of the descending stairs. This is the page's DRAMATIC FOCAL — densely rendered with strong beta on his coat shadow and on the staircase, with screentone for the morning light gradient.",
      "  Density: HIGH (this is the page's most rendered panel, contrasting with the white-space middle tier).",
      "",
      "Story flow (read RTL): #1 (the gray morning + Riku introduced) → #2 (overheard glamour talk) → #3 (Riku's silent reaction, eyes only) → #4 (decision, walking toward dungeon) → #5 (final beat at the staircase, deciding to descend).",
      "",
      "EMOTIONAL ARC: apathy → overheard glamour → silent acknowledgment → resolve → descent.",
      "EXPECTATION-VS-REALITY GAP: the overheard talk about high-rank explorers' wealth (panel #2) contrasts with Riku's gray reality (panel #1 + #4 + #5).",
      "",
      "REMEMBER: this page is NOT a pamphlet of scenes. It is the PROTAGONIST's emotional progression in 5 beats.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: {
      test: "manga_craft_v2",
      strategies: ["minimalism", "refs6", "rtl_directive", "panel_emotional_progression", "intro_box", "expectation_reality_gap"],
      compares_with: "rtl-fix-pilot/02.png (D rated)",
      target_quality: "A (commercial publishable)",
    },
  },
  {
    idx: 2,
    label: "tokyo_meikyu_awakening_craft",
    prompt: [
      STYLE,
      MINIMALISM,
      STYLE_MIMIC,
      RTL,
      LAYOUT,
      MANGA_CRAFT,
      "",
      "===== CHARACTER CAST =====",
      "Protagonist: Tachibana Riku, 24-year-old male, dark hooded jacket. Now in a dungeon, wounded.",
      "Antagonist: a wolf-like dungeon monster, large, claws, fanged jaws.",
      "",
      "===== PAGE 2: AWAKENING SCENE (作品3 1巻クライマックス覚醒) =====",
      "Page goal: the moment Tachibana Riku awakens his hidden skill. Pinned, dying — then a hexagonal sigil appears in his eye, a status HUD frame floats next to him, and his body fills with light. End with the monster recoiling.",
      "Density rhythm: 4 panels, 3 tiers. Tier 1 = HIGH density (the dying moment). Tier 2 = LOW density (the silent awakening — eye + HUD on white space). Tier 3 = the dramatic transformation with light.",
      "",
      "Panel #1 (top tier, FULL WIDTH, HIGH DENSITY focal):",
      "  Riku pinned against a cracking dungeon stone wall by a massive wolf-monster's claw. Blood from his shoulder. His face strained but defiant. Heavy beta and hatching for shadow. The wall behind him cracks visibly. Stone texture detailed via screentone.",
      "  Density: HIGH (this is the page's most rendered panel — the climactic crisis).",
      "",
      "Middle tier (silent awakening — TWO LOW-DENSITY panels):",
      "Panel #2 (middle tier, RIGHT side, read FIRST):",
      "  Extreme close-up on Riku's eye. The pupil is dilating. Inside the iris, a thin geometric pattern is forming — a hexagon with internal grid lines (the sigil of awakening). NO background, just pure white surrounding the eye.",
      "  Density: LOW (50%+ pure white).",
      "Panel #3 (middle tier, LEFT side, read SECOND):",
      "  A transparent floating status window UI — a clean rectangular HUD frame with thin borders, empty interior (text added later as SVG). A soft halo of light around it, drawn as curved lines (NOT screentone gradient). The HUD floats in pure white space.",
      "  Density: LOW (50%+ pure white).",
      "",
      "Panel #4 (bottom tier, FULL WIDTH, transformation):",
      "  Riku's whole body shown standing up, lit from within by an inner glow. His expression has shifted from dying-strain to wide-eyed awakening — eyes wide, mouth slightly open. The wolf-monster recoils to the left side of the frame, snarling but stepping back. The dungeon stone trembles, debris floats around. Strong silhouette against the inner light.",
      "  Density: MEDIUM-HIGH (silhouette + light effects, but the surrounding space is mostly debris/atmosphere with some white breathing room).",
      "",
      "Story flow (read RTL): #1 (dying crisis, full width) → #2 (eye sigil forming, silent low density) → #3 (HUD appearing, silent low density) → #4 (full body awakening, full width transformation).",
      "",
      "EMOTIONAL ARC: dying despair → silent flicker of something new → it's real (the HUD confirms) → REBIRTH.",
      "INDIRECT EMOTION: panels #2 and #3 use the eye and the HUD frame as proxies for the protagonist's transformation, not his face directly. This is the genre signature.",
      "GAP: the HIGH-density crisis (panel #1) contrasts with the LOW-density silent awakening (panels #2-#3) — the page breathes.",
      "",
      "REMEMBER: this is the genre's signature scene. The status HUD must look like a clean modern UI element (matching the references), NOT cluttered. The empty middle tier is intentional — the silence of awakening.",
      NO_TEXT,
      ANTI_AI,
    ].join("\n"),
    size: MANGA_SIZE_PRESETS.page_b5,
    referenceImagePaths: REFS_ALL,
    meta: {
      test: "manga_craft_v2",
      strategies: ["minimalism", "refs6", "rtl_directive", "indirect_emotion", "density_rhythm_extreme"],
      compares_with: "modern-dungeon-pilot/03.png (B-) and minimalism-pilot/03.png (A-)",
      target_quality: "A (commercial publishable awakening scene)",
    },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "craft-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-craft] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価対象: 商業漫画として通用する A 級か");
  console.log("比較: rtl-fix-pilot/02 (D) vs craft-pilot/01 (A目標)");
  console.log("仮説: kindle-test-1 全156p から抽出した作法を全反映で B- → A 達成");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-craft] FAILED:", err);
  process.exit(1);
});
