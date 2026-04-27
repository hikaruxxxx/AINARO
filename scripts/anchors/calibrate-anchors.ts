/**
 * anchor reference pool ペアワイズ校正
 *
 * 設計: docs/architecture/phase1_pipeline_design_v2.md §2 (校正手順)
 *
 * 目的: anchor 同士でペアワイズ比較を行い、Bradley-Terry でレーティングを安定化、
 *       hit/middle/low 帯の中央値 Elo と passElo を calibration.json に書き戻す。
 *
 * 入力:
 *   - data/generation/anchors/{genre}/anchors.json
 *   - data/generation/anchors/{genre}/layer{3,5}/{band}/{anchor_id}.md
 *   - data/generation/anchors/calibration.json (スケルトン)
 *
 * 出力 (追記):
 *   - data/generation/anchors/{genre}/anchor-matches/layer{N}.jsonl (試合履歴)
 *   - data/generation/anchors/{genre}/anchor-ratings/layer{N}.json (レーティング)
 *   - data/generation/anchors/calibration.json (Elo 中央値を書き戻し)
 *
 * 実行例:
 *   # 1ジャンル1層のパイロット
 *   npx tsx scripts/anchors/calibrate-anchors.ts --genre modern_romance --layer 3
 *
 *   # 全ジャンル × Layer 3,5 を順次校正 (時間かかる)
 *   npx tsx scripts/anchors/calibrate-anchors.ts --all
 *
 *   # LLM呼び出しせず計画のみ表示
 *   npx tsx scripts/anchors/calibrate-anchors.ts --genre modern_romance --layer 3 --dry-run
 *
 * 並列度: --concurrency=N (デフォルト3)
 * 試合数:  --matches-per-anchor=N (デフォルト6: 同帯1 + 異帯2 + 補完3)
 */

import fs from "node:fs";
import path from "node:path";
import { callClaudeCli } from "../../src/lib/screening/claude-cli";
import {
  buildComparePrompt,
  parseCompareResponse,
  type Winner,
} from "../../src/lib/screening/llm-compare";

const ROOT = process.cwd();
const ANCHORS_DIR = path.join(ROOT, "data/generation/anchors");
const CALIBRATION_FILE = path.join(ANCHORS_DIR, "calibration.json");

interface Anchor {
  anchorId: string;
  ncode: string;
  title: string;
  band: "hit" | "middle" | "low";
  globalPoint: number;
  hasLayer3: boolean;
  hasLayer5: boolean;
}

interface AnchorsFile {
  subGenreId: string;
  version: string;
  anchors: Anchor[];
}

interface MatchRecord {
  ts: number;
  layer: number;
  anchorA: string;
  anchorB: string;
  bandA: string;
  bandB: string;
  winner: Winner;
  reason: string;
  symmetric?: boolean;
}

interface AnchorRating {
  anchorId: string;
  band: string;
  rating: number;
  matchCount: number;
}

interface CalibrationFile {
  version: string;
  builtAt: string;
  note: string;
  hitProbability: { pass: number; reject: number; calibratedOn: string | null };
  layers: Record<string, Record<string, {
    hitMedianElo: number | null;
    middleMedianElo: number | null;
    lowMedianElo: number | null;
    passElo: number | null;
    requiredAnchorMatches: number;
    calibratedAt?: string;
    matchCount?: number;
  }>>;
}

// --- CLI 引数 ---

interface Args {
  genres: string[];
  layers: number[];
  matchesPerAnchor: number;
  concurrency: number;
  symmetric: boolean;
  dryRun: boolean;
  all: boolean;
  model?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    genres: [],
    layers: [],
    matchesPerAnchor: 6,
    concurrency: 3,
    symmetric: false,
    dryRun: false,
    all: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--symmetric") args.symmetric = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--genre") args.genres.push(argv[++i]);
    else if (a.startsWith("--genre=")) args.genres.push(a.slice("--genre=".length));
    else if (a === "--layer") args.layers.push(parseInt(argv[++i], 10));
    else if (a.startsWith("--layer=")) args.layers.push(parseInt(a.slice("--layer=".length), 10));
    else if (a.startsWith("--matches-per-anchor=")) args.matchesPerAnchor = parseInt(a.split("=")[1], 10);
    else if (a.startsWith("--concurrency=")) args.concurrency = parseInt(a.split("=")[1], 10);
    else if (a === "--model") args.model = argv[++i];
    else if (a.startsWith("--model=")) args.model = a.split("=")[1];
  }
  if (args.layers.length === 0) args.layers = [3, 5];
  return args;
}

// --- ヘルパ ---

function listGenres(): string[] {
  return fs
    .readdirSync(ANCHORS_DIR)
    .filter((d) => {
      const p = path.join(ANCHORS_DIR, d);
      return fs.statSync(p).isDirectory() && d !== "audit" && fs.existsSync(path.join(p, "anchors.json"));
    });
}

function loadAnchors(genre: string): Anchor[] {
  const p = path.join(ANCHORS_DIR, genre, "anchors.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8")) as AnchorsFile;
  return j.anchors;
}

function loadAnchorMaterial(genre: string, layer: number, band: string, anchorId: string): string | null {
  const p = path.join(ANCHORS_DIR, genre, `layer${layer}`, band, `${anchorId}.md`);
  if (!fs.existsSync(p)) return null;
  // markdown ヘッダ + 本文。素材として LLM に渡すのは本文部分のみにしたいが、
  // L3 はあらすじ全体、L5 は本文を渡す。前半メタは無視されてもよい。
  return fs.readFileSync(p, "utf8");
}

function matchesPathFor(genre: string, layer: number): string {
  return path.join(ANCHORS_DIR, genre, "anchor-matches", `layer${layer}.jsonl`);
}

function ratingsPathFor(genre: string, layer: number): string {
  return path.join(ANCHORS_DIR, genre, "anchor-ratings", `layer${layer}.json`);
}

function loadExistingMatches(genre: string, layer: number): MatchRecord[] {
  const p = matchesPathFor(genre, layer);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

// --- 試合計画 ---

/**
 * 各 anchor が同帯1件 + 異帯2件 + 補完(matchesPerAnchor - 3 件) の対戦を持つよう、
 * ペアを生成する (重複・自己対戦は除外)。
 *
 * 既存マッチを除いて未消化ペアだけ返す。
 */
function planMatches(
  anchors: Anchor[],
  matchesPerAnchor: number,
  existing: MatchRecord[],
): Array<{ a: Anchor; b: Anchor }> {
  const existingPairs = new Set(existing.map((m) => pairKey(m.anchorA, m.anchorB)));
  const counter = new Map<string, number>();
  for (const a of anchors) counter.set(a.anchorId, 0);
  // 既存試合数で初期化
  for (const m of existing) {
    counter.set(m.anchorA, (counter.get(m.anchorA) ?? 0) + 1);
    counter.set(m.anchorB, (counter.get(m.anchorB) ?? 0) + 1);
  }

  const byBand: Record<string, Anchor[]> = { hit: [], middle: [], low: [] };
  for (const a of anchors) byBand[a.band].push(a);

  const plan: Array<{ a: Anchor; b: Anchor }> = [];

  function tryAddMatch(a: Anchor, b: Anchor): boolean {
    if (a.anchorId === b.anchorId) return false;
    const k = pairKey(a.anchorId, b.anchorId);
    if (existingPairs.has(k)) return false;
    if ((counter.get(a.anchorId) ?? 0) >= matchesPerAnchor) return false;
    if ((counter.get(b.anchorId) ?? 0) >= matchesPerAnchor) return false;
    existingPairs.add(k);
    counter.set(a.anchorId, (counter.get(a.anchorId) ?? 0) + 1);
    counter.set(b.anchorId, (counter.get(b.anchorId) ?? 0) + 1);
    plan.push({ a, b });
    return true;
  }

  // ラウンドロビン: 各 anchor について、未消化のうち priority 順 (同帯1 → 異帯2 → 残り) で対戦相手を充足
  for (const a of anchors) {
    if ((counter.get(a.anchorId) ?? 0) >= matchesPerAnchor) continue;

    const sameBand = shuffle(byBand[a.band].filter((b) => b.anchorId !== a.anchorId));
    const otherBands: Anchor[] = [];
    for (const band of ["hit", "middle", "low"]) {
      if (band === a.band) continue;
      otherBands.push(...shuffle(byBand[band]));
    }

    // 同帯1
    for (const b of sameBand) {
      if ((counter.get(a.anchorId) ?? 0) >= 1 + (counter.get(a.anchorId) ?? 0)) break;
      if (tryAddMatch(a, b)) break;
    }

    // 異帯2 (各帯から1ずつ理想的に)
    let crossAdded = 0;
    for (const b of otherBands) {
      if (crossAdded >= 2) break;
      const before = counter.get(a.anchorId) ?? 0;
      if (tryAddMatch(a, b)) {
        if ((counter.get(a.anchorId) ?? 0) > before) crossAdded++;
      }
    }

    // 残り枠を全帯から
    const all = shuffle(anchors.filter((b) => b.anchorId !== a.anchorId));
    for (const b of all) {
      if ((counter.get(a.anchorId) ?? 0) >= matchesPerAnchor) break;
      tryAddMatch(a, b);
    }
  }

  return plan;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- 比較実行 ---

async function runOneMatch(
  genre: string,
  layer: number,
  pair: { a: Anchor; b: Anchor },
  symmetric: boolean,
  dryRun: boolean,
  model?: string,
): Promise<MatchRecord> {
  const textA = loadAnchorMaterial(genre, layer, pair.a.band, pair.a.anchorId);
  const textB = loadAnchorMaterial(genre, layer, pair.b.band, pair.b.anchorId);
  if (!textA || !textB) {
    throw new Error(`material missing: ${pair.a.anchorId} or ${pair.b.anchorId}`);
  }

  if (dryRun) {
    return {
      ts: Date.now(),
      layer,
      anchorA: pair.a.anchorId,
      anchorB: pair.b.anchorId,
      bandA: pair.a.band,
      bandB: pair.b.band,
      winner: "tie",
      reason: "dry_run",
      symmetric,
    };
  }

  const promptForward = buildComparePrompt({
    slugA: pair.a.anchorId,
    textA,
    slugB: pair.b.anchorId,
    textB,
    genre,
    layer,
  }, false);

  const rawForward = await callClaudeCli(promptForward, { layer: `anchor-cal-l${layer}`, slug: `${pair.a.anchorId}_vs_${pair.b.anchorId}`, model });
  const forward = parseCompareResponse(rawForward, false);

  let winner: Winner = forward.winner;
  let reason = forward.reason;

  if (symmetric) {
    const promptReverse = buildComparePrompt({
      slugA: pair.a.anchorId,
      textA,
      slugB: pair.b.anchorId,
      textB,
      genre,
      layer,
    }, true);
    const rawReverse = await callClaudeCli(promptReverse, { layer: `anchor-cal-l${layer}`, slug: `${pair.a.anchorId}_vs_${pair.b.anchorId}_rev`, model });
    const reverse = parseCompareResponse(rawReverse, true);
    if (forward.winner !== reverse.winner) {
      winner = "tie";
      reason = `inconsistent: f=${forward.winner} r=${reverse.winner}`;
    }
  }

  return {
    ts: Date.now(),
    layer,
    anchorA: pair.a.anchorId,
    anchorB: pair.b.anchorId,
    bandA: pair.a.band,
    bandB: pair.b.band,
    winner,
    reason,
    symmetric,
  };
}

// --- Bradley-Terry MLE (anchor 限定) ---

/**
 * Bradley-Terry MLE (Davidson-Beaver smoothing 付き)。
 *
 * 各 anchor に「仮想敵 (strength=1) との 1試合 0.5勝」を加える。
 * これで 0勝 anchor が log(0) = -Infinity に飛ぶのを防ぐ。
 * 試合数が増えると smoothing 項の影響は薄れる。
 */
function runBradleyTerry(matches: MatchRecord[], anchorIds: string[], maxIter = 200, tol = 1e-4): Record<string, number> {
  if (anchorIds.length < 2) return {};

  const SMOOTH_MATCHES = 1.0;
  const SMOOTH_WINS = 0.5;
  const SMOOTH_OPPONENT_P = 1.0;

  const p: Record<string, number> = {};
  for (const id of anchorIds) p[id] = 1.0;

  const wins: Record<string, number> = {};
  const matchPairs: Record<string, number> = {};
  for (const id of anchorIds) wins[id] = SMOOTH_WINS;

  for (const m of matches) {
    if (!(m.anchorA in p) || !(m.anchorB in p)) continue;
    const k = pairKey(m.anchorA, m.anchorB);
    matchPairs[k] = (matchPairs[k] ?? 0) + 1;
    if (m.winner === "A") wins[m.anchorA] += 1;
    else if (m.winner === "B") wins[m.anchorB] += 1;
    else {
      wins[m.anchorA] += 0.5;
      wins[m.anchorB] += 0.5;
    }
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const newP: Record<string, number> = {};
    let maxDelta = 0;
    for (const i of anchorIds) {
      // smoothing: 仮想敵との SMOOTH_MATCHES 試合
      let denom = SMOOTH_MATCHES / (p[i] + SMOOTH_OPPONENT_P);
      for (const j of anchorIds) {
        if (i === j) continue;
        const k = pairKey(i, j);
        const n = matchPairs[k] ?? 0;
        if (n === 0) continue;
        denom += n / (p[i] + p[j]);
      }
      if (denom === 0) {
        newP[i] = p[i];
      } else {
        newP[i] = wins[i] / denom;
      }
      maxDelta = Math.max(maxDelta, Math.abs(newP[i] - p[i]));
    }
    const sum = Object.values(newP).reduce((a, b) => a + b, 0);
    for (const i of anchorIds) newP[i] = (newP[i] / sum) * anchorIds.length;
    Object.assign(p, newP);
    if (maxDelta < tol) break;
  }

  // 数値安定性のため p を 1e-6 でクランプしてから対数変換
  const ratings: Record<string, number> = {};
  for (const id of anchorIds) {
    const safe = Math.max(p[id], 1e-6);
    ratings[id] = Math.log(safe) * (400 / Math.LN10) + 1500;
  }
  return ratings;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// --- メイン処理 ---

async function calibrateOne(genre: string, layer: number, args: Args): Promise<{ matchesRun: number; medians: { hit: number; middle: number; low: number } } | null> {
  const anchors = loadAnchors(genre).filter((a) => (layer === 3 ? a.hasLayer3 : a.hasLayer5));
  if (anchors.length < 6) {
    console.warn(`[calibrate] skip ${genre} layer${layer}: only ${anchors.length} anchors with material`);
    return null;
  }

  const existing = loadExistingMatches(genre, layer);
  const plan = planMatches(anchors, args.matchesPerAnchor, existing);

  console.log(`[calibrate] ${genre} layer${layer}: ${anchors.length} anchors, existing=${existing.length}, plan=${plan.length} new matches, symmetric=${args.symmetric}, dryRun=${args.dryRun}`);

  if (args.dryRun) {
    console.log(`[calibrate] dry-run: would execute ${plan.length} matches (${args.symmetric ? "x2 with symmetric" : "forward only"})`);
    return { matchesRun: 0, medians: { hit: 0, middle: 0, low: 0 } };
  }

  const matchesPath = matchesPathFor(genre, layer);
  fs.mkdirSync(path.dirname(matchesPath), { recursive: true });

  let executed = 0;
  let ok = 0;
  let failed = 0;

  // 並列実行 (ワーカープール)
  const queue = [...plan];
  const workers: Promise<void>[] = [];
  for (let w = 0; w < args.concurrency; w++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const pair = queue.shift();
        if (!pair) return;
        try {
          const m = await runOneMatch(genre, layer, pair, args.symmetric, false, args.model);
          fs.appendFileSync(matchesPath, JSON.stringify(m) + "\n");
          ok++;
          if (executed % 10 === 0) {
            console.log(`[calibrate] ${genre} layer${layer}: ${executed}/${plan.length} done`);
          }
        } catch (e) {
          failed++;
          console.error(`[calibrate] match failed ${pair.a.anchorId} vs ${pair.b.anchorId}:`, (e as Error).message?.slice(0, 200));
        }
        executed++;
      }
    })());
  }
  await Promise.all(workers);

  console.log(`[calibrate] ${genre} layer${layer}: executed=${executed} ok=${ok} failed=${failed}`);

  // 成功率が低すぎる場合 (失敗 >= 50%) はレート制限など外部要因。校正値は信頼できないので書き込まない。
  if (executed > 0 && ok < executed * 0.5) {
    console.warn(`[calibrate] ${genre} layer${layer}: ok率が低すぎる (${ok}/${executed})。calibration更新をスキップ。`);
    return { matchesRun: executed, medians: { hit: 0, middle: 0, low: 0 } };
  }

  // BT で再計算
  const allMatches = loadExistingMatches(genre, layer);
  const ratings = runBradleyTerry(allMatches, anchors.map((a) => a.anchorId));

  // ratings ファイル書き出し
  const ratingsPath = ratingsPathFor(genre, layer);
  fs.mkdirSync(path.dirname(ratingsPath), { recursive: true });
  const ratingEntries: AnchorRating[] = anchors.map((a) => ({
    anchorId: a.anchorId,
    band: a.band,
    rating: ratings[a.anchorId] ?? 1500,
    matchCount: allMatches.filter((m) => m.anchorA === a.anchorId || m.anchorB === a.anchorId).length,
  }));
  fs.writeFileSync(ratingsPath, JSON.stringify({ genre, layer, builtAt: new Date().toISOString(), entries: ratingEntries }, null, 2));

  // 帯別中央値
  const hitElos = ratingEntries.filter((r) => r.band === "hit").map((r) => r.rating);
  const middleElos = ratingEntries.filter((r) => r.band === "middle").map((r) => r.rating);
  const lowElos = ratingEntries.filter((r) => r.band === "low").map((r) => r.rating);
  const medians = {
    hit: median(hitElos),
    middle: median(middleElos),
    low: median(lowElos),
  };

  // calibration.json 更新
  const cal = JSON.parse(fs.readFileSync(CALIBRATION_FILE, "utf8")) as CalibrationFile;
  if (!cal.layers[genre]) cal.layers[genre] = {};
  cal.layers[genre][`layer${layer}`] = {
    hitMedianElo: medians.hit,
    middleMedianElo: medians.middle,
    lowMedianElo: medians.low,
    // passElo は hit と middle の中点を初期値とする (設計書: hit_median - margin)
    passElo: (medians.hit + medians.middle) / 2,
    requiredAnchorMatches: 10,
    calibratedAt: new Date().toISOString(),
    matchCount: allMatches.length,
  };
  fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(cal, null, 2));

  console.log(`[calibrate] ${genre} layer${layer} medians: hit=${medians.hit.toFixed(1)} middle=${medians.middle.toFixed(1)} low=${medians.low.toFixed(1)} passElo=${((medians.hit + medians.middle) / 2).toFixed(1)}`);

  return { matchesRun: executed, medians };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("[calibrate] args:", args);

  const allGenres = listGenres();
  const targetGenres = args.all ? allGenres : args.genres;
  if (targetGenres.length === 0) {
    console.error("Specify --genre <id> or --all");
    process.exit(1);
  }

  for (const genre of targetGenres) {
    if (!allGenres.includes(genre)) {
      console.warn(`[calibrate] genre not found: ${genre}`);
      continue;
    }
    for (const layer of args.layers) {
      try {
        await calibrateOne(genre, layer, args);
      } catch (e) {
        console.error(`[calibrate] ${genre} layer${layer} failed:`, e);
      }
    }
  }

  console.log("[calibrate] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
