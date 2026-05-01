/**
 * Week 0 Pilot 実験 5: panel-composite-pilot (3枚) — F-1 (コマ単位+SVG合成)
 *
 * 目的: 同一ネームから 3コマを個別生成し、後で SVG レイアウトに並べたとき
 *       「同一作品/同一人物に見えるか」を実測。F-1 戦略の基礎能力測定。
 *
 * 合格基準: 3コマを並べたとき (1) 同一人物に見える (2) 同一画風に見える (3) 流れが成立する
 *
 * 出力: data/manga/feasibility-week0/pilot/panel-composite-pilot/{01-03}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-panel-composite.ts
 *
 * 後続: 生成3枚を SVG で 1ページ風にレイアウトする検証は Week 0 の評価フェーズで実施
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";

const CHARACTER_DESCRIPTION = [
  "Subject: Shinozaki Kanade — a 16-year-old Japanese male high school student, kendo club captain.",
  "Tall lean build, short jet-black hair, sharp narrow eyes, black gakuran uniform.",
].join(" ");

const COMMON_BW_DIRECTIVE = [
  "Japanese shounen manga panel in PURE BLACK-AND-WHITE only — NO color, NO grayscale gradient.",
  "Bold black ink, decisive beta, screentone for mid-tones, Weekly Shounen Jump aesthetic.",
].join(" ");

const PANEL_SAFETY = [
  "Do NOT render any speech bubbles, dialogue text, sound effects, captions, or written symbols.",
  "Do NOT include watermarks, signatures, page numbers, panel borders, or studio logos.",
  "Output is a single isolated panel illustration — no panel grid, no multiple panels.",
].join(" ");

const CONSISTENCY = [
  "STRICT consistency: this is panel N of a 3-panel sequence; the character must look identical to the other panels.",
  "Maintain hair color, hair style, eye shape, face proportions, and outfit exactly.",
].join(" ");

/**
 * シーン設定（3コマで1つの流れを作る）:
 *   コマ1: 夕暮れの道場、Kanade が竹刀を構える (ロング、緊張感の確立)
 *   コマ2: 顔のクローズアップ、目を細める (内面、決意)
 *   コマ3: 一閃、踏み込み一歩 (アクション、動感)
 */
const SHARED_CONTEXT =
  "Continuous scene: Kanade in the dojo at dusk, preparing for a decisive strike. Three connected panels showing escalating tension.";

function buildPanelPrompt(panelDirective: string): string {
  return [
    COMMON_BW_DIRECTIVE,
    CHARACTER_DESCRIPTION,
    SHARED_CONTEXT,
    `This panel: ${panelDirective}`,
    CONSISTENCY,
    PANEL_SAFETY,
  ].join("\n\n");
}

const PROMPTS: ExperimentPrompt[] = [
  {
    idx: 1,
    label: "panel1_establishing",
    prompt: buildPanelPrompt(
      [
        "Wide medium shot. Kanade standing in the dojo, holding shinai in chudan stance, profile/three-quarter view.",
        "Atmospheric — late evening light through high windows, screentone for the air, beta for shadow.",
        "Mood: quiet tension, the moment before action.",
      ].join(" ")
    ),
    size: MANGA_SIZE_PRESETS.panel_landscape,
    meta: { sequence_idx: 1, role: "establishing" },
  },
  {
    idx: 2,
    label: "panel2_close_emotion",
    prompt: buildPanelPrompt(
      [
        "Tight close-up on Kanade's face, eyes narrowed in concentration.",
        "Heavy beta on hair, focus lines (shuuchu-sen) radiating from the eyes.",
        "Mood: inner determination crystallizing.",
      ].join(" ")
    ),
    size: MANGA_SIZE_PRESETS.panel_square,
    meta: { sequence_idx: 2, role: "emotion" },
  },
  {
    idx: 3,
    label: "panel3_action_strike",
    prompt: buildPanelPrompt(
      [
        "Dynamic action shot. Kanade in mid-strike, shinai swinging downward, body fully committed forward step.",
        "Heavy speed lines / motion lines. Strong silhouette, decisive ink.",
        "Mood: explosive release of tension.",
      ].join(" ")
    ),
    size: MANGA_SIZE_PRESETS.panel_tall,
    meta: { sequence_idx: 3, role: "action" },
  },
];

async function main(): Promise<void> {
  const results = await runExperiment({
    stage: "pilot",
    experiment: "panel-composite-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-panel-composite] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: 3コマを並べたとき (1) 同一人物 (2) 同一画風 (3) 流れ成立 を目視判定");
  console.log("F-1 戦略の基礎能力。コマ単位+SVG合成方針の妥当性確認");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-panel-composite] FAILED:", err);
  process.exit(1);
});
