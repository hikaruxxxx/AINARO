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
  PayoffEpisodeHint,
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
// Volume-level Cross-Episode Foreshadow DAG (Phase γ)
// ============================================================================

export type VolumeForeshadowItem = {
  token: string;
  /** setup 位置 (episode_id, scene_id) */
  setup_at: { episode_id: string; scene_id: string; hint: PayoffEpisodeHint } | null;
  /** payoff 位置 (episode_id, scene_id) */
  payoff_at: { episode_id: string; scene_id: string } | null;
};

export type VolumeForeshadowDag = {
  /** 全 setup token -> entry */
  items: VolumeForeshadowItem[];
  /** 巻内で setup されたが、巻内のいずれの episode でも payoff されていない token */
  unresolved_in_volume: VolumeForeshadowItem[];
  /** setup 無しで payoff だけが現れる token (異常) */
  payoff_without_setup: VolumeForeshadowItem[];
  /** payoff_episode_hint と実際の payoff 位置が矛盾する token (例: this_episode hint なのに次話で payoff) */
  hint_violations: Array<{ item: VolumeForeshadowItem; expected: PayoffEpisodeHint; actual: string }>;
};

export type VolumeValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  dag: VolumeForeshadowDag;
};

/**
 * 巻全体 (volume = N episode) の foreshadow DAG を検査する。
 *
 * 入力: episode 番号順に並んだ SceneGraphV1[]。
 *   - episode_in_volume は scene.arc_position.episode_in_volume から自動推定
 *
 * 検査項目:
 *   1. setup された全 token が、payoff_episode_hint の指定範囲内で payoff されているか
 *      - this_episode: 同 episode 内で payoff
 *      - next_episode: setup_episode + 1 で payoff
 *      - later_in_volume: setup_episode 以降の任意の episode で payoff
 *      - cross_volume: 当 volume 内の payoff は不要、unresolved_in_volume に積む
 *   2. setup 無しで現れる payoff は error
 *   3. 同 volume 内で payoff されていない this_episode/next_episode hint は error
 *   4. later_in_volume/cross_volume は warning として扱い、巻末に達した時点で解決の有無を集計
 */
export function computeVolumeForeshadowDag(
  volume_episodes: SceneGraphV1[]
): VolumeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // setup の登録: token -> { episode_id, scene_id, hint }
  const setups = new Map<
    string,
    { episode_id: string; scene_id: string; episode_index: number; hint: PayoffEpisodeHint }
  >();
  // payoff の登録: token -> [{ episode_id, scene_id, episode_index }]
  const payoffs = new Map<
    string,
    Array<{ episode_id: string; scene_id: string; episode_index: number }>
  >();

  for (let epIdx = 0; epIdx < volume_episodes.length; epIdx++) {
    const ep = volume_episodes[epIdx];
    for (const scene of ep.scenes) {
      for (const f of scene.foreshadow_setup) {
        if (setups.has(f.token)) {
          warnings.push(
            `setup duplicated: "${f.token}" first at ${setups.get(f.token)!.episode_id}/${setups.get(f.token)!.scene_id}, also at ${ep.episode_id}/${scene.scene_id}`
          );
          continue;
        }
        setups.set(f.token, {
          episode_id: ep.episode_id,
          scene_id: scene.scene_id,
          episode_index: epIdx,
          hint: f.payoff_episode_hint,
        });
      }
      for (const p of scene.foreshadow_payoff) {
        const arr = payoffs.get(p) ?? [];
        arr.push({ episode_id: ep.episode_id, scene_id: scene.scene_id, episode_index: epIdx });
        payoffs.set(p, arr);
      }
    }
  }

  const items: VolumeForeshadowItem[] = [];
  const unresolved_in_volume: VolumeForeshadowItem[] = [];
  const payoff_without_setup: VolumeForeshadowItem[] = [];
  const hint_violations: VolumeValidationResult["dag"]["hint_violations"] = [];

  // setup 側の処理
  for (const [token, s] of setups) {
    const payoffArr = payoffs.get(token) ?? [];
    const firstPayoff = payoffArr[0]; // 最初の payoff を採用 (setup 後の最初の出現)
    const item: VolumeForeshadowItem = {
      token,
      setup_at: { episode_id: s.episode_id, scene_id: s.scene_id, hint: s.hint },
      payoff_at: firstPayoff
        ? { episode_id: firstPayoff.episode_id, scene_id: firstPayoff.scene_id }
        : null,
    };
    items.push(item);

    if (!firstPayoff) {
      if (s.hint === "this_episode" || s.hint === "next_episode") {
        errors.push(
          `${s.episode_id}/${s.scene_id}: foreshadow_setup "${token}" hint=${s.hint} but no payoff in volume`
        );
      } else if (s.hint === "later_in_volume") {
        errors.push(
          `${s.episode_id}/${s.scene_id}: foreshadow_setup "${token}" hint=later_in_volume but no payoff anywhere in volume`
        );
      } else {
        // cross_volume: 当 volume 内の payoff は不要、保留
        unresolved_in_volume.push(item);
      }
      continue;
    }

    // payoff_episode_hint と実際の位置を照合
    const epDiff = firstPayoff.episode_index - s.episode_index;
    if (s.hint === "this_episode" && epDiff !== 0) {
      hint_violations.push({
        item,
        expected: "this_episode",
        actual: `payoff at ep_index ${firstPayoff.episode_index}, setup at ${s.episode_index}`,
      });
      errors.push(
        `${s.episode_id}/${s.scene_id}: foreshadow_setup "${token}" hint=this_episode but payoff is in ${firstPayoff.episode_id}`
      );
    } else if (s.hint === "next_episode" && epDiff !== 1) {
      hint_violations.push({
        item,
        expected: "next_episode",
        actual: `payoff at ep_index ${firstPayoff.episode_index}, setup at ${s.episode_index} (diff ${epDiff})`,
      });
      warnings.push(
        `${s.episode_id}/${s.scene_id}: foreshadow_setup "${token}" hint=next_episode but payoff diff ${epDiff} (${firstPayoff.episode_id})`
      );
    } else if (s.hint === "later_in_volume" && epDiff <= 0) {
      hint_violations.push({
        item,
        expected: "later_in_volume",
        actual: `payoff before setup (diff ${epDiff})`,
      });
      errors.push(
        `${s.episode_id}/${s.scene_id}: foreshadow_setup "${token}" hint=later_in_volume but payoff is at or before setup`
      );
    }
  }

  // setup 無しで payoff のみ存在する token
  for (const [token, payoffArr] of payoffs) {
    if (setups.has(token)) continue;
    const first = payoffArr[0];
    const item: VolumeForeshadowItem = {
      token,
      setup_at: null,
      payoff_at: { episode_id: first.episode_id, scene_id: first.scene_id },
    };
    items.push(item);
    payoff_without_setup.push(item);
    errors.push(
      `${first.episode_id}/${first.scene_id}: payoff "${token}" has no setup in volume`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    dag: { items, unresolved_in_volume, payoff_without_setup, hint_violations },
  };
}

export function formatVolumeDagReport(dag: VolumeForeshadowDag): string {
  const lines: string[] = [];
  lines.push(`total foreshadow items: ${dag.items.length}`);
  lines.push(
    `resolved in volume: ${dag.items.filter((i) => i.payoff_at).length}, unresolved (cross_volume): ${dag.unresolved_in_volume.length}, payoff_without_setup: ${dag.payoff_without_setup.length}, hint_violations: ${dag.hint_violations.length}`
  );
  if (dag.unresolved_in_volume.length > 0) {
    lines.push("");
    lines.push("=== unresolved in volume (cross_volume hint) ===");
    for (const i of dag.unresolved_in_volume) {
      lines.push(
        `  ${i.token}: setup at ${i.setup_at?.episode_id}/${i.setup_at?.scene_id} (hint=${i.setup_at?.hint})`
      );
    }
  }
  if (dag.hint_violations.length > 0) {
    lines.push("");
    lines.push("=== hint violations ===");
    for (const v of dag.hint_violations) {
      lines.push(`  ${v.item.token}: expected=${v.expected}, ${v.actual}`);
    }
  }
  return lines.join("\n");
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
