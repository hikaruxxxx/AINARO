// Swiss-system 統括: 新規作品をリーグに登録し、近傍と比較し、レーティング確定を判定
//
// デーモンから呼び出される高レベルAPI:
//   await runPairwiseRound({ slug, genre, layer, text, llm, isExploration })
//
// 内部:
// 1. registerWork でリーグ登録
// 2. findNearestOpponents で近傍K件取得(初回は乱択)
// 3. compareSymmetric で比較
// 4. recordMatch でレーティング更新
// 5. 確定したかチェック

import {
  registerWork,
  findNearestOpponents,
  recordMatch,
  loadRatings,
  MATCH_THRESHOLD,
  NEAREST_K,
  type RatingEntry,
} from "./league";
import {
  compareSymmetric,
  type LlmCallFn,
  type CompareInput,
} from "./llm-compare";

export interface PairwiseRoundInput {
  slug: string;
  genre: string;
  layer: number;
  text: string;
  /** slug -> 本文を取得する関数(対戦相手の本文ロード用) */
  loadOpponentText: (slug: string) => Promise<string>;
  llm: LlmCallFn;
  isExploration: boolean;
  baseDir?: string;
}

export interface PairwiseRoundResult {
  finalized: boolean;
  matchCount: number;
  rating: number;
  matchesPlayed: number;
  opponentsTried: string[];
}

/**
 * 1ラウンド実行: 近傍K件と比較してレーティング更新。
 * matchCountがMATCH_THRESHOLDに達したら finalized=true で返す。
 */
export async function runPairwiseRound(
  input: PairwiseRoundInput,
): Promise<PairwiseRoundResult> {
  const baseDir = input.baseDir ?? "data/generation/leagues";

  // 1. 登録(冪等)
  registerWork(input.genre, input.slug, input.layer, input.isExploration, baseDir);

  // 2. 近傍K件
  let opponents = findNearestOpponents(
    input.genre,
    input.slug,
    input.layer,
    NEAREST_K,
    baseDir,
  );

  // 初回は対戦相手がいない可能性 → コールドスタート
  if (opponents.length === 0) {
    const file = loadRatings(input.genre, baseDir);
    const all = Object.values(file.entries).filter(
      (e) => e.slug !== input.slug && e.layer === input.layer,
    );
    // ランダムに最大K件
    opponents = shuffle(all).slice(0, NEAREST_K);
  }

  const opponentsTried: string[] = [];
  let matchesPlayed = 0;

  for (const opp of opponents) {
    const oppText = await input.loadOpponentText(opp.slug);
    const cmpInput: CompareInput = {
      slugA: input.slug,
      textA: input.text,
      slugB: opp.slug,
      textB: oppText,
      genre: input.genre,
      layer: input.layer,
    };
    const result = await compareSymmetric(cmpInput, input.llm);
    recordMatch(input.genre, input.slug, opp.slug, input.layer, result.winner, result.reason, baseDir);
    opponentsTried.push(opp.slug);
    matchesPlayed++;
  }

  // 最新状態を取得
  const file = loadRatings(input.genre, baseDir);
  const me = file.entries[input.slug];
  return {
    finalized: me?.finalized ?? false,
    matchCount: me?.matchCount ?? 0,
    rating: me?.rating ?? 1500,
    matchesPlayed,
    opponentsTried,
  };
}

/**
 * 確定までラウンドを繰り返す高レベル関数。
 * MATCH_THRESHOLDを満たすまで複数ラウンド回す。
 */
export async function runUntilFinalized(
  input: PairwiseRoundInput,
  maxRounds = 5,
): Promise<PairwiseRoundResult> {
  let last: PairwiseRoundResult | null = null;
  for (let i = 0; i < maxRounds; i++) {
    last = await runPairwiseRound(input);
    if (last.finalized) return last;
    if (last.matchesPlayed === 0) break; // 対戦相手なしならbreak
  }
  return last ?? {
    finalized: false,
    matchCount: 0,
    rating: 1500,
    matchesPlayed: 0,
    opponentsTried: [],
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ジャンル横断グランドリーグ用: 各ジャンルのtopN を抽出 */
export function getTopFromGenres(
  genres: string[],
  topN: number,
  layer: number,
  baseDir = "data/generation/leagues",
): Array<{ genre: string; entry: RatingEntry }> {
  const result: Array<{ genre: string; entry: RatingEntry }> = [];
  for (const genre of genres) {
    const file = loadRatings(genre, baseDir);
    const entries = Object.values(file.entries)
      .filter((e) => e.layer === layer && e.finalized)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, topN);
    for (const entry of entries) {
      result.push({ genre, entry });
    }
  }
  return result;
}

export { MATCH_THRESHOLD };
