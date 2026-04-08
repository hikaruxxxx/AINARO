// Layer 2: プロット骨格生成
//
// 役割:
// - works/{slug}/_meta.json と layer1_logline.md を読む
// - data/generation/plot-templates/{subgenre}.md を参照(なければ大ジャンルの代表 or 空)
// - claude -p でプロット骨格を生成
// - works/{slug}/layer2_plot.md に保存

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { callClaudeCli } from "../claude-cli";
import type { WorkMetaFile } from "./layer1-logline";

export interface Layer2Result {
  ok: boolean;
  plot?: string;
  reason?: string;
}

const PLOT_TEMPLATE_DIR = "data/generation/plot-templates";

// サブジャンル → 大ジャンル代表テンプレ のフォールバック
// (genre-taxonomy.json の majorGenre と plot-templates/ の代表ファイル名を対応)
const FALLBACK_BY_MAJOR: Record<string, string> = {
  isekai: "isekai_tsuiho_zamaa",
  otome: "otome_akuyaku_zamaa",
  battle: "battle_dungeon",
  modern: "modern_human_drama",
  mystery: "mystery_detective",
};

const SUBGENRE_TO_MAJOR: Record<string, string> = {
  isekai_tensei_cheat: "isekai",
  isekai_tsuiho_zamaa: "isekai",
  isekai_slowlife: "isekai",
  isekai_high_fantasy: "isekai",
  otome_akuyaku_zamaa: "otome",
  otome_konyaku_haki: "otome",
  otome_isekai_pure: "otome",
  otome_villain_fantasy: "otome",
  battle_vrmmo: "battle",
  battle_modern_power: "battle",
  battle_war_chronicle: "battle",
  battle_dungeon: "battle",
  modern_romance: "modern",
  modern_school: "modern",
  modern_human_drama: "modern",
  modern_history: "modern",
  mystery_detective: "mystery",
  mystery_horror: "mystery",
  mystery_sf: "mystery",
  mystery_action: "mystery",
};

function loadPlotTemplate(subgenre: string): string {
  const direct = join(PLOT_TEMPLATE_DIR, `${subgenre}.md`);
  if (existsSync(direct)) return readFileSync(direct, "utf-8");
  const major = SUBGENRE_TO_MAJOR[subgenre];
  if (major && FALLBACK_BY_MAJOR[major]) {
    const fb = join(PLOT_TEMPLATE_DIR, `${FALLBACK_BY_MAJOR[major]}.md`);
    if (existsSync(fb)) return readFileSync(fb, "utf-8");
  }
  return "";
}

function buildPlotPrompt(meta: WorkMetaFile, logline: string): string {
  const template = loadPlotTemplate(meta.seed.genre);
  const templateBlock = template
    ? `\n# ジャンルテンプレート\n${template}\n`
    : "";
  return `あなたはWeb小説のプロット作家です。以下の素材から、第1アークのプロット骨格を構築してください。
${templateBlock}
# 素材
- ジャンル: ${meta.seed.genre}
- ログライン: ${logline}
- 主感情欲求: ${meta.seed.primaryDesire}
- 副感情欲求: ${meta.seed.secondaryDesire}
- 境遇: ${meta.seed.tags.境遇}
- 転機: ${meta.seed.tags.転機}
- 方向: ${meta.seed.tags.方向}
- フック: ${meta.seed.tags.フック}

# 出力形式
Markdown形式で以下のセクションを必ず含む(各150〜300字):

## 起点
主人公の境遇と読者の感情移入フック

## 転換点1
ログライン要素の発動

## 転換点2
主人公の決意と方向性の確定

## 第1アーク完結
小目標達成とカタルシス

## 全体引き
大目標への布石(続きが読みたくなる引き)

説明や前置きは不要。上記Markdownのみを出力してください。`;
}

export async function runLayer2(slug: string, worksDir = "data/generation/works"): Promise<Layer2Result> {
  const workDir = join(worksDir, slug);
  const metaPath = join(workDir, "_meta.json");
  const loglinePath = join(workDir, "layer1_logline.md");
  if (!existsSync(metaPath) || !existsSync(loglinePath)) {
    return { ok: false, reason: "prereq_missing" };
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as WorkMetaFile;
  const loglineText = readFileSync(loglinePath, "utf-8");
  // 「# ログライン\n\n...」の本体抽出
  const logline = loglineText.replace(/^#[^\n]*\n+/, "").trim();
  if (!logline) {
    return { ok: false, reason: "logline_empty" };
  }

  const prompt = buildPlotPrompt(meta, logline);
  let raw: string;
  try {
    raw = await callClaudeCli(prompt, { layer: "layer2", slug });
  } catch (e) {
    return { ok: false, reason: `claude_call_failed: ${(e as Error).message}` };
  }
  // 必須セクションの存在チェック
  const required = ["## 起点", "## 転換点1", "## 転換点2", "## 第1アーク完結", "## 全体引き"];
  for (const s of required) {
    if (!raw.includes(s)) {
      return { ok: false, reason: `missing_section: ${s}` };
    }
  }
  const outPath = join(workDir, "layer2_plot.md");
  writeFileSync(outPath, raw.trim() + "\n");
  return { ok: true, plot: raw.trim() };
}
