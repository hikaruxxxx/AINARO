import { describe, it, expect } from "vitest";
import { sampleTags, comboKey, type ElementGrid, type YieldStats } from "./element-grid";

const grid: ElementGrid = {
  byGenre: {
    悪役令嬢_恋愛: {
      境遇: ["処刑", "婚約破棄"],
      転機: ["ループ", "前世記憶"],
      方向: ["復讐", "ざまぁ"],
      フック: ["痛快", "理不尽"],
    },
  },
};

describe("sampleTags", () => {
  it("未知ジャンルはnull", () => {
    const r = sampleTags(grid, "unknown", { combos: {}, totalBatches: 0 });
    expect(r).toBeNull();
  });

  it("学習データが薄いときはフラット抽選", () => {
    const r = sampleTags(grid, "悪役令嬢_恋愛", { combos: {}, totalBatches: 0 }, () => 0);
    expect(r).not.toBeNull();
    // rng=0なので全軸の先頭が選ばれるはず
    expect(r!.境遇).toBe("処刑");
    expect(r!.方向).toBe("復讐");
  });

  it("十分な学習データがあれば重み付け抽選", () => {
    const stats: YieldStats = {
      totalBatches: 50,
      combos: {
        "悪役令嬢_恋愛|処刑|ループ|復讐|痛快": { samples: 100, meanHit: 0.9 },
      },
    };
    // ε=0.2、rng=0.5 → 0.5>0.2 なので学習モード
    const r = sampleTags(grid, "悪役令嬢_恋愛", stats, () => 0.5);
    expect(r).not.toBeNull();
  });
});

describe("comboKey", () => {
  it("一意キーを生成", () => {
    const key = comboKey("悪役令嬢_恋愛", {
      境遇: "処刑",
      転機: "ループ",
      方向: "復讐",
      フック: "痛快",
    });
    expect(key).toBe("悪役令嬢_恋愛|処刑|ループ|復讐|痛快");
  });
});
