import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as defaultStdin, stdout as defaultStdout } from "node:process";

import { bibleDir, bibleSnapshotPath } from "../layers/_paths";
import type { BibleSnapshotV2, BibleSnapshotV3, FactNode } from "../../../src/lib/manga/schemas-v2";
import { isBibleSnapshotV3 } from "../../../src/lib/manga/schemas-v2";
import * as atomicWrite from "../../../src/lib/manga/bible/atomic-write";
import { lintBible } from "../../../src/lib/manga/qa-v2/bible-lint";

type SourceKind = "preview" | "refined";

type Args = {
  slug?: string;
  source: SourceKind;
  splitFacts: boolean;
  dryRun: boolean;
  allowFatal: boolean;
  yes: boolean;
};

type RunSwapOptions = {
  argv: string[];
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stdin?: NodeJS.ReadStream;
};

const OUTPUT_FILES = {
  preview: "v3-classified-preview.json",
  refined: "v3-classified-llm-refine.json",
} as const;

export async function runSwap(options: RunSwapOptions): Promise<number> {
  const out = options.stdout ?? defaultStdout;
  const args = parseArgs(options.argv);
  if (!args.slug) throw new Error("--slug <slug> is required");

  const dir = bibleDir(args.slug);
  const snapshotPath = bibleSnapshotPath(args.slug);
  const ts = safeTimestamp();
  const backupPath = path.join(dir, `snapshot.bak-pre-v3-swap-${ts}.json`);
  const finalV2Path = path.join(dir, "snapshot.v2-final.json");

  const v2 = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as BibleSnapshotV2;
  const { v3, source, sourcePath } = await loadV3Snapshot(dir, args.source);
  log(out, `[swap] source: ${source} (${sourcePath})`);

  const consistency = atomicWrite.validateSnapshotConsistency(v3);
  if (!consistency.ok) {
    log(out, `[swap] consistency check: ok=false, errors=${consistency.errors.length}, warnings=${consistency.warnings.length}`);
    for (const error of consistency.errors) log(out, `[swap]   error: ${error}`);
    return 1;
  }

  const preLint = await lintBible({ bible: v2, useBibleV3: false, skipLlm: true });
  const v3Lint = await lintBible({ bible: v2, useBibleV3: true, skipLlm: true });
  if (v3Lint.fatal_count > 0 && !args.allowFatal) {
    log(out, `[swap] lint summary: fatal=${v3Lint.fatal_count}, warn=${v3Lint.warn_count} (would-be after V3 swap)`);
    log(out, "[swap] abort: lint fatal findings exist. Re-run with --allow-fatal to continue.");
    return 1;
  }

  const stats = computeStats(v3);
  if (args.dryRun) {
    log(out, "[swap] dry-run mode (writeSnapshotV3Atomic not called)");
    log(out, `[swap] would write to: ${path.join(dir, "snapshot.json")} (split facts: ${args.splitFacts})`);
    log(out, `[swap] v3 stats: entities=${stats.entities}, facts=${stats.facts}, volumes=${stats.volumes}`);
    log(out, `[swap] would create backup: ${backupPath}`);
    log(out, `[swap] consistency check: ok=true, errors=${consistency.errors.length}, warnings=${consistency.warnings.length}`);
    log(out, `[swap] lint summary: fatal=${v3Lint.fatal_count}, warn=${v3Lint.warn_count} (would-be after V3 swap)`);
    return 0;
  }

  if (!args.yes) {
    const ok = await confirmOverwrite(options.stdin ?? defaultStdin, out);
    if (!ok) {
      log(out, "[swap] aborted by user");
      return 1;
    }
  }

  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(snapshotPath, backupPath);
  await fs.copyFile(snapshotPath, finalV2Path);

  const result = await atomicWrite.writeSnapshotV3Atomic(v3, {
    bibleDir: dir,
    stageLabel: "phase-8-swap",
    splitFacts: args.splitFacts,
  });
  if (!result.ok) {
    log(out, `[swap] atomic write failed: ${result.error ?? "unknown error"}`);
    log(out, `[swap] rollback_used=${result.rollback_used === true}`);
    return 1;
  }

  const verify = await verifyWrittenSnapshot(dir);
  if (!verify.ok) {
    log(out, `[swap] post-swap verification failed: ${verify.error}`);
    log(out, `[swap] manual restore: cp ${backupPath} ${snapshotPath}`);
    return 2;
  }

  log(out, `[swap] V3 swap complete for ${args.slug}`);
  log(out, `[swap]   v3 stats: entities=${stats.entities}, facts=${stats.facts} (${formatCounts(stats.layerCounts)})`);
  log(out, `[swap]   confidence breakdown: avg=${stats.confidence.avg}, median=${stats.confidence.median}, <0.7=${stats.confidence.lowCount} facts (${stats.confidence.lowPercent}%)`);
  log(out, `[swap]   pre-swap V2 fatal=${preLint.fatal_count}, post-swap V3 fatal=${v3Lint.fatal_count}`);
  log(out, "[swap]   files written:");
  for (const line of summarizeWrittenFiles(result.written_files)) log(out, `[swap]     ${line}`);
  log(out, "[swap]   backups:");
  log(out, `[swap]     ${backupPath} (V2 final)`);
  log(out, `[swap]     ${finalV2Path} (V2 永久保存)`);
  return 0;
}

async function loadV3Snapshot(dir: string, requested: SourceKind): Promise<{ v3: BibleSnapshotV3; source: SourceKind; sourcePath: string }> {
  const choices: SourceKind[] = requested === "refined" ? ["refined", "preview"] : ["preview"];
  let lastError: unknown;
  for (const source of choices) {
    const sourcePath = path.join(dir, source === "refined" ? OUTPUT_FILES.refined : OUTPUT_FILES.preview);
    try {
      const raw = JSON.parse(await fs.readFile(sourcePath, "utf-8")) as unknown;
      const v3 = source === "refined" ? (raw as { v3?: unknown }).v3 : raw;
      if (!isBibleSnapshotV3(v3)) throw new Error(`${sourcePath} does not contain a BibleSnapshotV3`);
      return { v3, source, sourcePath };
    } catch (error) {
      lastError = error;
      if (source === requested && requested === "preview") throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function verifyWrittenSnapshot(dir: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const snapshotPath = path.join(dir, "snapshot.json");
    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as unknown;
    if (!isBibleSnapshotV3(snapshot)) return { ok: false, error: "snapshot.json is not recognized as V3" };
    const v3 = await hydrateSplitFacts(dir, snapshot);
    const consistency = atomicWrite.validateSnapshotConsistency(v3);
    if (!consistency.ok) return { ok: false, error: consistency.errors.join("; ") };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function hydrateSplitFacts(dir: string, snapshot: BibleSnapshotV3): Promise<BibleSnapshotV3> {
  const factsDir = path.join(dir, "facts");
  const factFiles = await listJsonFiles(factsDir).catch(() => []);
  if (factFiles.length === 0) return snapshot;
  const facts: FactNode[] = [];
  for (const file of factFiles) {
    const parsed = JSON.parse(await fs.readFile(file, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`fact file must contain an array: ${file}`);
    facts.push(...(parsed as FactNode[]));
  }
  return { ...snapshot, facts };
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [entryPath] : [];
  }));
  return files.flat().sort((a, b) => a.localeCompare(b));
}

function parseArgs(argv: string[]): Args {
  const args: Args = { source: "refined", splitFacts: true, dryRun: false, allowFatal: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--slug") args.slug = requireValue("--slug", argv[++i]);
    else if (arg.startsWith("--slug=")) args.slug = arg.slice("--slug=".length);
    else if (arg === "--source") args.source = parseSource(requireValue("--source", argv[++i]));
    else if (arg.startsWith("--source=")) args.source = parseSource(arg.slice("--source=".length));
    else if (arg === "--split-facts") args.splitFacts = true;
    else if (arg === "--no-split-facts") args.splitFacts = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--allow-fatal") args.allowFatal = true;
    else if (arg === "--yes") args.yes = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parseSource(value: string): SourceKind {
  if (value === "preview" || value === "refined") return value;
  throw new Error(`--source must be preview or refined: ${value}`);
}

function requireValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function computeStats(v3: BibleSnapshotV3): {
  entities: number;
  facts: number;
  volumes: number;
  layerCounts: Record<string, number>;
  confidence: { avg: string; median: string; lowCount: number; lowPercent: string };
} {
  const layerCounts: Record<string, number> = {};
  const confidences = v3.facts.map((fact) => fact.confidence ?? fact.evidence.confidence).filter((value) => Number.isFinite(value));
  for (const fact of v3.facts) layerCounts[fact.layer] = (layerCounts[fact.layer] ?? 0) + 1;
  const sorted = [...confidences].sort((a, b) => a - b);
  const avg = sorted.length === 0 ? 0 : sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const median = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
  const lowCount = sorted.filter((value) => value < 0.7).length;
  return {
    entities: v3.entities.length,
    facts: v3.facts.length,
    volumes: Object.keys(v3.volumes).length,
    layerCounts,
    confidence: {
      avg: avg.toFixed(2),
      median: median.toFixed(2),
      lowCount,
      lowPercent: sorted.length === 0 ? "0.0" : ((lowCount / sorted.length) * 100).toFixed(1),
    },
  };
}

function summarizeWrittenFiles(files: string[]): string[] {
  const factsByDir = new Map<string, number>();
  const lines: string[] = [];
  for (const file of files) {
    if (file.includes(`${path.sep}facts${path.sep}`)) {
      factsByDir.set(path.dirname(file), (factsByDir.get(path.dirname(file)) ?? 0) + 1);
    } else if (path.basename(file) === "snapshot.json") {
      lines.push(`${file} (V3 schema_version=3)`);
    } else {
      lines.push(file);
    }
  }
  for (const [dir, count] of [...factsByDir.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${path.join(dir, "*.json")} (${count} files)`);
  }
  return lines;
}

async function confirmOverwrite(stdin: NodeJS.ReadStream, stdout: Pick<NodeJS.WriteStream, "write">): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout as NodeJS.WritableStream });
  try {
    const answer = await rl.question("[swap] WARNING: This will overwrite snapshot.json with V3 schema. Continue? (y/N) ");
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function log(stdout: Pick<NodeJS.WriteStream, "write">, message: string): void {
  stdout.write(`${message}\n`);
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSwap({ argv: process.argv.slice(2) }).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(`[swap] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
