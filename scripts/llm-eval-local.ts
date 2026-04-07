/**
 * ローカルLLM評価 準備スクリプト
 *
 * Claude Codeセッション内で評価するための作品テキストを準備する。
 * 評価自体はClaude Codeの /batch-eval スキルで実行。
 *
 * 実行: npx tsx scripts/llm-eval-local.ts [--batch N] [--offset M]
 *   --batch N: 1バッチの作品数（デフォルト: 20）
 *   --offset M: 開始オフセット（デフォルト: 0）
 *
 * 出力: data/experiments/llm-eval-queue.json（評価キュー）
 */

import * as fs from "fs";
import * as path from "path";
import { isCharacterSheet } from "./migrate-llm-scores-v3";

const DATA_DIR = path.resolve(__dirname, "../data");
const CRAWLED_DIR = path.join(DATA_DIR, "crawled");
const OUTPUT_FILE = path.join(DATA_DIR, "experiments/llm-eval-queue.json");
const SCORES_FILE = path.join(DATA_DIR, "experiments/llm-feature-scores-v3.json");
const MAX_TEXT_CHARS = 3000;

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

/** エピソードテキストを取得（キャラ一覧フィルタ付き） */
function loadEpisodeText(ncode: string): {
  text: string;
  episodeUsed: number;
  contentFilter: string;
} | null {
  const ep1Path = path.join(CRAWLED_DIR, ncode, "ep0001.json");
  if (!fs.existsSync(ep1Path)) return null;

  try {
    const ep = JSON.parse(fs.readFileSync(ep1Path, "utf-8"));
    const body = ep.bodyText || "";

    if (body.length >= 300 && !isCharacterSheet(ep.title || "", body)) {
      return { text: body.slice(0, MAX_TEXT_CHARS), episodeUsed: 1, contentFilter: "pass" };
    }

    // ep0001がキャラ一覧 → ep0002にフォールバック
    const ep2Path = path.join(CRAWLED_DIR, ncode, "ep0002.json");
    if (fs.existsSync(ep2Path)) {
      const ep2 = JSON.parse(fs.readFileSync(ep2Path, "utf-8"));
      const body2 = ep2.bodyText || "";
      if (body2.length >= 300 && !isCharacterSheet(ep2.title || "", body2)) {
        return { text: body2.slice(0, MAX_TEXT_CHARS), episodeUsed: 2, contentFilter: "fallback_ep2" };
      }
    }

    // どちらも使えない
    return null;
  } catch {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);
  const batchSize = parseInt(args[args.indexOf("--batch") + 1]) || 20;
  const offset = parseInt(args[args.indexOf("--offset") + 1]) || 0;

  // 表層特徴量データ
  const featData = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "experiments/full-feature-extraction.json"), "utf-8")
  );

  // 既存LLMスコア
  const existingScores = fs.existsSync(SCORES_FILE)
    ? JSON.parse(fs.readFileSync(SCORES_FILE, "utf-8"))
    : { results: [] };
  const completedNcodes = new Set(existingScores.results.map((r: { ncode: string }) => r.ncode));

  // 未評価 & gp > 0 の作品を抽出（コンテンツフィルタ付き）
  const pending: QueueWork[] = [];
  let filtered = 0;

  for (const r of featData.results) {
    if (r.gp <= 0 || completedNcodes.has(r.ncode)) continue;

    const ep = loadEpisodeText(r.ncode);
    if (!ep) {
      filtered++;
      continue;
    }

    pending.push({
      ncode: r.ncode,
      gp: r.gp,
      genre: r.genre || "unknown",
      totalEpisodes: r.totalEpisodes || 0,
      text: ep.text,
      episodeUsed: ep.episodeUsed,
      isStoryContent: true,
      contentFilter: ep.contentFilter,
    });
  }

  console.log(`未評価作品: ${pending.length} (フィルタ除外: ${filtered})`);
  console.log(`オフセット: ${offset}, バッチサイズ: ${batchSize}`);

  const batch = pending.slice(offset, offset + batchSize);
  console.log(`今回のバッチ: ${batch.length}作品 (${offset}〜${offset + batch.length - 1})`);

  // キューファイル出力
  const queue = {
    generatedAt: new Date().toISOString(),
    totalPending: pending.length,
    batchOffset: offset,
    batchSize: batch.length,
    nextOffset: offset + batch.length,
    works: batch,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(queue, null, 2));
  console.log(`\n保存: ${OUTPUT_FILE}`);
  console.log(`\n次のバッチ: npx tsx scripts/llm-eval-local.ts --batch ${batchSize} --offset ${offset + batch.length}`);
}

main();
