#!/usr/bin/env npx tsx
// アルファポリス一括クロール（Cookie認証付き）
// 使い方:
//   npx tsx scripts/crawler/batch-crawl-alphapolis.ts data/targets/alphapolis_stratified.json
//   npx tsx scripts/crawler/batch-crawl-alphapolis.ts data/targets/alphapolis_stratified.json --max-ep 10 --max-works 20

import fs from "fs/promises";
import path from "path";
import { crawlAlphapolis, closeBrowser } from "./alphapolis";

interface Target {
  ncode: string; // novelPath (authorId/novelId)
  title: string;
  site: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("使い方: npx tsx scripts/crawler/batch-crawl-alphapolis.ts <targets.json> [--max-ep N] [--max-works N]");
    process.exit(1);
  }

  const targetFile = args[0];
  let maxEp: number | undefined;
  let maxWorks: number | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--max-ep" && args[i + 1]) {
      maxEp = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--max-works" && args[i + 1]) {
      maxWorks = parseInt(args[i + 1]);
      i++;
    }
  }

  return { targetFile, maxEp, maxWorks };
}

async function main() {
  const { targetFile, maxEp, maxWorks } = parseArgs();

  const raw = await fs.readFile(targetFile, "utf-8");
  let targets: Target[] = JSON.parse(raw);
  if (maxWorks) targets = targets.slice(0, maxWorks);

  const outputDir = path.resolve(process.cwd(), "data/crawled");

  console.log(`🕷️ アルファポリス一括クロール（Cookie認証）`);
  console.log(`  作品数: ${targets.length}`);
  if (maxEp) console.log(`  各作品上限: ${maxEp}話`);
  console.log("");

  const logPath = path.join(outputDir, "_alphapolis_crawl_log.json");
  let log: Record<string, { status: string; completedAt?: string }> = {};
  try {
    log = JSON.parse(await fs.readFile(logPath, "utf-8"));
  } catch {}

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const target of targets) {
      const key = target.ncode.replace("/", "_");
      if (log[key]?.status === "done") {
        console.log(`⏭️ ${target.ncode} スキップ（クロール済み）`);
        skipped++;
        continue;
      }

      console.log(`\n${"═".repeat(60)}`);
      console.log(`📚 [${completed + skipped + failed + 1}/${targets.length}] ${target.title.slice(0, 40)}`);

      try {
        await crawlAlphapolis(target.ncode, { endEp: maxEp, outputDir });
        log[key] = { status: "done", completedAt: new Date().toISOString() };
        completed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ 失敗: ${msg}`);
        log[key] = { status: "failed" };
        failed++;
      }

      await fs.mkdir(path.dirname(logPath), { recursive: true });
      await fs.writeFile(logPath, JSON.stringify(log, null, 2), "utf-8");
    }
  } finally {
    await closeBrowser();
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ 完了 — 成功: ${completed} / スキップ: ${skipped} / 失敗: ${failed}`);
}

main().catch((err) => {
  console.error("❌ 致命的エラー:", err.message);
  process.exit(1);
});
