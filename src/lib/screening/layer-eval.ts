// 層別ペアワイズ評価: 各層の生成完了後にリーグへ登録し、近傍比較を実行
//
// 役割:
// - 作品の本文(該当層)を読む
// - 同ジャンル・同層の対戦相手を引く
// - claude -p で比較プロンプトを実行
// - レーティング更新
// - 通過判定: 「上位 PASS_RATIO 以内に入っているか」で次層への進行を決める

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { runPairwiseRound, MATCH_THRESHOLD } from "./pairwise";
import { getRanking } from "./league";
import { callClaudeCli } from "./claude-cli";
import type { LlmCallFn } from "./llm-compare";
import type { LayerId } from "./work-queue";
import { runHitPredictorV12, V12_PASS_THRESHOLD, HitPredictorError, type HitPredictionResult } from "./hit-predictor-v12";

/**
 * 各層の通過率(階層的バランス: 上流多様性、下流品質)。
 * Layer 5 はペアワイズの基準を上位50%に緩め、v12 スコア≥25% との AND 判定で通す。
 */
export const LAYER_PASS_RATIO: Record<LayerId, number> = {
  1: 0.8,
  2: 0.5,
  3: 0.5,
  4: 0.4,
  5: 0.5,
  6: 1.0,
};

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
 * - 確定後、同層内のレーティング順位を計算
 * - 上位 LAYER_PASS_RATIO[layer] に入っていれば passed=true
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

  // Layer 2 も素通し(04-24 試験: L3/L4が既にcold_start_passで実質素通しなので、
  // L2も評価せずL5でまとめて絞る設計に変更。layer2_compareのLLM呼び出しを削減)
  if (layer === 2) {
    return { passed: true, rating: 1500, matchCount: 0, finalized: false, reason: "layer2_skip_trial" };
  }

  const text = loadLayerText(slug, layer, worksDir);
  if (!text) {
    return { passed: false, rating: 1500, matchCount: 0, finalized: false, reason: "text_missing" };
  }

  // 対戦相手のテキストを読み込む関数
  // Layer2以上: 対戦相手は冒頭2000字に制限（自作品は全文で比較される）
  // 04-24: layer2-4にも拡張。比較入力サイズを抑えてOpus枠を温存
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

  // 確定までは進めず、1ラウンド分の比較で current rating を取る
  // (常時稼働なので確定は時間とともに自然に進む)

  // 同層のランキングで自分の順位を確認
  const ranking = getRanking(genre, layer);
  const total = ranking.length;
  const myIndex = ranking.findIndex((e) => e.slug === slug);
  const rank = myIndex >= 0 ? myIndex + 1 : total;

  // 通過判定: 上位 PASS_RATIO 以内
  // 同層内に対戦相手がほぼいない初期状態(N<5)では「未確定なら通過」を採用(コールドスタート)
  const passRatio = LAYER_PASS_RATIO[layer];
  let pairwisePassed = false;
  if (total < 5) {
    pairwisePassed = true; // コールドスタート
  } else {
    const cutoffRank = Math.max(1, Math.ceil(total * passRatio));
    pairwisePassed = rank <= cutoffRank;
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
      v12Passed = hitProbability >= V12_PASS_THRESHOLD;
      if (!v12Passed) v12Reason = `v12_below_${V12_PASS_THRESHOLD}`;
      writeScreeningResult(slug, worksDir, {
        ...result,
        pairwiseRating: round.rating,
        pairwiseRank: rank,
        pairwiseTotalInLayer: total,
        pairwisePassed,
      });
    } catch (e) {
      // 予測失敗は「評価エラー」として扱い、ペアワイズ結果のみで判定（v12 は pass 扱い）
      const err = e as HitPredictorError | Error;
      v12Reason = `v12_error:${err.message.slice(0, 80)}`;
    }
  }

  const passed = pairwisePassed && v12Passed;
  const reason =
    total < 5 ? "cold_start_pass"
    : v12Reason ? v12Reason
    : undefined;

  return {
    passed,
    rating: round.rating,
    matchCount: round.matchCount,
    finalized: round.finalized,
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
