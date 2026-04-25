// backfillのv12スコアと新ジャンル別閾値を使い、過去L5作品を再評価してL6へenqueueする。
//
// 対象:
//   - L5 latest state が done/rejected の作品
//   - backfillでv12スコアが取れており、ジャンル別閾値を超える
//   - まだL6に入っていない(L6で done/processing/failed/pending のいずれにもない)
//
// Usage: npx tsx scripts/generation/_resurrect-l5.ts [--dry-run] [--limit N]

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { readdirSync } from "fs";
import { glob } from "glob";
import { enqueue, type LayerId, type QueueEntry } from "../../src/lib/screening/work-queue";
import { getV12Threshold } from "../../src/lib/screening/hit-predictor-v12";

// archive込みで layer の latest state を引く(キュー掃除後はcurrent layerNジはスカスカ)
function getLatestEntriesWithArchive(layer: LayerId): Map<string, QueueEntry> {
  const latest = new Map<string, QueueEntry>();
  const paths = [
    `data/generation/_queues/layer${layer}.jsonl`,
    ...readdirSync("data/generation/_queues/archive", { withFileTypes: false })
      .filter((f) => f.startsWith(`layer${layer}_`) && f.endsWith(".jsonl"))
      .map((f) => `data/generation/_queues/archive/${f}`),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const e = JSON.parse(line) as QueueEntry;
        const prev = latest.get(e.slug);
        if (!prev || e.updatedAt >= prev.updatedAt) latest.set(e.slug, e);
      } catch {}
    }
  }
  return latest;
}

interface BackfillRecord {
  slug: string;
  genre: string;
  v12: number;
  tier: string;
}
interface BackfillFile {
  records: BackfillRecord[];
  allStats: { n: number; mean: number; p50: number; p80: number; p90: number };
}

function findLatestBackfill(): string {
  const dir = "data/experiments";
  const candidates = readdirSync(dir)
    .filter((f) => f.startsWith("v12-backfill-") && f.endsWith(".json"))
    .sort();
  if (candidates.length === 0) throw new Error("v12-backfill-*.json が見つからない");
  return join(dir, candidates[candidates.length - 1]);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  const backfillPath = findLatestBackfill();
  console.log(`backfill: ${backfillPath}`);
  const data = JSON.parse(readFileSync(backfillPath, "utf-8")) as BackfillFile;

  // 現在のL5とL6のlatest stateを引く(archive込み)
  const l5Latest = getLatestEntriesWithArchive(5);
  const l6Latest = getLatestEntriesWithArchive(6);
  console.log(`L5 latest: ${l5Latest.size} slug / L6 latest: ${l6Latest.size} slug`);

  // v12通過フィルタ
  const passed: BackfillRecord[] = [];
  const byReason: Record<string, number> = { no_l5_entry: 0, already_in_l6: 0, l5_not_done_or_rejected: 0, below_threshold: 0, ok: 0 };
  for (const r of data.records) {
    const threshold = getV12Threshold(r.genre);
    if (r.v12 < threshold) { byReason.below_threshold++; continue; }

    const l5 = l5Latest.get(r.slug);
    if (!l5) { byReason.no_l5_entry++; continue; }
    if (l5.state !== "done" && l5.state !== "rejected") {
      byReason.l5_not_done_or_rejected++;
      continue;
    }
    if (l6Latest.has(r.slug)) { byReason.already_in_l6++; continue; }

    passed.push(r);
    byReason.ok++;
  }

  console.log(`\n判定内訳:`);
  for (const [k, v] of Object.entries(byReason)) console.log(`  ${k}: ${v}`);

  // ジャンル別集計
  const byGenre: Record<string, number> = {};
  for (const p of passed) byGenre[p.genre] = (byGenre[p.genre] ?? 0) + 1;
  console.log(`\n復活対象のジャンル分布 (計${passed.length}件):`);
  for (const [g, n] of Object.entries(byGenre).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g}: ${n}`);
  }

  if (dryRun) {
    console.log(`\n[dry-run] enqueue はスキップ。最初の5件:`);
    for (const p of passed.slice(0, 5)) console.log(`  ${p.slug} v12=${p.v12.toFixed(1)} genre=${p.genre}`);
    return;
  }

  const target = passed.slice(0, limit);
  let ok = 0;
  for (const p of target) {
    try {
      enqueue({ slug: p.slug, layer: 6, genre: p.genre, isExploration: false });
      ok++;
    } catch (e) {
      console.error(`enqueue失敗 ${p.slug}: ${(e as Error).message}`);
    }
  }
  console.log(`\nenqueue完了: ${ok}/${target.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
