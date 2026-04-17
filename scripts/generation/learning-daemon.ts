// 自己学習デーモン: 生成パイプラインの下流フィードバックループを自動化する
//
// 役割:
// - 日次: 歩留まり統計(yield-stats)更新 + 探索メトリクス集計
// - 週次: パターン発見(LLM比較分析) + 確認済みパターンの注入
// - 月次: モデル再訓練トリガー + Bradley-Terry再計算 + 探索効果レポート
//
// 設計思想:
// - daemon.ts(生成)とは別プロセス。launchdで常駐管理
// - 1時間ティックで due なジョブだけ実行
// - throttle.ts を共有し、生成側が優先(学習側は低優先度)
// - LLM呼び出しは週次パターン発見のみ(日次・月次はローカル計算)
//
// 起動: launchd (~/Library/LaunchAgents/com.novelis.learner.plist)
// または手動: npx tsx scripts/generation/learning-daemon.ts
// ドライラン: npx tsx scripts/generation/learning-daemon.ts --dry-run
// 即時実行: npx tsx scripts/generation/learning-daemon.ts --run-now [daily|weekly|monthly]

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync, cpSync } from "fs";
import { join, dirname } from "path";
import { loadRatings, getRanking, getFinalized, recomputeBradleyTerry } from "../../src/lib/screening/league";
import { computeExplorationMetrics } from "../../src/lib/screening/exploration-metrics";
import { callClaudeCli, extractJsonBlock } from "../../src/lib/screening/claude-cli";
import { getUsageIn5h, DEFAULT_THROTTLE_CONFIG } from "../../src/lib/screening/throttle";

// --- 定数 ---

const TICK_INTERVAL_MS = 60 * 60 * 1000; // 1時間
const LAST_RUN_PATH = "data/generation/_learning_last_run.json";
const YIELD_STATS_PATH = "data/generation/yield-stats.json";
const DISCOVERED_PATH = "data/generation/_discovered_patterns.jsonl";
const REPORTS_DIR = "data/generation/reports";
const LEARNED_PATTERNS_PATH = "content/style/learned_patterns.md";
const ANTI_PATTERNS_PATH = "content/style/anti_patterns.md";
const WORKS_DIR = "data/generation/works";
const CONTENT_DIR = "content/works";
const LEAGUES_DIR = "data/generation/leagues";
const MAX_PATTERNS = 30; // 学習パターン上限(暴走防止)
const DAILY_PUBLISH_LIMIT = 50; // 1日あたりの公開上限

// パイプラインのジャンル名 → Supabase genres.id のマッピング
const GENRE_MAP: Record<string, string> = {
  isekai_high_fantasy: "fantasy", isekai_slowlife: "fantasy",
  isekai_tensei_cheat: "fantasy", isekai_tsuiho_zamaa: "fantasy",
  otome_akuyaku_zamaa: "villainess", otome_isekai_pure: "villainess",
  otome_konyaku_haki: "villainess", otome_villain_fantasy: "villainess",
  battle_dungeon: "action", battle_modern_power: "action",
  battle_war_chronicle: "action", battle_vrmmo: "action",
  modern_history: "drama", modern_human_drama: "drama",
  modern_romance: "romance", modern_school: "romance",
  mystery_action: "mystery", mystery_detective: "mystery",
  mystery_horror: "horror", mystery_sf: "scifi",
};

// ジョブのスケジュール(ms)
const DAILY_INTERVAL = 24 * 60 * 60 * 1000;
const WEEKLY_INTERVAL = 7 * DAILY_INTERVAL;
const MONTHLY_INTERVAL = 30 * DAILY_INTERVAL;

// 学習デーモンのトークン消費率上限(全体の20%まで)
const LEARNER_TOKEN_RATIO = 0.2;

// --- 型定義 ---

interface LastRun {
  daily: number;    // unixミリ秒
  weekly: number;
  monthly: number;
}

interface YieldStats {
  combos: Record<string, { samples: number; meanHit: number }>;
  totalBatches: number;
  updatedAt: string;
}

interface DiscoveredPattern {
  text: string;
  type: "positive" | "negative";
  discoveredAt: string;
  confirmedAt?: string;
  confirmedCount: number; // 何週連続で発見されたか
  genre?: string;         // ジャンル特化の場合
}

// --- ユーティリティ ---

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadLastRun(): LastRun {
  if (!existsSync(LAST_RUN_PATH)) {
    return { daily: 0, weekly: 0, monthly: 0 };
  }
  return JSON.parse(readFileSync(LAST_RUN_PATH, "utf-8")) as LastRun;
}

function saveLastRun(lr: LastRun): void {
  ensureDir(LAST_RUN_PATH);
  writeFileSync(LAST_RUN_PATH, JSON.stringify(lr, null, 2));
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19);
  console.log(`[learner ${ts}] ${msg}`);
}

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

// 学習デーモン用の流量チェック
// priority: "low" = 週次パターン発見等（生成優先、80%で止まる）
//           "high" = 日次公開ジョブ等（公開は最優先、95%まで許容）
async function canUseTokens(priority: "low" | "high" = "low"): Promise<boolean> {
  const usage = getUsageIn5h();
  const limit = DEFAULT_THROTTLE_CONFIG.tokenLimit5h;
  const ratio = usage.total / limit;
  const threshold = priority === "high" ? 0.95 : 0.8;
  if (ratio >= threshold) {
    log(`トークン枠不足(使用率=${(ratio * 100).toFixed(0)}%, 閾値=${threshold * 100}%)、スキップ`);
    return false;
  }
  return true;
}

// --- 日次ジョブ1: 歩留まり統計更新 ---

function runYieldStatsUpdate(): void {
  log("日次: yield-stats 更新開始");

  // 全ジャンルのリーグからレーティングを集計
  if (!existsSync(LEAGUES_DIR)) {
    log("リーグディレクトリなし、スキップ");
    return;
  }

  const genres = readdirSync(LEAGUES_DIR).filter(
    (d) => existsSync(join(LEAGUES_DIR, d, "ratings.json")),
  );

  // 既存の yield-stats を読む
  const stats: YieldStats = existsSync(YIELD_STATS_PATH)
    ? JSON.parse(readFileSync(YIELD_STATS_PATH, "utf-8"))
    : { combos: {}, totalBatches: 0, updatedAt: "" };

  let updated = 0;

  for (const genre of genres) {
    // 確定済み作品(matchCount >= 10)を取得
    const finalized = getFinalized(genre, 5); // Layer5 のみ
    if (finalized.length === 0) continue;

    // レーティング中央値を算出
    const ratings = finalized.map((e) => e.rating).sort((a, b) => a - b);
    const median = ratings[Math.floor(ratings.length / 2)];

    // 各作品の _meta.json からシード情報を読み、ヒット判定
    for (const entry of finalized) {
      const metaPath = join(WORKS_DIR, entry.slug, "_meta.json");
      if (!existsSync(metaPath)) continue;
      let meta: { seed?: { genre: string; primaryDesire: string; tags?: { 境遇?: string; 転機?: string; 方向?: string; フック?: string } } };
      try {
        meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      } catch { continue; }
      if (!meta.seed?.tags) continue;

      const t = meta.seed.tags;
      const key = `${genre}|${t.境遇 ?? ""}|${t.転機 ?? ""}|${t.方向 ?? ""}|${t.フック ?? ""}`;
      const isHit = entry.rating >= median ? 1 : 0;

      if (!stats.combos[key]) {
        stats.combos[key] = { samples: 0, meanHit: 0 };
      }
      const c = stats.combos[key];
      // 移動平均的に更新(新しいデータに重みを置く)
      c.meanHit = (c.meanHit * c.samples + isHit) / (c.samples + 1);
      c.samples += 1;
      updated++;
    }
  }

  stats.totalBatches += 1;
  stats.updatedAt = new Date().toISOString();

  if (!isDryRun()) {
    ensureDir(YIELD_STATS_PATH);
    writeFileSync(YIELD_STATS_PATH, JSON.stringify(stats, null, 2));
  }

  log(`日次: yield-stats 更新完了。${updated}件更新、${Object.keys(stats.combos).length}組合せ、totalBatches=${stats.totalBatches}`);
}

// --- 日次ジョブ2: 探索メトリクス集計 ---

function runExplorationMetrics(): void {
  log("日次: 探索メトリクス集計開始");

  const now = Date.now();
  const windowStart = now - 7 * DAILY_INTERVAL; // 直近1週間

  try {
    const metrics = computeExplorationMetrics({
      worksDir: WORKS_DIR,
      leagueDir: LEAGUES_DIR,
      layer: 5,
      windowStart,
      windowEnd: now,
    });

    const reportPath = join(REPORTS_DIR, `exploration_${new Date().toISOString().slice(0, 10)}.json`);
    if (!isDryRun()) {
      ensureDir(reportPath);
      writeFileSync(reportPath, JSON.stringify(metrics, null, 2));
    }

    log(`日次: 探索メトリクス完了。passed=${metrics.passed} surprise=${metrics.surprise.breakthroughCount} novel=${metrics.diversity.novelCount} promoted=${metrics.emergence.promotedTupleCount}`);
  } catch (e) {
    log(`日次: 探索メトリクス失敗: ${e}`);
  }
}

// --- 週次ジョブ1: パターン発見(LLM比較分析) ---

async function runPatternDiscovery(): Promise<void> {
  log("週次: パターン発見開始");

  // トークン枠チェック
  if (!(await canUseTokens())) {
    log("週次: トークン枠不足、次週に延期");
    return;
  }

  // 全ジャンルから Layer5 確定済み作品を集める
  if (!existsSync(LEAGUES_DIR)) {
    log("リーグディレクトリなし、スキップ");
    return;
  }
  const genres = readdirSync(LEAGUES_DIR).filter(
    (d) => existsSync(join(LEAGUES_DIR, d, "ratings.json")),
  );

  // 全ジャンル横断でレーティング上位・下位を集める
  const allWorks: Array<{ slug: string; genre: string; rating: number; text: string }> = [];

  for (const genre of genres) {
    const ranking = getRanking(genre, 5);
    for (const entry of ranking) {
      const ep1Path = join(WORKS_DIR, entry.slug, "layer5_ep001.md");
      if (!existsSync(ep1Path)) continue;
      const text = readFileSync(ep1Path, "utf-8");
      if (text.length < 500) continue; // 短すぎるものは除外
      allWorks.push({ slug: entry.slug, genre, rating: entry.rating, text });
    }
  }

  if (allWorks.length < 20) {
    log(`週次: 作品数不足(${allWorks.length}<20)、スキップ`);
    return;
  }

  // 上位20%と下位20%を抽出
  allWorks.sort((a, b) => b.rating - a.rating);
  const topN = Math.max(5, Math.floor(allWorks.length * 0.2));
  const top = allWorks.slice(0, topN).slice(0, 10); // 最大10作品
  const bottom = allWorks.slice(-topN).slice(-10);

  // LLMに比較分析を依頼
  const prompt = buildPatternDiscoveryPrompt(top, bottom);

  log(`週次: LLM分析実行(上位${top.length}作品 vs 下位${bottom.length}作品)`);

  if (isDryRun()) {
    log("週次: ドライラン、LLM呼び出しスキップ");
    return;
  }

  try {
    const response = await callClaudeCli(prompt, {
      timeoutMs: 5 * 60 * 1000,
      layer: "learning_pattern_discovery",
    });

    // レスポンスからパターンを抽出
    const patterns = parseDiscoveredPatterns(response);
    if (patterns.length === 0) {
      log("週次: パターン抽出できず");
      return;
    }

    // discovered_patterns.jsonl に追記
    ensureDir(DISCOVERED_PATH);
    for (const p of patterns) {
      appendFileSync(DISCOVERED_PATH, JSON.stringify(p) + "\n");
    }

    log(`週次: ${patterns.length}件のパターンを発見(positive=${patterns.filter((p) => p.type === "positive").length}, negative=${patterns.filter((p) => p.type === "negative").length})`);
  } catch (e) {
    log(`週次: LLM呼び出し失敗: ${e}`);
  }
}

function buildPatternDiscoveryPrompt(
  top: Array<{ slug: string; genre: string; text: string }>,
  bottom: Array<{ slug: string; genre: string; text: string }>,
): string {
  const topTexts = top.map((w, i) =>
    `### 上位作品${i + 1}（${w.genre}）\n${w.text.slice(0, 3000)}`
  ).join("\n\n");

  const bottomTexts = bottom.map((w, i) =>
    `### 下位作品${i + 1}（${w.genre}）\n${w.text.slice(0, 3000)}`
  ).join("\n\n");

  return `あなたはWeb小説の品質分析エキスパートです。

以下にペアワイズ比較で高評価を得た作品群（上位）と低評価の作品群（下位）を示します。
両群の**構造的な差異**を分析し、「効くパターン」と「避けるべきパターン」を抽出してください。

## 分析の観点
- 冒頭の引き込み方（最初の3文）
- テンション推移（上昇・下降のリズム）
- 対話と地の文の比率・切り替え方
- 感情描写の密度と多様性
- シーン転換の頻度と手法
- 情報開示のタイミング
- 文の長短のリズム
- フック（次が読みたくなる仕掛け）の配置

## 上位作品群

${topTexts}

## 下位作品群

${bottomTexts}

## 出力フォーマット（厳守）

以下のJSON形式で出力してください。それ以外のテキストは不要です。

\`\`\`json
{
  "positive": [
    "効くパターンの具体的な記述（1文で。例: 冒頭3文以内に主人公の異常な状況を提示する）",
    "..."
  ],
  "negative": [
    "避けるべきパターンの具体的な記述（1文で。例: 冒頭で世界観設定の説明を3段落以上続ける）",
    "..."
  ],
  "analysis": "200字以内の総括"
}
\`\`\`

各パターンは**具体的で再現可能な記述**にしてください。「良い文章を書く」のような抽象的な記述は不要です。`;
}

function parseDiscoveredPatterns(response: string): DiscoveredPattern[] {
  const patterns: DiscoveredPattern[] = [];
  const now = new Date().toISOString();

  // JSONブロックを抽出
  const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  let parsed: { positive?: string[]; negative?: string[] } | null = null;

  if (fenceMatch) {
    try {
      parsed = JSON.parse(fenceMatch[1]);
    } catch { /* fallthrough */ }
  }

  if (!parsed) {
    // ``` なしでJSONを探す
    const start = response.indexOf("{");
    const end = response.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(response.slice(start, end + 1));
      } catch { return patterns; }
    }
  }

  if (!parsed) return patterns;

  for (const text of parsed.positive ?? []) {
    if (typeof text === "string" && text.length > 10) {
      patterns.push({ text, type: "positive", discoveredAt: now, confirmedCount: 1 });
    }
  }
  for (const text of parsed.negative ?? []) {
    if (typeof text === "string" && text.length > 10) {
      patterns.push({ text, type: "negative", discoveredAt: now, confirmedCount: 1 });
    }
  }
  return patterns;
}

// --- 週次ジョブ2: パターン確認・注入 ---

function runPatternConfirmation(): void {
  log("週次: パターン確認・注入開始");

  if (!existsSync(DISCOVERED_PATH)) {
    log("週次: discovered_patterns.jsonl なし、スキップ");
    return;
  }

  // 全パターンを読み込み
  const lines = readFileSync(DISCOVERED_PATH, "utf-8").split("\n").filter(Boolean);
  const allPatterns: DiscoveredPattern[] = [];
  for (const line of lines) {
    try { allPatterns.push(JSON.parse(line)); } catch { /* skip */ }
  }

  // テキストでグループ化し、出現回数をカウント
  const grouped = new Map<string, { pattern: DiscoveredPattern; count: number }>();
  for (const p of allPatterns) {
    const key = `${p.type}:${p.text}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
    } else {
      grouped.set(key, { pattern: p, count: 1 });
    }
  }

  // 2回以上発見されたパターンを確認済みとみなす
  const confirmed: DiscoveredPattern[] = [];
  for (const { pattern, count } of grouped.values()) {
    if (count >= 2 && !pattern.confirmedAt) {
      confirmed.push({ ...pattern, confirmedAt: new Date().toISOString(), confirmedCount: count });
    }
  }

  if (confirmed.length === 0) {
    log("週次: 新規確認パターンなし");
    return;
  }

  // 既存パターン数をチェック(上限超過防止)
  const existingPositive = countExistingPatterns(LEARNED_PATTERNS_PATH);
  const existingNegative = countExistingPatterns(ANTI_PATTERNS_PATH);

  const positiveToAdd = confirmed.filter((p) => p.type === "positive");
  const negativeToAdd = confirmed.filter((p) => p.type === "negative");

  // 上限チェック
  const positiveRoom = Math.max(0, MAX_PATTERNS - existingPositive);
  const negativeRoom = Math.max(0, MAX_PATTERNS - existingNegative);

  const finalPositive = positiveToAdd.slice(0, positiveRoom);
  const finalNegative = negativeToAdd.slice(0, negativeRoom);

  if (isDryRun()) {
    log(`週次: ドライラン。追加予定 positive=${finalPositive.length} negative=${finalNegative.length}`);
    return;
  }

  // learned_patterns.md に追記
  if (finalPositive.length > 0) {
    appendPatternsToFile(LEARNED_PATTERNS_PATH, finalPositive);
  }
  if (finalNegative.length > 0) {
    appendPatternsToFile(ANTI_PATTERNS_PATH, finalNegative);
  }

  log(`週次: パターン注入完了。positive=${finalPositive.length}件追記, negative=${finalNegative.length}件追記`);

  // 確認済みフラグを更新(JSONLを書き直す)
  const updatedLines: string[] = [];
  for (const line of lines) {
    try {
      const p = JSON.parse(line) as DiscoveredPattern;
      const key = `${p.type}:${p.text}`;
      const conf = confirmed.find((c) => `${c.type}:${c.text}` === key);
      if (conf) {
        p.confirmedAt = conf.confirmedAt;
        p.confirmedCount = conf.confirmedCount;
      }
      updatedLines.push(JSON.stringify(p));
    } catch {
      updatedLines.push(line);
    }
  }
  writeFileSync(DISCOVERED_PATH, updatedLines.join("\n") + "\n");
}

function countExistingPatterns(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const content = readFileSync(filePath, "utf-8");
  return (content.match(/^- /gm) || []).length;
}

function appendPatternsToFile(filePath: string, patterns: DiscoveredPattern[]): void {
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, "utf-8");
  // 末尾に改行がなければ追加
  if (!content.endsWith("\n")) content += "\n";
  for (const p of patterns) {
    content += `- ${p.text}\n`;
  }
  writeFileSync(filePath, content);
}

// --- 月次ジョブ1: モデル再訓練 ---

async function runModelRetrain(): Promise<void> {
  log("月次: モデル再訓練開始");

  if (isDryRun()) {
    log("月次: ドライラン、再訓練スキップ");
    return;
  }

  // Bradley-Terry 再計算(全ジャンル)
  log("月次: Bradley-Terry 再計算");
  const genres = readdirSync(LEAGUES_DIR).filter(
    (d) => existsSync(join(LEAGUES_DIR, d, "ratings.json")),
  );
  for (const genre of genres) {
    try {
      recomputeBradleyTerry(genre);
      log(`月次: BT再計算完了 genre=${genre}`);
    } catch (e) {
      log(`月次: BT再計算失敗 genre=${genre}: ${e}`);
    }
  }

  // Python 予測モデル再訓練
  log("月次: ヒット予測モデル再訓練");
  try {
    const { execSync } = await import("child_process");
    const result = execSync(
      "python3 scripts/predict/train-hit-predictor-v10.py",
      { encoding: "utf-8", timeout: 10 * 60 * 1000, cwd: process.cwd() },
    );
    log(`月次: 再訓練完了\n${result.slice(0, 500)}`);
  } catch (e) {
    log(`月次: 再訓練失敗(Python未インストール or スクリプトエラー): ${e}`);
  }
}

// --- 月次ジョブ2: 探索効果レポート ---

function runMonthlyReport(): void {
  log("月次: 探索効果レポート作成");

  const now = Date.now();
  const windowStart = now - MONTHLY_INTERVAL;

  try {
    const metrics = computeExplorationMetrics({
      worksDir: WORKS_DIR,
      leagueDir: LEAGUES_DIR,
      layer: 5,
      windowStart,
      windowEnd: now,
    });

    // yield-stats サマリー
    const yieldSummary = existsSync(YIELD_STATS_PATH)
      ? JSON.parse(readFileSync(YIELD_STATS_PATH, "utf-8")) as YieldStats
      : null;

    // パターン数
    const positiveCount = countExistingPatterns(LEARNED_PATTERNS_PATH);
    const negativeCount = countExistingPatterns(ANTI_PATTERNS_PATH);

    // 作品数
    const totalWorks = existsSync(WORKS_DIR)
      ? readdirSync(WORKS_DIR).filter((d) => existsSync(join(WORKS_DIR, d, "_meta.json"))).length
      : 0;

    const report = {
      generatedAt: new Date().toISOString(),
      period: {
        start: new Date(windowStart).toISOString(),
        end: new Date(now).toISOString(),
      },
      works: {
        totalGenerated: totalWorks,
      },
      exploration: metrics,
      yieldStats: yieldSummary
        ? { totalCombos: Object.keys(yieldSummary.combos).length, totalBatches: yieldSummary.totalBatches }
        : null,
      patterns: {
        positive: positiveCount,
        negative: negativeCount,
      },
    };

    const reportPath = join(REPORTS_DIR, `monthly_${new Date().toISOString().slice(0, 7)}.json`);
    if (!isDryRun()) {
      ensureDir(reportPath);
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
    }

    log(`月次: レポート出力完了 → ${reportPath}`);
    log(`月次: 作品=${totalWorks} パターン=+${positiveCount}/-${negativeCount} 探索passed=${metrics.passed}`);
  } catch (e) {
    log(`月次: レポート作成失敗: ${e}`);
  }
}

// --- 日次ジョブ3: 自動公開（昇格→Supabase投入→カバー生成） ---

function getSupabaseClient() {
  // .env.local を手動パース
  function loadEnvFile(filePath: string): void {
    if (!existsSync(filePath)) return;
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = require("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

// L6完走 + 未昇格の作品を取得（ファイル存在ベース、リーグlayerに依存しない）
function getUnpromotedL6Works(): Array<{ slug: string; genre: string; rating: number }> {
  if (!existsSync(WORKS_DIR)) return [];
  const works: Array<{ slug: string; genre: string; rating: number }> = [];

  for (const slug of readdirSync(WORKS_DIR)) {
    // L6完走チェック（ep2があれば完走）
    if (!existsSync(join(WORKS_DIR, slug, "layer6_ep002.md"))) continue;
    // 既にcontent/worksにあればスキップ
    if (existsSync(join(CONTENT_DIR, slug))) continue;
    // _meta.json からジャンルを取得
    const metaPath = join(WORKS_DIR, slug, "_meta.json");
    if (!existsSync(metaPath)) continue;
    let genre = "other";
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      genre = meta.seed?.genre ?? "other";
    } catch { /* skip */ }
    // リーグレーティングがあれば使う（なければ1500）
    let rating = 1500;
    if (existsSync(LEAGUES_DIR)) {
      for (const g of readdirSync(LEAGUES_DIR)) {
        const rPath = join(LEAGUES_DIR, g, "ratings.json");
        if (!existsSync(rPath)) continue;
        try {
          const file = loadRatings(g);
          if (file.entries[slug]) { rating = file.entries[slug].rating; break; }
        } catch { /* skip */ }
      }
    }
    works.push({ slug, genre, rating });
  }

  works.sort((a, b) => b.rating - a.rating);
  return works;
}

// LLMで title + synopsis + 文体パラメータを取得
async function generateMetaForWork(
  slug: string, genre: string, plot: string, synopsis: string, ep1: string,
): Promise<{ title: string; synopsisText: string; settings: string; style: string } | null> {
  const prompt = `あなたはWeb小説の編集者です。以下の作品情報を読み、JSONで回答してください。

## 作品情報
- slug: ${slug}
- ジャンル: ${genre}

### プロット骨格
${plot.slice(0, 2000)}

### あらすじ
${synopsis.slice(0, 1500)}

### ep1冒頭
${ep1.slice(0, 3000)}

## 出力（JSONのみ、説明不要）

\`\`\`json
{
  "title": "作品タイトル（日本語、20字以内）",
  "synopsis": "読者向けあらすじ（150-250字、ネタバレなし）",
  "world": "世界観の要点（100-200字）",
  "style_features": "ep1から読み取れる文体の特徴（100-200字）",
  "pov": "first_person または third_person",
  "tempo": "fast または medium または slow",
  "dialogue_ratio": 0.35,
  "humor_level": "low または medium または high"
}
\`\`\``;

  try {
    const raw = await callClaudeCli(prompt, { timeoutMs: 3 * 60 * 1000, layer: "auto_publish", slug });
    const parsed = extractJsonBlock(raw) as {
      title?: string; synopsis?: string; world?: string; style_features?: string;
      pov?: string; tempo?: string; dialogue_ratio?: number; humor_level?: string;
    } | null;
    if (!parsed?.title || !parsed?.synopsis) return null;

    const title = parsed.title;
    const pov = parsed.pov ?? "third_person";
    const tempo = parsed.tempo ?? "medium";
    const humor = parsed.humor_level ?? "medium";
    const dialogueRatio = parsed.dialogue_ratio ?? 0.35;

    const settings = `# 作品設定：${title}\n\n## 基本情報\n\n- ジャンル: ${genre}\n- 想定話数: 30話\n\n## あらすじ\n\n${parsed.synopsis}\n\n## 世界観\n\n${parsed.world ?? "（未設定）"}`;
    const style = `# 文体プロファイル：${title}\n\n## パラメータ\n\n\`\`\`yaml\npov: ${pov}\ntempo: ${tempo}\nsentence_length_avg: ${tempo === "fast" ? 18 : tempo === "slow" ? 28 : 22}\ndialogue_ratio: ${dialogueRatio.toFixed(2)}\ninner_monologue_ratio: ${pov === "first_person" ? "0.30" : "0.15"}\ndescription_density: ${tempo === "slow" ? "high" : "medium"}\nhumor_level: ${humor}\ntension_curve: wave\nvocabulary_level: ${humor === "high" ? "casual" : "standard"}\nline_break_frequency: frequent\n\`\`\`\n\n## 文体の特徴\n\n${parsed.style_features ?? ""}`;

    return { title, synopsisText: parsed.synopsis, settings, style };
  } catch (e) {
    log(`  メタ生成失敗 ${slug}: ${e}`);
    return null;
  }
}

async function runAutoPublish(): Promise<void> {
  log("日次: 自動公開開始");

  const supabase = getSupabaseClient();
  if (!supabase) {
    log("日次: Supabase未設定、スキップ");
    return;
  }

  // 1. 未昇格のL6完走作品を取得
  const unpromoted = getUnpromotedL6Works();
  if (unpromoted.length === 0) {
    log("日次: 未昇格作品なし");
    return;
  }

  const targets = unpromoted.slice(0, DAILY_PUBLISH_LIMIT);
  log(`日次: ${unpromoted.length}本未昇格、うち${targets.length}本を処理`);

  let promoted = 0;
  let published = 0;
  let coverGenerated = 0;

  for (const w of targets) {
    if (isDryRun()) {
      log(`  [dry] ${w.slug} (${w.genre}, rating=${w.rating.toFixed(0)})`);
      continue;
    }

    // --- Step 1: content/works/ に昇格 ---
    const plot = existsSync(join(WORKS_DIR, w.slug, "layer2_plot.md"))
      ? readFileSync(join(WORKS_DIR, w.slug, "layer2_plot.md"), "utf-8") : "";
    const synopsis = existsSync(join(WORKS_DIR, w.slug, "layer3_synopsis.md"))
      ? readFileSync(join(WORKS_DIR, w.slug, "layer3_synopsis.md"), "utf-8") : "";
    const ep1 = existsSync(join(WORKS_DIR, w.slug, "layer5_ep001.md"))
      ? readFileSync(join(WORKS_DIR, w.slug, "layer5_ep001.md"), "utf-8") : "";

    if (!ep1) { log(`  ${w.slug}: ep1なし、スキップ`); continue; }

    // トークン枠チェック（LLM呼び出し前、公開は高優先度）
    if (!(await canUseTokens("high"))) {
      log(`  トークン枠不足、残りは次回に延期`);
      break;
    }

    let meta = await generateMetaForWork(w.slug, w.genre, plot, synopsis, ep1);
    if (!meta) {
      // 1回リトライ（CLI一時障害対策）
      log(`  ${w.slug}: メタ生成失敗、5秒後にリトライ`);
      await new Promise((r) => setTimeout(r, 5000));
      meta = await generateMetaForWork(w.slug, w.genre, plot, synopsis, ep1);
    }
    if (!meta) { log(`  ${w.slug}: リトライも失敗、スキップ`); continue; }

    // content/works/{slug}/ にファイル配置
    const destDir = join(CONTENT_DIR, w.slug);
    mkdirSync(destDir, { recursive: true });
    const ep1Src = join(WORKS_DIR, w.slug, "layer5_ep001.md");
    const ep2Src = join(WORKS_DIR, w.slug, "layer6_ep002.md");
    const ep3Src = join(WORKS_DIR, w.slug, "layer6_ep003.md");
    if (existsSync(ep1Src)) cpSync(ep1Src, join(destDir, "ep001.md"));
    if (existsSync(ep2Src)) cpSync(ep2Src, join(destDir, "ep002.md"));
    if (existsSync(ep3Src)) cpSync(ep3Src, join(destDir, "ep003.md"));
    writeFileSync(join(destDir, "_settings.md"), meta.settings);
    writeFileSync(join(destDir, "_style.md"), meta.style);
    writeFileSync(join(destDir, "synopsis.md"), meta.synopsisText);

    const workJson = {
      slug: w.slug, title: meta.title, genre: w.genre,
      state: "published", episodes: 3, rating: Math.round(w.rating),
      createdAt: new Date().toISOString(), sourceDir: `data/generation/works/${w.slug}`,
    };
    writeFileSync(join(destDir, "work.json"), JSON.stringify(workJson, null, 2));
    promoted++;

    // --- Step 2: Supabase に投入 ---
    const dbGenre = GENRE_MAP[w.genre] ?? "other";
    const { data: existing } = await supabase
      .from("novels").select("id").eq("slug", w.slug).maybeSingle();

    let novelId: string;
    if (existing) {
      novelId = existing.id;
    } else {
      const { data: novel, error: novelError } = await supabase
        .from("novels")
        .insert({
          title: meta.title, slug: w.slug, synopsis: meta.synopsisText,
          genre: dbGenre, status: "serial", author_name: "編集部",
          tags: [w.genre, dbGenre], is_r18: false,
        })
        .select().single();
      if (novelError) { log(`  ${w.slug}: novels INSERT失敗: ${novelError.message}`); continue; }
      novelId = novel.id;
    }

    // エピソード投入
    const episodes = [
      { num: 1, path: join(destDir, "ep001.md") },
      { num: 2, path: join(destDir, "ep002.md") },
      { num: 3, path: join(destDir, "ep003.md") },
    ];
    let epCount = 0;
    let totalChars = 0;
    for (const ep of episodes) {
      if (!existsSync(ep.path)) continue;
      const { data: existingEp } = await supabase
        .from("episodes").select("id").eq("novel_id", novelId).eq("episode_number", ep.num).maybeSingle();
      if (existingEp) continue;

      const body = readFileSync(ep.path, "utf-8");
      const charCount = body.replace(/[\s\n\r]/g, "").length;
      const firstLine = body.split("\n")[0];
      const epTitle = firstLine.startsWith("# ") ? firstLine.slice(2).trim() : `第${ep.num}話`;
      const { error } = await supabase.from("episodes").insert({
        novel_id: novelId, episode_number: ep.num, title: epTitle,
        body_md: body, character_count: charCount, is_free: true,
        published_at: new Date().toISOString(),
      });
      if (!error) { epCount++; totalChars += charCount; }
    }

    // 集計値更新
    await supabase.from("novels").update({
      total_chapters: 3, total_characters: totalChars,
      latest_chapter_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    }).eq("id", novelId);
    published++;

    // --- Step 3: カバー画像生成 ---
    try {
      const { generateCoverInBackground } = await import("../../src/lib/cover/generate");
      await generateCoverInBackground(
        { novelId, title: meta.title, tagline: null, authorName: "編集部", genre: dbGenre },
        supabase, { force: false },
      );
      coverGenerated++;
    } catch (e) {
      log(`  ${w.slug}: カバー生成失敗（公開は完了）: ${e}`);
    }

    log(`  ${w.slug}: 公開完了 (${meta.title}) ${epCount}話/${totalChars}字`);
  }

  log(`日次: 自動公開完了。昇格=${promoted} Supabase=${published} カバー=${coverGenerated}`);

  // 索引更新
  if (promoted > 0) {
    try {
      const { execSync } = await import("child_process");
      execSync("npx tsx scripts/utils/rebuild-works-index.ts", { encoding: "utf-8", timeout: 30000 });
      log("日次: 索引更新完了");
    } catch (e) {
      log(`日次: 索引更新失敗: ${e}`);
    }
  }
}

// --- メインループ ---

async function tick(): Promise<void> {
  const now = Date.now();
  const lastRun = loadLastRun();
  const updated = { ...lastRun };

  // 日次ジョブ（yield-stats、探索メトリクス）
  if (now - lastRun.daily >= DAILY_INTERVAL) {
    log("=== 日次ジョブ開始 ===");
    try {
      runYieldStatsUpdate();
      runExplorationMetrics();
      updated.daily = now;
    } catch (e) {
      log(`日次ジョブ失敗: ${e}`);
    }
  }

  // 毎時: 自動公開（未昇格があれば処理。日次制約なし、失敗しても次の1時間で再試行）
  try {
    await runAutoPublish();
  } catch (e) {
    log(`自動公開失敗: ${e}`);
  }

  // 週次ジョブ
  if (now - lastRun.weekly >= WEEKLY_INTERVAL) {
    log("=== 週次ジョブ開始 ===");
    try {
      await runPatternDiscovery();
      runPatternConfirmation();
      updated.weekly = now;
    } catch (e) {
      log(`週次ジョブ失敗: ${e}`);
    }
  }

  // 月次ジョブ
  if (now - lastRun.monthly >= MONTHLY_INTERVAL) {
    log("=== 月次ジョブ開始 ===");
    try {
      await runModelRetrain();
      runMonthlyReport();
      updated.monthly = now;
    } catch (e) {
      log(`月次ジョブ失敗: ${e}`);
    }
  }

  // 実行記録を保存
  if (!isDryRun()) {
    saveLastRun(updated);
  }
}

let shuttingDown = false;
process.on("SIGTERM", () => { log("SIGTERM受信、停止"); shuttingDown = true; });
process.on("SIGINT", () => { log("SIGINT受信、停止"); shuttingDown = true; });

async function main(): Promise<void> {
  log("learning-daemon 起動");

  // --run-now オプション: 指定ジョブを即時実行して終了
  const runNowIndex = process.argv.indexOf("--run-now");
  if (runNowIndex !== -1) {
    const target = process.argv[runNowIndex + 1] ?? "all";
    log(`即時実行モード: target=${target}`);

    if (target === "daily" || target === "all") {
      runYieldStatsUpdate();
      runExplorationMetrics();
      await runAutoPublish();
    }
    if (target === "publish") {
      await runAutoPublish();
    }
    if (target === "weekly" || target === "all") {
      await runPatternDiscovery();
      runPatternConfirmation();
    }
    if (target === "monthly" || target === "all") {
      await runModelRetrain();
      runMonthlyReport();
    }

    if (!isDryRun()) {
      const now = Date.now();
      const lr = loadLastRun();
      if (target === "daily" || target === "all") lr.daily = now;
      if (target === "weekly" || target === "all") lr.weekly = now;
      if (target === "monthly" || target === "all") lr.monthly = now;
      saveLastRun(lr);
    }

    log("即時実行完了");
    return;
  }

  // 単発実行モード: tickを1回実行して終了
  // launchdのStartIntervalで1時間ごとに起動される
  log("単発実行モード");
  try {
    await tick();
  } catch (e) {
    log(`tickエラー: ${e}`);
  }
  log("learning-daemon 完了");
}

main().catch((e) => {
  log(`fatal: ${e}`);
  process.exit(1);
});
