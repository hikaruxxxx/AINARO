// 過去バッチの summary.json を集計して
// data/generation/yield-stats.json を生成する。
//
// 各バッチの promotedSlugs と各slugのscreening_resultから
// (ジャンル, 境遇, 転機, 方向, フック) の組合せごとの平均hit確率を蓄積。
//
// 実行: npx tsx scripts/generation/yield-stats.ts

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

interface ScreeningResult {
  hitProbability: number;
  genre?: string;
  tags?: { 境遇: string; 転機: string; 方向: string; フック: string };
}

interface YieldStats {
  combos: Record<string, { samples: number; meanHit: number }>;
  totalBatches: number;
}

function main(): void {
  const batchesRoot = "data/generation/batches";
  const outPath = "data/generation/yield-stats.json";

  if (!existsSync(batchesRoot)) {
    console.warn("バッチディレクトリが存在しません。空のyield-statsを書き出します。");
    writeFileSync(outPath, JSON.stringify({ combos: {}, totalBatches: 0 }, null, 2));
    return;
  }

  const batchDirs = readdirSync(batchesRoot)
    .map((d) => join(batchesRoot, d))
    .filter((p) => statSync(p).isDirectory());

  const acc: Record<string, { sum: number; n: number }> = {};

  for (const batchDir of batchDirs) {
    const slugs = readdirSync(batchDir)
      .map((d) => join(batchDir, d))
      .filter((p) => statSync(p).isDirectory() && !p.endsWith("promoted"));
    for (const slugDir of slugs) {
      const resultPath = join(slugDir, "screening_result.json");
      if (!existsSync(resultPath)) continue;
      const r = JSON.parse(readFileSync(resultPath, "utf-8")) as ScreeningResult;
      if (!r.tags || !r.genre) continue;
      const key = `${r.genre}|${r.tags.境遇}|${r.tags.転機}|${r.tags.方向}|${r.tags.フック}`;
      if (!acc[key]) acc[key] = { sum: 0, n: 0 };
      acc[key].sum += r.hitProbability;
      acc[key].n += 1;
    }
  }

  const stats: YieldStats = {
    combos: Object.fromEntries(
      Object.entries(acc).map(([k, v]) => [k, { samples: v.n, meanHit: v.sum / v.n }]),
    ),
    totalBatches: batchDirs.length,
  };

  writeFileSync(outPath, JSON.stringify(stats, null, 2));
  console.log(
    `✅ yield-stats.json を更新: ${batchDirs.length}バッチ / ${Object.keys(stats.combos).length}組合せ`,
  );
}

main();
