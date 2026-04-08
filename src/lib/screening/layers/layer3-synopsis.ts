// Layer 3: あらすじ生成
//
// 役割:
// - layer1_logline.md と layer2_plot.md を入力
// - 読者向けの 800字程度のあらすじを生成
// - works/{slug}/layer3_synopsis.md に保存

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { callClaudeCli } from "../claude-cli";
import type { WorkMetaFile } from "./layer1-logline";

export interface Layer3Result {
  ok: boolean;
  synopsis?: string;
  reason?: string;
}

const STYLE_TEMPLATE_DIR = "data/generation/style-templates";

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

function buildSynopsisPrompt(meta: WorkMetaFile, logline: string, plot: string): string {
  const style = loadStyleTemplate(meta.seed.genre);
  const styleBlock = style ? `\n# 文体ガイド\n${style}\n` : "";
  return `あなたはWeb小説のあらすじ作家です。以下の素材から、読者向けのあらすじ(700〜900字)を執筆してください。
${styleBlock}
# 素材
- ジャンル: ${meta.seed.genre}
- ログライン: ${logline}

## プロット骨格
${plot}

# 制約
- 700〜900字(日本語実文字数)
- 読者の興味を引くフックを冒頭1〜2文で提示
- 主人公の境遇 → 転機 → 物語の方向性 が伝わる
- 結末の核心は明かさない(続きが気になる引きで終える)
- なろう読者に響く検索キーワードを自然に含める
- 文体ガイドの語彙傾向に従う

# 出力形式
あらすじ本文のみ。前置き・解説・タイトルは不要。`;
}

export async function runLayer3(slug: string, worksDir = "data/generation/works"): Promise<Layer3Result> {
  const workDir = join(worksDir, slug);
  const metaPath = join(workDir, "_meta.json");
  const loglinePath = join(workDir, "layer1_logline.md");
  const plotPath = join(workDir, "layer2_plot.md");
  if (!existsSync(metaPath) || !existsSync(loglinePath) || !existsSync(plotPath)) {
    return { ok: false, reason: "prereq_missing" };
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as WorkMetaFile;
  const logline = readFileSync(loglinePath, "utf-8").replace(/^#[^\n]*\n+/, "").trim();
  const plot = readFileSync(plotPath, "utf-8");

  const prompt = buildSynopsisPrompt(meta, logline, plot);
  let raw: string;
  try {
    raw = await callClaudeCli(prompt, { layer: "layer3", slug });
  } catch (e) {
    return { ok: false, reason: `claude_call_failed: ${(e as Error).message}` };
  }

  const synopsis = raw.trim();
  const charCount = synopsis.length;
  if (charCount < 500) {
    return { ok: false, reason: `synopsis_too_short(${charCount})` };
  }
  if (charCount > 1500) {
    return { ok: false, reason: `synopsis_too_long(${charCount})` };
  }

  const outPath = join(workDir, "layer3_synopsis.md");
  writeFileSync(outPath, `# あらすじ\n\n${synopsis}\n`);
  return { ok: true, synopsis };
}
