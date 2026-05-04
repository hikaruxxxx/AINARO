/**
 * RefsProvenance ヘルパー
 *
 * bible/refs/_provenance.json の読み書きと、kindle_archive 由来の reject ガード。
 * L7 Refs Resolution が production 入力の前段で必ず使う。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  RefsProvenance,
  RefProvenanceEntry,
  RefSourceType,
  RefRightsStatus,
} from "../schemas-v2";

export const PROVENANCE_FILENAME = "_provenance.json";

export async function loadProvenance(refsDir: string): Promise<RefsProvenance> {
  const file = path.join(refsDir, PROVENANCE_FILENAME);
  try {
    const txt = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(txt) as RefsProvenance;
    if (parsed.schema_version !== 1) {
      throw new Error(`provenance schema_version mismatch: ${parsed.schema_version}`);
    }
    return parsed;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { schema_version: 1, refs: [] };
    }
    throw e;
  }
}

export async function saveProvenance(
  refsDir: string,
  provenance: RefsProvenance
): Promise<void> {
  const file = path.join(refsDir, PROVENANCE_FILENAME);
  await fs.mkdir(refsDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(provenance, null, 2));
}

export async function appendProvenanceEntry(
  refsDir: string,
  entry: RefProvenanceEntry
): Promise<void> {
  const cur = await loadProvenance(refsDir);
  // 既存 asset_id があれば置換
  const filtered = cur.refs.filter((r) => r.asset_id !== entry.asset_id);
  filtered.push(entry);
  await saveProvenance(refsDir, { schema_version: 1, refs: filtered });
}

/**
 * production 入力許可判定。kindle_archive 由来 / blocked 状態は false。
 * L7 が refs を選ぶ前に必ず通す。
 */
export function isAllowedForProduction(entry: RefProvenanceEntry): boolean {
  if (entry.source_type === "kindle_archive") return false;
  if (entry.rights_status !== "ai_use_allowed") return false;
  return true;
}

/** asset_id → entry の lookup map */
export function indexByAssetId(
  provenance: RefsProvenance
): Map<string, RefProvenanceEntry> {
  return new Map(provenance.refs.map((r) => [r.asset_id, r]));
}

/** target_entity_id × variant で entry を引く */
export function findRefsByEntity(
  provenance: RefsProvenance,
  entityId: string,
  variant?: string
): RefProvenanceEntry[] {
  return provenance.refs.filter(
    (r) =>
      r.target_entity_id === entityId &&
      (variant === undefined || r.variant === variant) &&
      isAllowedForProduction(r)
  );
}

/** 新規 entry を組み立てるヘルパー (default は bible_generated/ai_use_allowed) */
export function makeProvenanceEntry(args: {
  asset_id: string;
  path: string;
  target_entity_id: string;
  target_entity_type: "character" | "location" | "prop" | "style";
  variant: string;
  source_type?: RefSourceType;
  rights_status?: RefRightsStatus;
  created_by?: string;
  derived_from?: string[];
  license_note?: string;
  training_candidate?: boolean;
}): RefProvenanceEntry {
  return {
    asset_id: args.asset_id,
    path: args.path,
    source_type: args.source_type ?? "bible_generated",
    rights_status: args.rights_status ?? "ai_use_allowed",
    created_by: args.created_by ?? "system",
    created_at: new Date().toISOString(),
    derived_from: args.derived_from ?? [],
    license_note:
      args.license_note ??
      "AI生成 (Codex CLI gpt-image-2 経由)、商用利用・改変・再配布許諾。",
    training_candidate: args.training_candidate ?? false,
    target_entity_id: args.target_entity_id,
    target_entity_type: args.target_entity_type,
    variant: args.variant,
  };
}
