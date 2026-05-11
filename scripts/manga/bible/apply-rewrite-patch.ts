/**
 * Overwrite one bible snapshot field with a Claude Agent rewrite result.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bibleSnapshotPath } from "../layers/_paths";
import { findTargetField, type Scope } from "./apply-deepen-patch";

type Args = {
  slug: string;
  targetId: string;
  scope: Scope;
  field: string;
  resultFile: string;
  forceApply: boolean;
  dryRun: boolean;
};

type ApplyRewritePatchInput = Omit<Args, "slug"> & {
  snapshotPath: string;
};

type ApplyRewritePatchResult = {
  applied: boolean;
  skippedReason?: string;
  backupPath?: string;
  beforeLen: number;
  afterLen: number;
  evaluationSummary: string;
  issues: RewriteIssue[];
};

type JsonRecord = Record<string, unknown>;

type RewriteIssue = {
  category?: string;
  description?: string;
  location_hint?: string;
};

export function parseArgs(argv = process.argv.slice(2)): Args {
  const out: Partial<Args> = { forceApply: false, dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--force-apply") {
      out.forceApply = true;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }

    const eq = arg.match(/^--([^=]+)=(.*)$/u);
    const key = eq?.[1] ?? (arg.startsWith("--") ? arg.slice(2) : "");
    const value = eq?.[2] ?? (key && i + 1 < argv.length ? argv[++i] : undefined);
    if (!key || value === undefined) continue;

    if (key === "slug") out.slug = value;
    else if (key === "target-id") out.targetId = value;
    else if (key === "scope") out.scope = parseScope(value);
    else if (key === "field") out.field = value;
    else if (key === "result-file") out.resultFile = value;
  }

  if (!out.slug) throw new Error("--slug required");
  if (!out.targetId) throw new Error("--target-id required");
  if (!out.scope) throw new Error("--scope required");
  if (!out.field) throw new Error("--field required");
  if (!out.resultFile) throw new Error("--result-file required");
  return out as Args;
}

export async function applyRewritePatch(input: ApplyRewritePatchInput): Promise<ApplyRewritePatchResult> {
  const bible = await readJson(input.snapshotPath, "snapshot.json");
  const result = asRecord(await readJson(input.resultFile, "result-file"), "result-file");
  const target = findTargetField(bible, input.scope, input.targetId, input.field);
  const beforeLen = target.current.length;
  const rewrittenText = typeof result.rewritten_text === "string" ? result.rewritten_text.trim() : "";
  const evaluationSummary = typeof result.evaluation_summary === "string" ? result.evaluation_summary : "";
  const issues = parseIssues(result.issues);

  if (result.needs_rewrite === false && !input.forceApply) {
    return { applied: false, skippedReason: "no rewrite needed", beforeLen, afterLen: beforeLen, evaluationSummary, issues };
  }

  if (!rewrittenText) {
    return { applied: false, skippedReason: "rewritten_text is empty", beforeLen, afterLen: beforeLen, evaluationSummary, issues };
  }

  const afterLen = rewrittenText.length;
  if (input.dryRun) {
    return { applied: false, skippedReason: "dry-run", beforeLen, afterLen, evaluationSummary, issues };
  }

  const backupPath = await backupSnapshot(input.snapshotPath);
  target.target[input.field] = rewrittenText;
  await fs.writeFile(input.snapshotPath, `${JSON.stringify(bible, null, 2)}\n`);

  return { applied: true, backupPath, beforeLen, afterLen, evaluationSummary, issues };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const result = await applyRewritePatch({
    snapshotPath: bibleSnapshotPath(args.slug),
    targetId: args.targetId,
    scope: args.scope,
    field: args.field,
    resultFile: args.resultFile,
    forceApply: args.forceApply,
    dryRun: args.dryRun,
  });

  const delta = result.afterLen - result.beforeLen;
  const prefix = result.applied ? "[apply-rewrite]" : "[apply-rewrite] skip";
  console.log(`${prefix} ${args.targetId}.${args.field}: ${result.beforeLen} → ${result.afterLen} chars (${formatDelta(delta)})`);
  if (result.evaluationSummary) console.log(`[apply-rewrite] summary: ${result.evaluationSummary}`);
  for (const issue of result.issues) {
    console.log(`[apply-rewrite] issue: ${issue.category ?? "other"}: ${issue.description ?? ""} (${issue.location_hint ?? "no hint"})`);
  }
  if (result.backupPath) console.log(`[apply-rewrite] backup: ${result.backupPath}`);
  if (result.skippedReason) console.log(`[apply-rewrite] reason: ${result.skippedReason}`);
}

async function readJson(filePath: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(`${label} not found or invalid: ${filePath} (${errorMessage(error)})`);
  }
}

async function backupSnapshot(snapshotPath: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(path.dirname(snapshotPath), `snapshot.bak-rewrite-${ts}.json`);
  await fs.copyFile(snapshotPath, backupPath);
  return backupPath;
}

function parseScope(value: string): Scope {
  if (value === "character" || value === "location" || value === "motif") return value;
  throw new Error(`unknown --scope: ${value}`);
}

function parseIssues(value: unknown): RewriteIssue[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).filter(isRecord).map((item) => ({
    category: typeof item.category === "string" ? item.category : undefined,
    description: typeof item.description === "string" ? item.description : undefined,
    location_hint: typeof item.location_hint === "string" ? item.location_hint : undefined,
  }));
}

function formatDelta(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (isRecord(value)) return value;
  throw new Error(`${label} is not an object`);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isCliEntry = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isCliEntry) {
  void main().catch((error: unknown) => {
    console.error("[apply-rewrite] FAILED:", error);
    process.exit(1);
  });
}
