// Layer 6: ep2-3本文生成
//
// 役割:
// - Layer 5 を通過した精鋭作品のみが対象
// - ep2 と ep3 を順に生成
// - 各話 3500-4500字、追記ループ最大2回
// - works/{slug}/layer6_ep002.md と layer6_ep003.md に保存

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { callClaudeCli } from "../claude-cli";
import { buildPatternBlock } from "../patterns";
import type { WorkMetaFile } from "./layer1-logline";

export interface Layer6Result {
  ok: boolean;
  ep2CharCount?: number;
  ep3CharCount?: number;
  reason?: string;
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

function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

function buildEpPrompt(
  meta: WorkMetaFile,
  arcPlot: string,
  prevEpisodes: { ep: number; body: string }[],
  targetEp: number,
  isExploration = false,
): string {
  const style = loadStyleTemplate(meta.seed.genre);
  const styleBlock = style ? `\n# 文体ガイド(必ず従う)\n${style}\n` : "";
  const patternBlock = buildPatternBlock(isExploration);
  const prevBlock = prevEpisodes
    .map((e) => `## ep${String(e.ep).padStart(3, "0")}\n${e.body}`)
    .join("\n\n");
  return `あなたはWeb小説家です。前話の流れを引き継いで ep${targetEp} の本文を執筆してください。
${styleBlock}${patternBlock}
# ジャンル
${meta.seed.genre}

# 第1アーク詳細プロット
${arcPlot}

# 既存話
${prevBlock}

# 文字数(厳守)
- ${MIN_CHARS}〜${MAX_CHARS}字(日本語実文字数、空白・改行を除いてカウント)
- 目標は${Math.floor((MIN_CHARS + MAX_CHARS) / 2)}字前後。${MIN_CHARS}字を絶対に下回らないこと
- 前話の引きを必ず受ける
- 詳細プロットの ep${targetEp} の中心となる出来事を描く
- 末尾は次話への引きで終える

# 構成(4シーン)
【冒頭】 600〜900字 — 前話からの接続
【展開】 1300〜1700字 — 主要な出来事
【転機】 1100〜1500字 — 場面の変化や決断
【引き】 300〜500字 — 次話への期待

# 出力形式
本文のみ。前置き・タイトル・章見出しは不要。`;
}

function buildAppendPrompt(currentBody: string, shortageChars: number): string {
  const currentChars = currentBody.replace(/\s/g, "").length;
  const targetChars = currentChars + shortageChars + 200;
  return `以下の本文は文字数が${shortageChars}字不足しています(現在 約${currentChars}字、目標 約${targetChars}字以上)。【展開】または【転機】を膨らませてください。

# 絶対制約
- 出力は必ず現在より長くすること(短くなったら失敗扱い)
- 目標は${targetChars}字以上(空白・改行除く)
- 既存の本文の文・段落を削らない。原文の文章はすべて含めること
- 既存シーンの描写を厚くする(新シーンの追加ではなく、五感・心情・対話の追記)

# 既存本文
${currentBody}

# 出力形式
追記後の完全な本文のみ。説明は不要。`;
}

async function generateOneEpisode(
  meta: WorkMetaFile,
  arcPlot: string,
  prevEpisodes: { ep: number; body: string }[],
  targetEp: number,
  slug: string,
  isExploration = false,
): Promise<{ ok: boolean; body?: string; charCount?: number; reason?: string }> {
  const prompt = buildEpPrompt(meta, arcPlot, prevEpisodes, targetEp, isExploration);
  let body: string;
  try {
    body = (await callClaudeCli(prompt, { layer: `layer6_ep${targetEp}`, slug })).trim();
  } catch (e) {
    return { ok: false, reason: `claude_call_failed: ${(e as Error).message}` };
  }
  // best-of: append で短く返ってくることがあるため、過去最長を保持
  let bestBody = body;
  let bestCount = countChars(body);
  let appendCount = 0;
  while (bestCount < MIN_CHARS && appendCount < MAX_APPEND_LOOPS) {
    appendCount++;
    const shortage = MIN_CHARS - bestCount;
    let next: string;
    try {
      next = (await callClaudeCli(buildAppendPrompt(bestBody, shortage), {
        layer: `layer6_ep${targetEp}_append`,
        slug,
      })).trim();
    } catch (e) {
      return { ok: false, reason: `append_failed: ${(e as Error).message}` };
    }
    const nextCount = countChars(next);
    if (nextCount > bestCount) {
      bestBody = next;
      bestCount = nextCount;
    }
  }
  if (bestCount < MIN_CHARS) {
    return { ok: false, reason: `too_short(${bestCount})`, charCount: bestCount };
  }
  return { ok: true, body: bestBody, charCount: bestCount };
}

export async function runLayer6(slug: string, worksDir = "data/generation/works", isExploration = false): Promise<Layer6Result> {
  const workDir = join(worksDir, slug);
  const metaPath = join(workDir, "_meta.json");
  const arcPath = join(workDir, "layer4_arc1_plot.md");
  const ep1Path = join(workDir, "layer5_ep001.md");
  for (const p of [metaPath, arcPath, ep1Path]) {
    if (!existsSync(p)) return { ok: false, reason: `prereq_missing: ${p}` };
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as WorkMetaFile;
  const arcPlot = readFileSync(arcPath, "utf-8");
  const ep1 = readFileSync(ep1Path, "utf-8");

  // ep2
  const ep2Result = await generateOneEpisode(meta, arcPlot, [{ ep: 1, body: ep1 }], 2, slug, isExploration);
  if (!ep2Result.ok) {
    return { ok: false, reason: `ep2_failed: ${ep2Result.reason}` };
  }
  writeFileSync(join(workDir, "layer6_ep002.md"), ep2Result.body! + "\n");

  // ep3
  const ep3Result = await generateOneEpisode(
    meta,
    arcPlot,
    [
      { ep: 1, body: ep1 },
      { ep: 2, body: ep2Result.body! },
    ],
    3,
    slug,
    isExploration,
  );
  if (!ep3Result.ok) {
    return {
      ok: false,
      reason: `ep3_failed: ${ep3Result.reason}`,
      ep2CharCount: ep2Result.charCount,
    };
  }
  writeFileSync(join(workDir, "layer6_ep003.md"), ep3Result.body! + "\n");

  return {
    ok: true,
    ep2CharCount: ep2Result.charCount,
    ep3CharCount: ep3Result.charCount,
  };
}
