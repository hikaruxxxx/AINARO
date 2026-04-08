import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { computeExplorationMetrics } from "./exploration-metrics";
import { registerWork, recordMatch } from "./league";

let worksDir: string;
let leagueDir: string;

function makeWork(slug: string, genre: string, isExploration: boolean, fingerprint: string, body: string, createdAt: number): void {
  const dir = join(worksDir, slug);
  mkdirSync(dir, { recursive: true });
  const meta = {
    slug,
    seed: {
      fingerprint,
      primaryDesire: "rewarded",
      secondaryDesire: "revenge",
      genre,
      tags: { 境遇: "x", 転機: "y", 方向: "z", フック: "w" },
      isExploration,
    },
    createdAt: new Date(createdAt).toISOString(),
  };
  writeFileSync(join(dir, "_meta.json"), JSON.stringify(meta));
  writeFileSync(join(dir, "layer5_ep001.md"), body);
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "explore-test-"));
  worksDir = join(root, "works");
  leagueDir = join(root, "leagues");
  mkdirSync(worksDir, { recursive: true });
  mkdirSync(leagueDir, { recursive: true });
});

describe("computeExplorationMetrics", () => {
  it("探索作品が0件なら全て0、passed=false", () => {
    makeWork("a", "g", false, "fp1", "通常作品の本文", Date.now());
    const m = computeExplorationMetrics({
      worksDir,
      leagueDir,
      layer: 5,
      windowStart: Date.now() - 1000000,
      windowEnd: Date.now() + 1000,
    });
    expect(m.surprise.breakthroughCount).toBe(0);
    expect(m.passed).toBe(false);
  });

  it("時間窓外の作品は除外される", () => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oldStart = sevenDaysAgo - 24 * 60 * 60 * 1000;
    makeWork("old", "g", true, "fp1", "古い探索作品", oldStart);
    const m = computeExplorationMetrics({
      worksDir,
      leagueDir,
      layer: 5,
      windowStart: Date.now() - 60 * 60 * 1000, // 過去1時間のみ
      windowEnd: Date.now(),
    });
    // 古い作品はカウントされない
    expect(m.surprise.breakthroughCount).toBe(0);
  });

  it("Emergence: 探索作品の fingerprint を後から通常作品が再採用すると promoted+1", () => {
    const t1 = Date.now() - 1000;
    const t2 = Date.now();
    makeWork("explore", "g", true, "shared_fp", "本文1", t1);
    makeWork("normal", "g", false, "shared_fp", "本文2", t2);
    const m = computeExplorationMetrics({
      worksDir,
      leagueDir,
      layer: 5,
      windowStart: t1 - 1000,
      windowEnd: t2 + 1000,
    });
    expect(m.emergence.promotedTupleCount).toBe(1);
  });

  it("Emergence: 探索より前に作られた通常作品はカウントしない(時系列順守)", () => {
    const t1 = Date.now() - 2000;
    const t2 = Date.now() - 1000;
    makeWork("normal", "g", false, "shared_fp", "本文1", t1);
    makeWork("explore", "g", true, "shared_fp", "本文2", t2);
    const m = computeExplorationMetrics({
      worksDir,
      leagueDir,
      layer: 5,
      windowStart: t1 - 1000,
      windowEnd: Date.now(),
    });
    expect(m.emergence.promotedTupleCount).toBe(0);
  });

  it("Diversity: 探索作品が通常作品と全く異なる本文ならnovel件数が増える", () => {
    const t = Date.now();
    makeWork("normal", "g", false, "fp1", "追放された薬師が辺境で薬草園を開く物語の冒頭", t);
    makeWork("explore", "g", true, "fp2", "宇宙の果てで目覚める異星生命体との遭遇から始まるサイバーパンク叙事詩の幕開け", t);
    const m = computeExplorationMetrics({
      worksDir,
      leagueDir,
      layer: 5,
      windowStart: t - 1000,
      windowEnd: t + 1000,
    });
    expect(m.diversity.avgNearestDistance).toBeGreaterThan(0.5);
  });
});
