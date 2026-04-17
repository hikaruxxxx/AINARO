// ジャンル別ペアワイズリーグ: Swiss-system + Bradley-Terry レーティング
//
// 設計:
// - ジャンルごとに独立したリーグ
// - 各作品が「現在のレーティングが近い既存作品3件」と比較される
// - 累積10ペアで確定(matchCount >= MATCH_THRESHOLD)
// - レーティングは Bradley-Terry の最尤推定で算出
// - 状態: data/generation/leagues/{genre}/ratings.json + matches.jsonl

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { Winner } from "./llm-compare";

export const MATCH_THRESHOLD = 10; // 累積比較数がこれ以上で確定
export const NEAREST_K = 2; // 近傍何件と比較するか（3→2に削減: トークン33%節約）
export const INITIAL_RATING = 1500; // Elo初期値風

export interface RatingEntry {
  slug: string;
  rating: number;
  matchCount: number;
  wins: number;
  losses: number;
  ties: number;
  isExploration: boolean;
  finalized: boolean; // matchCount >= MATCH_THRESHOLD
  layer: number;
  updatedAt: number;
}

export interface RatingsFile {
  genre: string;
  version: string;
  updatedAt: number;
  entries: Record<string, RatingEntry>;
}

export interface MatchRecord {
  timestamp: number;
  slugA: string;
  slugB: string;
  layer: number;
  winner: Winner;
  reason: string;
  // 比較時点のレーティング
  ratingABefore: number;
  ratingBBefore: number;
  ratingAAfter: number;
  ratingBAfter: number;
}

function ratingsPath(genre: string, baseDir: string): string {
  return join(baseDir, genre, "ratings.json");
}

function matchesPath(genre: string, baseDir: string): string {
  return join(baseDir, genre, "matches.jsonl");
}

function ensureDir(p: string): void {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

export function loadRatings(genre: string, baseDir = "data/generation/leagues"): RatingsFile {
  const path = ratingsPath(genre, baseDir);
  if (!existsSync(path)) {
    return { genre, version: "v1", updatedAt: Date.now(), entries: {} };
  }
  return JSON.parse(readFileSync(path, "utf-8")) as RatingsFile;
}

export function saveRatings(file: RatingsFile, baseDir = "data/generation/leagues"): void {
  const path = ratingsPath(file.genre, baseDir);
  ensureDir(path);
  file.updatedAt = Date.now();
  writeFileSync(path, JSON.stringify(file, null, 2));
}

/** 新規作品をリーグに登録(初期レーティングで) */
export function registerWork(
  genre: string,
  slug: string,
  layer: number,
  isExploration: boolean,
  baseDir = "data/generation/leagues",
): RatingEntry {
  const file = loadRatings(genre, baseDir);
  if (!file.entries[slug]) {
    file.entries[slug] = {
      slug,
      rating: INITIAL_RATING,
      matchCount: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      isExploration,
      finalized: false,
      layer,
      updatedAt: Date.now(),
    };
    saveRatings(file, baseDir);
  }
  return file.entries[slug];
}

/** レーティングが近いN件を抽出(同layer・未確定除く・自分を除く) */
export function findNearestOpponents(
  genre: string,
  targetSlug: string,
  layer: number,
  k: number = NEAREST_K,
  baseDir = "data/generation/leagues",
): RatingEntry[] {
  const file = loadRatings(genre, baseDir);
  const target = file.entries[targetSlug];
  if (!target) return [];
  const candidates = Object.values(file.entries).filter(
    (e) => e.slug !== targetSlug && e.layer === layer,
  );
  // |Δrating| でソート
  candidates.sort(
    (a, b) => Math.abs(a.rating - target.rating) - Math.abs(b.rating - target.rating),
  );
  return candidates.slice(0, k);
}

/** 比較結果を記録してレーティング更新(Elo風の段階的更新) */
export function recordMatch(
  genre: string,
  slugA: string,
  slugB: string,
  layer: number,
  winner: Winner,
  reason: string,
  baseDir = "data/generation/leagues",
): MatchRecord {
  const file = loadRatings(genre, baseDir);
  const a = file.entries[slugA];
  const b = file.entries[slugB];
  if (!a || !b) {
    throw new Error(`recordMatch: slug not registered. a=${!!a} b=${!!b}`);
  }

  const ratingABefore = a.rating;
  const ratingBBefore = b.rating;

  // Elo更新(K=32、tieは0.5)
  const K = 32;
  const expectedA = 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400));
  const expectedB = 1 - expectedA;
  let scoreA: number;
  let scoreB: number;
  if (winner === "A") {
    scoreA = 1;
    scoreB = 0;
    a.wins++;
    b.losses++;
  } else if (winner === "B") {
    scoreA = 0;
    scoreB = 1;
    a.losses++;
    b.wins++;
  } else {
    scoreA = 0.5;
    scoreB = 0.5;
    a.ties++;
    b.ties++;
  }
  a.rating = a.rating + K * (scoreA - expectedA);
  b.rating = b.rating + K * (scoreB - expectedB);
  a.matchCount++;
  b.matchCount++;
  a.updatedAt = Date.now();
  b.updatedAt = Date.now();
  if (a.matchCount >= MATCH_THRESHOLD) a.finalized = true;
  if (b.matchCount >= MATCH_THRESHOLD) b.finalized = true;

  saveRatings(file, baseDir);

  const record: MatchRecord = {
    timestamp: Date.now(),
    slugA,
    slugB,
    layer,
    winner,
    reason,
    ratingABefore,
    ratingBBefore,
    ratingAAfter: a.rating,
    ratingBAfter: b.rating,
  };

  // matches.jsonl に追記
  const mPath = matchesPath(genre, baseDir);
  ensureDir(mPath);
  appendFileSync(mPath, JSON.stringify(record) + "\n");

  return record;
}

/** ジャンル内の現在順位(rating降順) */
export function getRanking(
  genre: string,
  layer?: number,
  baseDir = "data/generation/leagues",
): RatingEntry[] {
  const file = loadRatings(genre, baseDir);
  const entries = Object.values(file.entries);
  const filtered = layer != null ? entries.filter((e) => e.layer === layer) : entries;
  return filtered.sort((a, b) => b.rating - a.rating);
}

/** 確定済み作品のみ取得 */
export function getFinalized(
  genre: string,
  layer?: number,
  baseDir = "data/generation/leagues",
): RatingEntry[] {
  return getRanking(genre, layer, baseDir).filter((e) => e.finalized);
}

/**
 * Bradley-Terry の最尤推定でレーティングを再計算する(バッチ処理)。
 * Eloは逐次更新で順序依存がある。月1回などのタイミングで全試合履歴から再構築する。
 */
export function recomputeBradleyTerry(
  genre: string,
  baseDir = "data/generation/leagues",
  maxIter = 200,
  tol = 1e-4,
): void {
  const mPath = matchesPath(genre, baseDir);
  if (!existsSync(mPath)) return;
  const matches = readFileSync(mPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as MatchRecord);

  const file = loadRatings(genre, baseDir);
  const slugList = Object.keys(file.entries);
  if (slugList.length < 2) return;

  // Bradley-Terry: P(i beats j) = pi / (pi + pj)
  // 最尤推定の反復: pi_new = wins_i / sum_j(matches_ij / (pi + pj))
  const p: Record<string, number> = {};
  for (const s of slugList) p[s] = 1.0;

  const wins: Record<string, number> = {};
  const matchPairs: Record<string, number> = {}; // key=`${a}|${b}` (sorted)
  for (const s of slugList) wins[s] = 0;

  for (const m of matches) {
    if (!(m.slugA in p) || !(m.slugB in p)) continue;
    const k = [m.slugA, m.slugB].sort().join("|");
    matchPairs[k] = (matchPairs[k] ?? 0) + 1;
    if (m.winner === "A") wins[m.slugA] += 1;
    else if (m.winner === "B") wins[m.slugB] += 1;
    else {
      wins[m.slugA] += 0.5;
      wins[m.slugB] += 0.5;
    }
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const newP: Record<string, number> = {};
    let maxDelta = 0;
    for (const i of slugList) {
      let denom = 0;
      for (const j of slugList) {
        if (i === j) continue;
        const k = [i, j].sort().join("|");
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
    // 正規化
    const sum = Object.values(newP).reduce((a, b) => a + b, 0);
    for (const i of slugList) newP[i] = (newP[i] / sum) * slugList.length;
    Object.assign(p, newP);
    if (maxDelta < tol) break;
  }

  // p をレーティングに変換: log(p) * 400 + 1500
  for (const s of slugList) {
    const r = Math.log(p[s]) * (400 / Math.LN10) + INITIAL_RATING;
    if (file.entries[s]) {
      file.entries[s].rating = r;
      file.entries[s].updatedAt = Date.now();
    }
  }
  saveRatings(file, baseDir);
}
