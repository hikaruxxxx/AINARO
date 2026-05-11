import { promises as fs } from "node:fs";
import path from "node:path";

import type { BibleSnapshotV3, FactNode } from "../schemas-v2";

export type LoadV3Options = {
  bibleDir: string;
  /** snapshot body file. Defaults to snapshot.v3.json. */
  snapshotFileName?: string;
};

const FACT_SUBDIRS = ["characters", "locations", "world", "motifs", "props", "events"] as const;

export async function loadBibleSnapshotV3FromDir(options: LoadV3Options): Promise<BibleSnapshotV3> {
  const snapshotPath = path.join(options.bibleDir, options.snapshotFileName ?? "snapshot.v3.json");
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as BibleSnapshotV3;
  const facts = await loadFacts(path.join(options.bibleDir, "facts"));
  const restored: BibleSnapshotV3 = {
    ...snapshot,
    facts: facts.length > 0 ? facts : snapshot.facts,
  };

  await validateFactIndex(options.bibleDir, restored.facts);
  validateEntityFactIds(restored);
  return restored;
}

async function loadFacts(factsDir: string): Promise<FactNode[]> {
  const allFacts: FactNode[] = [];
  for (const subDir of FACT_SUBDIRS) {
    const dir = path.join(factsDir, subDir);
    const entries = await fs.readdir(dir).catch(() => []);
    for (const file of entries.sort()) {
      if (!file.endsWith(".json")) continue;
      const content = JSON.parse(await fs.readFile(path.join(dir, file), "utf-8")) as unknown;
      const facts = extractFacts(content);
      allFacts.push(...facts);
    }
  }
  return allFacts;
}

function extractFacts(content: unknown): FactNode[] {
  if (Array.isArray(content)) return content as FactNode[];
  if (typeof content === "object" && content !== null && Array.isArray((content as { facts?: unknown }).facts)) {
    return (content as { facts: FactNode[] }).facts;
  }
  return [];
}

async function validateFactIndex(bibleDir: string, facts: FactNode[]): Promise<void> {
  const indexPath = path.join(bibleDir, "fact_index.json");
  const raw = await fs.readFile(indexPath, "utf-8").catch(() => null);
  if (raw === null) return;

  const index = JSON.parse(raw) as Array<{ id?: string; fact_id?: string }>;
  const factIds = new Set(facts.map((fact) => fact.fact_id));
  const missing = index
    .map((entry) => entry.id ?? entry.fact_id)
    .filter((id): id is string => typeof id === "string")
    .filter((id) => !factIds.has(id));
  if (missing.length > 0) {
    throw new Error(`V3 fact_index references missing facts: ${missing.slice(0, 10).join(", ")}`);
  }
}

function validateEntityFactIds(snapshot: BibleSnapshotV3): void {
  const factIds = new Set(snapshot.facts.map((fact) => fact.fact_id));
  const missing: string[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const fact of snapshot.facts) {
    if (seen.has(fact.fact_id)) duplicates.add(fact.fact_id);
    seen.add(fact.fact_id);
  }
  for (const entity of snapshot.entities) {
    for (const factId of entity.fact_ids) {
      if (!factIds.has(factId)) missing.push(`${entity.id}:${factId}`);
    }
  }

  if (duplicates.size > 0) {
    throw new Error(`V3 facts contain duplicate fact_id values: ${[...duplicates].slice(0, 10).join(", ")}`);
  }
  if (missing.length > 0) {
    throw new Error(`V3 entity.fact_ids reference missing facts: ${missing.slice(0, 10).join(", ")}`);
  }
}
