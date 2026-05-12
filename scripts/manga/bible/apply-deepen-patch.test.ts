import { describe, expect, it } from "vitest";
import { findTargetField, parseArgs } from "./apply-deepen-patch";

describe("apply-deepen-patch", () => {
  it("character の field を見つけられる", () => {
    const bible = { characters: [{ id: "c1", origin_wound_deep: "x" }] };

    const target = findTargetField(bible, "character", "c1", "origin_wound_deep");

    expect(target.current).toBe("x");
    expect(target.collection).toBe("characters");
    expect(target.index).toBe(0);
    expect(target.leafKey).toBe("origin_wound_deep");
  });

  it("target が見つからないとエラー", () => {
    expect(() => findTargetField({ characters: [] }, "character", "c1", "f")).toThrow(
      "target character not found: c1",
    );
  });

  it("dotted path の nested string field を見つけられる", () => {
    const bible = { locations: [{ id: "loc1", spec: { who_typically_inhabits: "住人" } }] };

    const target = findTargetField(bible, "location", "loc1", "spec.who_typically_inhabits");

    expect(target.current).toBe("住人");
    expect(target.leafKey).toBe("who_typically_inhabits");
  });

  it("dotted path の途中が missing なら object を作る", () => {
    const bible = { locations: [{ id: "loc1" }] };

    const target = findTargetField(bible, "location", "loc1", "spec.who_typically_inhabits");
    target.target[target.leafKey] = "追加";

    expect(bible.locations[0]).toEqual({ id: "loc1", spec: { who_typically_inhabits: "追加" } });
  });

  it("dotted path の途中が string ならエラー", () => {
    const bible = { locations: [{ id: "loc1", spec: "bad" }] };

    expect(() => findTargetField(bible, "location", "loc1", "spec.who_typically_inhabits")).toThrow(
      "loc1.spec is not an object",
    );
  });

  it("world scope の field を見つけられる", () => {
    const bible = { world: { premise: "前提" } };

    const target = findTargetField(bible, "world", undefined, "premise");
    target.target[target.leafKey] = `${target.current}\n\n追加`;

    expect(bible.world.premise).toBe("前提\n\n追加");
    expect(target.collection).toBe("world");
    expect(target.index).toBe(-1);
  });

  it("world scope は target-id なしで parse できる", () => {
    const args = parseArgs([
      "--slug",
      "work",
      "--scope",
      "world",
      "--field",
      "premise",
      "--addition-file",
      "/tmp/addition.txt",
    ]);

    expect(args).toEqual(expect.objectContaining({ slug: "work", scope: "world", field: "premise" }));
    expect(args.targetId).toBeUndefined();
  });
});
