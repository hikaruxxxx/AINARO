// Layer 5: ep1本文生成
//
// 役割:
// - 全前段(logline/plot/synopsis/arcPlot)を入力
// - ジャンル別文体テンプレを参照
// - 3500〜4500字の本文を生成
// - 文字数不足時は1回だけ追記指示でリトライ
// - works/{slug}/layer5_ep001.md に保存

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { callClaudeCli } from "../claude-cli";
import type { WorkMetaFile } from "./layer1-logline";

export interface Layer5Result {
  ok: boolean;
  body?: string;
  charCount?: number;
  reason?: string;
  appendCount?: number;
}

const STYLE_TEMPLATE_DIR = "data/generation/style-templates";
const MIN_CHARS = 3200;
const MAX_CHARS = 4500;
const MAX_APPEND_LOOPS = 2;

const SUBGENRE_TO_FALLBACK: Record<string, string> = {
  isekai_tensei_cheat: "isekai_tsuiho_zamaa",
  isekai_tsuiho_zamaa: "isekai_tsuiho_zamaa",
  isekai_slowlife: "isekai_tsuiho_zamaa",
  isekai_high_fantasy: "isekai_tsuiho_zamaa",
  otome_akuyaku_zamaa: "otome_akuyaku_zamaa",
  otome_konyaku_haki: "otome_akuyaku_zamaa",
  otome_isekai_pure: "otome_akuyaku_zamaa",
  otome_villain_fantasy: "otome_akuyaku_zamaa",
  battle_vrmmo: "battle_dungeon",
  battle_modern_power: "battle_dungeon",
  battle_war_chronicle: "battle_dungeon",
  battle_dungeon: "battle_dungeon",
  modern_romance: "modern_human_drama",
  modern_school: "modern_human_drama",
  modern_human_drama: "modern_human_drama",
  modern_history: "modern_human_drama",
  mystery_detective: "mystery_detective",
  mystery_horror: "mystery_detective",
  mystery_sf: "mystery_detective",
  mystery_action: "mystery_detective",
};

function loadStyleTemplate(subgenre: string): string {
  const direct = join(STYLE_TEMPLATE_DIR, `${subgenre}.md`);
  if (existsSync(direct)) return readFileSync(direct, "utf-8");
  const fb = SUBGENRE_TO_FALLBACK[subgenre];
  if (fb) {
    const fbPath = join(STYLE_TEMPLATE_DIR, `${fb}.md`);
    if (existsSync(fbPath)) return readFileSync(fbPath, "utf-8");
  }
  return "";
}

function buildEp1Prompt(meta: WorkMetaFile, logline: string, plot: string, synopsis: string, arcPlot: string): string {
  const style = loadStyleTemplate(meta.seed.genre);
  const styleBlock = style ? `\n# 文体ガイド(必ず従う)\n${style}\n` : "";
  const target = Math.floor((MIN_CHARS + MAX_CHARS) / 2);
  return `あなたはWeb小説家です。以下の素材から ep1 の本文を執筆してください。
他の作品の文体・構成・固有名詞を一切参照しないでください。各作品は独立した執筆者として書きます。
${styleBlock}
# 素材
- ジャンル: ${meta.seed.genre}
- ログライン: ${logline}

## あらすじ
${synopsis}

## プロット骨格
${plot}

## 第1アーク詳細プロット
${arcPlot}

# 文字数(厳守)
- ${MIN_CHARS}〜${MAX_CHARS}字(日本語実文字数、空白・改行を除いてカウント)
- 目標は${target}字前後。${MIN_CHARS}字を絶対に下回らないこと
- 短すぎる場合はシーンを膨らませる(描写・心情・五感)
- 上限を超えそうなら引きシーンで切る

# 構成(4シーン)
【冒頭シーン】 700〜1000字
- 引きの強い1文目で始める
- 状況設定と主人公の感情を示す

【展開シーン】 1300〜1700字
- 主人公の境遇・性格・葛藤を描写
- 会話と地の文をバランスよく
- 五感描写を最低1つ

【転機シーン】 1100〜1500字
- ログラインの「転機」要素をここに配置
- 主人公の決意や運命の変化

【引きシーン】 300〜500字
- 末尾は「次話を読みたい」と思わせる
- 完結させない、解決させない

# 出力形式
本文のみ。前置き・タイトル・章見出しは不要。`;
}

function buildAppendPrompt(currentBody: string, shortageChars: number): string {
  const currentChars = currentBody.replace(/\s/g, "").length;
  const targetChars = currentChars + shortageChars + 200;
  return `以下のep1本文は文字数が${shortageChars}字不足しています(現在 約${currentChars}字、目標 約${targetChars}字以上)。【展開シーン】または【転機シーン】を膨らませて、不足分を補ってください。

# 絶対制約
- 出力は必ず現在より長くすること(短くなったら失敗扱い)
- 目標は${targetChars}字以上(空白・改行除く)
- 既存の本文の文・段落を削らない。原文の文章はすべて含めること
- 既存シーンの描写を厚くする(新シーンの追加ではなく、五感・心情・対話の追記)

# 既存本文
${currentBody}

# 出力形式
追記後の完全な本文のみを出力。差分や説明は不要。`;
}

function countChars(text: string): number {
  // 改行・空白を除いた実文字数
  return text.replace(/\s/g, "").length;
}

export async function runLayer5(slug: string, worksDir = "data/generation/works"): Promise<Layer5Result> {
  const workDir = join(worksDir, slug);
  const metaPath = join(workDir, "_meta.json");
  const loglinePath = join(workDir, "layer1_logline.md");
  const plotPath = join(workDir, "layer2_plot.md");
  const synopsisPath = join(workDir, "layer3_synopsis.md");
  const arcPath = join(workDir, "layer4_arc1_plot.md");
  for (const p of [metaPath, loglinePath, plotPath, synopsisPath, arcPath]) {
    if (!existsSync(p)) return { ok: false, reason: `prereq_missing: ${p}` };
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as WorkMetaFile;
  const logline = readFileSync(loglinePath, "utf-8").replace(/^#[^\n]*\n+/, "").trim();
  const plot = readFileSync(plotPath, "utf-8");
  const synopsis = readFileSync(synopsisPath, "utf-8").replace(/^#[^\n]*\n+/, "").trim();
  const arcPlot = readFileSync(arcPath, "utf-8");

  const prompt = buildEp1Prompt(meta, logline, plot, synopsis, arcPlot);
  let body: string;
  try {
    body = (await callClaudeCli(prompt, { layer: "layer5", slug })).trim();
  } catch (e) {
    return { ok: false, reason: `claude_call_failed: ${(e as Error).message}` };
  }

  // best-of: append で短く返ってくることがあるため、過去最長を保持する
  let bestBody = body;
  let bestCount = countChars(body);
  let appendCount = 0;

  while (bestCount < MIN_CHARS && appendCount < MAX_APPEND_LOOPS) {
    appendCount++;
    const shortage = MIN_CHARS - bestCount;
    const appendPrompt = buildAppendPrompt(bestBody, shortage);
    let next: string;
    try {
      next = (await callClaudeCli(appendPrompt, { layer: "layer5_append", slug })).trim();
    } catch (e) {
      return { ok: false, reason: `append_call_failed: ${(e as Error).message}`, appendCount };
    }
    const nextCount = countChars(next);
    if (nextCount > bestCount) {
      bestBody = next;
      bestCount = nextCount;
    }
  }

  if (bestCount < MIN_CHARS) {
    return { ok: false, reason: `too_short(${bestCount})`, charCount: bestCount, appendCount };
  }
  body = bestBody;
  const charCount = bestCount;
  // 上限超過は警告のみで通す(ペアワイズで評価)
  const outPath = join(workDir, "layer5_ep001.md");
  writeFileSync(outPath, body + "\n");
  return { ok: true, body, charCount, appendCount };
}
