import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  recordUsage,
  getUsageIn5h,
  throttleBeforeCall,
  estimateTokens,
  type ThrottleConfig,
} from "./throttle";

let cfg: ThrottleConfig;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "throttle-test-"));
  cfg = {
    tokenLimit5h: 1000,
    warnRatio: 0.8,
    pauseRatio: 0.95,
    warnSleepMs: 10,
    pauseSleepMs: 20,
    logPath: join(dir, "_usage.jsonl"),
  };
});

describe("estimateTokens", () => {
  it("文字数の1.2倍を返す", () => {
    expect(estimateTokens("a".repeat(100))).toBe(120);
  });
  it("空文字は0", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("recordUsage / getUsageIn5h", () => {
  it("記録なしは全て0", () => {
    const u = getUsageIn5h(cfg);
    expect(u.total).toBe(0);
    expect(u.recordCount).toBe(0);
  });

  it("recordした分が集計される", () => {
    recordUsage({ timestamp: Date.now(), inputTokens: 100, outputTokens: 200, layer: "test" }, cfg);
    recordUsage({ timestamp: Date.now(), inputTokens: 50, outputTokens: 50, layer: "test" }, cfg);
    const u = getUsageIn5h(cfg);
    expect(u.input).toBe(150);
    expect(u.output).toBe(250);
    expect(u.total).toBe(400);
    expect(u.recordCount).toBe(2);
  });

  it("5h以前のレコードは除外される", () => {
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    recordUsage({ timestamp: sixHoursAgo, inputTokens: 999, outputTokens: 999, layer: "old" }, cfg);
    recordUsage({ timestamp: Date.now(), inputTokens: 10, outputTokens: 20, layer: "new" }, cfg);
    const u = getUsageIn5h(cfg);
    expect(u.total).toBe(30);
    expect(u.recordCount).toBe(1);
  });

  it("ログファイルがJSONLとして書き出される", () => {
    recordUsage({ timestamp: Date.now(), inputTokens: 1, outputTokens: 1, layer: "x" }, cfg);
    expect(existsSync(cfg.logPath)).toBe(true);
    const lines = readFileSync(cfg.logPath, "utf-8").split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});

describe("throttleBeforeCall", () => {
  it("使用量0%なら即時返る", async () => {
    const r = await throttleBeforeCall(cfg);
    expect(r.slept).toBe(0);
    expect(r.reason).toBe("ok");
  });

  it("80%超でwarn sleep", async () => {
    // 上限1000、80%=800まで使う
    recordUsage({ timestamp: Date.now(), inputTokens: 400, outputTokens: 400, layer: "x" }, cfg);
    const r = await throttleBeforeCall(cfg);
    expect(r.slept).toBe(cfg.warnSleepMs);
    expect(r.reason).toContain("warn");
  });

  it("95%超でpause sleep", async () => {
    recordUsage({ timestamp: Date.now(), inputTokens: 500, outputTokens: 500, layer: "x" }, cfg);
    const r = await throttleBeforeCall(cfg);
    expect(r.slept).toBe(cfg.pauseSleepMs);
    expect(r.reason).toContain("pause");
  });
});
