import { describe, expect, it } from "vitest";
import type { VolumeValidationResult } from "./episode-metrics";
import { formatL2CrossRef, summarizeL2CrossRef } from "./volume-foreshadow-l2-crossref";

function dummyDag(
  sg_seeds: number,
  resolved: number,
  unresolved: number
): VolumeValidationResult {
  return {
    ok: true,
    errors: [],
    warnings: [],
    dag: {
      items: Array.from({ length: sg_seeds }, (_, i) => ({
        token: `F_${i}`,
        setup_at: { episode_id: "ep01", scene_id: "S01", hint: "later_in_volume" as const },
        payoff_at: i < resolved ? { episode_id: "ep05", scene_id: "S01" } : null,
      })),
      unresolved_in_volume: Array.from({ length: unresolved }, (_, i) => ({
        token: `F_cross_${i}`,
        setup_at: { episode_id: "ep08", scene_id: "S01", hint: "cross_volume" as const },
        payoff_at: null,
      })),
      payoff_without_setup: [],
      hint_violations: [],
    },
  };
}

describe("summarizeL2CrossRef — L2 foreshadow_map と volume dag の件数比較", () => {
  it("L2 と scene_graph が一致しているケース (no warning)", () => {
    const l2 = [
      { seed_in_episode: 1, payoff_in_episode: 5, description: "x" },
      { seed_in_episode: 2, payoff_in_episode: 8, description: "y" },
      { seed_in_episode: 3, payoff_in_episode: 3, description: "z" },
    ];
    const dag = dummyDag(3, 3, 0);
    const s = summarizeL2CrossRef(l2, dag);
    expect(s.l2_seed_count).toBe(3);
    expect(s.l2_this_episode_count).toBe(1);
    expect(s.l2_cross_episode_count).toBe(2);
    expect(s.sg_seed_count).toBe(3);
    expect(s.warnings).toHaveLength(0);
  });

  it("scene_graph が L2 より大幅に多い → over-foreshadowed warning", () => {
    const l2 = [{ seed_in_episode: 1, payoff_in_episode: 5, description: "x" }];
    const dag = dummyDag(15, 5, 0);
    const s = summarizeL2CrossRef(l2, dag);
    expect(s.warnings.some((w) => w.includes("over-foreshadowed"))).toBe(true);
  });

  it("scene_graph が L2 より大幅に少ない → under-foreshadowed warning", () => {
    const l2 = Array.from({ length: 10 }, (_, i) => ({
      seed_in_episode: 1,
      payoff_in_episode: i + 2,
      description: "x",
    }));
    const dag = dummyDag(2, 2, 0);
    const s = summarizeL2CrossRef(l2, dag);
    expect(s.warnings.some((w) => w.includes("under-foreshadowed"))).toBe(true);
  });

  it("unresolved が L2 cross-episode より過剰 → too many unresolved warning", () => {
    const l2 = [{ seed_in_episode: 1, payoff_in_episode: 5, description: "x" }];
    const dag = dummyDag(8, 0, 8);
    const s = summarizeL2CrossRef(l2, dag);
    expect(s.warnings.some((w) => w.includes("too many unresolved"))).toBe(true);
  });

  it("formatL2CrossRef: 主要 section が含まれる", () => {
    const l2 = [{ seed_in_episode: 1, payoff_in_episode: 1, description: "x" }];
    const dag = dummyDag(1, 1, 0);
    const s = summarizeL2CrossRef(l2, dag);
    const text = formatL2CrossRef(s);
    expect(text).toContain("L2 design:");
    expect(text).toContain("scene_graph reality:");
  });
});
