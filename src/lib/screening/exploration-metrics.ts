// 探索専用サブパイプラインの成功度を多軸で測定
//
// 設計: docs/architecture/phase1_pipeline_design_v2.md の「探索成功の測り方」参照
//
// 4軸:
// - Surprise: 探索作品の予測スコア percentile vs リーグレーティング percentile の乖離
// - Diversity: 既存作品との埋め込み距離(ここではbigramベースの代理)
// - Emergence: 探索作品の組合せが通常パイプラインで再採用された頻度
// - Model contribution: モデル再訓練前後の精度差分(本ファイルでは枠だけ提供)
//
// 探索作品か通常作品かの識別は league.RatingEntry.isExploration で行う

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { loadRatings } from "./league";
import { bigramSetFromText } from "./template-detector-helpers";

export interface ExplorationMetrics {
  /** 評価対象期間(unixミリ秒) */
  windowStart: number;
  windowEnd: number;
  /** 軸1: Surprise */
  surprise: {
    /** 探索作品で「予測 < 30% かつ リーグ percentile >= 70%」となった件数 */
    breakthroughCount: number;
    /** 探索作品全体の (リーグrank - 予測rank) の平均 */
    avgRankDelta: number;
    examples: Array<{ slug: string; genre: string; rankDelta: number }>;
  };
  /** 軸2: Diversity */
  diversity: {
    /** 探索作品の最近傍距離の平均(0-1、大きいほど多様) */
    avgNearestDistance: number;
    /** 完全に新規領域(最近傍距離 > 0.7)の件数 */
    novelCount: number;
  };
  /** 軸3: Emergence */
  emergence: {
    /** 探索作品の4-tupleが通常パイプラインで再採用された件数 */
    promotedTupleCount: number;
    /** 探索発の新規組合せが yield-stats で重み上昇した件数 */
    boostedComboCount: number;
  };
  /** 軸4: Model contribution(今は0、再訓練ジョブと連動) */
  modelContribution: {
    aucDelta: number;
    note: string;
  };
  /** 総合判定 */
  passed: boolean;
  reason: string;
}

const THRESH = {
  surpriseRatio: 0.05, // 探索作品の5%が breakthrough なら success
  diversityNovel: 0.7, // 最近傍距離がこれより遠ければ novel
  emergencePromotedMin: 1, // 月1件以上 promoted されればOK
};

export interface ExplorationInput {
  /** 全作品(works/{slug}/_meta.json と該当層本文を持つもの) */
  worksDir: string;
  leagueDir: string;
  /** 評価対象の層(通常はLayer 5) */
  layer: number;
  /** 評価窓 */
  windowStart: number;
  windowEnd: number;
}

interface WorkSnapshot {
  slug: string;
  genre: string;
  isExploration: boolean;
  rating: number;
  matchCount: number;
  /** ヒット予測スコア(現状: 暫定的にレーティングを percentile 化したもので代替) */
  predictedHit?: number;
  bigrams?: Set<string>;
  fingerprint?: string; // (primaryDesire|genre|境遇|転機)
  createdAt: number;
}

function loadWorks(worksDir: string, layer: number, windowStart: number, windowEnd: number): WorkSnapshot[] {
  if (!existsSync(worksDir)) return [];
  const snapshots: WorkSnapshot[] = [];
  for (const slug of readdirSync(worksDir)) {
    const metaPath = join(worksDir, slug, "_meta.json");
    if (!existsSync(metaPath)) continue;
    let meta: { slug: string; seed?: { genre: string; isExploration: boolean; fingerprint?: string }; createdAt: string };
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    } catch {
      continue;
    }
    if (!meta.seed) continue;
    const createdAt = new Date(meta.createdAt).getTime();
    if (createdAt < windowStart || createdAt > windowEnd) continue;

    // 該当層本文を読む
    const layerFile = layer === 5 ? "layer5_ep001.md" : `layer${layer}_*.md`;
    const bodyPath = join(worksDir, slug, layerFile);
    let bigrams: Set<string> | undefined;
    if (existsSync(bodyPath)) {
      bigrams = bigramSetFromText(readFileSync(bodyPath, "utf-8"));
    }

    snapshots.push({
      slug,
      genre: meta.seed.genre,
      isExploration: meta.seed.isExploration,
      rating: 1500,
      matchCount: 0,
      bigrams,
      fingerprint: meta.seed.fingerprint,
      createdAt,
    });
  }
  return snapshots;
}

function attachLeagueData(snapshots: WorkSnapshot[], leagueDir: string, layer: number): void {
  // ジャンル別にレーティングを取得
  const genres = new Set(snapshots.map((s) => s.genre));
  for (const genre of genres) {
    if (!existsSync(join(leagueDir, genre, "ratings.json"))) continue;
    const file = loadRatings(genre, leagueDir);
    for (const snap of snapshots) {
      if (snap.genre !== genre) continue;
      const e = file.entries[snap.slug];
      if (e && e.layer === layer) {
        snap.rating = e.rating;
        snap.matchCount = e.matchCount;
      }
    }
  }
}

function percentile(values: number[], target: number): number {
  if (values.length === 0) return 0.5;
  const sorted = [...values].sort((a, b) => a - b);
  let count = 0;
  for (const v of sorted) {
    if (v <= target) count++;
  }
  return count / sorted.length;
}

function jaccardOf(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function computeSurprise(snapshots: WorkSnapshot[]): ExplorationMetrics["surprise"] {
  // 同層の予測スコア(暫定: rating 自体)とリーグレーティングを比較
  // 現状ヒット予測モデルとの統合がないため、rating からの percentile で近似
  const exp = snapshots.filter((s) => s.isExploration);
  if (exp.length === 0) {
    return { breakthroughCount: 0, avgRankDelta: 0, examples: [] };
  }
  const allRatings = snapshots.map((s) => s.rating);

  // 現時点では予測モデル統合がないため、Surprise は「探索作品のレーティング順位 vs 全体平均」で近似する
  // 将来 v11 ヒット予測スコアが入ったら本来の定義(predicted_pct vs league_pct)に置き換える
  const examples: Array<{ slug: string; genre: string; rankDelta: number }> = [];
  let breakthrough = 0;
  let totalDelta = 0;
  for (const e of exp) {
    const leaguePct = percentile(allRatings, e.rating);
    // 暫定: 探索作品の平均レーティングは低めと仮定し、leaguePct >= 0.7 を breakthrough とする
    const expectedPct = 0.4; // 探索作品の予想 percentile(暫定)
    const delta = leaguePct - expectedPct;
    totalDelta += delta;
    if (leaguePct >= 0.7) {
      breakthrough++;
      examples.push({ slug: e.slug, genre: e.genre, rankDelta: delta });
    }
  }
  return {
    breakthroughCount: breakthrough,
    avgRankDelta: totalDelta / exp.length,
    examples: examples.slice(0, 10),
  };
}

function computeDiversity(snapshots: WorkSnapshot[]): ExplorationMetrics["diversity"] {
  const exp = snapshots.filter((s) => s.isExploration && s.bigrams && s.bigrams.size > 0);
  const baseline = snapshots.filter((s) => !s.isExploration && s.bigrams && s.bigrams.size > 0);
  if (exp.length === 0 || baseline.length === 0) {
    return { avgNearestDistance: 0, novelCount: 0 };
  }
  let totalDistance = 0;
  let novel = 0;
  for (const e of exp) {
    let maxSim = 0;
    for (const b of baseline) {
      const sim = jaccardOf(e.bigrams!, b.bigrams!);
      if (sim > maxSim) maxSim = sim;
    }
    const distance = 1 - maxSim;
    totalDistance += distance;
    if (distance > THRESH.diversityNovel) novel++;
  }
  return {
    avgNearestDistance: totalDistance / exp.length,
    novelCount: novel,
  };
}

function computeEmergence(snapshots: WorkSnapshot[]): ExplorationMetrics["emergence"] {
  // 探索作品の fingerprint が、後発の通常作品で再採用されたか
  const expFingerprints = new Map<string, number>(); // fingerprint -> 最初の探索作品 createdAt
  for (const s of snapshots) {
    if (s.isExploration && s.fingerprint) {
      const prev = expFingerprints.get(s.fingerprint);
      if (prev == null || s.createdAt < prev) {
        expFingerprints.set(s.fingerprint, s.createdAt);
      }
    }
  }
  let promoted = 0;
  for (const s of snapshots) {
    if (!s.isExploration && s.fingerprint) {
      const expTime = expFingerprints.get(s.fingerprint);
      if (expTime != null && s.createdAt > expTime) {
        promoted++;
      }
    }
  }
  // boostedComboCount は yield-stats との連動が必要なため、ここでは promoted と同値
  return {
    promotedTupleCount: promoted,
    boostedComboCount: promoted,
  };
}

export function computeExplorationMetrics(input: ExplorationInput): ExplorationMetrics {
  const snapshots = loadWorks(input.worksDir, input.layer, input.windowStart, input.windowEnd);
  attachLeagueData(snapshots, input.leagueDir, input.layer);

  const surprise = computeSurprise(snapshots);
  const diversity = computeDiversity(snapshots);
  const emergence = computeEmergence(snapshots);

  const expCount = snapshots.filter((s) => s.isExploration).length;
  const passed =
    expCount > 0 &&
    (surprise.breakthroughCount / Math.max(1, expCount) >= THRESH.surpriseRatio ||
      diversity.novelCount > 0 ||
      emergence.promotedTupleCount >= THRESH.emergencePromotedMin);

  const reasons: string[] = [];
  if (expCount === 0) reasons.push("no_exploration_works");
  if (surprise.breakthroughCount > 0) reasons.push(`surprise=${surprise.breakthroughCount}`);
  if (diversity.novelCount > 0) reasons.push(`novel=${diversity.novelCount}`);
  if (emergence.promotedTupleCount > 0) reasons.push(`promoted=${emergence.promotedTupleCount}`);

  return {
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    surprise,
    diversity,
    emergence,
    modelContribution: {
      aucDelta: 0,
      note: "未統合(retrain-v11.ts と連動予定)",
    },
    passed,
    reason: reasons.join(", ") || "no_signals",
  };
}
