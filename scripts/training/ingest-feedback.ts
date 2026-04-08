// 公開済み作品の読者シグナルを取得してv11学習データを更新するCLI。
//
// 実行: npx tsx --env-file=.env.local scripts/training/ingest-feedback.ts
//   オプション:
//     --min-sample N         最小サンプル数 (default 30)
//     --positive-threshold N quality_signal閾値 (default 70)
//     --root DIR             出力ルート (default data/training)

import { ingestFeedback } from "../../src/lib/training/feedback-ingest";

function parseArgs(): { minSampleSize: number; positiveThreshold: number; rootDir: string } {
  const args = process.argv.slice(2);
  let minSampleSize = 30;
  let positiveThreshold = 70;
  let rootDir = "data/training";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--min-sample") minSampleSize = parseInt(args[++i], 10);
    else if (a === "--positive-threshold") positiveThreshold = parseFloat(args[++i]);
    else if (a === "--root") rootDir = args[++i];
  }
  return { minSampleSize, positiveThreshold, rootDir };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  console.log("📥 読者フィードバック取り込み開始");
  console.log(`  minSample=${opts.minSampleSize} threshold=${opts.positiveThreshold} root=${opts.rootDir}`);

  const summary = await ingestFeedback(opts);

  console.log("✅ 完了");
  console.log(`  取得エピソード数: ${summary.totalEpisodesFetched}`);
  console.log(`  feedbackに保存:   ${summary.feedbackCount}`);
  console.log(`  positiveに保存:   ${summary.positiveCount}`);
  console.log(`  本文なしスキップ: ${summary.skippedNoText}`);
}

main().catch((err) => {
  console.error("❌ 失敗:", err);
  process.exit(1);
});
