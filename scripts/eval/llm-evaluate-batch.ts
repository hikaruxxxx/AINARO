/**
 * LLMベース人気予測 — バッチ評価
 *
 * Claude Codeのスラッシュコマンドとして実行し、
 * LLM自身にテキストを読ませて品質スコアをつける。
 *
 * このスクリプトは「評価プロンプト」をファイルに出力する。
 * Claude Codeが実行し、結果をJSONに記録する。
 *
 * 実行: このスクリプトの出力をClaude Codeに食わせる
 *       npx tsx scripts/llm-evaluate-batch.ts > /tmp/eval-queue.json
 *       その後 /llm-evaluate コマンドで実行
 */

import * as fs from "fs";
import * as path from "path";

const dataDir = path.resolve(__dirname, "../data");
const crawledDir = path.join(dataDir, "crawled");
const targets = JSON.parse(fs.readFileSync(path.join(dataDir, "targets/stratified_all.json"), "utf-8"));
const crawlLog = JSON.parse(fs.readFileSync(path.join(crawledDir, "_crawl_log.json"), "utf-8"));

const tierMap: Record<string, { tier: string; gp: number }> = {};
for (const t of targets) tierMap[t.ncode] = { tier: t.tier, gp: t.globalPoint };

// 各作品のep001を評価対象とする（第1話は最も重要）
interface EvalTask {
  ncode: string;
  tier: string;
  gp: number;
  textSnippet: string; // 冒頭2000字
  charCount: number;
}

const tasks: EvalTask[] = [];

for (const [ncode, log] of Object.entries(crawlLog) as [string, { episodes: number }][]) {
  if (!log.episodes) continue;
  const info = tierMap[ncode];
  if (!info) continue;

  const ep1File = path.join(crawledDir, ncode, "ep0001.json");
  if (!fs.existsSync(ep1File)) continue;

  try {
    const ep = JSON.parse(fs.readFileSync(ep1File, "utf-8"));
    if (!ep.bodyText || ep.bodyText.length < 300) continue;

    tasks.push({
      ncode,
      tier: info.tier,
      gp: info.gp,
      textSnippet: ep.bodyText.slice(0, 2000),
      charCount: ep.bodyText.length,
    });
  } catch { continue; }
}

// 出力
const output = {
  generatedAt: new Date().toISOString(),
  taskCount: tasks.length,
  tasks: tasks.map(t => ({
    ncode: t.ncode,
    tier: t.tier,
    gp: t.gp,
    charCount: t.charCount,
    textSnippet: t.textSnippet,
  })),
};

const outFile = path.join(dataDir, "experiments/llm-eval-queue.json");
fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
console.log(`評価キュー: ${outFile}`);
console.log(`対象: ${tasks.length}作品`);
console.log(`\ntier分布:`);
const tierCounts: Record<string, number> = {};
for (const t of tasks) tierCounts[t.tier] = (tierCounts[t.tier] || 0) + 1;
for (const [tier, count] of Object.entries(tierCounts).sort()) {
  console.log(`  ${tier}: ${count}作品`);
}
