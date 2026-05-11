import { describe, expect, it } from "vitest";
import { findTargetField } from "./apply-deepen-patch";

describe("apply-deepen-patch", () => {
  it("character の field を見つけられる", () => {
    const bible = { characters: [{ id: "c1", origin_wound_deep: "x" }] };

    const target = findTargetField(bible, "character", "c1", "origin_wound_deep");

    expect(target.current).toBe("x");
    expect(target.collection).toBe("characters");
    expect(target.index).toBe(0);
  });

  it("target が見つからないとエラー", () => {
    expect(() => findTargetField({ characters: [] }, "character", "c1", "f")).toThrow(
      "target character not found: c1",
    );
  });
});
