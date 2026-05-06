/**
 * Episode-level Metrics 集計 (Phase β B4)
 *
 * scene-graph 全体に対して以下の指標を計算する:
 *   - foreshadow_dag: setup / payoff の整合 (schema.ts の buildForeshadowDag を再利用)
 *   - pacing_curve: page_budget × beat の盛り上がりカーブ。anchor pool との比較で in_anchor_range を判定
 *   - template_collision_avg: scene 列シグネチャのハッシュベース簡易検出 (B4-2 で LLM 採点に拡張)
 *   - pattern_match: episode-pattern 辞書との照合 (B4-2 LLM)
 *   - relationship_terminal_consistency: 巻終了到達点 (volume_plot) との一致 (B4-2 で wire)
 *
 * 仕様: docs/plans/manga/scene-graph-l3-5.md "B4 episode 全体採点"
 */

import type {
  SceneGraphV1,
  Scene,
  EpisodeMetrics,
  ForeshadowDag,
} from "./schema";
import { buildForeshadowDag } from "./schema";

// ============================================================================
// Top-level entry
// ============================================================================

export type ComputeMetricsOptions = {
  /** 期待する volume 終了時の relationship 状態 (volume_plot 由来、未指定なら check スキップ) */
  expectedTerminalRelations?: Array<{
    pair: [string, string];
    final_intensity: number;
  }>;
  /** anchor pool 由来の pacing カーブ (未指定なら deviation_score=0、in_anchor_range=true) */
  anchorPacingProfile?: PacingProfile;
};

export function computeEpisodeMetrics(
  sceneGraph: SceneGraphV1,
  options?: ComputeMetricsOptions
): EpisodeMetrics {
  const foreshadow_dag = buildForeshadowDag(sceneGraph);
  const pacing = computePacingCurve(sceneGraph, options?.anchorPacingProfile);
  const template = computeTemplateCollision(sceneGraph);
  const relationship_terminal_consistency = checkRelationshipTerminal(
    sceneGraph,
    options?.expectedTerminalRelations
  );
  return {
    pattern_match: { matched_pattern_id: "(B4-2: LLM 照合未実装)", distance: 0 },
    template_collision_avg: template.avg,
    foreshadow_dag,
    pacing_curve: pacing,
    relationship_terminal_consistency,
  };
}

// ============================================================================
// pacing_curve
// ============================================================================

export type PacingProfile = {
  /** 各 scene の (arc_position_normalized, importance_score) ペア */
  curve: Array<{ position: number; intensity: number }>;
};

/**
 * scene-graph から「intensity = page_budget.preferred * beat_weight」のカーブを作り、
 * anchor pool プロファイル (オプション) と RMSE を計算する。
 */
export function computePacingCurve(
  sceneGraph: SceneGraphV1,
  anchorProfile?: PacingProfile
): EpisodeMetrics["pacing_curve"] {
  const curve = sceneGraph.scenes.map((s) => ({
    position: s.arc_position.arc_position_normalized,
    intensity: pickIntensityForScene(s),
  }));
  if (!anchorProfile || anchorProfile.curve.length === 0) {
    return { in_anchor_range: true, deviation_score: 0 };
  }
  // 簡易: position が近い anchor 点との intensity 差の RMSE
  let sumSq = 0;
  let count = 0;
  for (const p of curve) {
    const nearest = nearestAnchorPoint(anchorProfile.curve, p.position);
    if (!nearest) continue;
    const diff = p.intensity - nearest.intensity;
    sumSq += diff * diff;
    count++;
  }
  const rmse = count > 0 ? Math.sqrt(sumSq / count) : 0;
  return {
    in_anchor_range: rmse <= 1.5, // anchor との 1.5 ポイント差以内なら範囲内
    deviation_score: round2(rmse),
  };
}

function pickIntensityForScene(scene: Scene): number {
  const beatWeight: Record<Scene["beat_type"], number> = {
    introduce: 1.5,
    setup: 2.0,
    reveal: 3.5,
    turn: 3.0,
    payoff: 4.5,
    cliff: 5.0,
    aftermath: 2.5,
    transition: 1.0,
  };
  return scene.page_budget.preferred * (beatWeight[scene.beat_type] ?? 2.0);
}

function nearestAnchorPoint(
  anchorCurve: Array<{ position: number; intensity: number }>,
  position: number
): { position: number; intensity: number } | null {
  let best: { position: number; intensity: number } | null = null;
  let bestDist = Infinity;
  for (const p of anchorCurve) {
    const d = Math.abs(p.position - position);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

// ============================================================================
// template_collision (簡易: シグネチャ Jaccard)
// ============================================================================

export function computeTemplateCollision(
  sceneGraph: SceneGraphV1
): { avg: number; signature: string } {
  // シグネチャ: scene 列 ((location_id, beat_type, mode) のタプルを連結)
  const sig = sceneGraph.scenes
    .map((s) => `${s.location_id}|${s.beat_type}|${s.mode}`)
    .join(" → ");
  // B4-1 段階では既存作テンプレートとの LLM 比較は未実装。
  // 自己 collision は 0、外部 anchor pool との比較は B4-2 で実装。
  return { avg: 0, signature: sig };
}

// ============================================================================
// relationship_terminal_consistency
// ============================================================================

export function checkRelationshipTerminal(
  sceneGraph: SceneGraphV1,
  expected?: ComputeMetricsOptions["expectedTerminalRelations"]
): boolean {
  if (!expected || expected.length === 0) return true;
  // 各 pair の delta intensity を episode 全体で累積
  const accum = new Map<string, number>();
  for (const scene of sceneGraph.scenes) {
    for (const r of scene.relationship_state_delta) {
      const key = pairKey(r.pair);
      accum.set(key, (accum.get(key) ?? 0) + r.intensity);
    }
  }
  // 期待する終了 intensity と累積値が ±1 以内に収まるか
  for (const exp of expected) {
    const key = pairKey(exp.pair);
    const v = accum.get(key) ?? 0;
    if (Math.abs(v - exp.final_intensity) > 1) return false;
  }
  return true;
}

function pairKey(pair: [string, string]): string {
  return [...pair].sort().join("|");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// 簡易レポート (CLI 出力用)
// ============================================================================

export function formatMetricsReport(metrics: EpisodeMetrics): string {
  const dag = metrics.foreshadow_dag;
  const lines: string[] = [];
  lines.push(`pattern_match: ${metrics.pattern_match.matched_pattern_id} (distance=${metrics.pattern_match.distance})`);
  lines.push(`template_collision_avg: ${metrics.template_collision_avg}`);
  lines.push(`pacing_curve: in_anchor_range=${metrics.pacing_curve.in_anchor_range} deviation=${metrics.pacing_curve.deviation_score}`);
  lines.push(`relationship_terminal_consistency: ${metrics.relationship_terminal_consistency}`);
  lines.push(
    `foreshadow_dag: setups=${dag.setup_count} payoffs=${dag.payoff_count} orphans=${dag.orphan_setups.length} payoff_without_setup=${dag.payoff_without_setup.length} pending=${dag.pending_cross_episode.length}`
  );
  return lines.join("\n");
}
