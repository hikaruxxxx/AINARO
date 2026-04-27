import { describe, it, expect } from "vitest";
import {
  estimateCandidateElo,
  planAnchorMatches,
  type CandidateVsAnchorMatch,
  type AnchorRatingEntry,
} from "./anchor-eval";

describe("estimateCandidateElo", () => {
  it("returns 1500 for empty matches (no info)", () => {
    expect(estimateCandidateElo([])).toBe(1500);
  });

  it("converges to anchor rating when 50/50 wins/losses against equal-rating anchors", () => {
    const matches: CandidateVsAnchorMatch[] = [
      { anchorRating: 1500, outcome: "candidate" },
      { anchorRating: 1500, outcome: "candidate" },
      { anchorRating: 1500, outcome: "anchor" },
      { anchorRating: 1500, outcome: "anchor" },
    ];
    const elo = estimateCandidateElo(matches);
    expect(elo).toBeGreaterThan(1499);
    expect(elo).toBeLessThan(1501);
  });

  it("places candidate above hit anchors when candidate wins all", () => {
    // 全勝 → 退化処理で meanAnchor + 400 を返す
    const matches: CandidateVsAnchorMatch[] = [
      { anchorRating: 1500, outcome: "candidate" },
      { anchorRating: 1600, outcome: "candidate" },
      { anchorRating: 1700, outcome: "candidate" },
    ];
    const elo = estimateCandidateElo(matches);
    expect(elo).toBeGreaterThan(1900);
  });

  it("places candidate below low anchors when candidate loses all", () => {
    const matches: CandidateVsAnchorMatch[] = [
      { anchorRating: 1100, outcome: "anchor" },
      { anchorRating: 1200, outcome: "anchor" },
      { anchorRating: 1300, outcome: "anchor" },
    ];
    const elo = estimateCandidateElo(matches);
    expect(elo).toBeLessThan(900);
  });

  it("places candidate near hit median when beats middle, loses to hit", () => {
    // hit=1500, middle=1300, candidate beats middle 1勝, loses to hit 1敗
    // 期待: candidate Elo は middle と hit の間に位置する
    const matches: CandidateVsAnchorMatch[] = [
      { anchorRating: 1500, outcome: "anchor" }, // hit に負け
      { anchorRating: 1300, outcome: "candidate" }, // middle に勝ち
    ];
    const elo = estimateCandidateElo(matches);
    expect(elo).toBeGreaterThan(1300);
    expect(elo).toBeLessThan(1500);
  });

  it("treats ties as 0.5 (no movement against equal anchor)", () => {
    const matches: CandidateVsAnchorMatch[] = [
      { anchorRating: 1500, outcome: "tie" },
      { anchorRating: 1500, outcome: "tie" },
    ];
    const elo = estimateCandidateElo(matches);
    expect(elo).toBeGreaterThan(1499);
    expect(elo).toBeLessThan(1501);
  });

  it("estimate increases monotonically as candidate wins more matches", () => {
    function buildMatches(wins: number, total: number): CandidateVsAnchorMatch[] {
      const arr: CandidateVsAnchorMatch[] = [];
      for (let i = 0; i < wins; i++) arr.push({ anchorRating: 1500, outcome: "candidate" });
      for (let i = 0; i < total - wins; i++) arr.push({ anchorRating: 1500, outcome: "anchor" });
      return arr;
    }
    const e3 = estimateCandidateElo(buildMatches(3, 10));
    const e5 = estimateCandidateElo(buildMatches(5, 10));
    const e7 = estimateCandidateElo(buildMatches(7, 10));
    expect(e3).toBeLessThan(e5);
    expect(e5).toBeLessThan(e7);
  });
});

describe("planAnchorMatches", () => {
  function makeAnchors(): AnchorRatingEntry[] {
    const out: AnchorRatingEntry[] = [];
    for (let i = 0; i < 10; i++) out.push({ anchorId: `hit_${i}`, band: "hit", rating: 1500 + i, matchCount: 6 });
    for (let i = 0; i < 10; i++) out.push({ anchorId: `mid_${i}`, band: "middle", rating: 1400 + i, matchCount: 6 });
    for (let i = 0; i < 10; i++) out.push({ anchorId: `low_${i}`, band: "low", rating: 1100 + i, matchCount: 6 });
    return out;
  }

  it("distributes matches across hit/middle/low", () => {
    const plan = planAnchorMatches(makeAnchors(), 6);
    const bands = new Set(plan.map((p) => p.band));
    expect(bands.size).toBe(3); // 全帯から選ばれる
    expect(plan.length).toBe(6);
  });

  it("excludes already-matched anchors", () => {
    const exclude = new Set(["hit_0", "hit_1", "hit_2", "hit_3", "hit_4"]);
    const plan = planAnchorMatches(makeAnchors(), 6, exclude);
    for (const p of plan) {
      expect(exclude.has(p.anchorId)).toBe(false);
    }
  });

  it("gracefully handles small k", () => {
    const plan = planAnchorMatches(makeAnchors(), 3);
    expect(plan.length).toBeLessThanOrEqual(3);
    // Math.ceil(3/3)=1 から各帯1件
    const bands = plan.map((p) => p.band);
    expect(new Set(bands).size).toBeGreaterThanOrEqual(1);
  });
});
