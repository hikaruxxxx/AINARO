/**
 * Append a Claude-generated deepen paragraph to one bible snapshot field.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bibleSnapshotPath } from "../layers/_paths";

export type Scope = "character" | "location" | "motif";

type Args = {
  slug: string;
  targetId: string;
  scope: Scope;
  field: string;
  additionFile: string;
  dryRun: boolean;
};

type JsonRecord = Record<string, unknown>;

export type TargetField = {
  target: JsonRecord;
  current: string;
  collection: "characters" | "locations" | "visual_motifs";
  index: number;
};

export function findTargetField(bible: unknown, scope: Scope, targetId: string, field: string): TargetField {
  const collection = collectionForScope(scope);
  const root = asRecord(bible, "bible");
  const items = root[collection];
  if (!Array.isArray(items)) throw new Error(`bible.${collection} is not an array`);

  const index = items.findIndex((item, i) => isRecord(item) && matchesTarget(item, scope, targetId, i));
  if (index < 0) throw new Error(`target ${scope} not found: ${targetId}`);

  const target = asRecord(items[index], `${collection}[${index}]`);
  const value = target[field];
  if (value === undefined || value === null || value === "") return { target, current: "", collection, index };
  if (typeof value !== "string") throw new Error(`${targetId}.${field} is not a string field`);
  return { target, current: value, collection, index };
}

export function parseArgs(argv = process.argv.slice(2)): Args {
  const out: Partial<Args> = { dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
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
    else if (key === "addition-file") out.additionFile = value;
  }

  if (!out.slug) throw new Error("--slug required");
  if (!out.targetId) throw new Error("--target-id required");
  if (!out.scope) throw new Error("--scope required");
  if (!out.field) throw new Error("--field required");
  if (!out.additionFile) throw new Error("--addition-file required");
  return out as Args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const snapshotPath = bibleSnapshotPath(args.slug);
  const bible = await readJson(snapshotPath, "snapshot.json");
  const addition = (await readText(args.additionFile, "addition-file")).trim();
  if (!addition) throw new Error(`addition-file is empty: ${args.additionFile}`);

  const target = findTargetField(bible, args.scope, args.targetId, args.field);
  const beforeLen = target.current.length;
  const next = target.current ? `${target.current}\n\n${addition}` : addition;
  const afterLen = next.length;

  if (args.dryRun) {
    console.log(`[dry-run] ${args.targetId}.${args.field}: ${beforeLen} → ${afterLen} chars (+${afterLen - beforeLen})`);
    console.log(next);
    return;
  }

  const backupPath = await backupSnapshot(snapshotPath);
  target.target[args.field] = next;
  await fs.writeFile(snapshotPath, `${JSON.stringify(bible, null, 2)}\n`);

  console.log(`[apply] ${args.targetId}.${args.field}: ${beforeLen} → ${afterLen} chars (+${afterLen - beforeLen})`);
  console.log(`[apply] backup: ${backupPath}`);
}

async function readJson(filePath: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(`${label} not found or invalid: ${filePath} (${errorMessage(error)})`);
  }
}

async function readText(filePath: string, label: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    throw new Error(`${label} not found: ${filePath} (${errorMessage(error)})`);
  }
}

async function backupSnapshot(snapshotPath: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(path.dirname(snapshotPath), `snapshot.bak-claude-${ts}.json`);
  await fs.copyFile(snapshotPath, backupPath);
  return backupPath;
}

function parseScope(value: string): Scope {
  if (value === "character" || value === "location" || value === "motif") return value;
  throw new Error(`unknown --scope: ${value}`);
}

function collectionForScope(scope: Scope): TargetField["collection"] {
  if (scope === "character") return "characters";
  if (scope === "location") return "locations";
  if (scope === "motif") return "visual_motifs";
  throw new Error(`unknown --scope: ${scope}`);
}

function matchesTarget(item: JsonRecord, scope: Scope, targetId: string, index: number): boolean {
  if (typeof item.id === "string" && item.id === targetId) return true;
  if (scope !== "motif") return false;
  return typeof item.name === "string" && (slugForId(item.name) === targetId || v3MotifId(item.name, index) === targetId);
}

function v3MotifId(name: string, index: number): string {
  return `motif_${createHash("sha1").update(`${name}:${index}`).digest("hex").slice(0, 12)}`;
}

function slugForId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/gu, "_");
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
    console.error("[apply] FAILED:", error);
    process.exit(1);
  });
}
