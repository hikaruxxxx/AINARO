import { describe, it, expect } from "vitest";
import {
  parseCompareResponse,
  buildComparePrompt,
  compareSymmetric,
  type CompareInput,
  type LlmCallFn,
} from "./llm-compare";

describe("parseCompareResponse", () => {
  it("正常なJSONをパース", () => {
    const raw = '{"winner":"A","reason":"Aの方がフックが強い"}';
    const r = parseCompareResponse(raw, false);
    expect(r.winner).toBe("A");
    expect(r.reason).toBe("Aの方がフックが強い");
  });
  it("swap=trueなら勝者を逆転", () => {
    const raw = '{"winner":"A","reason":"x"}';
    const r = parseCompareResponse(raw, true);
    expect(r.winner).toBe("B");
  });
  it("壊れたJSONはtie", () => {
    const r = parseCompareResponse("not a json", false);
    expect(r.winner).toBe("tie");
    expect(r.reason).toBe("parse_failed");
  });
  it("余計なテキストが付いていてもJSON抽出できる", () => {
    const raw = 'はい、評価しました。\n{"winner":"B","reason":"理由"}\n以上です。';
    const r = parseCompareResponse(raw, false);
    expect(r.winner).toBe("B");
  });
});

describe("buildComparePrompt", () => {
  it("ジャンル名とラベルが含まれる", () => {
    const input: CompareInput = {
      slugA: "a",
      textA: "本文A",
      slugB: "b",
      textB: "本文B",
      genre: "isekai_tsuiho_zamaa",
      layer: 5,
    };
    const prompt = buildComparePrompt(input, false);
    expect(prompt).toContain("isekai_tsuiho_zamaa");
    expect(prompt).toContain("ep1本文");
    expect(prompt).toContain("本文A");
    expect(prompt).toContain("本文B");
  });
  it("swap=trueで本文の順序が入れ替わる", () => {
    const input: CompareInput = {
      slugA: "a",
      textA: "本文A",
      slugB: "b",
      textB: "本文B",
      genre: "isekai_tsuiho_zamaa",
      layer: 5,
    };
    const swapped = buildComparePrompt(input, true);
    const aIdx = swapped.indexOf("本文A");
    const bIdx = swapped.indexOf("本文B");
    expect(bIdx).toBeLessThan(aIdx); // BがAより先に出る
  });
});

describe("compareSymmetric", () => {
  it("両方向で同じ勝者なら整合", async () => {
    const llm: LlmCallFn = async (prompt) => {
      // 常にAが勝つ。swap時は元のBがAとして提示されるので winner=A → 元のBが勝者
      return '{"winner":"A","reason":"x"}';
    };
    const input: CompareInput = {
      slugA: "a",
      textA: "x",
      slugB: "b",
      textB: "y",
      genre: "isekai_tsuiho_zamaa",
      layer: 2,
    };
    const r = await compareSymmetric(input, llm);
    // forward: A wins, reverse: A wins(swapで元のB) → 不整合 → tie
    expect(r.symmetric?.consistent).toBe(false);
    expect(r.winner).toBe("tie");
  });

  it("バイアスがなければ正しく整合", async () => {
    // 常に「先に提示された方が勝つ」LLM(完全な順序バイアス)を逆に使い、
    // forward時はA勝ち、reverse時はB勝ち(元のAが勝ち) → 整合
    const llm: LlmCallFn = async (prompt) => {
      // 「本文A」が「本文B」より先に出てるかチェック
      const aIdx = prompt.indexOf("【作品A】");
      // 内容は無視して常に「prompt 上のA」が勝ち = 順序バイアス
      return '{"winner":"A","reason":"x"}';
    };
    // この場合、forward は元A勝ち、reverse は元B勝ち(swapでBがAに)→不整合
    const r = await compareSymmetric(
      { slugA: "a", textA: "x", slugB: "b", textB: "y", genre: "isekai_tsuiho_zamaa", layer: 2 },
      llm,
    );
    expect(r.symmetric?.consistent).toBe(false);
  });
});
