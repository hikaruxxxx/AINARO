// Phase 1 パイプラインの稼働状況スナップショット
//
// 使い方: npx tsx scripts/generation/stats.ts
//
// 出力:
// - 各層の pending/processing/done/rejected/failed 件数
// - リーグの登録作品数(ジャンル別)
// - 直近5h のトークン使用量
// - テンプレ検出(Layer 5の本文が10件以上ある場合のみ)

import { readdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { queueStats } from "../../src/lib/screening/work-queue";
import { getUsageIn5h, DEFAULT_THROTTLE_CONFIG } from "../../src/lib/screening/throttle";
import { loadRatings } from "../../src/lib/screening/league";
import { detectTemplateClusters } from "../../src/lib/screening/template-detector";

const WORKS_DIR = "data/generation/works";
const LEAGUE_DIR = "data/generation/leagues";

function header(s: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(s);
  console.log("=".repeat(60));
}

function showQueues(): void {
  header("キュー状況");
  const stats = queueStats();
  console.log("Layer    | pending | processing | done | rejected | failed");
  console.log("---------|---------|------------|------|----------|-------");
  for (const [layer, counts] of Object.entries(stats)) {
    console.log(
      `${layer.padEnd(8)} | ${String(counts.pending).padStart(7)} | ${String(counts.processing).padStart(10)} | ${String(counts.done).padStart(4)} | ${String(counts.rejected).padStart(8)} | ${String(counts.failed).padStart(6)}`,
    );
  }
}

function showLeagues(): void {
  header("リーグ状況(ジャンル別)");
  if (!existsSync(LEAGUE_DIR)) {
    console.log("(リーグディレクトリ未作成)");
    return;
  }
  const genres = readdirSync(LEAGUE_DIR).filter((d) => {
    const p = join(LEAGUE_DIR, d);
    return existsSync(join(p, "ratings.json"));
  });
  if (genres.length === 0) {
    console.log("(リーグ未登録)");
    return;
  }
  console.log("Genre                       | works | finalized | top rating");
  console.log("----------------------------|-------|-----------|------------");
  for (const genre of genres) {
    const file = loadRatings(genre, LEAGUE_DIR);
    const entries = Object.values(file.entries);
    const finalized = entries.filter((e) => e.finalized).length;
    const top = entries.length > 0 ? Math.max(...entries.map((e) => e.rating)) : 0;
    console.log(
      `${genre.padEnd(27)} | ${String(entries.length).padStart(5)} | ${String(finalized).padStart(9)} | ${top.toFixed(0).padStart(10)}`,
    );
  }
}

function showUsage(): void {
  header("トークン使用量(直近5h)");
  const u = getUsageIn5h(DEFAULT_THROTTLE_CONFIG);
  const limit = DEFAULT_THROTTLE_CONFIG.tokenLimit5h;
  const ratio = (u.total / limit) * 100;
  console.log(`Records: ${u.recordCount}`);
  console.log(`Input:   ${u.input.toLocaleString()} tokens`);
  console.log(`Output:  ${u.output.toLocaleString()} tokens`);
  console.log(`Total:   ${u.total.toLocaleString()} / ${limit.toLocaleString()} (${ratio.toFixed(1)}%)`);
  if (ratio >= 95) console.log("⚠️  PAUSE 圏内");
  else if (ratio >= 80) console.log("⚠️  WARN 圏内");
}

function showTemplateDetection(): void {
  header("テンプレ化検出(Layer 5本文)");
  if (!existsSync(WORKS_DIR)) {
    console.log("(works ディレクトリなし)");
    return;
  }
  const slugs = readdirSync(WORKS_DIR).filter((s) =>
    existsSync(join(WORKS_DIR, s, "layer5_ep001.md")),
  );
  if (slugs.length < 10) {
    console.log(`Layer 5 本文が ${slugs.length}件のみ。10件以上で実行可能`);
    return;
  }
  const works = slugs.map((slug) => ({
    slug,
    text: readFileSync(join(WORKS_DIR, slug, "layer5_ep001.md"), "utf-8"),
  }));
  const report = detectTemplateClusters(works);
  console.log(`総作品数: ${report.totalWorks}`);
  console.log(`検出クラスタ: ${report.clusters.length}`);
  console.log(`フラグ作品: ${report.flaggedSlugs.length}`);
  for (const [i, c] of report.clusters.entries()) {
    console.log(
      `  cluster ${i + 1}: ${c.members.length}件, avg jaccard=${c.representativeJaccard.toFixed(2)}`,
    );
    console.log(`    members: ${c.members.slice(0, 5).join(", ")}${c.members.length > 5 ? " ..." : ""}`);
  }
}

function main(): void {
  console.log(`\nNovelis Phase 1 パイプライン状況 - ${new Date().toISOString()}`);
  showQueues();
  showLeagues();
  showUsage();
  showTemplateDetection();
  console.log("");
}

main();
