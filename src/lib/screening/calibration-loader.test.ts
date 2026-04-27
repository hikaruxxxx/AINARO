import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const TEST_ROOT = join(tmpdir(), `ainaro-cal-test-${process.pid}`);
const TEST_FILE = join(TEST_ROOT, "data/generation/anchors/calibration.json");

beforeEach(() => {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(join(TEST_ROOT, "data/generation/anchors"), { recursive: true });
  vi.resetModules();
  process.chdir(TEST_ROOT);
});

afterEach(() => {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("calibration-loader", () => {
  it("returns fallback when calibration file is missing", async () => {
    const mod = await import("./calibration-loader");
    expect(mod.getCalibratedPassElo("modern_romance", 3, 1234)).toBe(1234);
    expect(mod.getCalibratedMiddleMedianElo("modern_romance", 3)).toBeNull();
    expect(mod.isCalibrated("modern_romance", 3)).toBe(false);
  });

  it("returns calibrated passElo when present", async () => {
    writeFileSync(
      TEST_FILE,
      JSON.stringify({
        version: "test",
        builtAt: new Date().toISOString(),
        hitProbability: { pass: 60.0, reject: 30.0 },
        layers: {
          modern_romance: {
            layer3: {
              hitMedianElo: 1500,
              middleMedianElo: 1400,
              lowMedianElo: 1200,
              passElo: 1450,
              requiredAnchorMatches: 10,
            },
          },
        },
      }),
    );
    const mod = await import("./calibration-loader");
    expect(mod.getCalibratedPassElo("modern_romance", 3, 9999)).toBe(1450);
    expect(mod.getCalibratedMiddleMedianElo("modern_romance", 3)).toBe(1400);
    expect(mod.isCalibrated("modern_romance", 3)).toBe(true);
    expect(mod.getCalibratedHitProbabilityThresholds()).toEqual({ pass: 60.0, reject: 30.0 });
  });

  it("returns fallback for uncalibrated genres in calibrated file", async () => {
    writeFileSync(
      TEST_FILE,
      JSON.stringify({
        version: "test",
        builtAt: new Date().toISOString(),
        hitProbability: { pass: 55.0, reject: 35.0 },
        layers: {
          modern_romance: {
            layer3: { hitMedianElo: 1500, middleMedianElo: 1400, lowMedianElo: 1200, passElo: 1450, requiredAnchorMatches: 10 },
          },
        },
      }),
    );
    const mod = await import("./calibration-loader");
    expect(mod.getCalibratedPassElo("isekai_high_fantasy", 5, 1550)).toBe(1550);
    expect(mod.isCalibrated("isekai_high_fantasy", 5)).toBe(false);
  });

  it("returns fallback when passElo is null (skeleton)", async () => {
    writeFileSync(
      TEST_FILE,
      JSON.stringify({
        version: "test",
        builtAt: new Date().toISOString(),
        hitProbability: { pass: 55.0, reject: 35.0 },
        layers: {
          modern_romance: {
            layer3: { hitMedianElo: null, middleMedianElo: null, lowMedianElo: null, passElo: null, requiredAnchorMatches: 10 },
          },
        },
      }),
    );
    const mod = await import("./calibration-loader");
    expect(mod.getCalibratedPassElo("modern_romance", 3, 1520)).toBe(1520);
    expect(mod.isCalibrated("modern_romance", 3)).toBe(false);
  });
});
