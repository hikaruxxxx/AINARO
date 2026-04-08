import { describe, it, expect } from "vitest";
import { extractJsonBlock } from "./claude-cli";

describe("extractJsonBlock", () => {
  it("純粋なJSONをパース", () => {
    expect(extractJsonBlock('{"a": 1}')).toEqual({ a: 1 });
  });

  it("```json フェンスから抽出", () => {
    const text = "```json\n{\"foo\": \"bar\"}\n```";
    expect(extractJsonBlock(text)).toEqual({ foo: "bar" });
  });

  it("``` フェンス(言語指定なし)からも抽出", () => {
    const text = "```\n{\"x\": 42}\n```";
    expect(extractJsonBlock(text)).toEqual({ x: 42 });
  });

  it("前後にテキストがあっても { から } を抽出", () => {
    const text = "はい、結果です。\n{\"winner\": \"A\", \"reason\": \"理由\"}\n以上";
    expect(extractJsonBlock(text)).toEqual({ winner: "A", reason: "理由" });
  });

  it("ネストJSONも抽出", () => {
    const text = '{"outer": {"inner": [1, 2, 3]}}';
    expect(extractJsonBlock(text)).toEqual({ outer: { inner: [1, 2, 3] } });
  });

  it("壊れたJSONはnull", () => {
    expect(extractJsonBlock("not json at all")).toBeNull();
    expect(extractJsonBlock("{broken")).toBeNull();
  });

  it("空文字はnull", () => {
    expect(extractJsonBlock("")).toBeNull();
  });
});
