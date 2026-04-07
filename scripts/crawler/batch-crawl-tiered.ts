#!/usr/bin/env npx tsx
// 階層別クロール: 人気作品は全話、それ以外は10話制限
// 使い方: npx tsx scripts/crawler/batch-crawl-tiered.ts data/targets/narou_8k.json

import fs from "fs/promises";
import path from "path";
import { crawlNovel } from "./narou";

// 全話取得する条件: tier が人気層 OR globalPoint が 50,000 以上
const FULL_TIERS = new Set(["top", "upper", "paired_high", "mid-high"]);
const FULL_POINT_THRESHOLD = 50000;
const DEFAULT_MAX_EP = 10;

interface Target {
  ncode: string;
  title: string;
  tier?: string;
  globalPoint?: number;
  episodes?: number;
}

function shouldCrawlFull(target: Target): boolean {
  if (target.tier && FULL_TIERS.has(target.tier)) return true;
  if ((target.globalPoint || 0) >= FULL_POINT_THRESHOLD) return true;
  return false;
}

async function main() {
  const targetFile = process.argv[2];
  if (!targetFile) {
    console.log("使い方: npx tsx scripts/crawler/batch-crawl-tiered.ts <targets.json>");
    process.exit(1);
  }

  const raw = await fs.readFile(targetFile, "utf-8");
  const targets: Target[] = JSON.parse(raw);
  const outputDir = path.resolve(process.cwd(), "data/crawled");

  // 人気作品と一般作品に分類
  const fullTargets = targets.filter(shouldCrawlFull);
  const limitedTargets = targets.filter((t) => !shouldCrawlFull(t));

  console.log(`🕷️ 階層別クロール`);
  console.log(`  全話取得: ${fullTargets.length}作品（top/upper/paired_high/mid-high or ${FULL_POINT_THRESHOLD.toLocaleString()}pt以上）`);
  console.log(`  ${DEFAULT_MAX_EP}話制限: ${limitedTargets.length}作品`);
  console.log(`  合計: ${targets.length}作品\n`);

  // ログ
  const logPath = path.join(outputDir, "_crawl_log.json");
  let log: Record<string, { status: string; episodes: number; completedAt?: string; full?: boolean }> = {};
  try {
    log = JSON.parse(await fs.readFile(logPath, "utf-8"));
  } catch {}

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  // フェーズ1: 人気作品（全話）→ フェーズ2: 一般作品（10話）
  const phases: { label: string; targets: Target[]; maxEp?: number }[] = [
    { label: "🌟 フェーズ1: 人気作品（全話取得）", targets: fullTargets, maxEp: undefined },
    { label: "📚 フェーズ2: 一般作品（10話制限）", targets: limitedTargets, maxEp: DEFAULT_MAX_EP },
  ];

  for (const phase of phases) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(phase.label);
    console.log(`  対象: ${phase.targets.length}作品`);
    if (phase.maxEp) console.log(`  上限: ${phase.maxEp}話`);
    console.log(`${"═".repeat(60)}\n`);

    for (const target of phase.targets) {
      const targetDir = path.join(outputDir, target.ncode);
      const dirExists = await fs.access(targetDir).then(() => true).catch(() => false);

      // エピソードファイルが実際にあるか確認（メタだけのディレクトリは不完全）
      let epCount = 0;
      if (dirExists) {
        const files = await fs.readdir(targetDir);
        epCount = files.filter((f) => f.startsWith("ep") && f.endsWith(".json")).length;
      }
      const hasData = dirExists && epCount > 0;

      // 全話取得対象で、既にmax-ep制限で取得済みの場合は再取得が必要
      if (!phase.maxEp && hasData && log[target.ncode]?.status === "done" && !log[target.ncode]?.full) {
        // 人気作品だが10話制限で取得済み → 続きから再取得
        console.log(`🔄 ${target.ncode} "${(target.title || "").slice(0, 30)}" 全話で再取得（既存${epCount}話）`);
      } else if (hasData || log[target.ncode]?.status === "done") {
        skipped++;
        continue;
      }

      const maxEp = phase.maxEp;
      const epLabel = maxEp ? `${maxEp}話` : "全話";
      console.log(`[${completed + skipped + failed + 1}/${targets.length}] ${epLabel} ${(target.title || target.ncode).slice(0, 40)}`);

      try {
        await crawlNovel(target.ncode, {
          endEp: maxEp,
          outputDir,
        });

        log[target.ncode] = {
          status: "done",
          episodes: target.episodes || 0,
          completedAt: new Date().toISOString(),
          full: !maxEp,
        };
        completed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ ${target.ncode} 失敗: ${msg}`);
        log[target.ncode] = { status: "failed", episodes: 0 };
        failed++;

        if (msg.includes("429") || msg.includes("503")) {
          console.warn("⚠️ レート制限検出。60秒待機...");
          await new Promise((r) => setTimeout(r, 60000));
        }
      }

      await fs.writeFile(logPath, JSON.stringify(log, null, 2), "utf-8");
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ 完了: 成功${completed} / スキップ${skipped} / 失敗${failed}`);
}

main().catch((err) => {
  console.error("❌ 致命的エラー:", err.message);
  process.exit(1);
});
