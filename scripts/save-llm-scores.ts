/**
 * LLM評価結果をv3スコアファイルに追記する
 *
 * 実行: npx tsx scripts/save-llm-scores.ts <results-json-file>
 *
 * results-json-file は以下の形式:
 * [
 *   { "ncode": "n1234ab", "hook": 6, "character": 5, "originality": 4, "prose": 7, "tension": 5, "pull": 6 },
 *   ...
 * ]
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(__dirname, "../data");
const SCORES_FILE = path.join(DATA_DIR, "experiments/llm-feature-scores-v3.json");
const QUEUE_FILE = path.join(DATA_DIR, "experiments/llm-eval-queue.json");

interface ScoreInput {
  ncode: string;
  hook: number;
  character: number;
  originality: number;
  prose: number;
  tension: number;
  pull: number;
}

interface QueueWork {
  ncode: string;
  gp: number;
  genre: string;
  totalEpisodes: number;
  text: string;
  episodeUsed: number;
  isStoryContent: boolean;
  contentFilter: string;
}

function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("使い方: npx tsx scripts/save-llm-scores.ts <results.json>");
    process.exit(1);
  }

  // 評価結果読み込み
  const newResults: ScoreInput[] = JSON.parse(fs.readFileSync(inputFile, "utf-8"));

  // 既存スコア読み込み
  const existing = fs.existsSync(SCORES_FILE)
    ? JSON.parse(fs.readFileSync(SCORES_FILE, "utf-8"))
    : { generatedAt: "", version: 3, method: "claude-code-subagent-v3", totalWorks: 0, results: [] };

  const existingNcodes = new Set(existing.results.map((r: { ncode: string }) => r.ncode));

  // キューから作品メタデータを取得
  const queue = fs.existsSync(QUEUE_FILE)
    ? JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"))
    : { works: [] };
  const queueMap = new Map<string, QueueWork>(
    queue.works.map((w: QueueWork) => [w.ncode, w])
  );

  let added = 0;
  let skipped = 0;

  for (const r of newResults) {
    if (existingNcodes.has(r.ncode)) {
      skipped++;
      continue;
    }

    const meta = queueMap.get(r.ncode);
    const scores = {
      hook: clamp(r.hook),
      character: clamp(r.character),
      originality: clamp(r.originality),
      prose: clamp(r.prose),
      tension: clamp(r.tension),
      pull: clamp(r.pull),
    };
    const total =
      Math.round(
        ((scores.hook + scores.character + scores.originality + scores.prose + scores.tension + scores.pull) / 6) * 10
      ) / 10;

    existing.results.push({
      ncode: r.ncode,
      gp: meta?.gp ?? 0,
      site: "narou",
      genre: meta?.genre ?? "unknown",
      totalEpisodes: meta?.totalEpisodes ?? 0,
      scores,
      total,
      evalMeta: {
        episodeUsed: meta?.episodeUsed ?? 1,
        textLength: meta?.text?.length ?? 0,
        isStoryContent: meta?.isStoryContent ?? true,
        contentFilter: meta?.contentFilter ?? "unknown",
        evaluatedAt: new Date().toISOString(),
      },
      text: meta?.text ?? "",
    });
    existingNcodes.add(r.ncode);
    added++;
  }

  existing.totalWorks = existing.results.length;
  existing.generatedAt = new Date().toISOString();
  existing.version = 3;

  fs.writeFileSync(SCORES_FILE, JSON.stringify(existing, null, 2));
  console.log(`追加: ${added}作品, スキップ: ${skipped}作品, 合計: ${existing.results.length}作品`);
}

function clamp(v: unknown): number {
  const n = Number(v);
  if (isNaN(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

main();
