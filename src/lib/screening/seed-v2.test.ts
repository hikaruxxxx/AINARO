import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  makeFingerprint,
  loadUsedSeeds,
  saveUsedSeeds,
  buildLoglinePrompt,
  type SeedV2,
} from "./seed-v2";

describe("makeFingerprint", () => {
  it("4要素を|で結合", () => {
    const fp = makeFingerprint("rewarded", "isekai_tsuiho_zamaa", {
      境遇: "追放された",
      転機: "スキル覚醒",
      方向: "成り上がり",
      フック: "ざまぁ",
    });
    expect(fp).toBe("rewarded|isekai_tsuiho_zamaa|追放された|スキル覚醒");
  });

  it("方向/フックは fingerprint に含まれない(4-tuple除外の方針)", () => {
    const fp1 = makeFingerprint("rewarded", "g", {
      境遇: "x",
      転機: "y",
      方向: "A",
      フック: "B",
    });
    const fp2 = makeFingerprint("rewarded", "g", {
      境遇: "x",
      転機: "y",
      方向: "C",
      フック: "D",
    });
    expect(fp1).toBe(fp2);
  });
});

describe("loadUsedSeeds / saveUsedSeeds", () => {
  let path: string;
  beforeEach(() => {
    path = join(mkdtempSync(join(tmpdir(), "seed-test-")), "_used_seeds.json");
  });

  it("ファイルがなければ空構造", () => {
    const u = loadUsedSeeds(path);
    expect(u.fingerprints).toEqual([]);
    expect(u.seeds).toEqual([]);
  });

  it("save → load round trip", () => {
    const seed: SeedV2 = {
      fingerprint: "test|g|x|y",
      primaryDesire: "rewarded",
      secondaryDesire: "revenge",
      genre: "isekai_tsuiho_zamaa",
      tags: { 境遇: "x", 転機: "y", 方向: "z", フック: "w" },
      isExploration: false,
      createdAt: new Date().toISOString(),
    };
    saveUsedSeeds({ version: "v1", fingerprints: [seed.fingerprint], seeds: [seed] }, path);
    const loaded = loadUsedSeeds(path);
    expect(loaded.fingerprints).toEqual(["test|g|x|y"]);
    expect(loaded.seeds[0].primaryDesire).toBe("rewarded");
  });
});

describe("buildLoglinePrompt", () => {
  // reader-desires.json をプロジェクトroot から読むので、テスト環境では存在前提
  it("プロンプトに必要な要素が全て含まれる", () => {
    // reader-desires.json が存在しないと throw する。データが揃っている前提でテスト
    if (!existsSync("data/generation/reader-desires.json")) {
      return; // skip
    }
    const seed: SeedV2 = {
      fingerprint: "rewarded|isekai_tsuiho_zamaa|追放された|スキル覚醒",
      primaryDesire: "rewarded",
      secondaryDesire: "revenge",
      genre: "isekai_tsuiho_zamaa",
      tags: { 境遇: "追放された", 転機: "スキル覚醒", 方向: "成り上がり", フック: "ざまぁ" },
      isExploration: false,
      createdAt: new Date().toISOString(),
    };
    const prompt = buildLoglinePrompt(seed);
    expect(prompt).toContain("isekai_tsuiho_zamaa");
    expect(prompt).toContain("追放された");
    expect(prompt).toContain("スキル覚醒");
    expect(prompt).toContain("成り上がり");
    expect(prompt).toContain("ざまぁ");
    expect(prompt).toContain("ログライン作家");
    expect(prompt).toContain("logline");
  });
});
