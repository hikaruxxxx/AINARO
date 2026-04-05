#!/usr/bin/env npx tsx
// クローラー実行スクリプト
// 使い方:
//   npx tsx scripts/crawler/run.ts <ncode> [--start 1] [--end 10]
//
// 例:
//   npx tsx scripts/crawler/run.ts n9669bk           # 全話取得
//   npx tsx scripts/crawler/run.ts n9669bk --end 5   # 最初の5話だけ
//   npx tsx scripts/crawler/run.ts n9669bk --start 3  # 3話目から再開

import { crawlNovel } from "./narou";
import path from "path";

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("使い方: npx tsx scripts/crawler/run.ts <ncode> [--start N] [--end N]");
    console.log("");
    console.log("例:");
    console.log("  npx tsx scripts/crawler/run.ts n9669bk         # 全話取得");
    console.log("  npx tsx scripts/crawler/run.ts n9669bk --end 5 # 最初の5話");
    process.exit(1);
  }

  const ncode = args[0].toLowerCase();
  let startEp: number | undefined;
  let endEp: number | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--start" && args[i + 1]) {
      startEp = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--end" && args[i + 1]) {
      endEp = parseInt(args[i + 1]);
      i++;
    }
  }

  return { ncode, startEp, endEp };
}

async function main() {
  const { ncode, startEp, endEp } = parseArgs();
  const outputDir = path.resolve(process.cwd(), "data/crawled");

  console.log(`🕷️ なろうクローラー起動`);
  console.log(`  対象: ${ncode}`);
  if (startEp) console.log(`  開始: ${startEp}話`);
  if (endEp) console.log(`  終了: ${endEp}話`);
  console.log(`  出力: ${outputDir}/${ncode}/`);
  console.log(`  間隔: 3〜8秒（BAN防止）`);
  console.log("");

  await crawlNovel(ncode, { startEp, endEp, outputDir });
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
