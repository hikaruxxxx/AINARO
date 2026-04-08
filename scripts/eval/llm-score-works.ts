/**
 * Claude Code自身がテキストを読んでスコアリングする
 *
 * 評価キュー(llm-eval-queue.json)の各作品ep001を読み、
 * 5つの品質軸でスコアをつけ、結果をJSONに保存する。
 *
 * 使い方: Claude Codeでこのファイルの内容を読み、
 *         指示に従って各作品を評価してもらう
 *
 * 評価軸:
 * 1. 冒頭の引き込み力 (1-10)
 * 2. 文章の成熟度 (1-10)
 * 3. キャラクターの魅力 (1-10)
 * 4. テンポ・構成力 (1-10)
 * 5. 続きを読みたいか (1-10)
 */

// このスクリプトはClaude Codeが実行するのではなく、
// Claude Code自身に「読んで評価して」と頼む際のフレームワーク。
// 実際の評価はClaude Codeの会話内で行う。

import * as fs from "fs";
import * as path from "path";

const dataDir = path.resolve(__dirname, "../data");
const queue = JSON.parse(fs.readFileSync(path.join(dataDir, "experiments/llm-eval-queue.json"), "utf-8"));

console.log("=== LLM評価用テキスト準備 ===\n");
console.log(`対象: ${queue.taskCount}作品\n`);

// 評価用にncode一覧を出力
for (const task of queue.tasks) {
  console.log(`${task.ncode}\t${task.tier}\tgp=${task.gp}\t${task.charCount}字`);
}

console.log(`\n各作品のep001を読んで以下の5軸で1-10スコアをつけてください:`);
console.log(`1. hook: 冒頭の引き込み力`);
console.log(`2. prose: 文章の成熟度`);
console.log(`3. character: キャラクターの魅力`);
console.log(`4. structure: テンポ・構成力`);
console.log(`5. continuation: 続きを読みたいか`);
