import { describe, it, expect } from "vitest";
import { summarizeCost, perPromotedUSD } from "./cost";

describe("summarizeCost", () => {
  it("Opusの料金を正しく換算", () => {
    const r = summarizeCost([
      { model: "claude-opus-4-6", inputTokens: 1_000_000, outputTokens: 1_000_000 },
    ]);
    // input: 15$ + output: 75$ = 90$
    expect(r.totalUSD).toBeCloseTo(90, 5);
    expect(r.byModel["claude-opus-4-6"].usd).toBeCloseTo(90, 5);
  });

  it("複数モデルを合算", () => {
    const r = summarizeCost([
      { model: "claude-opus-4-6", inputTokens: 1_000_000, outputTokens: 0 },
      { model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 0 },
    ]);
    expect(r.totalUSD).toBeCloseTo(18, 5);
  });

  it("未知モデルはスキップ", () => {
    const r = summarizeCost([{ model: "unknown", inputTokens: 1_000_000, outputTokens: 0 }]);
    expect(r.totalUSD).toBe(0);
  });
});

describe("perPromotedUSD", () => {
  it("0除算回避", () => {
    expect(perPromotedUSD(100, 0)).toBe(0);
  });
  it("単純割り算", () => {
    expect(perPromotedUSD(100, 25)).toBe(4);
  });
});
