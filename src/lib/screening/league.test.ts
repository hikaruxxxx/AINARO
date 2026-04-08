import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  registerWork,
  recordMatch,
  findNearestOpponents,
  loadRatings,
  getRanking,
  recomputeBradleyTerry,
  MATCH_THRESHOLD,
} from "./league";

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "league-test-"));
});

describe("registerWork", () => {
  it("新規作品をINITIAL_RATINGで登録", () => {
    const e = registerWork("test_genre", "slug-1", 2, false, baseDir);
    expect(e.rating).toBe(1500);
    expect(e.matchCount).toBe(0);
    expect(e.finalized).toBe(false);
  });
  it("冪等(同一slugを2回登録しても上書きしない)", () => {
    registerWork("test_genre", "slug-1", 2, false, baseDir);
    const e2 = registerWork("test_genre", "slug-1", 2, false, baseDir);
    expect(e2.rating).toBe(1500);
  });
});

describe("recordMatch", () => {
  it("Aが勝てばAのレーティングが上がる", () => {
    registerWork("g", "a", 2, false, baseDir);
    registerWork("g", "b", 2, false, baseDir);
    recordMatch("g", "a", "b", 2, "A", "test", baseDir);
    const file = loadRatings("g", baseDir);
    expect(file.entries.a.rating).toBeGreaterThan(1500);
    expect(file.entries.b.rating).toBeLessThan(1500);
    expect(file.entries.a.wins).toBe(1);
    expect(file.entries.b.losses).toBe(1);
  });
  it("tieは両者ほぼ変わらない", () => {
    registerWork("g", "a", 2, false, baseDir);
    registerWork("g", "b", 2, false, baseDir);
    recordMatch("g", "a", "b", 2, "tie", "test", baseDir);
    const file = loadRatings("g", baseDir);
    expect(file.entries.a.rating).toBeCloseTo(1500, 0);
    expect(file.entries.b.rating).toBeCloseTo(1500, 0);
    expect(file.entries.a.ties).toBe(1);
  });
  it("MATCH_THRESHOLD回比較すると finalized になる", () => {
    registerWork("g", "a", 2, false, baseDir);
    registerWork("g", "b", 2, false, baseDir);
    for (let i = 0; i < MATCH_THRESHOLD; i++) {
      recordMatch("g", "a", "b", 2, "tie", "test", baseDir);
    }
    const file = loadRatings("g", baseDir);
    expect(file.entries.a.finalized).toBe(true);
    expect(file.entries.b.finalized).toBe(true);
  });
});

describe("findNearestOpponents", () => {
  it("レーティングが近い順にK件返す", () => {
    registerWork("g", "target", 2, false, baseDir);
    registerWork("g", "near", 2, false, baseDir);
    registerWork("g", "far", 2, false, baseDir);
    // far のレーティングを大きく動かす
    for (let i = 0; i < 5; i++) {
      recordMatch("g", "far", "near", 2, "A", "t", baseDir);
    }
    const nearest = findNearestOpponents("g", "target", 2, 1, baseDir);
    expect(nearest.length).toBe(1);
    // target=1500 に近い方が "near"(微減後でも近い)
    expect(nearest[0].slug).toBe("near");
  });
});

describe("getRanking", () => {
  it("rating降順で返る", () => {
    registerWork("g", "a", 2, false, baseDir);
    registerWork("g", "b", 2, false, baseDir);
    registerWork("g", "c", 2, false, baseDir);
    recordMatch("g", "a", "b", 2, "A", "t", baseDir);
    recordMatch("g", "a", "c", 2, "A", "t", baseDir);
    const ranking = getRanking("g", 2, baseDir);
    expect(ranking[0].slug).toBe("a");
  });
});

describe("recomputeBradleyTerry", () => {
  it("実行してエラーを出さない", () => {
    registerWork("g", "a", 2, false, baseDir);
    registerWork("g", "b", 2, false, baseDir);
    registerWork("g", "c", 2, false, baseDir);
    recordMatch("g", "a", "b", 2, "A", "t", baseDir);
    recordMatch("g", "b", "c", 2, "A", "t", baseDir);
    recordMatch("g", "a", "c", 2, "A", "t", baseDir);
    expect(() => recomputeBradleyTerry("g", baseDir)).not.toThrow();
    const ranking = getRanking("g", 2, baseDir);
    // a が最も多く勝っているので最高レーティング
    expect(ranking[0].slug).toBe("a");
  });
});
