// ep mdファイル先頭に `# 第N話「タイトル」\n\n---\n\n` を挿入する汎用スクリプト
//
// 入力 JSON の2形式に対応:
//   単一作品: { "1": "タイトル1", ... }  → --slug SLUG 必須
//   複数作品: { "slug1": {"1": "..."}, "slug2": {...}, ... }  → --slug 不要
//
// 既に先頭が `# 第N話「...」` 形式なら skip
//
// 使い方:
//   npx tsx scripts/utils/prepend-episode-titles.ts [--slug SLUG] --titles-file /tmp/titles.json [--dry-run]

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slugIdx = args.indexOf("--slug");
const cliSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;
const titlesIdx = args.indexOf("--titles-file");
const titlesFile = titlesIdx !== -1 ? args[titlesIdx + 1] : null;

if (!titlesFile) {
  console.error("Usage: [--slug SLUG] --titles-file /path/to/titles.json [--dry-run]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(titlesFile, "utf-8")) as Record<string, unknown>;

// 形式判定: 値が string → 単一作品, object → 複数作品
const entries: Array<[string, Record<string, string>]> = [];
const firstVal = Object.values(raw)[0];
if (typeof firstVal === "string") {
  if (!cliSlug) {
    console.error("単一形式の JSON には --slug 指定が必要");
    process.exit(1);
  }
  entries.push([cliSlug, raw as Record<string, string>]);
} else {
  for (const [slug, m] of Object.entries(raw)) {
    entries.push([slug, m as Record<string, string>]);
  }
}

const alreadyTitledRe = /^# 第\d+話「.+」/;
let prepended = 0;
let skipped = 0;
let missing = 0;

for (const [slug, titleMap] of entries) {
  const dir = join("content/works", slug);
  if (!existsSync(dir)) {
    console.warn(`[missing] 作品ディレクトリ: ${dir}`);
    missing++;
    continue;
  }

  for (const [epStr, title] of Object.entries(titleMap)) {
    const epNum = parseInt(epStr, 10);
    if (isNaN(epNum) || !title) continue;

    const epPath = join(dir, `ep${String(epNum).padStart(3, "0")}.md`);
    if (!existsSync(epPath)) {
      console.warn(`  [missing] ${slug} ep${epNum}`);
      missing++;
      continue;
    }

    const body = readFileSync(epPath, "utf-8");
    const firstLine = body.split("\n", 1)[0];
    if (alreadyTitledRe.test(firstLine)) {
      skipped++;
      continue;
    }

    const header = `# 第${epNum}話「${title}」\n\n---\n\n`;
    if (dryRun) {
      console.log(`  [dry] ${slug} ep${epNum} → ${title}`);
    } else {
      writeFileSync(epPath, header + body);
    }
    prepended++;
  }
}

console.log(`\n完了: 挿入 ${prepended} / スキップ ${skipped} / missing ${missing}`);
