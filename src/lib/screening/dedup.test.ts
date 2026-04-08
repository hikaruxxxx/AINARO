import { describe, it, expect } from "vitest";
import { jaccard, isDuplicate, dedupLoglines } from "./dedup";

describe("jaccard", () => {
  it("完全一致は1.0", () => {
    expect(jaccard("追放された薬師の物語", "追放された薬師の物語")).toBeCloseTo(1.0, 5);
  });
  it("完全に異なる文字列は低い", () => {
    expect(jaccard("追放された薬師", "宇宙海賊の冒険")).toBeLessThan(0.2);
  });
});

describe("isDuplicate", () => {
  it("類似する既存loglineを検出", () => {
    const existing = ["追放された薬師が辺境で薬草園を開く"];
    expect(isDuplicate("追放された薬師が辺境で薬草園を開く話", existing)).toBe(true);
  });
  it("無関係なloglineはfalse", () => {
    const existing = ["追放された薬師が辺境で薬草園を開く"];
    expect(isDuplicate("宇宙海賊の冒険譚", existing)).toBe(false);
  });
});

describe("dedupLoglines", () => {
  it("先着優先で重複を除外", () => {
    const candidates = [
      "追放された薬師が辺境で薬草園を開く",
      "追放された薬師が辺境で薬草園を開く話",
      "悪役令嬢が3周目のループで真犯人を暴く",
    ];
    const result = dedupLoglines(candidates);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(candidates[0]);
  });
});
