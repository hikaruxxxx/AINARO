import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { BibleSnapshotV3, FactNode } from "../schemas-v2";

export type AtomicWriteResult = {
  ok: boolean;
  written_files: string[];
  rollback_used?: boolean;
  error?: string;
};

export type AtomicWriteOptions = {
  /** snapshot 永続化先 root (例: data/manga/works/<slug>/bible) */
  bibleDir: string;
  /** rollback 用 .bak-pre-<stage>.json suffix */
  stageLabel: string;
  /** facts/ 分割を有効にするか (false で V3 snapshot 単一ファイル) */
  splitFacts?: boolean;
  /** V3 snapshot のファイル名。default は snapshot.v3.json */
  v3FileName?: string;
};

export type ConsistencyCheckResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

type FactIndexEntry = {
  id: string;
  entity_id: string | null;
  aspect: FactNode["aspect"];
  layer: FactNode["layer"];
  revealed_at_volume?: number | null;
};

type PlannedJsonFile = {
  relativePath: string;
  data: unknown;
};

type MoveEntry = {
  from: string;
  to: string;
};

export async function writeSnapshotV3Atomic(
  v3: BibleSnapshotV3,
  options: AtomicWriteOptions,
): Promise<AtomicWriteResult> {
  const bibleDir = options.bibleDir;
  const splitFacts = options.splitFacts ?? true;
  const snapshotFileName = options.v3FileName ?? "snapshot.v3.json";
  const timestamp = safeTimestamp();
  const tmpDir = path.join(bibleDir, `.tmp-write-${timestamp}`);
  const oldDir = path.join(bibleDir, `.old-${timestamp}`);
  const backupPath = path.join(bibleDir, `snapshot.bak-pre-${sanitizeStageLabel(options.stageLabel)}-${timestamp}.json`);
  const snapshotPath = path.join(bibleDir, snapshotFileName);
  const writtenFiles: string[] = [];
  const oldMoves: MoveEntry[] = [];
  let backupCreated = false;
  let renameStarted = false;

  try {
    await fs.mkdir(bibleDir, { recursive: true });

    if (await exists(snapshotPath)) {
      await fs.copyFile(snapshotPath, backupPath);
      backupCreated = true;
    }

    const plannedFiles = planSnapshotFiles(v3, splitFacts, snapshotFileName);
    await fs.mkdir(tmpDir, { recursive: true });

    for (const file of plannedFiles) {
      const target = path.join(tmpDir, file.relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, `${JSON.stringify(file.data, null, 2)}\n`, "utf8");
    }

    const checksums = await writeAndVerifyChecksums(tmpDir, plannedFiles.map((file) => file.relativePath));

    const consistency = validateSnapshotConsistency(v3);
    if (!consistency.ok) {
      throw new Error(`V3 snapshot consistency check failed: ${consistency.errors.join("; ")}`);
    }

    await fs.mkdir(oldDir, { recursive: true });
    for (const relativePath of [snapshotFileName, "facts", "fact_index.json", "checksums.json"]) {
      const from = path.join(bibleDir, relativePath);
      if (await exists(from)) {
        const to = path.join(oldDir, relativePath);
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.rename(from, to);
        oldMoves.push({ from, to });
      }
    }

    renameStarted = true;
    for (const relativePath of [...plannedFiles.map((file) => file.relativePath), "checksums.json"]) {
      const from = path.join(tmpDir, relativePath);
      const to = path.join(bibleDir, relativePath);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
      writtenFiles.push(to);
    }

    await fs.rm(tmpDir, { recursive: true, force: true });

    return {
      ok: true,
      written_files: writtenFiles,
    };
  } catch (error) {
    await rollbackAtomicWrite({
      tmpDir,
      oldMoves,
      backupPath: backupCreated ? backupPath : null,
      snapshotPath,
      finalPaths: writtenFiles,
      renameStarted,
    });

    return {
      ok: false,
      written_files: writtenFiles,
      rollback_used: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function validateSnapshotConsistency(v3: BibleSnapshotV3): ConsistencyCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const factIds = new Set<string>();
  const entityIds = new Set<string>();

  for (const fact of v3.facts) {
    if (factIds.has(fact.fact_id)) {
      errors.push(`Duplicate fact_id: ${fact.fact_id}`);
    }
    factIds.add(fact.fact_id);
  }

  for (const entity of v3.entities) {
    if (entityIds.has(entity.id)) {
      errors.push(`Duplicate entity id: ${entity.id}`);
    }
    entityIds.add(entity.id);
  }

  for (const entity of v3.entities) {
    for (const factId of entity.fact_ids) {
      if (!factIds.has(factId)) {
        errors.push(`Entity ${entity.id} references missing fact_id ${factId}`);
      }
    }
  }

  for (const fact of v3.facts) {
    if (fact.entity_id !== null && !entityIds.has(fact.entity_id)) {
      errors.push(`Fact ${fact.fact_id} references missing entity_id ${fact.entity_id}`);
    }

    for (const refId of fact.references ?? []) {
      if (!factIds.has(refId)) {
        warnings.push(`Fact ${fact.fact_id} references missing fact_id ${refId}`);
      }
    }
    for (const refId of fact.invalidates ?? []) {
      if (!factIds.has(refId)) {
        warnings.push(`Fact ${fact.fact_id} invalidates missing fact_id ${refId}`);
      }
    }
    for (const refId of fact.supersedes ?? []) {
      if (!factIds.has(refId)) {
        warnings.push(`Fact ${fact.fact_id} supersedes missing fact_id ${refId}`);
      }
    }
  }

  for (const relation of v3.relations) {
    if (!entityIds.has(relation.from_id)) {
      errors.push(`Relation ${relation.rel_id} references missing from_id ${relation.from_id}`);
    }
    if (!entityIds.has(relation.to_id)) {
      errors.push(`Relation ${relation.rel_id} references missing to_id ${relation.to_id}`);
    }
    for (const factId of relation.fact_ids) {
      if (!factIds.has(factId)) {
        errors.push(`Relation ${relation.rel_id} references missing fact_id ${factId}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function planSnapshotFiles(v3: BibleSnapshotV3, splitFacts: boolean, snapshotFileName: string): PlannedJsonFile[] {
  if (!splitFacts) {
    return [{ relativePath: snapshotFileName, data: v3 }];
  }

  const files: PlannedJsonFile[] = [{ relativePath: snapshotFileName, data: { ...v3, facts: [] } }];
  const factsByPath = new Map<string, FactNode[]>();

  for (const fact of v3.facts) {
    const relativePath = factPathFor(v3, fact);
    const existing = factsByPath.get(relativePath) ?? [];
    existing.push(fact);
    factsByPath.set(relativePath, existing);
  }

  for (const [relativePath, facts] of [...factsByPath.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    files.push({ relativePath, data: facts });
  }

  files.push({
    relativePath: "fact_index.json",
    data: v3.facts.map((fact): FactIndexEntry => ({
      id: fact.fact_id,
      entity_id: fact.entity_id,
      aspect: fact.aspect,
      layer: fact.layer,
      revealed_at_volume: fact.revealed_at_volume,
    })),
  });

  return files;
}

function factPathFor(v3: BibleSnapshotV3, fact: FactNode): string {
  if (fact.entity_id === null) {
    return path.join("facts", "world", `${safeFileName(fact.aspect)}.json`);
  }

  const entity = v3.entities.find((candidate) => candidate.id === fact.entity_id);
  const bucket = entityKindToFactBucket(entity?.kind);
  return path.join("facts", bucket, `${safeFileName(fact.entity_id)}.json`);
}

function entityKindToFactBucket(kind: string | undefined): string {
  switch (kind) {
    case "character":
      return "characters";
    case "location":
      return "locations";
    case "motif":
      return "motifs";
    case "prop":
      return "props";
    case "event":
      return "events";
    default:
      return "world";
  }
}

async function writeAndVerifyChecksums(
  tmpDir: string,
  relativePaths: string[],
): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};

  for (const relativePath of relativePaths) {
    checksums[relativePath] = await sha256File(path.join(tmpDir, relativePath));
  }

  await fs.writeFile(path.join(tmpDir, "checksums.json"), `${JSON.stringify(checksums, null, 2)}\n`, "utf8");

  for (const relativePath of relativePaths) {
    const actual = await sha256File(path.join(tmpDir, relativePath));
    if (actual !== checksums[relativePath]) {
      throw new Error(`Checksum mismatch for ${relativePath}`);
    }
  }

  return checksums;
}

async function sha256File(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function rollbackAtomicWrite(args: {
  tmpDir: string;
  oldMoves: MoveEntry[];
  backupPath: string | null;
  snapshotPath: string;
  finalPaths: string[];
  renameStarted: boolean;
}): Promise<void> {
  await fs.rm(args.tmpDir, { recursive: true, force: true }).catch(() => undefined);

  if (args.renameStarted) {
    for (const finalPath of [...args.finalPaths].reverse()) {
      await fs.rm(finalPath, { recursive: true, force: true }).catch(() => undefined);
    }

    for (const move of [...args.oldMoves].reverse()) {
      if (await exists(move.to)) {
        await fs.rm(move.from, { recursive: true, force: true }).catch(() => undefined);
        await fs.mkdir(path.dirname(move.from), { recursive: true }).catch(() => undefined);
        await fs.rename(move.to, move.from).catch(() => undefined);
      }
    }
  }

  if (args.backupPath !== null && (await exists(args.backupPath))) {
    await fs.copyFile(args.backupPath, args.snapshotPath).catch(() => undefined);
  }
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
}

function safeTimestamp(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeStageLabel(stageLabel: string): string {
  return stageLabel.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function safeFileName(value: string): string {
  return value.replace(/[\\/]/g, "_");
}
