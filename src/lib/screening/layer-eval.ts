// 層別ペアワイズ評価: 各層の生成完了後にリーグへ登録し、近傍比較を実行
//
// 役割:
// - 作品の本文(該当層)を読む
// - 同ジャンル・同層の対戦相手を引く
// - claude -p で比較プロンプトを実行
// - レーティング更新
// - 通過判定: anchor校正済みの絶対Elo閾値で次層への進行を決める

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { runPairwiseRound, MATCH_THRESHOLD } from "./pairwise";
import { getRanking } from "./league";
import { callClaudeCli } from "./claude-cli";
import type { LlmCallFn } from "./llm-compare";
import type { LayerId } from "./work-queue";
import { runHitPredictorV12, HitPredictorError, type HitPredictionResult } from "./hit-predictor-v12";
import { getCalibratedPassElo, getCalibratedMiddleMedianElo, getCalibratedHitProbabilityThresholds, isCalibrated } from "./calibration-loader";
import { evaluateCandidateAgainstAnchors, hasAnchorRatings } from "./anchor-eval";

// 候補が anchor と対戦する数 (各帯から ceil(K/3) ずつ)
const ANCHOR_MATCHES_PER_CANDIDATE = 6;

/**
 * 各層の絶対Elo閾値 (anchor 未校正ジャンルへのフォールバック)。
 * 校正済みジャンルは data/generation/anchors/calibration.json から passElo を読む。
 */
export const LAYER_ELO_THRESHOLD_FALLBACK: Record<LayerId, number> = {
  1: 0,
  2: 1510,
  3: 1520,
  4: 1535,
  5: 1550,
  6: 0,
};

function getLayerEloThreshold(genre: string, layer: LayerId): number {
  return getCalibratedPassElo(genre, layer, LAYER_ELO_THRESHOLD_FALLBACK[layer]);
}

/** 各層の本文ファイル名 */
const LAYER_FILES: Record<LayerId, string> = {
  1: "layer1_logline.md",
  2: "layer2_plot.md",
  3: "layer3_synopsis.md",
  4: "layer4_arc1_plot.md",
  5: "layer5_ep001.md",
  6: "layer6_ep002.md",
};

function loadLayerText(slug: string, layer: LayerId, worksDir: string): string {
  const path = join(worksDir, slug, LAYER_FILES[layer]);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

// ペアワイズ評価のモデル割り当て(Opus枠温存のため軽量モデルへ寄せる)
// 04-24: A/B検証待ち。Haiku layer2は65%一致で採用見送り。Sonnet検証中。
// 確定するまでは未指定=Opusフォールバックで安全に動かす。
const COMPARE_MODEL: Record<number, string | undefined> = {};

/** claude -p をペアワイズ用 LlmCallFn に変換 */
function makeClaudeLlm(slug: string, layer: number): LlmCallFn {
  const model = COMPARE_MODEL[layer];
  return async (prompt: string) => {
    return callClaudeCli(prompt, { layer: `layer${layer}_compare`, slug, model });
  };
}

export interface EvalResult {
  passed: boolean;
  rating: number;
  matchCount: number;
  finalized: boolean;
  rank?: number;
  totalInLayer?: number;
  reason?: string;
  /** Layer 5 のみ: v12 アンサンブルのヒット確率 (%) */
  hitProbability?: number;
  /** Layer 5 のみ: v12 tier */
  hitTier?: string;
}

/**
 * 1作品を該当層で評価し、次層へ進むべきか判定する。
 *
 * 評価ロジック:
 * - レーティングが未確定(matchCount < MATCH_THRESHOLD)なら、ラウンドを回して比較を進める
 * - 証拠不足なら passed=false / reason=insufficient_evidence で保留扱いにする
 * - 確定後、絶対Elo閾値を満たしていれば passed=true
 *
 * 注: Layer 1 はテキスト量が少なく比較の意味が薄いので、評価せず常に passed=true で返す。
 */
export async function evaluateLayer(
  slug: string,
  layer: LayerId,
  genre: string,
  isExploration: boolean,
  worksDir = "data/generation/works",
): Promise<EvalResult> {
  // Layer 1 は素通し(ロジック側でフォーマットチェックのみ)
  if (layer === 1) {
    return { passed: true, rating: 1500, matchCount: 0, finalized: false, reason: "layer1_skip" };
  }

  const text = loadLayerText(slug, layer, worksDir);
  if (!text) {
    return { passed: false, rating: 1500, matchCount: 0, finalized: false, reason: "text_missing" };
  }

  // 評価ルート選択:
  // - anchor pool に当該ジャンル × 層の calibration + ratings が揃っている場合は anchor 主根拠評価
  // - 揃っていない場合は従来の候補プールペアワイズ (legacy fallback)
  const useAnchorEval = isCalibrated(genre, layer) && hasAnchorRatings(genre, layer);

  let rating: number;
  let matchCount: number;
  let finalized: boolean;
  let rank: number | undefined;
  let total: number | undefined;

  if (useAnchorEval) {
    // anchor pool 評価
    const result = await evaluateCandidateAgainstAnchors(slug, layer, genre, text, {
      matchesPerCandidate: ANCHOR_MATCHES_PER_CANDIDATE,
    });
    rating = result.candidateElo;
    matchCount = result.matchCount;
    // anchor 比較は 6試合で確定 (固定 anchor なので試合数が安定すれば finalized 扱い)
    finalized = matchCount >= ANCHOR_MATCHES_PER_CANDIDATE;
    if (matchCount < ANCHOR_MATCHES_PER_CANDIDATE) {
      return {
        passed: false,
        rating,
        matchCount,
        finalized,
        reason: result.reason ?? "insufficient_anchor_evidence",
      };
    }
  } else {
    // 旧 candidate pool ペアワイズ (anchor 未校正ジャンル)
    const OPPONENT_TEXT_LIMIT = 2000;
    const loadOpponentText = async (oppSlug: string): Promise<string> => {
      const full = loadLayerText(oppSlug, layer, worksDir);
      return layer >= 2 ? full.slice(0, OPPONENT_TEXT_LIMIT) : full;
    };

    const llm = makeClaudeLlm(slug, layer);
    const round = await runPairwiseRound({
      slug,
      genre,
      layer,
      text,
      loadOpponentText,
      llm,
      isExploration,
    });

    rating = round.rating;
    matchCount = round.matchCount;
    finalized = round.finalized;

    // 同層ランキングで順位を取る (legacy 経路のみ)
    const ranking = getRanking(genre, layer);
    total = ranking.length;
    const myIndex = ranking.findIndex((e) => e.slug === slug);
    rank = myIndex >= 0 ? myIndex + 1 : total;

    if (round.matchCount < MATCH_THRESHOLD) {
      return {
        passed: false,
        rating,
        matchCount,
        finalized,
        rank,
        totalInLayer: total,
        reason: "insufficient_evidence",
      };
    }
  }

  const passElo = getLayerEloThreshold(genre, layer);
  const pairwisePassed = rating >= passElo;

  // 設計書 §5: candidate_elo < middle_median_elo は reject 即決
  // anchor 未校正ジャンルでは middle_median が無いのでこの即決はスキップ
  const middleMedian = getCalibratedMiddleMedianElo(genre, layer);
  if (middleMedian != null && rating < middleMedian) {
    return {
      passed: false,
      rating,
      matchCount,
      finalized,
      rank,
      totalInLayer: total,
      reason: `elo_below_middle_median:${middleMedian.toFixed(0)}`,
    };
  }

  // Layer 5 のみ: v12 アンサンブルのヒット予測を追加実行し、ペアワイズとのAND判定にする
  let hitProbability: number | undefined;
  let hitTier: string | undefined;
  let v12Passed = true;
  let v12Reason: string | undefined;

  if (layer === 5) {
    const ep1Path = join(worksDir, slug, "layer5_ep001.md");
    try {
      const result = runHitPredictorV12(slug, ep1Path, { episode: 1, genre });
      hitProbability = result.hitProbability;
      hitTier = result.tier;
      // anchor 校正済み閾値を優先、未校正ならハードコードされた絶対値
      const calThresholds = getCalibratedHitProbabilityThresholds();
      const threshold = calThresholds.pass;
      v12Passed = hitProbability >= threshold;
      if (!v12Passed) v12Reason = `v12_below_${threshold}(${genre})`;
      writeScreeningResult(slug, worksDir, {
        ...result,
        pairwiseRating: rating,
        pairwiseRank: rank ?? 0,
        pairwiseTotalInLayer: total ?? 0,
        pairwisePassed,
      });
    } catch (e) {
      // 予測失敗は証拠不足として保留する。positive evidence なしでは通さない。
      const err = e as HitPredictorError | Error;
      return {
        passed: false,
        rating,
        matchCount,
        finalized,
        rank,
        totalInLayer: total,
        reason: `hit_probability_unavailable:${err.message.slice(0, 80)}`,
      };
    }
  }

  const passed = pairwisePassed && v12Passed;
  const reason =
    v12Reason ? v12Reason
    : !pairwisePassed ? `elo_below_${passElo.toFixed(0)}`
    : undefined;

  return {
    passed,
    rating,
    matchCount,
    finalized,
    rank,
    totalInLayer: total,
    reason,
    hitProbability,
    hitTier,
  };
}

interface ScreeningResultRecord extends HitPredictionResult {
  pairwiseRating: number;
  pairwiseRank: number;
  pairwiseTotalInLayer: number;
  pairwisePassed: boolean;
}

function writeScreeningResult(
  slug: string,
  worksDir: string,
  record: ScreeningResultRecord,
): void {
  const path = join(worksDir, slug, "screening_result.json");
  writeFileSync(path, JSON.stringify(record, null, 2));
}

export { MATCH_THRESHOLD };
