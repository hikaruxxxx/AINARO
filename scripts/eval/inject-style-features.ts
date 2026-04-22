// 全ジャンルの style-template.md に「ヒット作実測値」セクションを注入
//
// 使い方: npx tsx scripts/eval/inject-style-features.ts [--dry]
//
// 内部ジャンル(data/generation/style-templates/{name}.md)ごとに、
// 対応する外部なろうラベルの top10/bottom10 の prose 特徴量を抽出し、
// セクション末尾に追記(既存の同セクションがあれば置換)。

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// 内部ジャンル → 外部searchGenre (サンプル十分なもののみ)
const MAP: Record<string, string> = {
  isekai_tensei_cheat: "ハイファンタジー",
  isekai_high_fantasy: "ハイファンタジー",
  isekai_tsuiho_zamaa: "追放",
  isekai_slowlife: "スローライフ",
  otome_akuyaku_zamaa: "悪役令嬢",
  otome_villain_fantasy: "悪役令嬢",
  otome_konyaku_haki: "婚約破棄",
  otome_isekai_pure: "異世界恋愛",
  battle_dungeon: "ローファンタジー",
  battle_modern_power: "アクション",
  battle_vrmmo: "VRゲーム",
  battle_war_chronicle: "ハイファンタジー",
  modern_romance: "現実世界恋愛",
  modern_history: "歴史",
  modern_human_drama: "ヒューマンドラマ",
  modern_school: "ヒューマンドラマ",
  mystery_sf: "宇宙",
  mystery_action: "アクション",
};

const MARKER_START = "<!-- AUTO-STYLE-FEATURES-START -->";
const MARKER_END = "<!-- AUTO-STYLE-FEATURES-END -->";

const TEMPLATE_DIR = "data/generation/style-templates";
const isDry = process.argv.includes("--dry");

function runExtract(label: string, topN = 10, botN = 10): string | null {
  try {
    const out = execSync(`npx tsx scripts/eval/extract-style-features.ts '${label}' ${topN} ${botN}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out.trim();
  } catch (e) {
    console.error(`extract failed for ${label}: ${(e as Error).message}`);
    return null;
  }
}

function injectSection(templatePath: string, section: string): { changed: boolean; reason: string } {
  if (!existsSync(templatePath)) return { changed: false, reason: "template not found" };
  const original = readFileSync(templatePath, "utf-8");

  // ヘッダー付きの注入ブロック
  const block = `${MARKER_START}\n## ヒット作実測値(自動抽出、週次更新想定)\n\n${section}\n\n**読み方**: 中央値(IQR 25-75%)。差は top 中央値 − bottom 中央値。\n${MARKER_END}`;

  let updated: string;
  if (original.includes(MARKER_START) && original.includes(MARKER_END)) {
    // 既存ブロックを置換
    const re = new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}`);
    updated = original.replace(re, block);
  } else {
    // 末尾に追記(末尾改行を保証)
    updated = (original.endsWith("\n") ? original : original + "\n") + "\n" + block + "\n";
  }

  if (updated === original) return { changed: false, reason: "no diff" };
  if (isDry) return { changed: true, reason: "(dry run)" };
  writeFileSync(templatePath, updated);
  return { changed: true, reason: "written" };
}

function main() {
  console.log(`[inject-style-features] dry=${isDry}`);
  for (const [internal, label] of Object.entries(MAP)) {
    const tpl = join(TEMPLATE_DIR, `${internal}.md`);
    if (!existsSync(tpl)) {
      console.log(`  skip ${internal}: template missing`);
      continue;
    }
    const section = runExtract(label);
    if (!section) {
      console.log(`  skip ${internal} (${label}): extract failed`);
      continue;
    }
    // 先頭の `## ...` 行を除き本体表のみ取り出す
    // section内容はH2ヘッダ+表。ここでは丸ごと取り込む
    const res = injectSection(tpl, section);
    console.log(`  ${internal} (${label}): ${res.reason}`);
  }
}

main();
