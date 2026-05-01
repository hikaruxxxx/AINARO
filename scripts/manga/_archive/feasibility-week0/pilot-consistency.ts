/**
 * Week 0 Pilot 実験 3: consistency-pilot (8枚)
 *
 * 目的: 16枚参照プールから 4枚/8枚/16枚 を渡して同じキャラを生成し、
 *       参照枚数とキャラ一貫性のトレードオフを実測する。
 *       「16枚だと顔が平均化する」というCodex第4ラウンド指摘の検証。
 *
 * 合格基準: 推奨参照枚数判定 (4/8/16 のうちどれが最も同一人物に見えるか)
 *
 * ⚠️ 前提: 参照画像16枚プールが必要。
 *   - data/manga/feasibility-week0/refs/kanade-{01-16}.png に配置
 *   - style-pilot 後にベスト8枚を選別 + Kindle蔵書から類似系統8枚を加える
 *   - プールが揃うまでこのスクリプトは実行しない
 *
 * 出力: data/manga/feasibility-week0/pilot/consistency-pilot/{01-08}.png
 *
 * 実行: npx tsx scripts/manga/feasibility-week0/pilot-consistency.ts
 */

import { runExperiment, type ExperimentPrompt } from "./runner";
import { MANGA_SIZE_PRESETS } from "@/lib/manga/generate/codex-image";
import { existsSync } from "fs";
import path from "path";

const CHARACTER_DESCRIPTION = [
  "Subject: Shinozaki Kanade — a 16-year-old Japanese male high school student.",
  "Tall and lean (180cm), short jet-black hair, sharp narrow eyes, angular jaw.",
  "Wearing a black gakuran (Japanese school uniform).",
].join(" ");

const COMMON_BW_DIRECTIVE = [
  "Japanese shounen manga page in PURE BLACK-AND-WHITE only.",
  "Bold confident black ink, decisive solid blacks, screentone for mid-tones.",
].join(" ");

const PANEL_SAFETY = [
  "Do NOT render speech bubbles, dialogue, or any written symbols.",
  "Do NOT include watermarks, panel borders, or studio logos.",
  "Output a single panel illustration only.",
].join(" ");

const CONSISTENCY_DIRECTIVE =
  "STRICT consistency rule: use the supplied reference images as the canonical character appearance. Match hair, eyes, face shape, and outfit with strict fidelity.";

const POSE_DIRECTIVE =
  "Medium shot, three-quarter view, holding a shinai at his side, neutral expression. School dojo background hinted minimally.";

function buildPrompt(): string {
  return [
    COMMON_BW_DIRECTIVE,
    CHARACTER_DESCRIPTION,
    POSE_DIRECTIVE,
    CONSISTENCY_DIRECTIVE,
    PANEL_SAFETY,
  ].join("\n\n");
}

function refs(count: 4 | 8 | 16): string[] {
  const repoRoot = process.env.AINARO_REPO_ROOT ?? process.cwd();
  const refsDir = path.join(repoRoot, "data", "manga", "feasibility-week0", "refs");
  return Array.from({ length: count }, (_, i) =>
    path.join(refsDir, `kanade-${String(i + 1).padStart(2, "0")}.png`)
  );
}

const PROMPTS: ExperimentPrompt[] = [
  // 4枚参照 × 3
  { idx: 1, label: "ref4_a", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(4), meta: { ref_count: 4 } },
  { idx: 2, label: "ref4_b", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(4), meta: { ref_count: 4 } },
  { idx: 3, label: "ref4_c", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(4), meta: { ref_count: 4 } },
  // 8枚参照 × 3
  { idx: 4, label: "ref8_a", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(8), meta: { ref_count: 8 } },
  { idx: 5, label: "ref8_b", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(8), meta: { ref_count: 8 } },
  { idx: 6, label: "ref8_c", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(8), meta: { ref_count: 8 } },
  // 16枚参照 × 2
  { idx: 7, label: "ref16_a", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(16), meta: { ref_count: 16 } },
  { idx: 8, label: "ref16_b", prompt: buildPrompt(), size: MANGA_SIZE_PRESETS.panel_portrait, referenceImagePaths: refs(16), meta: { ref_count: 16 } },
];

async function main(): Promise<void> {
  // 参照画像の存在チェック
  const allRefs = refs(16);
  const missing = allRefs.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error(`[pilot-consistency] 参照画像が不足しています (${missing.length}/16):`);
    for (const p of missing.slice(0, 5)) console.error(`  - ${p}`);
    if (missing.length > 5) console.error(`  ... 他 ${missing.length - 5} 枚`);
    console.error("\n対応: style-pilot 完了後にベスト画像 + Kindle蔵書から計16枚を選別し、");
    console.error("       data/manga/feasibility-week0/refs/kanade-01.png ... kanade-16.png に配置してください。");
    process.exit(1);
  }

  const results = await runExperiment({
    stage: "pilot",
    experiment: "consistency-pilot",
    prompts: PROMPTS,
  });

  const ok = results.filter((r) => r.ok).length;
  console.log("");
  console.log("=========================================");
  console.log(`[pilot-consistency] DONE ${ok}/${PROMPTS.length} 成功`);
  console.log("評価: 4枚/8枚/16枚 の各グループで同一人物に見えるか目視比較");
  console.log("「16枚で平均化する」傾向が出るかが最重要観測点");
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[pilot-consistency] FAILED:", err);
  process.exit(1);
});
