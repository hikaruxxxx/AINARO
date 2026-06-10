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
 *
 * 単 entry 検査のみ。transitive な祖先チェック (learning_source_chain) は
 * isAllowedForProductionStrict() を使うこと。
 */
export function isAllowedForProduction(entry: RefProvenanceEntry): boolean {
  if (entry.source_type === "kindle_archive") return false;
  if (entry.rights_status !== "ai_use_allowed") return false;
  return true;
}

/**
 * 厳密版: B-1 計画 Track C-1 で導入。
 *
 * (a) 単 entry が isAllowedForProduction を満たす
 * (b) learning_source_chain の祖先 asset_id が全て kindle_archive 由来でない
 *     (transitive reject)
 * (c) trademark_check_status が "passed"
 *     (Codex指摘: 商標未チェック素材を production 入力に使うのを禁止)
 *
 * KDP 入稿前の最終ゲートとして L7 / L13 で使う。
 */
export function isAllowedForProductionStrict(
  entry: RefProvenanceEntry,
  provenance: RefsProvenance,
): { ok: true } | { ok: false; reason: string } {
  if (entry.source_type === "kindle_archive") {
    return { ok: false, reason: `kindle_archive 由来 (${entry.asset_id})` };
  }
  if (entry.rights_status !== "ai_use_allowed") {
    return { ok: false, reason: `rights_status=${entry.rights_status} (${entry.asset_id})` };
  }
  // (b) transitive: 祖先 asset_id を全部展開して検査
  const ancestors = entry.learning_source_chain ?? [];
  if (ancestors.length > 0) {
    const idx = indexByAssetId(provenance);
    for (const ancestorId of ancestors) {
      const anc = idx.get(ancestorId);
      if (!anc) {
        // 祖先 entry が記録されていない = 監査不能なので reject
        return {
          ok: false,
          reason: `祖先 ${ancestorId} の provenance entry が見つからない (${entry.asset_id})`,
        };
      }
      if (anc.source_type === "kindle_archive") {
        return {
          ok: false,
          reason: `祖先 ${ancestorId} が kindle_archive 由来 (transitive reject from ${entry.asset_id})`,
        };
      }
      if (anc.rights_status === "blocked") {
        return { ok: false, reason: `祖先 ${ancestorId} が blocked (${entry.asset_id})` };
      }
    }
  }
  // (c) 商標チェック必須化
  if (entry.trademark_check_status !== "passed") {
    return {
      ok: false,
      reason: `trademark_check_status=${entry.trademark_check_status ?? "未設定"} (${entry.asset_id}) — production 入力には "passed" が必須`,
    };
  }
  return { ok: true };
}

/**
 * provenance 全体の strict audit。1 つでも reject があれば reasons を全部返す。
 * KDP 出版前の Layer 全体検査用。
 */
export function auditProvenanceStrict(
  provenance: RefsProvenance,
  options: { onlyForEntities?: string[] } = {},
): { ok: boolean; rejected: { asset_id: string; reason: string }[] } {
  const rejected: { asset_id: string; reason: string }[] = [];
  const target = options.onlyForEntities
    ? provenance.refs.filter((r) => options.onlyForEntities!.includes(r.target_entity_id))
    : provenance.refs;

  for (const entry of target) {
    const r = isAllowedForProductionStrict(entry, provenance);
    if (!r.ok) rejected.push({ asset_id: entry.asset_id, reason: r.reason });
  }
  return { ok: rejected.length === 0, rejected };
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
  // ── Track C-1 dossier 強化 (任意、徐々に必須化) ──
  generation_prompt?: string;
  model_name?: string;
  model_version?: string;
  generation_timestamp?: string;
  purchase_record_id?: string;
  commercial_use_clause?: string;
  trademark_check_status?: import("../schemas-v2").TrademarkCheckStatus;
  learning_source_chain?: string[];
}): RefProvenanceEntry {
  const now = new Date().toISOString();
  return {
    asset_id: args.asset_id,
    path: args.path,
    source_type: args.source_type ?? "bible_generated",
    rights_status: args.rights_status ?? "ai_use_allowed",
    created_by: args.created_by ?? "system",
    created_at: now,
    derived_from: args.derived_from ?? [],
    license_note:
      args.license_note ??
      "AI生成 (Codex CLI gpt-image-2 経由)、商用利用・改変・再配布許諾。",
    training_candidate: args.training_candidate ?? false,
    target_entity_id: args.target_entity_id,
    target_entity_type: args.target_entity_type,
    variant: args.variant,
    generation_prompt: args.generation_prompt,
    model_name: args.model_name,
    model_version: args.model_version,
    generation_timestamp: args.generation_timestamp ?? (args.source_type === "bible_generated" ? now : undefined),
    edit_history: [],
    purchase_record_id: args.purchase_record_id,
    commercial_use_clause: args.commercial_use_clause,
    trademark_check_status: args.trademark_check_status ?? "pending",
    learning_source_chain: args.learning_source_chain ?? [],
  };
}

/** 既存 entry に編集履歴を追記する (in-place 安全)。 */
export function addEditHistory(
  entry: RefProvenanceEntry,
  history: { editor: string; reason: string },
): RefProvenanceEntry {
  return {
    ...entry,
    edit_history: [
      ...(entry.edit_history ?? []),
      {
        editor: history.editor,
        timestamp: new Date().toISOString(),
        reason: history.reason,
      },
    ],
  };
}
