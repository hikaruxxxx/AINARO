/**
 * LLM特徴量評価スクリプト
 *
 * Claude APIでWeb小説の第1話を読み、テキスト表層では捉えられない
 * 「意味の質」を6次元で評価する。
 *
 * 目的: 交絡除去モデルの残差予測を改善する特徴量の生成
 *
 * 実行:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/llm-feature-eval.ts
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/llm-feature-eval.ts --pilot   # 50作品のみ
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/llm-feature-eval.ts --resume  # 中断再開
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// 設定
// ============================================================

const MODEL = "claude-sonnet-4-20250514";
const MAX_TEXT_CHARS = 3000; // 第1話の先頭3000字
const CONCURRENCY = 5; // 同時リクエスト数
const RETRY_MAX = 3;
const RETRY_DELAY_MS = 5000;
const PILOT_COUNT = 50;

const DATA_DIR = path.resolve(__dirname, "../data");
const CRAWLED_DIR = path.join(DATA_DIR, "crawled");
const OUTPUT_FILE = path.join(DATA_DIR, "experiments/llm-feature-scores-v2-full.json");

// ============================================================
// 評価プロンプト
// ============================================================

const SYSTEM_PROMPT = `あなたはWeb小説の熱心な読者です。
第1話の冒頭を読み、「この作品を続けて読みたいか」の観点で品質を評価してください。

以下の6項目を1〜10の整数で採点してください。
各項目の基準:
- 1-3: 弱い / 問題あり
- 4-6: 普通 / 及第点
- 7-8: 良い / 印象的
- 9-10: 非常に優れている / 読者を強く惹きつける

必ず以下のJSON形式のみで回答してください。説明は不要です。
{"hook":N,"character":N,"originality":N,"prose":N,"tension":N,"pull":N}`;

function buildUserPrompt(text: string): string {
  return `以下のWeb小説の第1話冒頭を読んで評価してください。

---
${text}
---`;
}

// ============================================================
// 評価結果の型
// ============================================================

interface LLMScores {
  hook: number;        // 冒頭の引き込み力
  character: number;   // キャラクターの魅力・個性
  originality: number; // 設定・展開の独自性
  prose: number;       // 文章の巧みさ
  tension: number;     // 緊張感・ページターナー性
  pull: number;        // 続きを読みたいか
}

interface WorkResult {
  ncode: string;
  tier: string;
  gp: number;
  site: string;
  genre: string;
  scores: LLMScores;
  total: number; // 6項目の平均
  inputTokens: number;
  outputTokens: number;
}

interface OutputData {
  generatedAt: string;
  model: string;
  totalWorks: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  results: WorkResult[];
}

// ============================================================
// 評価対象の収集
// ============================================================

interface EvalTarget {
  ncode: string;
  tier: string;
  gp: number;
  site: string;
  genre: string;
  textSnippet: string;
}

function collectTargets(): EvalTarget[] {
  const targets: EvalTarget[] = [];

  // --- なろう ---
  const narouTargets = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "targets/stratified_all.json"), "utf-8"));
  const pairedTargets = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "targets/paired_comparison.json"), "utf-8"));
  const crawlLog = JSON.parse(fs.readFileSync(path.join(CRAWLED_DIR, "_crawl_log.json"), "utf-8"));

  const narouMap: Record<string, { tier: string; gp: number; genre: string }> = {};
  for (const t of narouTargets) narouMap[t.ncode] = { tier: t.tier, gp: t.globalPoint, genre: t.searchGenre };
  for (const t of pairedTargets) {
    if (!narouMap[t.ncode]) narouMap[t.ncode] = { tier: t.tier, gp: t.globalPoint, genre: t.searchGenre };
  }

  for (const ncode of Object.keys(crawlLog)) {
    const info = narouMap[ncode];
    if (!info) continue;
    const ep1 = path.join(CRAWLED_DIR, ncode, "ep0001.json");
    if (!fs.existsSync(ep1)) continue;
    try {
      const ep = JSON.parse(fs.readFileSync(ep1, "utf-8"));
      if (!ep.bodyText || ep.bodyText.length < 300) continue;
      targets.push({
        ncode, tier: info.tier, gp: info.gp, site: "narou",
        genre: info.genre || "unknown",
        textSnippet: ep.bodyText.slice(0, MAX_TEXT_CHARS),
      });
    } catch { continue; }
  }

  // --- アルファポリス・カクヨムは除外（なろう作品のみ） ---

  return targets;
}

// ============================================================
// Claude API呼び出し
// ============================================================

async function evaluateWork(
  client: Anthropic,
  target: EvalTarget,
): Promise<{ scores: LLMScores; inputTokens: number; outputTokens: number } | null> {
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 100,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(target.textSnippet) }],
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      // JSONパース（コードブロック内の場合も対応）
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        console.error(`  [${target.ncode}] JSONパース失敗: ${text.slice(0, 100)}`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const scores: LLMScores = {
        hook: clampScore(parsed.hook),
        character: clampScore(parsed.character),
        originality: clampScore(parsed.originality),
        prose: clampScore(parsed.prose),
        tension: clampScore(parsed.tension),
        pull: clampScore(parsed.pull),
      };

      return { scores, inputTokens, outputTokens };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // レート制限の場合は長めに待つ
      if (errMsg.includes("rate") || errMsg.includes("429")) {
        console.error(`  [${target.ncode}] レート制限、${RETRY_DELAY_MS * 2}ms待機...`);
        await sleep(RETRY_DELAY_MS * 2);
      } else {
        console.error(`  [${target.ncode}] エラー(試行${attempt + 1}): ${errMsg}`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  return null;
}

function clampScore(v: unknown): number {
  const n = Number(v);
  if (isNaN(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 並列実行（同時実行数制限）
// ============================================================

async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ============================================================
// メイン
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const isPilot = args.includes("--pilot");
  const isResume = args.includes("--resume");

  // APIキー確認
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("エラー: ANTHROPIC_API_KEY を設定してください");
    console.error("  ANTHROPIC_API_KEY=sk-... npx tsx scripts/llm-feature-eval.ts");
    process.exit(1);
  }

  const client = new Anthropic();

  // 評価対象の収集
  console.log("評価対象を収集中...");
  let allTargets = collectTargets();
  console.log(`  合計: ${allTargets.length}作品`);

  // 既存結果の読み込み（resume用）
  let existingResults: WorkResult[] = [];
  const completedNcodes = new Set<string>();
  if (isResume && fs.existsSync(OUTPUT_FILE)) {
    const existing: OutputData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"));
    existingResults = existing.results;
    for (const r of existingResults) completedNcodes.add(r.ncode);
    console.log(`  既存結果: ${existingResults.length}作品（スキップ）`);
  }

  // 未評価のみフィルタ
  let targets = allTargets.filter(t => !completedNcodes.has(t.ncode));

  // パイロットモードなら50作品に絞る（tier・サイト均等にサンプル）
  if (isPilot) {
    targets = sampleStratified(targets, PILOT_COUNT);
    console.log(`  パイロットモード: ${targets.length}作品を抽出`);
  }

  console.log(`  評価対象: ${targets.length}作品\n`);

  if (targets.length === 0) {
    console.log("評価対象なし。終了。");
    return;
  }

  // サイト・tier分布
  const dist: Record<string, number> = {};
  for (const t of targets) {
    const key = `${t.site}/${t.tier}`;
    dist[key] = (dist[key] || 0) + 1;
  }
  console.log("分布:");
  for (const [k, v] of Object.entries(dist).sort()) console.log(`  ${k}: ${v}`);
  console.log();

  // --- 評価実行 ---
  let completed = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const results: WorkResult[] = [...existingResults];

  const evalResults = await processWithConcurrency(targets, CONCURRENCY, async (target, _i) => {
    const result = await evaluateWork(client, target);
    completed++;

    if (result) {
      totalInput += result.inputTokens;
      totalOutput += result.outputTokens;
      const total = Math.round(
        (result.scores.hook + result.scores.character + result.scores.originality +
         result.scores.prose + result.scores.tension + result.scores.pull) / 6 * 10
      ) / 10;

      const workResult: WorkResult = {
        ncode: target.ncode, tier: target.tier, gp: target.gp,
        site: target.site, genre: target.genre,
        scores: result.scores, total,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      };

      // 進捗表示（10作品ごと）
      if (completed % 10 === 0 || completed === targets.length) {
        const costInput = totalInput / 1_000_000 * 3;   // Sonnet input: $3/1M
        const costOutput = totalOutput / 1_000_000 * 15; // Sonnet output: $15/1M
        console.log(
          `  [${completed}/${targets.length}] ` +
          `${target.ncode} → total=${total} | ` +
          `tokens: ${totalInput.toLocaleString()}in/${totalOutput.toLocaleString()}out | ` +
          `$${(costInput + costOutput).toFixed(2)}`
        );
      }

      return workResult;
    }

    console.error(`  [${completed}/${targets.length}] ${target.ncode} → 評価失敗（スキップ）`);
    return null;
  });

  // 成功した結果を追加
  for (const r of evalResults) {
    if (r) results.push(r);
  }

  // --- 結果保存 ---
  const output: OutputData = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    totalWorks: results.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    results,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n結果保存: ${OUTPUT_FILE}`);
  console.log(`成功: ${results.length - existingResults.length}作品 / 失敗: ${targets.length - (results.length - existingResults.length)}作品`);

  // --- 簡易分析 ---
  analyzeResults(results);
}

// ============================================================
// 層別サンプリング（パイロット用）
// ============================================================

function sampleStratified(targets: EvalTarget[], count: number): EvalTarget[] {
  // サイト×tierでグループ分け
  const groups: Record<string, EvalTarget[]> = {};
  for (const t of targets) {
    const key = `${t.site}/${t.tier}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }

  const groupKeys = Object.keys(groups);
  const perGroup = Math.max(1, Math.floor(count / groupKeys.length));
  const sampled: EvalTarget[] = [];

  for (const key of groupKeys) {
    const group = groups[key];
    // シャッフルして先頭から取る
    const shuffled = group.sort(() => Math.random() - 0.5);
    sampled.push(...shuffled.slice(0, perGroup));
  }

  // 足りなければランダム追加
  if (sampled.length < count) {
    const remaining = targets.filter(t => !sampled.includes(t));
    const shuffled = remaining.sort(() => Math.random() - 0.5);
    sampled.push(...shuffled.slice(0, count - sampled.length));
  }

  return sampled.slice(0, count);
}

// ============================================================
// 結果分析
// ============================================================

function analyzeResults(results: WorkResult[]) {
  console.log(`\n${"=".repeat(50)}`);
  console.log("=== 簡易分析 ===\n");

  // なろうデータのみ（gP付き）でスピアマン相関
  const narouResults = results.filter(r => r.site === "narou" && r.gp > 0);
  if (narouResults.length >= 10) {
    const logGP = narouResults.map(r => Math.log10(r.gp));
    const totals = narouResults.map(r => r.total);

    console.log(`なろう（gP>0）: ${narouResults.length}作品`);
    console.log(`  total vs log(gP) Spearman: ${spearman(totals, logGP).toFixed(3)}`);

    // 各軸の相関
    const axes: (keyof LLMScores)[] = ["hook", "character", "originality", "prose", "tension", "pull"];
    for (const axis of axes) {
      const values = narouResults.map(r => r.scores[axis]);
      console.log(`  ${axis.padEnd(12)} vs log(gP) Spearman: ${spearman(values, logGP).toFixed(3)}`);
    }
  }

  // サイト別・tier別平均
  console.log("\ntier別 totalスコア平均:");
  const tierOrder = ["top", "paired_high", "upper", "mid", "lower", "bottom", "new", "unpopular"];
  for (const site of ["narou", "alphapolis", "kakuyomu"]) {
    const siteResults = results.filter(r => r.site === site);
    if (siteResults.length === 0) continue;
    console.log(`  [${site}]`);
    for (const tier of tierOrder) {
      const tierResults = siteResults.filter(r => r.tier === tier);
      if (tierResults.length === 0) continue;
      const avg = tierResults.reduce((s, r) => s + r.total, 0) / tierResults.length;
      console.log(`    ${tier.padEnd(12)}: ${avg.toFixed(1)} (n=${tierResults.length})`);
    }
  }
}

// ============================================================
// スピアマン相関
// ============================================================

function spearman(x: number[], y: number[]): number {
  const n = x.length;
  function rank(arr: number[]): number[] {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    for (let i = 0; i < n; i++) ranks[sorted[i].i] = i + 1;
    return ranks;
  }
  const rx = rank(x);
  const ry = rank(y);
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

main().catch(console.error);
