/**
 * Week 0 Pilot 実験: pilot-page-composite (F-1 1ページ合成 PoC)
 *
 * 目的: コマ単位生成 + sharp 合成で「東京迷宮」第1話冒頭1ページを作る。
 *       F-2 (一発生成) で出ていた「全コマ均質テンプレ感」「ページ構図のAI臭」が
 *       構造的に消えるか、各コマが独立した高品質1枚絵として通用するかを検証する。
 *
 * シナリオ: 第1話 P1「派遣オフィスの倦怠」(5コマ standard_3tier_5)
 *   s1 上段 wide  : 派遣会社オフィス俯瞰、蛍光灯、整然と並ぶPC机、無人感のある朝
 *   s2 中段 右    : リクの手元、PC画面に「データ入力 進捗45%」、無造作なタイプ
 *   s3 中段 左    : リクの顔クローズアップ、無感動な目・目の下のクマ
 *   s4 下段 右    : 机上の100円おにぎり、フィルムを指で破る
 *   s5 下段 左    : 窓越しに新宿駅前の人通り、時計は11:00
 *
 * 戦略:
 *   - 各 panel は「単独イラスト」として生成 (コマ枠/吹き出し/テキスト一切なし)
 *   - 画風統一: 蔵書 refs 6枚を全コマで共通注入
 *   - 時間流れ: 各 panel の change_from_prev を明示し「ページ内に時間が流れる」設計
 *   - コマ割り・配置・コマ枠は composeMangaPage() でコード強制 → AI が触らない
 *
 * 出力:
 *   - data/manga/feasibility-week0/pilot/page-composite-pilot/panel-{01-05}.png (素材)
 *   - data/manga/feasibility-week0/pilot/page-composite-pilot/page-01.png (1748×2480 合成済)
 *   - data/manga/feasibility-week0/pilot/page-composite-pilot/_meta.json
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-page-composite.ts
 */

import "../_env";
import path from "path";
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
  "page-composite-pilot"
);

// ============================================================
// 共通プロンプト要素
// ============================================================

/** 主人公の不変記述 (全 panel で固定) */
const PROTAGONIST = [
  "PROTAGONIST: Tachibana Riku, 24-year-old Japanese male, ordinary build, short messy black hair, sharp tired eyes,",
  "modern street fashion (black hooded jacket over plain shirt, slim black jeans, worn sneakers).",
  "Apathetic facial expression. Slightly slumped posture. Subtle dark circles under eyes.",
].join(" ");

/** B&W 画風 directive */
const STYLE_DIRECTIVE = [
  "Japanese seinen manga panel illustration in PURE BLACK-AND-WHITE only. NO color. NO grayscale gradient.",
  "Style: Solo Leveling × Tokyo Ghoul aesthetic — sharp ink line work, decisive beta (solid black areas),",
  "professional screentone for mid-tones, urban realism. Light novel adaptation feel.",
].join(" ");

/** 描き込み抑制 (minimalism-pilot/04 が A 評価だった理由を継承) */
const MINIMALISM = [
  "DRAWING DISCIPLINE — 'Drawing what NOT to draw is also drawing.' Use FEWEST lines that convey the moment.",
  "Backgrounds minimal where appropriate. Crowd figures as silhouettes (NEVER detailed faces).",
  "Avoid uniform hatching density. Avoid every-corner-detailed AI rendering.",
].join(" ");

/** 単独イラストとして出させるための制約 (panel合成用) */
const SOLO_PANEL_DIRECTIVE = [
  "OUTPUT IS A SINGLE STANDALONE PANEL ILLUSTRATION — do NOT draw panel borders, do NOT draw multiple panels,",
  "do NOT draw a manga page grid. Output fills the entire image canvas edge-to-edge as one scene.",
  "Do NOT render any speech bubbles, dialogue text, sound effects (SFX kana), captions, narration boxes,",
  "page numbers, watermarks, signatures, status UI text. Pure illustration only.",
].join(" ");

/** AI臭抑制 */
const ANTI_AI = [
  "Avoid: cloned silhouettes (identical posture/height/spacing), perfect symmetric effects,",
  "perfect geometric magic patterns, uniform line weight throughout, evenly spaced background figures,",
  "AI illustration sheen. Embrace: line weight variation, decisive ink, intentional asymmetry.",
].join(" ");

/** 画風 references の使い方ヒント */
const REFS_DIRECTIVE = [
  "STRICT STYLE REFERENCE: 6 reference pages from a published commercial Japanese seinen manga (modern dungeon genre).",
  "Match line work density, screentone usage, beta placement, face proportions, urban texture handling.",
  "Match the COMMERCIAL PUBLISHED MANGA feel — handcrafted, edited, professional.",
].join(" ");

/**
 * 1 panel のプロンプトを構築
 */
function buildPanelPrompt(args: {
  panel_idx: number;
  panel_role: string;
  scene_directive: string;
  change_from_prev: string;
  visual_focus: string;
}): string {
  return [
    STYLE_DIRECTIVE,
    "",
    PROTAGONIST,
    "",
    `THIS PANEL (panel #${args.panel_idx} of 5, role=${args.panel_role}):`,
    args.scene_directive,
    "",
    `VISUAL FOCUS: ${args.visual_focus}`,
    "",
    `CHANGE FROM PREVIOUS PANEL: ${args.change_from_prev}`,
    "(this panel must visibly advance time/space/emotion from the previous one — NOT a standalone poster image)",
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
  panel_idx: number; // 1-indexed reading_order
  slot_id: "s1" | "s2" | "s3" | "s4" | "s5";
  panel_role: string;
  scene_directive: string;
  change_from_prev: string;
  visual_focus: string;
  size_preset_key: keyof typeof MANGA_SIZE_PRESETS;
};

const PANELS: PanelDef[] = [
  {
    panel_idx: 1,
    slot_id: "s1",
    panel_role: "establishing_wide",
    scene_directive: [
      "Wide high-angle shot of a Japanese 派遣 (temp staffing) office floor, early morning around 9:00.",
      "Long rows of identical narrow desks with bulky office PCs, fluorescent ceiling lights buzzing harsh white,",
      "low-saturation gray cubicle partitions, scattered paper trays, a wall clock visible.",
      "Tachibana Riku is one of several seated workers (small in frame, do NOT close in on his face here),",
      "all hunched forward at their PCs. Convey institutional dullness, a faint sense of being trapped in a grid.",
      "ARCHITECTURE READS as cheap modern Japanese office, NOT futuristic. No screen text legible.",
    ].join(" "),
    change_from_prev: "Opening shot — establishes the protagonist's social cage from above.",
    visual_focus:
      "The geometry of identical desks. Riku is just one figure among many — the office IS the subject.",
    size_preset_key: "panel_landscape", // 1536x1024
  },
  {
    panel_idx: 2,
    slot_id: "s2",
    panel_role: "action_hands",
    scene_directive: [
      "Tight medium shot from behind/over-shoulder of Riku's hands on a worn keyboard,",
      "fingertips striking keys mid-typing. PC monitor partly visible at upper edge with abstract data spreadsheet rows",
      "(do NOT render any legible characters — only suggest dense rows of numbers/text via screentone and ruled lines).",
      "Riku's worn jacket sleeve, a chipped coffee cup, a small desk calendar visible.",
      "Mood: mechanical labor, no enthusiasm.",
    ].join(" "),
    change_from_prev:
      "Camera pushes in from the wide office establishing shot down to the protagonist's individual labor — space narrows from the room to one set of hands.",
    visual_focus:
      "The hands and the keyboard — labor as a mechanical loop. Background falls into screentone blur.",
    size_preset_key: "panel_square", // 1024x1024
  },
  {
    panel_idx: 3,
    slot_id: "s3",
    panel_role: "close_up_emotion",
    scene_directive: [
      "Tight close-up of Riku's face in three-quarter profile, eyes half-lidded, looking through the monitor not at it.",
      "Visible faint dark circles under eyes, subtle stubble or unshaven cheek. Lips slightly parted in a near-sigh.",
      "Background reduced to soft screentone wash, bokeh of fluorescent light. No background detail competes.",
      "Mood: total apathy crystallizing into a held breath.",
    ].join(" "),
    change_from_prev:
      "Camera moves from his hands up to his face — labor → inner emotion. The same instant in time, but interiority surfaces.",
    visual_focus:
      "His eyes. Everything else dissolves into tone. This is the emotional anchor of the page.",
    size_preset_key: "panel_square", // 1024x1024
  },
  {
    panel_idx: 4,
    slot_id: "s4",
    panel_role: "object_symbol",
    scene_directive: [
      "Extreme close-up of a single 100-yen convenience store onigiri (rice ball) on a corner of the desk,",
      "still in its plastic film wrapper, label partly visible (do NOT render legible Japanese characters — abstracted).",
      "A single hand (Riku's) entering frame from the right, fingertips peeling the plastic film with mechanical precision.",
      "A few crumpled receipts beside it. Sharp ink line on the onigiri's outline, screentone for the desk surface.",
      "Mood: poverty rendered as a domestic still life. The cheap meal is the protagonist's economic reality.",
    ].join(" "),
    change_from_prev:
      "Camera leaves his face and finds the small object that defines his life. Inner emotion → external evidence of his condition.",
    visual_focus:
      "The onigiri itself, isolated, almost reverent. The hand is just an entry — the object IS the statement.",
    size_preset_key: "panel_square", // 1024x1024
  },
  {
    panel_idx: 5,
    slot_id: "s5",
    panel_role: "outward_window",
    scene_directive: [
      "Medium shot from inside the office looking out a large window toward Shinjuku station east exit area,",
      "the foreground a section of dirty window frame and Riku's blurred shoulder in lower-right.",
      "Outside: morning Shinjuku — distant station building rooftops, scattered pedestrians as silhouette gestures (NOT detailed faces),",
      "a digital clock or wall clock visible somewhere reading roughly 11:00.",
      "Convey: the world is going on outside, the protagonist is sealed inside. Light pours in but does not warm.",
    ].join(" "),
    change_from_prev:
      "Camera leaves the desk surface and looks outward through glass — interior cage → outer world. The page closes on the gap between Riku and reality.",
    visual_focus:
      "The window pane as boundary. Outside is bright, inside is the protagonist's edge of frame.",
    size_preset_key: "panel_square", // 1024x1024
  },
];

// ============================================================
// メイン
// ============================================================

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const template = getTemplate("standard_3tier_5");
  if (!template) throw new Error("template standard_3tier_5 not found");

  // slot_id → slot 矩形を取り出す
  const slotById = new Map(template.slots.map((s) => [s.id, s]));

  console.log(`[page-composite] template=${template.id} panels=${PANELS.length}`);
  console.log(`[page-composite] page_dim=${PAGE_DIMENSIONS.width}×${PAGE_DIMENSIONS.height}`);
  console.log(`[page-composite] outputDir=${OUTPUT_DIR}`);

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

  // バッチに分割 (panels[0..1], panels[2..3], panels[4])
  const batches: PanelDef[][] = [];
  for (let i = 0; i < PANELS.length; i += PARALLELISM) {
    batches.push(PANELS.slice(i, i + PARALLELISM));
  }

  console.log(
    `[page-composite] parallelism=${PARALLELISM}, batches=${batches.length}, stagger=${STAGGER_MS}ms`
  );

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    console.log(
      `\n[page-composite] === batch ${bIdx + 1}/${batches.length} (${batch.length}コマ並列) ===`
    );

    const batchResults = await Promise.all(
      batch.map(async (def, idxInBatch) => {
        // 同時 spawn を避けるため少しずらす
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
        });

        const outputPath = path.join(
          OUTPUT_DIR,
          `panel-${String(def.panel_idx).padStart(2, "0")}-${def.slot_id}.png`
        );
        const size = MANGA_SIZE_PRESETS[def.size_preset_key];

        console.log(
          `[page-composite]   [${def.panel_idx}/${PANELS.length}] START slot=${def.slot_id} role=${def.panel_role} size=${size.width}×${size.height}`
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
            `[page-composite]   [${def.panel_idx}/${PANELS.length}] OK slot=${def.slot_id} (${(r.sizeBytes / 1024).toFixed(0)}KB, ${(durationMs / 1000).toFixed(1)}s)`
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
            `[page-composite]   [${def.panel_idx}/${PANELS.length}] FAIL slot=${def.slot_id}: ${message}`
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

  // 並列処理後に panel_idx 順で並び替え (ログ可読性のため)
  results.sort((a, b) => a.panel_idx - b.panel_idx);

  // ================================
  // 2. メタJSON保存
  // ================================
  const metaPath = path.join(OUTPUT_DIR, "_meta.json");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        experiment: "page-composite-pilot",
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
          slot_rect: slotById.get(p.slot_id)?.rect,
        })),
        refs: REFS_ALL,
        results,
      },
      null,
      2
    )
  );
  console.log(`\n[page-composite] meta saved: ${metaPath}`);

  // ================================
  // 3. 全成功なら 1ページ合成
  // ================================
  const allOk = results.every((r) => r.ok);
  if (!allOk) {
    console.warn(
      `\n[page-composite] 一部失敗 (${results.filter((r) => !r.ok).length}/${results.length})。1ページ合成はスキップ。`
    );
    return;
  }

  console.log(`\n[page-composite] 全 ${PANELS.length} コマ生成成功 → 1ページ合成 (sharp)`);

  const composeInputs = PANELS.map((def) => {
    const slot = slotById.get(def.slot_id)!;
    const sourceImage = results.find((r) => r.panel_idx === def.panel_idx)!.outputPath!;
    return {
      panel_idx: def.panel_idx - 1, // 0-indexed
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
    `[page-composite] 1ページ合成 OK: ${pagePath} (${composeResult.width}×${composeResult.height}, ${composeResult.durationMs}ms)`
  );
  console.log("");
  console.log("=========================================");
  console.log("[page-composite] DONE");
  console.log("評価: 1ページとして (1) 同一画風 (2) 時間が流れる (3) AI臭抑制 を目視判定");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[page-composite] FAILED:", err);
  process.exit(1);
});
