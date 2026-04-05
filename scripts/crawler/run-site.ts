#!/usr/bin/env npx tsx
// マルチサイトクローラーCLI
// 使い方:
//   npx tsx scripts/crawler/run-site.ts kakuyomu <workId> [--end 5]
//   npx tsx scripts/crawler/run-site.ts alphapolis <authorId/novelId> [--end 5]
//
// 例:
//   npx tsx scripts/crawler/run-site.ts kakuyomu 16816927860265927929 --end 3
//   npx tsx scripts/crawler/run-site.ts alphapolis 836425194/156aborist --end 3

import path from "path";

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("使い方: npx tsx scripts/crawler/run-site.ts <site> <id> [--start N] [--end N]");
    console.log("");
    console.log("サイト:");
    console.log("  kakuyomu     カクヨム（workId）");
    console.log("  alphapolis   アルファポリス（authorId/novelId）");
    console.log("");
    console.log("例:");
    console.log("  npx tsx scripts/crawler/run-site.ts kakuyomu 16816927860265927929 --end 3");
    process.exit(1);
  }

  const site = args[0];
  const id = args[1];
  let startEp: number | undefined;
  let endEp: number | undefined;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--start" && args[i + 1]) {
      startEp = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === "--end" && args[i + 1]) {
      endEp = parseInt(args[i + 1]);
      i++;
    }
  }

  const outputDir = path.resolve(process.cwd(), "data/crawled");

  console.log(`🕷️ ${site} クローラー起動`);
  console.log(`  対象: ${id}`);
  if (endEp) console.log(`  上限: ${endEp}話`);
  console.log("");

  if (site === "kakuyomu") {
    const { crawlKakuyomu, closeBrowser } = await import("./kakuyomu");
    try {
      await crawlKakuyomu(id, { startEp, endEp, outputDir });
    } finally {
      await closeBrowser();
    }
  } else if (site === "alphapolis") {
    const { crawlAlphapolis, closeBrowser } = await import("./alphapolis");
    try {
      await crawlAlphapolis(id, { startEp, endEp, outputDir });
    } finally {
      await closeBrowser();
    }
  } else {
    console.error(`❌ 未対応サイト: ${site}`);
    console.error("対応: kakuyomu, alphapolis");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
