import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type SqlValue = string | number | null | undefined;

type LedgerStatement = {
  run: (...params: SqlValue[]) => unknown;
  get: (...params: SqlValue[]) => unknown;
  all: (...params: SqlValue[]) => unknown[];
};

export type LedgerDatabase = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => LedgerStatement;
  close?: () => void;
};

export type AccountType = "pro" | "api";

export type MonthlyBudget = {
  month_key: string;
  pro_cap_calls: number;
  pro_safe_threshold: number;
  pro_hard_stop: number;
  api_budget_yen: number;
  api_per_image_yen: number;
  notes: string | null;
};

export type QuotaDecision = { allowed: boolean; account: AccountType; reason?: string };
export type QuotaCheckArgs = {
  slug: string; episode?: number; layer: string; estimatedCalls: number; monthKey?: string;
};
export type RecordGenerationArgs = {
  slug: string; episode?: number; layer: string; page?: number; account: AccountType;
  durationMs?: number; outputPath?: string; retry_count?: number; monthKey?: string;
};

const require = createRequire(import.meta.url);
const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "manga", "_ledger", "pro-quota.sqlite");

let activeDb: LedgerDatabase | null = null;

function loadDatabaseConstructor(): new (dbPath: string) => LedgerDatabase {
  try {
    return require("better-sqlite3") as new (dbPath: string) => LedgerDatabase;
  } catch {
    const sqlite = require("node:sqlite") as {
      DatabaseSync: new (dbPath: string) => LedgerDatabase;
    };
    return sqlite.DatabaseSync;
  }
}

export function initLedger(dbPath = process.env.MANGA_PRO_LEDGER_DB ?? DEFAULT_DB_PATH): LedgerDatabase {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const Database = loadDatabaseConstructor();
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_gen_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, month_key TEXT NOT NULL,
      slug TEXT NOT NULL, episode INTEGER, layer TEXT NOT NULL, page INTEGER,
      account_type TEXT NOT NULL, cost_units INTEGER NOT NULL, output_path TEXT,
      duration_ms INTEGER, retry_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS monthly_budget (
      month_key TEXT PRIMARY KEY, pro_cap_calls INTEGER NOT NULL,
      pro_safe_threshold REAL DEFAULT 0.8, pro_hard_stop REAL DEFAULT 0.95,
      api_budget_yen INTEGER NOT NULL, api_per_image_yen REAL NOT NULL, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS work_plan (
      month_key TEXT NOT NULL, slug TEXT NOT NULL, episode INTEGER NOT NULL,
      planned_account TEXT NOT NULL, status TEXT DEFAULT 'planned',
      estimated_calls INTEGER NOT NULL, PRIMARY KEY (month_key, slug, episode)
    );
  `);
  activeDb = db;
  return db;
}

export function closeLedger(): void {
  activeDb?.close?.();
  activeDb = null;
}

function db(): LedgerDatabase {
  return activeDb ?? initLedger();
}

export function currentMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function defaultBudget(monthKey: string): MonthlyBudget {
  return {
    month_key: monthKey, pro_cap_calls: Number(process.env.MANGA_PRO_CAP_CALLS ?? 300),
    pro_safe_threshold: Number(process.env.MANGA_PRO_SAFE_THRESHOLD ?? 0.8),
    pro_hard_stop: Number(process.env.MANGA_PRO_HARD_STOP ?? 0.95),
    api_budget_yen: Number(process.env.MANGA_API_BUDGET_YEN ?? 10000),
    api_per_image_yen: Number(process.env.MANGA_API_PER_IMAGE_YEN ?? 30), notes: "auto-created default budget",
  };
}

export function loadBudget(monthKey = currentMonthKey()): MonthlyBudget {
  const existing = db()
    .prepare("SELECT * FROM monthly_budget WHERE month_key = ?")
    .get(monthKey) as MonthlyBudget | undefined;
  if (existing) return existing;

  const budget = defaultBudget(monthKey);
  db().prepare(
    `INSERT INTO monthly_budget
      (month_key, pro_cap_calls, pro_safe_threshold, pro_hard_stop, api_budget_yen, api_per_image_yen, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    budget.month_key, budget.pro_cap_calls, budget.pro_safe_threshold, budget.pro_hard_stop,
    budget.api_budget_yen, budget.api_per_image_yen, budget.notes,
  );
  return budget;
}

export function sumProCalls(monthKey = currentMonthKey()): number {
  const row = db()
    .prepare(
      "SELECT COALESCE(SUM(cost_units), 0) AS total FROM image_gen_log WHERE month_key = ? AND account_type = 'pro'",
    )
    .get(monthKey) as { total?: number } | undefined;
  return Number(row?.total ?? 0);
}

function plannedAccount(args: QuotaCheckArgs, monthKey: string): AccountType | null {
  if (args.episode === undefined) return null;
  const row = db()
    .prepare(
      `SELECT planned_account FROM work_plan
       WHERE month_key = ? AND slug = ? AND episode = ? AND status != 'cancelled'`,
    )
    .get(monthKey, args.slug, args.episode) as { planned_account?: string } | undefined;
  return row?.planned_account === "pro" || row?.planned_account === "api"
    ? row.planned_account
    : null;
}

export async function checkAndReserveQuota(args: QuotaCheckArgs): Promise<QuotaDecision> {
  const monthKey = args.monthKey ?? currentMonthKey();
  const budget = loadBudget(monthKey);
  const estimatedCalls = Math.max(0, Math.ceil(args.estimatedCalls));
  const plan = plannedAccount(args, monthKey);

  if (plan === "api") {
    return { allowed: true, account: "api", reason: "work_plan planned_account=api" };
  }

  const used = sumProCalls(monthKey);
  const projected = used + estimatedCalls;
  const hardLimit = budget.pro_cap_calls * budget.pro_hard_stop;
  const safeLimit = budget.pro_cap_calls * budget.pro_safe_threshold;

  if (projected > hardLimit) {
    return {
      allowed: true,
      account: "api",
      reason: `pro hard stop would be exceeded (${projected}/${budget.pro_cap_calls})`,
    };
  }

  if (projected >= safeLimit) {
    console.warn(
      `[manga-ledger] Pro quota warning: ${projected}/${budget.pro_cap_calls} calls ` +
        `(${Math.round((projected / budget.pro_cap_calls) * 100)}%) for ${monthKey}`,
    );
  }

  return {
    allowed: true,
    account: "pro",
    reason: plan === "pro" ? "work_plan planned_account=pro" : undefined,
  };
}

export async function recordGeneration(args: RecordGenerationArgs): Promise<void> {
  const monthKey = args.monthKey ?? currentMonthKey();
  loadBudget(monthKey);
  db().prepare(
    `INSERT INTO image_gen_log
      (ts, month_key, slug, episode, layer, page, account_type, cost_units, output_path, duration_ms, retry_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(), monthKey, args.slug, args.episode ?? null, args.layer,
    args.page ?? null, args.account, 1, args.outputPath ?? null, args.durationMs ?? null,
    args.retry_count ?? 0,
  );
}
