// 候補作品を anchor reference pool と比較して anchor スケールの Elo を推定する。
//
// 設計: docs/architecture/phase1_pipeline_design_v2.md §7
//
// アンカー側のレーティングは scripts/anchors/calibrate-anchors.ts で固定されている。
// 候補は K 件の anchor (hit/middle/low を網羅) と LLM ペアワイズ比較し、
// 1D Bradley-Terry MLE で candidate Elo を anchor スケール上に位置決めする。
//
// 候補 vs 候補の比較 (旧 pairwise.ts) は補助観測に降格。Phase 1 の合格判定は
// anchor 比較を主根拠とする。

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { buildComparePrompt, parseCompareResponse, type Winner } from "./llm-compare";
import { callClaudeCli } from "./claude-cli";

const ANCHORS_DIR = "data/generation/anchors";

export interface AnchorRatingEntry {
  anchorId: string;
  band: "hit" | "middle" | "low";
  rating: number;
  matchCount: number;
}

interface AnchorRatingsFile {
  genre: string;
  layer: number;
  builtAt: string;
  entries: AnchorRatingEntry[];
}

export interface AnchorMatchRecord {
  ts: number;
  layer: number;
  candidateSlug: string;
  anchorId: string;
  anchorBand: string;
  anchorRating: number;
  candidateRatingEstimate: number;
  winner: Winner;
  reason: string;
}

export interface AnchorEvalResult {
  /** anchor スケール上の候補 Elo */
  candidateElo: number;
  /** anchor pool に対して何試合実行したか */
  matchCount: number;
  /** 各 anchor との対戦結果 */
  matches: AnchorMatchRecord[];
  /** 評価不能の理由 (anchor pool 不在等) */
  reason?: string;
}

interface PlannedMatch {
  anchorId: string;
  band: "hit" | "middle" | "low";
  anchorRating: number;
}

// --- ファイル I/O ---

export function loadAnchorRatings(genre: string, layer: number, baseDir = ANCHORS_DIR): AnchorRatingsFile | null {
  const p = join(baseDir, genre, "anchor-ratings", `layer${layer}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as AnchorRatingsFile;
  } catch {
    return null;
  }
}

function loadAnchorMaterial(genre: string, layer: number, band: string, anchorId: string, baseDir = ANCHORS_DIR): string | null {
  const p = join(baseDir, genre, `layer${layer}`, band, `${anchorId}.md`);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function appendCandidateMatch(genre: string, layer: number, slug: string, record: AnchorMatchRecord, baseDir = ANCHORS_DIR): void {
  const p = join(baseDir, genre, "candidate-matches", `layer${layer}`, `${slug}.jsonl`);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(record) + "\n");
}

function loadExistingCandidateMatches(genre: string, layer: number, slug: string, baseDir = ANCHORS_DIR): AnchorMatchRecord[] {
  const p = join(baseDir, genre, "candidate-matches", `layer${layer}`, `${slug}.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// --- 試合計画 ---

/**
 * K 件の anchor を hit/middle/low から均等に選ぶ。
 * 既に対戦済みの anchor は除外する。
 */
export function planAnchorMatches(
  ratings: AnchorRatingEntry[],
  k: number,
  excludeAnchorIds: Set<string> = new Set(),
): PlannedMatch[] {
  const byBand: Record<string, AnchorRatingEntry[]> = { hit: [], middle: [], low: [] };
  for (const r of ratings) {
    if (excludeAnchorIds.has(r.anchorId)) continue;
    byBand[r.band].push(r);
  }
  // 各帯ごとシャッフル
  for (const b of Object.keys(byBand)) byBand[b] = shuffle(byBand[b]);

  const perBand = Math.ceil(k / 3);
  const plan: PlannedMatch[] = [];
  for (const band of ["hit", "middle", "low"] as const) {
    const slice = byBand[band].slice(0, perBand);
    for (const r of slice) {
      plan.push({ anchorId: r.anchorId, band, anchorRating: r.rating });
    }
  }
  // k に切り詰める (均等分配で超過した分は落とす)
  return plan.slice(0, k);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- 1D Bradley-Terry MLE ---

/** 候補視点の勝敗: candidate=候補勝, anchor=anchor勝, tie=引き分け */
export type CandidateOutcome = "candidate" | "anchor" | "tie";

export interface CandidateVsAnchorMatch {
  anchorRating: number;
  outcome: CandidateOutcome;
}

/**
 * anchor のレーティングを固定し、候補の Elo を MLE で求める。
 *
 * P(candidate beats anchor_i) = 1 / (1 + 10^((r_a_i - r_c) / 400))
 * ties は 0.5 とする。
 *
 * 1D 凸最適化なので二分探索で解く。
 *
 * 全勝 / 全敗の場合は対数尤度の極限が ±∞ になるので、勝率が極端な場合は
 * 経験則で +400 / -400 のオフセットを返す (BT MLE は本来発散する)。
 */
export function estimateCandidateElo(matches: CandidateVsAnchorMatch[]): number {
  if (matches.length === 0) return 1500;

  // 退化ケース: 全勝/全敗
  const wins = matches.filter((m) => m.outcome === "candidate").length;
  const losses = matches.filter((m) => m.outcome === "anchor").length;
  const ties = matches.length - wins - losses;
  if (wins + ties === 0 || losses + ties === 0) {
    const meanAnchor = matches.reduce((s, m) => s + m.anchorRating, 0) / matches.length;
    const offset = wins + ties === 0 ? -400 : 400;
    return meanAnchor + offset;
  }

  function gradient(rc: number): number {
    let g = 0;
    for (const m of matches) {
      const s = m.outcome === "tie" ? 0.5 : m.outcome === "candidate" ? 1 : 0;
      const p = 1 / (1 + Math.pow(10, (m.anchorRating - rc) / 400));
      g += s - p;
    }
    return g;
  }

  // 二分探索: gradient(rc) は rc に対して単調増加
  let lo = 0;
  let hi = 4000;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const g = gradient(mid);
    if (Math.abs(g) < 1e-6) return mid;
    if (g > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function winnerToCandidateOutcome(winner: Winner): CandidateOutcome {
  if (winner === "A") return "candidate";
  if (winner === "B") return "anchor";
  return "tie";
}

// --- メイン: 候補を anchor pool で評価 ---

export interface EvaluateAgainstAnchorsOptions {
  /** 何件の anchor と対戦するか (default 6, 各帯から ceil(k/3) ずつ) */
  matchesPerCandidate?: number;
  /** 候補本文 (キャッシュ用、未指定なら baseDir から読まない) */
  candidateText?: string;
  /** 試験用: LLM呼び出しを差し替え (省略時は claude CLI) */
  llmCall?: (prompt: string) => Promise<string>;
}

/**
 * 候補を anchor pool と比較して anchor スケールの Elo を返す。
 *
 * 既存の対戦結果は再利用する (冪等)。matchesPerCandidate に達するまで追加対戦を実行。
 */
export async function evaluateCandidateAgainstAnchors(
  slug: string,
  layer: number,
  genre: string,
  candidateText: string,
  opts: EvaluateAgainstAnchorsOptions = {},
): Promise<AnchorEvalResult> {
  const ratings = loadAnchorRatings(genre, layer);
  if (!ratings || ratings.entries.length === 0) {
    return { candidateElo: 1500, matchCount: 0, matches: [], reason: "no_anchor_ratings" };
  }

  const k = opts.matchesPerCandidate ?? 6;
  const llm = opts.llmCall ?? ((prompt: string) => callClaudeCli(prompt, { layer: `layer${layer}_anchor`, slug }));

  // 既存試合を読んで、追加で必要な分だけ計画する
  const existing = loadExistingCandidateMatches(genre, layer, slug);
  const usedAnchorIds = new Set(existing.map((m) => m.anchorId));
  const remaining = Math.max(0, k - existing.length);

  const plan = remaining > 0 ? planAnchorMatches(ratings.entries, remaining, usedAnchorIds) : [];
  const newMatches: AnchorMatchRecord[] = [];

  for (const planned of plan) {
    const anchorText = loadAnchorMaterial(genre, layer, planned.band, planned.anchorId);
    if (!anchorText) {
      continue;
    }

    // 候補を A、anchor を B にして比較。LLM へは label A=候補, B=anchor で渡す。
    const promptForward = buildComparePrompt({
      slugA: slug,
      textA: candidateText,
      slugB: planned.anchorId,
      textB: anchorText,
      genre,
      layer,
    }, false);

    let raw: string;
    try {
      raw = await llm(promptForward);
    } catch (e) {
      // LLM 失敗は記録のみで継続。最終的に matchCount が足りなければ呼び出し側で hold する。
      continue;
    }
    const parsed = parseCompareResponse(raw, false);

    // 候補視点の勝敗に変換: A=候補なので winner=A → "candidate"
    const candidateWinner: Winner = parsed.winner; // A=候補が勝, B=anchor勝, tie

    const record: AnchorMatchRecord = {
      ts: Date.now(),
      layer,
      candidateSlug: slug,
      anchorId: planned.anchorId,
      anchorBand: planned.band,
      anchorRating: planned.anchorRating,
      candidateRatingEstimate: 0, // 後で全試合で再推定
      winner: candidateWinner,
      reason: parsed.reason,
    };

    appendCandidateMatch(genre, layer, slug, record);
    newMatches.push(record);
  }

  // 全試合 (既存 + 新規) で MLE
  const all = [...existing, ...newMatches];
  const candidateElo = estimateCandidateElo(
    all.map((m) => ({
      anchorRating: m.anchorRating,
      outcome: winnerToCandidateOutcome(m.winner),
    })),
  );

  return {
    candidateElo,
    matchCount: all.length,
    matches: all,
  };
}

/**
 * 当該 genre × layer に anchor ratings が存在するか。
 */
export function hasAnchorRatings(genre: string, layer: number): boolean {
  return loadAnchorRatings(genre, layer) != null;
}
