import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  checkAndReserveQuota,
  closeLedger,
  initLedger,
  type LedgerDatabase,
  loadBudget,
  recordGeneration,
  sumProCalls,
} from "./quota";

let tmpDir: string;
let ledgerDb: LedgerDatabase;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "ainaro-ledger-"));
  ledgerDb = initLedger(path.join(tmpDir, "pro-quota.sqlite"));
});

afterEach(() => {
  closeLedger();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function setBudget(monthKey: string, proCapCalls: number) {
  ledgerDb
    .prepare(
      `INSERT OR REPLACE INTO monthly_budget
        (month_key, pro_cap_calls, pro_safe_threshold, pro_hard_stop, api_budget_yen, api_per_image_yen, notes)
       VALUES (?, ?, 0.8, 0.95, 10000, 30, 'test')`,
    )
    .run(monthKey, proCapCalls);
}

describe("manga pro quota ledger", () => {
  it("仮想シナリオ 6本 Pro + 2本 API を正しくカウントする", async () => {
    const monthKey = "2026-05";
    setBudget(monthKey, 20);

    for (let i = 1; i <= 6; i++) {
      await recordGeneration({
        monthKey,
        slug: `pro-${i}`,
        episode: i,
        layer: "L09",
        account: "pro",
      });
    }
    for (let i = 1; i <= 2; i++) {
      await recordGeneration({
        monthKey,
        slug: `api-${i}`,
        episode: i,
        layer: "L09",
        account: "api",
      });
    }

    expect(sumProCalls(monthKey)).toBe(6);
  });

  it("80% threshold で warning log を出す", async () => {
    const monthKey = "2026-05";
    setBudget(monthKey, 10);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    for (let i = 0; i < 7; i++) {
      await recordGeneration({ monthKey, slug: "a", layer: "L09", account: "pro" });
    }

    const decision = await checkAndReserveQuota({
      monthKey,
      slug: "a",
      layer: "L09",
      estimatedCalls: 1,
    });

    expect(decision.account).toBe("pro");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Pro quota warning"));
  });

  it("95% threshold 超過見込みで api に自動切替する", async () => {
    const monthKey = "2026-05";
    setBudget(monthKey, 10);

    for (let i = 0; i < 9; i++) {
      await recordGeneration({ monthKey, slug: "a", layer: "L09", account: "pro" });
    }

    const decision = await checkAndReserveQuota({
      monthKey,
      slug: "a",
      layer: "L09",
      estimatedCalls: 1,
    });

    expect(decision).toMatchObject({ allowed: true, account: "api" });
    expect(decision.reason).toContain("hard stop");
  });

  it("monthly_budget が無ければ default を作成する", () => {
    const budget = loadBudget("2026-06");

    expect(budget).toMatchObject({
      month_key: "2026-06",
      pro_safe_threshold: 0.8,
      pro_hard_stop: 0.95,
    });
    expect(budget.pro_cap_calls).toBeGreaterThan(0);
  });
});
