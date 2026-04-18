// ep mdファイル先頭に `# 第N話「タイトル」\n\n---\n\n` を挿入する汎用スクリプト
//
// 入力: JSON ファイル { "1": "タイトル1", "2": "タイトル2", ... }
// 既に先頭が `# 第N話「...」` 形式なら skip
//
// 使い方:
//   npx tsx scripts/utils/prepend-episode-titles.ts --slug SLUG --titles-file /tmp/titles.json [--dry-run]

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const slugIdx = args.indexOf("--slug");
const slug = slugIdx !== -1 ? args[slugIdx + 1] : null;
const titlesIdx = args.indexOf("--titles-file");
const titlesFile = titlesIdx !== -1 ? args[titlesIdx + 1] : null;

if (!slug || !titlesFile) {
  console.error("Usage: --slug SLUG --titles-file /path/to/titles.json [--dry-run]");
  process.exit(1);
}

const dir = join("content/works", slug);
if (!existsSync(dir)) {
  console.error(`作品ディレクトリが見つからない: ${dir}`);
  process.exit(1);
}

const titles = JSON.parse(readFileSync(titlesFile, "utf-8")) as Record<string, string>;

const alreadyTitledRe = /^# 第\d+話「.+」/;

let prepended = 0;
let skipped = 0;
let missing = 0;

for (const [epStr, title] of Object.entries(titles)) {
  const epNum = parseInt(epStr, 10);
  if (isNaN(epNum) || !title) continue;

  const epPath = join(dir, `ep${String(epNum).padStart(3, "0")}.md`);
  if (!existsSync(epPath)) {
    console.warn(`  [missing] ep${epNum}: ${epPath}`);
    missing++;
    continue;
  }

  const body = readFileSync(epPath, "utf-8");
  const firstLine = body.split("\n", 1)[0];
  if (alreadyTitledRe.test(firstLine)) {
    console.log(`  [skip] ep${epNum} (既にタイトル付き: ${firstLine})`);
    skipped++;
    continue;
  }

  const header = `# 第${epNum}話「${title}」\n\n---\n\n`;
  if (dryRun) {
    console.log(`  [dry] ep${epNum} → ${header.trim()}`);
  } else {
    writeFileSync(epPath, header + body);
    console.log(`  [ok]  ep${epNum} → 第${epNum}話「${title}」`);
  }
  prepended++;
}

console.log(`\n完了: 挿入 ${prepended} / スキップ ${skipped} / missing ${missing}`);
