import { describe, it, expect } from "vitest";
import { countChars, buildAppendInstruction, TARGET_MIN } from "./wordcount";

describe("countChars", () => {
  it("空白と改行を除外する", () => {
    expect(countChars("あい う\nえお")).toBe(5);
  });
  it("空文字は0", () => {
    expect(countChars("")).toBe(0);
  });
});

describe("buildAppendInstruction", () => {
  it("3500字以上ならneeded=false", () => {
    const text = "あ".repeat(TARGET_MIN);
    const r = buildAppendInstruction(text);
    expect(r.needed).toBe(false);
    expect(r.shortBy).toBe(0);
  });

  it("不足時はneeded=trueとshortByを返す", () => {
    const text = "あ".repeat(2000);
    const r = buildAppendInstruction(text);
    expect(r.needed).toBe(true);
    expect(r.shortBy).toBe(TARGET_MIN - 2000);
    expect(r.prompt).toContain("追記");
  });

  it("最も短いシーンを名指しする", () => {
    const text =
      "【冒頭シーン】" + "あ".repeat(900) +
      "【展開シーン】" + "あ".repeat(100) +
      "【転機シーン】" + "あ".repeat(900) +
      "【引きシーン】" + "あ".repeat(300);
    const r = buildAppendInstruction(text);
    expect(r.needed).toBe(true);
    expect(r.prompt).toContain("展開シーン");
  });
});
