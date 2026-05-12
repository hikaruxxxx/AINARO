import type { VolumeValidationResult } from "./episode-metrics";

export type L2CrossRefSummary = {
  l2_seed_count: number;
  l2_this_episode_count: number;
  l2_cross_episode_count: number;
  sg_seed_count: number;
  sg_resolved_count: number;
  sg_unresolved_count: number;
  warnings: string[];
};

type VolumePlotForeshadow = {
  seed_in_episode: number;
  payoff_in_episode: number;
  description: string;
};

/**
 * volume_plot.foreshadow_map と scene_graph 由来の volume DAG result を突き合わせ、
 * 件数差分のサマリと警告メッセージを返す。
 *
 * token と description は形式が揃わないため、件数と hint 分布で coarse に整合を見る。
 */
export function summarizeL2CrossRef(
  volumePlotForeshadowMap: VolumePlotForeshadow[],
  volumeDagResult: VolumeValidationResult
): L2CrossRefSummary {
  const l2_seed_count = volumePlotForeshadowMap.length;
  const l2_this_episode_count = volumePlotForeshadowMap.filter(
    (f) => f.seed_in_episode === f.payoff_in_episode
  ).length;
  const l2_cross_episode_count = volumePlotForeshadowMap.filter(
    (f) => f.payoff_in_episode > f.seed_in_episode
  ).length;

  const sg_seed_count = volumeDagResult.dag.items.filter((i) => i.setup_at !== null).length;
  const sg_resolved_count = volumeDagResult.dag.items.filter(
    (i) => i.payoff_at !== null && i.setup_at !== null
  ).length;
  const sg_unresolved_count = volumeDagResult.dag.unresolved_in_volume.length;

  const warnings: string[] = [];

  // 巻全体での伏線数が L2 設計と大きく異なる場合だけ警告する。
  if (sg_seed_count < l2_seed_count - 3 || sg_seed_count > l2_seed_count * 2 + 3) {
    warnings.push(
      `volume foreshadow count mismatch: L2 expects ${l2_seed_count} seeds, scene_graphs have ${sg_seed_count} setups (${sg_seed_count > l2_seed_count ? "over-foreshadowed" : "under-foreshadowed"})`
    );
  }

  // cross_volume 由来の未回収は L2 から厳密推定できないため、過剰な場合のみ警告する。
  if (sg_unresolved_count > l2_cross_episode_count + 3) {
    warnings.push(
      `too many unresolved-in-volume foreshadows: ${sg_unresolved_count} (L2 cross-episode foreshadows: ${l2_cross_episode_count})`
    );
  }

  return {
    l2_seed_count,
    l2_this_episode_count,
    l2_cross_episode_count,
    sg_seed_count,
    sg_resolved_count,
    sg_unresolved_count,
    warnings,
  };
}

export function formatL2CrossRef(s: L2CrossRefSummary): string {
  const lines: string[] = [];
  lines.push("L2 design:");
  lines.push(`  - total foreshadows: ${s.l2_seed_count}`);
  lines.push(`  - in-episode (seed === payoff): ${s.l2_this_episode_count}`);
  lines.push(`  - cross-episode (seed < payoff): ${s.l2_cross_episode_count}`);
  lines.push("scene_graph reality:");
  lines.push(`  - total setups: ${s.sg_seed_count}`);
  lines.push(`  - resolved (setup + payoff in vol): ${s.sg_resolved_count}`);
  lines.push(`  - unresolved (cross_volume): ${s.sg_unresolved_count}`);
  if (s.warnings.length > 0) {
    lines.push("L2 cross-ref warnings:");
    for (const w of s.warnings) lines.push(`  ⚠ ${w}`);
  } else {
    lines.push("L2 cross-ref: ok (件数差は許容範囲内)");
  }
  return lines.join("\n");
}
