// 探索メトリクス週次レポート
//
// 使い方: npx tsx scripts/generation/exploration-report.ts [days]
//   days を省略すると過去7日間
//
// 出力:
// - 4軸の集計
// - 通過判定
// - 月次撤退ルール用の履歴 metrics_history.jsonl への追記

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { computeExplorationMetrics } from "../../src/lib/screening/exploration-metrics";

const WORKS_DIR = "data/generation/works";
const LEAGUE_DIR = "data/generation/leagues";
const HISTORY_PATH = "data/generation/exploration/metrics_history.jsonl";
const REPORT_PATH = "data/generation/exploration/_weekly_report.json";

const days = Number(process.argv[2] ?? 7);
const now = Date.now();
const windowStart = now - days * 24 * 60 * 60 * 1000;

const metrics = computeExplorationMetrics({
  worksDir: WORKS_DIR,
  leagueDir: LEAGUE_DIR,
  layer: 5,
  windowStart,
  windowEnd: now,
});

console.log(`\n探索メトリクス(過去${days}日)`);
console.log("=".repeat(60));
console.log(`対象期間: ${new Date(windowStart).toISOString()} 〜 ${new Date(now).toISOString()}`);
console.log("");
console.log("【軸1: Surprise】");
console.log(`  breakthrough件数: ${metrics.surprise.breakthroughCount}`);
console.log(`  平均rank delta: ${metrics.surprise.avgRankDelta.toFixed(3)}`);
if (metrics.surprise.examples.length > 0) {
  console.log(`  例:`);
  for (const e of metrics.surprise.examples.slice(0, 3)) {
    console.log(`    - ${e.slug} (${e.genre}) delta=${e.rankDelta.toFixed(2)}`);
  }
}
console.log("");
console.log("【軸2: Diversity】");
console.log(`  平均最近傍距離: ${metrics.diversity.avgNearestDistance.toFixed(3)}`);
console.log(`  novel件数(>0.7): ${metrics.diversity.novelCount}`);
console.log("");
console.log("【軸3: Emergence】");
console.log(`  promoted件数: ${metrics.emergence.promotedTupleCount}`);
console.log(`  boosted件数: ${metrics.emergence.boostedComboCount}`);
console.log("");
console.log("【軸4: Model contribution】");
console.log(`  AUC delta: ${metrics.modelContribution.aucDelta}`);
console.log(`  ${metrics.modelContribution.note}`);
console.log("");
console.log("【総合判定】");
console.log(`  passed: ${metrics.passed}`);
console.log(`  reason: ${metrics.reason}`);

// 履歴・レポート保存
const reportDir = dirname(REPORT_PATH);
if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(metrics, null, 2));
appendFileSync(HISTORY_PATH, JSON.stringify(metrics) + "\n");
console.log(`\n保存: ${REPORT_PATH}`);
console.log(`履歴追記: ${HISTORY_PATH}`);
