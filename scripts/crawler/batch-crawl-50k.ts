#!/usr/bin/env npx tsx
// なろう5万作品クロール
// - 上位5,000件（globalPoint上位）: 全話取得
// - 残り45,000件: 10話制限
// 使い方: npx tsx scripts/crawler/batch-crawl-50k.ts

import fs from "fs/promises";
import path from "path";
import { crawlNovel } from "./narou";

const TARGET_FILE = "data/targets/narou_50k.json";
const OUTPUT_DIR = path.resolve(process.cwd(), "data/crawled");
const LOG_FILE = path.join(OUTPUT_DIR, "_crawl_50k_log.json");
const FULL_CRAWL_TOP_N = 5000;
const LIMITED_MAX_EP = 10;

interface Target {
  ncode: string;
  title: string;
  globalPoint: number;
  episodes?: number;
  [key: string]: any;
}

interface LogEntry {
  status: string;
  episodes: number;
  completedAt?: string;
  full?: boolean;
}

async function hasEpisodes(dir: string): Promise<number> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.startsWith("ep") && f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

async function main() {
  const raw = await fs.readFile(TARGET_FILE, "utf-8");
  const allTargets: Target[] = JSON.parse(raw);

  // ポイント降順でソートし、上位5000件を全話取得対象に
  const sorted = [...allTargets].sort((a, b) => (b.globalPoint || 0) - (a.globalPoint || 0));
  const fullNcodes = new Set(sorted.slice(0, FULL_CRAWL_TOP_N).map((t) => t.ncode.toLowerCase()));

  const fullTargets = allTargets.filter((t) => fullNcodes.has(t.ncode.toLowerCase()));
  const limitedTargets = allTargets.filter((t) => !fullNcodes.has(t.ncode.toLowerCase()));

  console.log(`🕷️ なろう5万作品クロール`);
  console.log(`  全話取得: ${fullTargets.length}作品（ポイント上位${FULL_CRAWL_TOP_N}）`);
  console.log(`  ${LIMITED_MAX_EP}話制限: ${limitedTargets.length}作品`);
  console.log(`  合計: ${allTargets.length}作品\n`);

  // ログ読み込み
  let log: Record<string, LogEntry> = {};
  try {
    log = JSON.parse(await fs.readFile(LOG_FILE, "utf-8"));
  } catch {}

  // 旧ログも参照（8kクロールのログ）
  let oldLog: Record<string, LogEntry> = {};
  try {
    oldLog = JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, "_crawl_log.json"), "utf-8"));
  } catch {}

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  const phases: { label: string; targets: Target[]; maxEp?: number; isFull: boolean }[] = [
    { label: "🌟 フェーズ1: 人気作品（全話取得）", targets: fullTargets, maxEp: undefined, isFull: true },
    { label: `📚 フェーズ2: 一般作品（${LIMITED_MAX_EP}話制限）`, targets: limitedTargets, maxEp: LIMITED_MAX_EP, isFull: false },
  ];

  for (const phase of phases) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(phase.label);
    console.log(`  対象: ${phase.targets.length}作品`);
    console.log(`${"═".repeat(60)}\n`);

    for (const target of phase.targets) {
      const ncode = target.ncode.toLowerCase();
      const targetDir = path.join(OUTPUT_DIR, ncode);
      const epCount = await hasEpisodes(targetDir);

      // スキップ判定
      const logEntry = log[ncode] || oldLog[ncode];

      if (phase.isFull) {
        // 全話取得: full=trueでログ済みならスキップ
        if (logEntry?.status === "done" && logEntry.full) {
          skipped++;
          continue;
        }
        // エピソードあり＋fullでないなら続きから取得（narou.tsが既存epをスキップする）
      } else {
        // 10話制限: エピソードが1件以上あればスキップ
        if (epCount > 0 || logEntry?.status === "done") {
          skipped++;
          continue;
        }
      }

      const epLabel = phase.maxEp ? `${phase.maxEp}話` : "全話";
      const total = completed + skipped + failed + 1;
      if (total % 100 === 1 || epCount > 0) {
        console.log(`[${total}/${allTargets.length}] ${epLabel} ${(target.title || ncode).slice(0, 40)}${epCount > 0 ? ` (既存${epCount}話から継続)` : ""}`);
      }

      try {
        await crawlNovel(ncode, {
          endEp: phase.maxEp,
          outputDir: OUTPUT_DIR,
        });

        log[ncode] = {
          status: "done",
          episodes: target.episodes || 0,
          completedAt: new Date().toISOString(),
          full: phase.isFull,
        };
        completed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (total % 50 === 1) {
          console.error(`❌ ${ncode} 失敗: ${msg}`);
        }
        log[ncode] = { status: "failed", episodes: 0 };
        failed++;

        if (msg.includes("429") || msg.includes("503")) {
          console.warn("⚠️ レート制限検出。60秒待機...");
          await new Promise((r) => setTimeout(r, 60000));
        }
      }

      // 100作品ごとにログ保存 + 進捗表示
      if ((completed + failed) % 100 === 0) {
        await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2), "utf-8");
        console.log(`📊 進捗: 成功${completed} / スキップ${skipped} / 失敗${failed} / 合計${completed + skipped + failed}/${allTargets.length}`);
      }
    }

    // フェーズ完了時にログ保存
    await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2), "utf-8");
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ 完了: 成功${completed} / スキップ${skipped} / 失敗${failed}`);
}

main().catch((err) => {
  console.error("❌ 致命的エラー:", err.message);
  process.exit(1);
});
