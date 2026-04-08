// 要素グリッド: 4軸タグの抽選 + 歩留まり学習による重み付け
//
// ヒットDBから事前抽出した element-grid.json を読み込み、
// (ジャンル × 境遇 × 転機 × 方向 × フック) の組合せをランダム抽選する。
// 過去バッチの歩留まりがあれば yield-stats.json で重み付けする。
// データが薄いうちは ε探索（20%は完全ランダム）で偏りを防ぐ。

import { readFileSync, existsSync } from "fs";
import type { ElementTags } from "./types";

export interface ElementGrid {
  byGenre: Record<
    string,
    {
      境遇: string[];
      転機: string[];
      方向: string[];
      フック: string[];
    }
  >;
}

export interface YieldStats {
  /** key = `${genre}|${境遇}|${転機}|${方向}|${フック}` -> 平均hit確率 */
  combos: Record<string, { samples: number; meanHit: number }>;
  totalBatches: number;
}

export const EXPLORATION_EPSILON = 0.2;
export const MIN_BATCHES_FOR_LEARNING = 30;

const RNG = () => Math.random();

/** element-grid.json をロード（ない場合はnull） */
export function loadElementGrid(path: string): ElementGrid | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as ElementGrid;
}

/** yield-stats.json をロード（ない場合は空） */
export function loadYieldStats(path: string): YieldStats {
  if (!existsSync(path)) return { combos: {}, totalBatches: 0 };
  return JSON.parse(readFileSync(path, "utf-8")) as YieldStats;
}

/** ジャンル指定で4軸タグを1組抽選 */
export function sampleTags(
  grid: ElementGrid,
  genre: string,
  stats: YieldStats,
  rng: () => number = RNG,
): ElementTags | null {
  const axes = grid.byGenre[genre];
  if (!axes) return null;

  // ε探索: 一定確率で完全ランダム
  // 学習データが薄いとき（バッチ数<閾値）は学習を使わずフラット
  const useLearning = stats.totalBatches >= MIN_BATCHES_FOR_LEARNING && rng() > EXPLORATION_EPSILON;

  if (!useLearning) {
    return {
      境遇: pickRandom(axes.境遇, rng),
      転機: pickRandom(axes.転機, rng),
      方向: pickRandom(axes.方向, rng),
      フック: pickRandom(axes.フック, rng),
    };
  }

  // 学習あり: 各軸の重みを過去hit確率の周辺平均で決定
  return {
    境遇: pickWeighted(axes.境遇, "境遇", genre, stats, rng),
    転機: pickWeighted(axes.転機, "転機", genre, stats, rng),
    方向: pickWeighted(axes.方向, "方向", genre, stats, rng),
    フック: pickWeighted(axes.フック, "フック", genre, stats, rng),
  };
}

function pickRandom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted(
  options: readonly string[],
  axis: keyof ElementTags,
  genre: string,
  stats: YieldStats,
  rng: () => number,
): string {
  // 軸×値の周辺hit確率を集計
  const weights = options.map((opt) => marginalMean(stats, genre, axis, opt));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return pickRandom(options, rng);
  let r = rng() * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

function marginalMean(
  stats: YieldStats,
  genre: string,
  axis: keyof ElementTags,
  value: string,
): number {
  let sum = 0;
  let n = 0;
  for (const [key, v] of Object.entries(stats.combos)) {
    const [g, ky, tk, hk, fk] = key.split("|");
    if (g !== genre) continue;
    const map: Record<keyof ElementTags, string> = {
      境遇: ky,
      転機: tk,
      方向: hk,
      フック: fk,
    };
    if (map[axis] === value) {
      sum += v.meanHit * v.samples;
      n += v.samples;
    }
  }
  // ラプラススムージング: 観測ゼロでも0にしない
  return n === 0 ? 0.2 : sum / n;
}

export function comboKey(genre: string, tags: ElementTags): string {
  return `${genre}|${tags.境遇}|${tags.転機}|${tags.方向}|${tags.フック}`;
}
