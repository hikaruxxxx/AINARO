/**
 * Week 0 Pilot 拡張: 「東京迷宮」第1話 P1 (冒頭ページ) を見本準拠で再構築。
 *
 * 過去の page-composite-pilot/page-01.png は「主人公の派遣オフィス倦怠」を5コマで描いてしまい、
 * 商業漫画 1話冒頭の責務 (世界観 establishing) を満たさず D 評価だった。
 *
 * v2 では kindle-test-1 c_0008 (1話 p2) の作法を踏襲:
 *   - panel 1 (上段大ゴマ): YouTube動画UI - D攻略ストリーマーの戦闘シーン
 *   - panel 2 (中段右): ニュース速報スマホ画面
 *   - panel 3 (中段左): 街俯瞰 + ダンジョン入口看板
 *   - panel 4 (下段右): D級証カード close-up + マスコット「探 (タン)」ロゴ
 *   - panel 5 (下段左): 主人公シルエット (背中、顔見せない)
 *
 * テンプレ: big_top_5 (上段大ゴマ 5コマ)
 *
 * 出力: data/manga/feasibility-week0/pilot/establishing-pilot/
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-establishing.ts
 */

import "../_env";
import path from "path";
import { existsSync, statSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

import { generateMangaImage, MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";
import { composeMangaPage } from "@/lib/manga/render/panel-composite";
import { getTemplate } from "@/lib/manga/page-director/layout-templates";
import { PAGE_DIMENSIONS } from "@/lib/manga/page-director/types";

const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? process.cwd();
const REFS_DIR = path.join(REPO_ROOT, "data", "manga", "feasibility-week0", "refs", "style-mimic");

const REFS_ALL = [
  path.join(REFS_DIR, "ref-01-conversation.png"),
  path.join(REFS_DIR, "ref-02-protagonist.png"),
  path.join(REFS_DIR, "ref-03-skill-activation.png"),
  path.join(REFS_DIR, "ref-04-awakened-character.png"),
  path.join(REFS_DIR, "ref-05-skill-ui.png"),
  path.join(REFS_DIR, "ref-06-city-dungeon.png"),
];

const OUTPUT_DIR = path.join(
  REPO_ROOT,
  "data",
  "manga",
  "feasibility-week0",
  "pilot",
  "establishing-pilot"
);

// ============================================================
// 共通プロンプト要素
// ============================================================

const STYLE_DIRECTIVE = [
  "Japanese seinen manga panel illustration in PURE BLACK-AND-WHITE only. NO color. NO grayscale gradient.",
  "Style: Solo Leveling × Tokyo Ghoul aesthetic — sharp ink line work, decisive beta (solid black areas),",
  "professional screentone for mid-tones, urban realism. Light novel adaptation feel.",
].join(" ");

const MINIMALISM = [
  "DRAWING DISCIPLINE — 'Drawing what NOT to draw is also drawing.' Use FEWEST lines that convey the moment.",
  "Backgrounds minimal where appropriate. Crowd figures as silhouettes (NEVER detailed faces).",
  "Avoid uniform hatching density. Avoid every-corner-detailed AI rendering.",
].join(" ");

const SOLO_PANEL_DIRECTIVE = [
  "OUTPUT IS A SINGLE STANDALONE PANEL ILLUSTRATION — do NOT draw panel borders, do NOT draw multiple panels,",
  "do NOT draw a manga page grid. Output fills the entire image canvas edge-to-edge as one scene.",
  "Do NOT render any speech bubbles, dialogue text, narration boxes,",
  "page numbers, watermarks, signatures.",
  "EXCEPTION: small hand-drawn SFX (onomatopoeia) in katakana only is acceptable IF specified in 'INCLUDE_SFX' below.",
  "If no INCLUDE_SFX is given, do NOT render any text characters at all.",
].join(" ");

const ANTI_AI = [
  "Avoid: cloned silhouettes (identical posture/height/spacing), perfect symmetric effects,",
  "perfect geometric magic patterns, uniform line weight throughout, evenly spaced background figures,",
  "AI illustration sheen. Embrace: line weight variation, decisive ink, intentional asymmetry.",
].join(" ");

const REFS_DIRECTIVE = [
  "STRICT STYLE REFERENCE: 6 reference pages from a published commercial Japanese seinen manga (modern dungeon genre).",
  "Match line work density, screentone usage, beta placement, face proportions, urban texture handling.",
  "Match the COMMERCIAL PUBLISHED MANGA feel — handcrafted, edited, professional.",
].join(" ");

function buildPanelPrompt(args: {
  panel_idx: number;
  panel_role: string;
  scene_directive: string;
  change_from_prev: string;
  visual_focus: string;
  include_sfx?: string;
}): string {
  const sfxLine = args.include_sfx
    ? `INCLUDE_SFX: render the katakana SFX "${args.include_sfx}" inside the panel as bold hand-drawn ink strokes (NOT computer font, integrated into the artwork as if drawn by the manga artist). Only this SFX text, no other text.`
    : "INCLUDE_SFX: none — do NOT render any text characters.";

  return [
    STYLE_DIRECTIVE,
    "",
    `THIS PANEL (panel #${args.panel_idx} of 5, role=${args.panel_role}):`,
    args.scene_directive,
    "",
    `VISUAL FOCUS: ${args.visual_focus}`,
    "",
    `CHANGE FROM PREVIOUS PANEL: ${args.change_from_prev}`,
    "(this panel must visibly advance time/space/emotion from the previous one — NOT a standalone poster image)",
    "",
    sfxLine,
    "",
    MINIMALISM,
    "",
    ANTI_AI,
    "",
    REFS_DIRECTIVE,
    "",
    SOLO_PANEL_DIRECTIVE,
  ].join("\n");
}

// ============================================================
// シーン定義
// ============================================================

type PanelDef = {
  panel_idx: number;
  slot_id: "s1" | "s2" | "s3" | "s4" | "s5";
  panel_role: string;
  scene_directive: string;
  change_from_prev: string;
  visual_focus: string;
  size_preset_key: keyof typeof MANGA_SIZE_PRESETS;
  include_sfx?: string;
};

const PANELS: PanelDef[] = [
  // ---- panel 1: 上段大ゴマ - YouTube動画画面 (世界観establishing) ----
  {
    panel_idx: 1,
    slot_id: "s1",
    panel_role: "world_establishing_youtube",
    scene_directive: [
      "A black-bordered manga panel rendered as a YouTube video player frame.",
      "Inside the video frame (the main content): a dynamic mid-action shot of a young female dungeon attack streamer in tactical gear,",
      "swinging a curved blade at a glowing crystalline monster in an underground stone cavern.",
      "Strong dramatic angle, motion lines, beta black for the cavern shadows, screentone for crystal glow.",
      "Around the video frame, draw simple manga-style YouTube UI elements: a play/pause button, a video progress timeline bar, a 'thumbs up' icon, a tiny view count area.",
      "These UI elements are drawn in clean ink lines, NOT photorealistic — they look like a manga artist's stylized rendition of a video player.",
      "The whole composition reads as 'somebody is watching this video on a screen', framing the dungeon-attack action.",
      "Convey: in this 2024 Tokyo, dungeon attack is a popular streaming genre — the new gold rush.",
    ].join(" "),
    change_from_prev: "Opening panel — establish the world THROUGH a video screen, not direct reality.",
    visual_focus: "The streamer mid-strike at the crystal. The SFX impact. The video IS the world's reality.",
    size_preset_key: "panel_landscape",
    include_sfx: "バシッ",
  },

  // ---- panel 2: 中段右 - ニュース速報スマホ画面 ----
  {
    panel_idx: 2,
    slot_id: "s2",
    panel_role: "news_alert_smartphone",
    scene_directive: [
      "Tight medium shot of a hand holding a smartphone, screen facing the camera.",
      "On the screen: a stylized news flash alert layout — a bold red header bar (rendered as solid beta black for B&W), a thumbnail box (showing an abstract dungeon entrance silhouette), a headline text area (rendered as DENSE ABSTRACT INKED LINES, NOT legible Japanese characters), and below it a few news body lines (also abstract).",
      "The smartphone's bezel is sharply inked. The hand is anonymous — could be anyone.",
      "Background: blurred screentone of a busy street with vague pedestrian silhouettes.",
      "Pure black-and-white seinen manga style.",
      "Convey: a breaking-news alert about a new dungeon appearance — but the protagonist is just one of millions holding a phone right now.",
    ].join(" "),
    change_from_prev: "Camera shifts from the world-as-video (panel 1) to the world-as-news flash on a personal screen.",
    visual_focus: "The phone screen as the news feed. The hand is deliberately anonymous.",
    size_preset_key: "panel_landscape",
  },

  // ---- panel 3: 中段左 - 街俯瞰 + ダンジョン入口看板 ----
  {
    panel_idx: 3,
    slot_id: "s3",
    panel_role: "city_bystander_overhead",
    scene_directive: [
      "Medium high-angle shot of a Shinjuku-like Tokyo street.",
      "In the foreground, several pedestrians walking — some looking down at smartphones with screens lit, faces partially shadowed by phone glow.",
      "Crowd should be VARIED — different heights, postures, clothing styles. Some in business suits, some in casual wear, some students. NOT cloned silhouettes.",
      "In the middle background: a large prominent official metal sign over a basement staircase entrance. The sign is clearly inked with a bold 'D' letter mark and a smaller circular emblem next to it (the explorer association mark, with a tiny chibi creature shape).",
      "The sign should read as 'this is a government-authorized dungeon entrance', recognizable but no legible Japanese characters needed beyond the 'D'.",
      "Pure black-and-white seinen manga style. Heavy beta on building shadows, screentone for background buildings.",
      "Convey: dungeons are normalized into Tokyo daily life. People walk past them while watching attack streams on their phones.",
    ].join(" "),
    change_from_prev: "Camera lifts from the phone (panel 2) to the street where everyone is on phones near a dungeon entrance.",
    visual_focus: "The varied phone-watching crowd + the dungeon entrance sign. The casualness of it all.",
    size_preset_key: "panel_landscape",
  },

  // ---- panel 4: 下段右 - D級証カード close-up + マスコット「探」 ----
  {
    panel_idx: 4,
    slot_id: "s4",
    panel_role: "d_class_card_closeup",
    scene_directive: [
      "Extreme close-up of a government-issued explorer ID card lying on a worn desk surface.",
      "The card has a clean polymer-plastic look with embossed details:",
      "  - A photo placeholder area showing a silhouetted profile (stylized, no facial detail)",
      "  - A LARGE bold 'D' letter mark dominating the right side (rank indicator)",
      "  - A small chibi mascot character in the lower-left corner of the card: a round plush-doll-like creature, simple eyes, holding a tiny leaf in its paws — this is the explorer association mascot.",
      "The mascot should read as cute and government-issued, like a Japanese yuru-kyara (gentle official mascot).",
      "Background of the panel: the desk surface with two crumpled receipts and one 100-yen coin nearby (suggesting poverty).",
      "Pure black-and-white seinen manga style. Sharp ink outline on the card edge. Screentone for the desk surface. Beta for shadows under the card.",
      "Do NOT render any legible Japanese characters anywhere — the visual layout IS the meaning.",
    ].join(" "),
    change_from_prev: "Camera leaves the public street and zooms into one specific person's identity — the rank D card.",
    visual_focus: "The 'D' mark and the mascot. The poverty around them (receipts, coin).",
    size_preset_key: "panel_landscape",
  },

  // ---- panel 5: 下段左 - 主人公シルエット (背中) ----
  {
    panel_idx: 5,
    slot_id: "s5",
    panel_role: "protagonist_silhouette_descending",
    scene_directive: [
      "Medium-wide shot of the protagonist Tachibana Riku from BEHIND, walking down concrete subway-like steps into an underground entrance.",
      "He has short messy black hair, wears a black hooded jacket, slim black jeans, worn sneakers.",
      "He carries a small worn shoulder bag.",
      "ABSOLUTELY DO NOT show his face — keep him as a back-view / silhouette only.",
      "On the wall beside the entrance: a small official sign with the same 'D' mark and the same chibi mascot in its corner (small but visible).",
      "Light pours down from above the staircase, deep shadow below.",
      "Pure black-and-white seinen manga style. Strong contrast between bright sky-light above and dark underground.",
      "Heavy beta black for the underground void he is entering.",
      "Convey: the protagonist is one of countless D-class workers descending — anonymous, daily ritual, faceless.",
    ].join(" "),
    change_from_prev: "Camera leaves the card and finds its owner — but only as a back-turned silhouette. The face is withheld for a later page.",
    visual_focus: "His back. The descent. The light/dark boundary at the staircase. His face is deliberately hidden.",
    size_preset_key: "panel_landscape",
  },
];

// ============================================================
// メイン
// ============================================================

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const template = getTemplate("big_top_5");
  if (!template) throw new Error("template big_top_5 not found");

  const slotById = new Map(template.slots.map((s) => [s.id, s]));

  console.log(`[establishing] template=${template.id} panels=${PANELS.length}`);
  console.log(`[establishing] page_dim=${PAGE_DIMENSIONS.width}×${PAGE_DIMENSIONS.height}`);
  console.log(`[establishing] outputDir=${OUTPUT_DIR}`);

  // ================================
  // 1. 各 panel を生成 (2並列バッチ、3秒スタガー)
  // ================================
  const PARALLELISM = 2;
  const STAGGER_MS = 3000;

  const results: Array<{
    panel_idx: number;
    slot_id: string;
    ok: boolean;
    outputPath?: string;
    error?: string;
    durationMs?: number;
  }> = [];

  const batches: PanelDef[][] = [];
  for (let i = 0; i < PANELS.length; i += PARALLELISM) {
    batches.push(PANELS.slice(i, i + PARALLELISM));
  }

  console.log(
    `[establishing] parallelism=${PARALLELISM}, batches=${batches.length}, stagger=${STAGGER_MS}ms`
  );

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    console.log(
      `\n[establishing] === batch ${bIdx + 1}/${batches.length} (${batch.length}コマ並列) ===`
    );

    const batchResults = await Promise.all(
      batch.map(async (def, idxInBatch) => {
        if (idxInBatch > 0) {
          await new Promise((r) => setTimeout(r, STAGGER_MS * idxInBatch));
        }

        const slot = slotById.get(def.slot_id);
        if (!slot) {
          throw new Error(`slot ${def.slot_id} not found in template ${template.id}`);
        }

        const prompt = buildPanelPrompt({
          panel_idx: def.panel_idx,
          panel_role: def.panel_role,
          scene_directive: def.scene_directive,
          change_from_prev: def.change_from_prev,
          visual_focus: def.visual_focus,
          include_sfx: def.include_sfx,
        });

        const outputPath = path.join(
          OUTPUT_DIR,
          `panel-${String(def.panel_idx).padStart(2, "0")}-${def.slot_id}.png`
        );
        const size = MANGA_SIZE_PRESETS[def.size_preset_key];

        const MIN_VALID_SIZE = 50 * 1024;
        if (existsSync(outputPath)) {
          const stat = statSync(outputPath);
          if (stat.size >= MIN_VALID_SIZE) {
            console.log(
              `[establishing]   [${def.panel_idx}/${PANELS.length}] SKIP (既存) slot=${def.slot_id} (${(stat.size / 1024).toFixed(0)}KB)`
            );
            return {
              panel_idx: def.panel_idx,
              slot_id: def.slot_id,
              ok: true,
              outputPath,
              durationMs: 0,
            };
          }
        }

        console.log(
          `[establishing]   [${def.panel_idx}/${PANELS.length}] START slot=${def.slot_id} role=${def.panel_role} size=${size.width}×${size.height} sfx=${def.include_sfx ?? "none"}`
        );

        const startedAt = Date.now();
        try {
          const r = await generateMangaImage({
            prompt,
            outputPath,
            size,
            referenceImagePaths: REFS_ALL,
            timeoutMs: 20 * 60 * 1000,
            maxRetries: 2,
          });
          const durationMs = Date.now() - startedAt;
          console.log(
            `[establishing]   [${def.panel_idx}/${PANELS.length}] OK slot=${def.slot_id} (${(r.sizeBytes / 1024).toFixed(0)}KB, ${(durationMs / 1000).toFixed(1)}s)`
          );
          return {
            panel_idx: def.panel_idx,
            slot_id: def.slot_id,
            ok: true,
            outputPath: r.outputPath,
            durationMs,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[establishing]   [${def.panel_idx}/${PANELS.length}] FAIL slot=${def.slot_id}: ${message}`
          );
          return {
            panel_idx: def.panel_idx,
            slot_id: def.slot_id,
            ok: false,
            error: message,
          };
        }
      })
    );

    results.push(...batchResults);
  }

  results.sort((a, b) => a.panel_idx - b.panel_idx);

  // ================================
  // 2. メタJSON保存
  // ================================
  const metaPath = path.join(OUTPUT_DIR, "_meta.json");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        experiment: "establishing-pilot",
        template_id: template.id,
        page_dim: PAGE_DIMENSIONS,
        generated_at: new Date().toISOString(),
        panels: PANELS.map((p) => ({
          panel_idx: p.panel_idx,
          slot_id: p.slot_id,
          panel_role: p.panel_role,
          size_preset_key: p.size_preset_key,
          scene_directive: p.scene_directive,
          change_from_prev: p.change_from_prev,
          visual_focus: p.visual_focus,
          include_sfx: p.include_sfx ?? null,
          slot_rect: slotById.get(p.slot_id)?.rect,
        })),
        refs: REFS_ALL,
        results,
      },
      null,
      2
    )
  );
  console.log(`\n[establishing] meta saved: ${metaPath}`);

  // ================================
  // 3. 全成功なら 1ページ合成
  // ================================
  const allOk = results.every((r) => r.ok);
  if (!allOk) {
    console.warn(
      `\n[establishing] 一部失敗 (${results.filter((r) => !r.ok).length}/${results.length})。1ページ合成はスキップ。`
    );
    return;
  }

  console.log(`\n[establishing] 全 ${PANELS.length} コマ生成成功 → 1ページ合成 (sharp)`);

  const composeInputs = PANELS.map((def) => {
    const slot = slotById.get(def.slot_id)!;
    const sourceImage = results.find((r) => r.panel_idx === def.panel_idx)!.outputPath!;
    return {
      panel_idx: def.panel_idx - 1,
      rect: slot.rect,
      source_image_path: sourceImage,
      reading_order: def.panel_idx,
    };
  });

  const pagePath = path.join(OUTPUT_DIR, "page-01.png");
  const composeResult = await composeMangaPage({
    page_idx: 0,
    panels: composeInputs,
    outputPath: pagePath,
  });

  console.log(
    `[establishing] 1ページ合成 OK: ${pagePath} (${composeResult.width}×${composeResult.height}, ${composeResult.durationMs}ms)`
  );
  console.log("");
  console.log("=========================================");
  console.log("[establishing] DONE");
  console.log("評価: 1話冒頭 establishing として (1) ジャンル提示 (2) 世界観 (3) AI臭抑制 (4) SFX 描画成功率 を目視判定");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[establishing] FAILED:", err);
  process.exit(1);
});
