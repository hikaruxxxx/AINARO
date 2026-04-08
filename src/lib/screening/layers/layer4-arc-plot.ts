// Layer 4: アーク1詳細プロット生成
//
// 役割:
// - layer1_logline.md / layer2_plot.md / layer3_synopsis.md を入力
// - 第1アーク(10〜20話分)のシーン構成を生成
// - works/{slug}/layer4_arc1_plot.md に保存

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { callClaudeCli } from "../claude-cli";
import type { WorkMetaFile } from "./layer1-logline";

export interface Layer4Result {
  ok: boolean;
  arcPlot?: string;
  reason?: string;
}

function buildArcPlotPrompt(meta: WorkMetaFile, logline: string, plot: string, synopsis: string): string {
  return `あなたはWeb小説の構成作家です。以下の素材から、第1アーク(10〜20話分)の詳細プロットを構築してください。

# 素材
- ジャンル: ${meta.seed.genre}
- ログライン: ${logline}

## あらすじ
${synopsis}

## プロット骨格
${plot}

# 出力形式
Markdownで以下の構造に従う:

## 第1アーク概要
(150字以内、アーク全体の目標と完結)

## 各話構成
ep1〜ep15程度を以下のフォーマットで列挙(各話70〜120字):

### ep1: タイトル案
- 中心となる出来事
- 引きの方向

### ep2: タイトル案
- 中心となる出来事
- 引きの方向

(以下同様に10〜20話)

## アーク完結後の状態
(150字以内、次アークへの引き)

# 制約
- ep1はプロット骨格の「起点」、最終話は「第1アーク完結」と整合させる
- 中だるみを避け、各話に必ず1つの動きを入れる
- 1アーク=10〜20話の範囲を厳守
- 説明や前置きは不要、Markdownのみ出力`;
}

export async function runLayer4(slug: string, worksDir = "data/generation/works"): Promise<Layer4Result> {
  const workDir = join(worksDir, slug);
  const metaPath = join(workDir, "_meta.json");
  const loglinePath = join(workDir, "layer1_logline.md");
  const plotPath = join(workDir, "layer2_plot.md");
  const synopsisPath = join(workDir, "layer3_synopsis.md");
  for (const p of [metaPath, loglinePath, plotPath, synopsisPath]) {
    if (!existsSync(p)) return { ok: false, reason: `prereq_missing: ${p}` };
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as WorkMetaFile;
  const logline = readFileSync(loglinePath, "utf-8").replace(/^#[^\n]*\n+/, "").trim();
  const plot = readFileSync(plotPath, "utf-8");
  const synopsis = readFileSync(synopsisPath, "utf-8").replace(/^#[^\n]*\n+/, "").trim();

  const prompt = buildArcPlotPrompt(meta, logline, plot, synopsis);
  let raw: string;
  try {
    raw = await callClaudeCli(prompt, { layer: "layer4", slug });
  } catch (e) {
    return { ok: false, reason: `claude_call_failed: ${(e as Error).message}` };
  }
  // 必須セクションチェック
  const required = ["## 第1アーク概要", "## 各話構成", "## アーク完結後の状態"];
  for (const s of required) {
    if (!raw.includes(s)) return { ok: false, reason: `missing_section: ${s}` };
  }
  // ep数の簡易チェック
  const epCount = (raw.match(/### ep\d+/g) ?? []).length;
  if (epCount < 8) return { ok: false, reason: `too_few_episodes(${epCount})` };
  if (epCount > 25) return { ok: false, reason: `too_many_episodes(${epCount})` };

  const outPath = join(workDir, "layer4_arc1_plot.md");
  writeFileSync(outPath, raw.trim() + "\n");
  return { ok: true, arcPlot: raw.trim() };
}
