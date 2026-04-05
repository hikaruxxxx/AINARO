#!/usr/bin/env npx tsx
// ターゲットリストから一括クロール
// 使い方:
//   npx tsx scripts/crawler/batch-crawl.ts data/targets/villainess.json
//   npx tsx scripts/crawler/batch-crawl.ts data/targets/villainess.json --max-ep 50  # 各作品50話まで
//   npx tsx scripts/crawler/batch-crawl.ts data/targets/villainess.json --max-works 5 # 最初の5作品だけ

import fs from "fs/promises";
import path from "path";
import { crawlNovel } from "./narou";

interface Target {
  ncode: string;
  title: string;
  episodes: number;
  status: string;
}

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("使い方: npx tsx scripts/crawler/batch-crawl.ts <targets.json> [--max-ep N] [--max-works N]");
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

  if (maxWorks) {
    targets = targets.slice(0, maxWorks);
  }

  const outputDir = path.resolve(process.cwd(), "data/crawled");
  const totalEpisodes = targets.reduce(
    (sum, t) => sum + Math.min(t.episodes, maxEp || Infinity),
    0
  );

  console.log(`🕷️ 一括クロール開始`);
  console.log(`  作品数: ${targets.length}`);
  console.log(`  推定エピソード数: ${totalEpisodes}`);
  if (maxEp) console.log(`  各作品上限: ${maxEp}話`);
  console.log(`  出力: ${outputDir}/`);

  // 推定時間（1話あたり平均5.5秒 + 目次取得）
  const estimatedMinutes = Math.ceil((totalEpisodes * 5.5 + targets.length * 10) / 60);
  console.log(`  推定所要時間: 約${estimatedMinutes}分`);
  console.log("");

  // 進捗ログファイル
  const logPath = path.join(outputDir, "_crawl_log.json");
  let log: Record<string, { status: string; episodes: number; completedAt?: string }> = {};
  try {
    log = JSON.parse(await fs.readFile(logPath, "utf-8"));
  } catch {
    // 初回
  }

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of targets) {
    // 完了済みスキップ
    if (log[target.ncode]?.status === "done") {
      console.log(`⏭️ ${target.ncode} "${target.title.slice(0, 30)}" スキップ（クロール済み）`);
      skipped++;
      continue;
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`📚 [${completed + skipped + failed + 1}/${targets.length}] ${target.title.slice(0, 40)}`);
    console.log(`${"═".repeat(60)}`);

    try {
      await crawlNovel(target.ncode, {
        endEp: maxEp,
        outputDir,
      });

      log[target.ncode] = {
        status: "done",
        episodes: Math.min(target.episodes, maxEp || Infinity),
        completedAt: new Date().toISOString(),
      };
      completed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ ${target.ncode} 失敗: ${msg}`);
      log[target.ncode] = { status: "failed", episodes: 0 };
      failed++;

      // BAN疑いの場合は長時間待機
      if (msg.includes("429") || msg.includes("503")) {
        console.warn("⚠️ レート制限検出。60秒待機...");
        await new Promise((r) => setTimeout(r, 60000));
      }
    }

    // 進捗保存（作品ごとに）
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, JSON.stringify(log, null, 2), "utf-8");
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ 一括クロール完了`);
  console.log(`  成功: ${completed} / スキップ: ${skipped} / 失敗: ${failed}`);
  console.log(`${"═".repeat(60)}`);
}

main().catch((err) => {
  console.error("❌ 致命的エラー:", err.message);
  process.exit(1);
});
