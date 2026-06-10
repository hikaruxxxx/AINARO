#!/usr/bin/env tsx
import "./_env";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  currentMonthKey,
  initLedger,
  loadBudget,
  sumProCalls,
  type AccountType,
} from "../../src/lib/manga/_ledger/quota";

type Args = {
  command: string;
  flags: Record<string, string | boolean>;
};

function parseArgs(): Args {
  const [command, ...rest] = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      flags[eq[1]] = eq[2];
      continue;
    }
    const flag = arg.match(/^--(.+)$/);
    if (!flag) continue;
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags[flag[1]] = next;
      i++;
    } else {
      flags[flag[1]] = true;
    }
  }
  if (!command) usage();
  return { command, flags };
}

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/manga/ledger-cli.ts init
  npx tsx scripts/manga/ledger-cli.ts set-budget --month YYYY-MM --pro-cap N --api-budget Y
  npx tsx scripts/manga/ledger-cli.ts add-plan --month YYYY-MM --slug X --episode N --account pro|api --estimated-calls C
  npx tsx scripts/manga/ledger-cli.ts status --month YYYY-MM
  npx tsx scripts/manga/ledger-cli.ts report --month YYYY-MM [--out path]`);
  process.exit(1);
}

function str(flags: Args["flags"], key: string, fallback?: string): string {
  const value = flags[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${key} required`);
}

function num(flags: Args["flags"], key: string): number {
  const value = Number(str(flags, key));
  if (!Number.isFinite(value)) throw new Error(`--${key} must be a number`);
  return value;
}

function account(flags: Args["flags"]): AccountType {
  const value = str(flags, "account");
  if (value !== "pro" && value !== "api") {
    throw new Error("--account must be pro or api");
  }
  return value;
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function commandInit(): void {
  initLedger();
  console.log("[ledger] initialized data/manga/_ledger/pro-quota.sqlite");
}

function commandSetBudget(flags: Args["flags"]): void {
  const db = initLedger();
  const month = str(flags, "month");
  const proCap = num(flags, "pro-cap");
  const apiBudget = num(flags, "api-budget");
  const apiPerImage = Number(flags["api-per-image"] ?? 30);
  db.prepare(
    `INSERT OR REPLACE INTO monthly_budget
      (month_key, pro_cap_calls, pro_safe_threshold, pro_hard_stop, api_budget_yen, api_per_image_yen, notes)
     VALUES (?, ?, 0.8, 0.95, ?, ?, ?)`,
  ).run(month, proCap, apiBudget, apiPerImage, "set by ledger-cli");
  console.log(`[ledger] budget ${month}: pro_cap=${proCap}, api_budget_yen=${apiBudget}`);
}

function commandAddPlan(flags: Args["flags"]): void {
  const db = initLedger();
  const month = str(flags, "month");
  const slug = str(flags, "slug");
  const episode = num(flags, "episode");
  const plannedAccount = account(flags);
  const estimatedCalls = num(flags, "estimated-calls");
  db.prepare(
    `INSERT OR REPLACE INTO work_plan
      (month_key, slug, episode, planned_account, status, estimated_calls)
     VALUES (?, ?, ?, ?, 'planned', ?)`,
  ).run(month, slug, episode, plannedAccount, estimatedCalls);
  console.log(
    `[ledger] plan ${month} ${slug} ep${episode}: ${plannedAccount}, estimated_calls=${estimatedCalls}`,
  );
}

function commandStatus(flags: Args["flags"]): void {
  const db = initLedger();
  const month = str(flags, "month", currentMonthKey());
  const budget = loadBudget(month);
  const proCalls = sumProCalls(month);
  const apiRow = db
    .prepare(
      "SELECT COALESCE(SUM(cost_units), 0) AS calls FROM image_gen_log WHERE month_key = ? AND account_type = 'api'",
    )
    .get(month) as { calls?: number } | undefined;
  const apiCalls = Number(apiRow?.calls ?? 0);
  const proPct = budget.pro_cap_calls > 0 ? proCalls / budget.pro_cap_calls : 0;
  const apiSpend = apiCalls * budget.api_per_image_yen;

  console.log(`[ledger] status ${month}`);
  console.log(`  Pro: ${proCalls}/${budget.pro_cap_calls} (${Math.round(proPct * 100)}%)`);
  console.log(`  API: ${apiCalls} calls, est ${apiSpend.toFixed(0)}/${budget.api_budget_yen} yen`);
  console.log(`  thresholds: safe=${budget.pro_safe_threshold}, hard=${budget.pro_hard_stop}`);

  const plans = db
    .prepare(
      `SELECT slug, episode, planned_account, status, estimated_calls
       FROM work_plan WHERE month_key = ? ORDER BY slug, episode`,
    )
    .all(month) as Record<string, unknown>[];
  if (plans.length > 0) {
    console.log("  work_plan:");
    for (const plan of plans) {
      console.log(
        `    ${plan.slug} ep${plan.episode}: ${plan.planned_account} ` +
          `${plan.estimated_calls} calls (${plan.status})`,
      );
    }
  }
}

function commandReport(flags: Args["flags"]): void {
  const db = initLedger();
  const month = str(flags, "month", currentMonthKey());
  const rows = db
    .prepare("SELECT * FROM image_gen_log WHERE month_key = ? ORDER BY id")
    .all(month) as Record<string, unknown>[];
  const header = [
    "id",
    "ts",
    "month_key",
    "slug",
    "episode",
    "layer",
    "page",
    "account_type",
    "cost_units",
    "output_path",
    "duration_ms",
    "retry_count",
  ];
  const csv = [header.join(",")]
    .concat(rows.map((row) => header.map((key) => csvValue(row[key])).join(",")))
    .join("\n");
  const out =
    typeof flags.out === "string"
      ? flags.out
      : path.resolve("data", "manga", "_ledger", "reports", `image-gen-${month}.csv`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${csv}\n`);
  console.log(`[ledger] report ${month}: ${out} (${rows.length} rows)`);
}

function main(): void {
  const args = parseArgs();
  if (args.command === "init") commandInit();
  else if (args.command === "set-budget") commandSetBudget(args.flags);
  else if (args.command === "add-plan") commandAddPlan(args.flags);
  else if (args.command === "status") commandStatus(args.flags);
  else if (args.command === "report") commandReport(args.flags);
  else usage();
}

try {
  main();
} catch (err) {
  console.error(`[ledger] error: ${(err as Error).message}`);
  process.exit(1);
}
