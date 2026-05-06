/**
 * Layer 入力ハッシュ + キャッシュ管理 (B-1 計画 Track C-1)
 *
 * 目的:
 *   - L1-L8 (決定論的 layer): 入力 SHA256 が一致したら出力を再利用 (skip)
 *   - L9, L11-L13 (画像生成・PDF 生成: 非決定論): hash は **記録のみ** で skip しない
 *
 * Codex レビュー反映:
 *   - L9 以降は乱数依存なので「冪等性で品質安定」期待は危険
 *   - hash は再生成必要性の参考情報 / 監査ログとして使う
 *
 * 永続先: data/manga/works/{slug}/_cache/{layer}/{episodeOrVolume}.hash
 *   { input_hash, computed_at, inputs: [{ path, hash, bytes }], note? }
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { workDir } from "../../../../scripts/manga/layers/_paths";

/** 各 layer の確定論性 */
export const DETERMINISTIC_LAYERS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"] as const;
export const NON_DETERMINISTIC_LAYERS = ["L9", "L9b", "L11", "L12", "L13"] as const;

export type LayerId =
  | (typeof DETERMINISTIC_LAYERS)[number]
  | (typeof NON_DETERMINISTIC_LAYERS)[number];

export type InputSource = {
  /** 絶対パス or 識別子 (識別子はファイルが無い概念入力に使う) */
  path: string;
  /** ファイルの場合は file://、識別子の場合は id://、外部入力 (capability JSON 等) は config:// */
  kind: "file" | "id" | "config";
  /** id/config の場合に、内容文字列を直接渡せる (file の場合は省略) */
  contentOverride?: string;
};

export type InputHashRecord = {
  schema_version: 1;
  layer: LayerId;
  scope: string; // "ep01" / "v01" / "global" 等
  input_hash: string;
  computed_at: string;
  is_deterministic: boolean;
  inputs: { path: string; kind: InputSource["kind"]; hash: string; bytes: number | null }[];
  note?: string;
};

function isDeterministic(layer: LayerId): boolean {
  return (DETERMINISTIC_LAYERS as readonly string[]).includes(layer);
}

async function hashFile(filePath: string): Promise<{ hash: string; bytes: number }> {
  const buf = await fs.readFile(filePath);
  return {
    hash: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.byteLength,
  };
}

function hashString(content: string): { hash: string; bytes: number } {
  return {
    hash: createHash("sha256").update(content).digest("hex"),
    bytes: Buffer.byteLength(content, "utf-8"),
  };
}

async function hashOneInput(input: InputSource): Promise<{ hash: string; bytes: number | null }> {
  if (input.contentOverride !== undefined) {
    return hashString(input.contentOverride);
  }
  if (input.kind === "file") {
    return await hashFile(input.path);
  }
  // id / config without contentOverride: パス文字列をそのままハッシュ
  return hashString(input.path);
}

/** 全入力の hash を確定的に並べ、その連結を SHA256 → 集約 hash */
async function computeAggregateHash(inputs: InputSource[]): Promise<{
  aggregate: string;
  details: { path: string; kind: InputSource["kind"]; hash: string; bytes: number | null }[];
}> {
  const sorted = [...inputs].sort((a, b) => a.path.localeCompare(b.path));
  const details: { path: string; kind: InputSource["kind"]; hash: string; bytes: number | null }[] = [];
  const concat = createHash("sha256");
  for (const input of sorted) {
    const h = await hashOneInput(input);
    details.push({ path: input.path, kind: input.kind, hash: h.hash, bytes: h.bytes });
    concat.update(input.kind);
    concat.update("\0");
    concat.update(input.path);
    concat.update("\0");
    concat.update(h.hash);
    concat.update("\n");
  }
  return { aggregate: concat.digest("hex"), details };
}

export function inputHashPath(slug: string, layer: LayerId, scope: string): string {
  return path.join(workDir(slug), "_cache", layer, `${scope}.hash`);
}

export async function loadInputHash(
  slug: string,
  layer: LayerId,
  scope: string,
): Promise<InputHashRecord | null> {
  const file = inputHashPath(slug, layer, scope);
  try {
    const txt = await fs.readFile(file, "utf-8");
    return JSON.parse(txt) as InputHashRecord;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw e;
  }
}

export async function saveInputHash(record: InputHashRecord, slug: string): Promise<string> {
  const file = inputHashPath(slug, record.layer, record.scope);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(record, null, 2));
  return file;
}

export type ShouldRunResult =
  | { run: true; reason: "no-cache" | "hash-mismatch" | "non-deterministic"; record?: InputHashRecord }
  | { run: false; reason: "cache-hit"; record: InputHashRecord };

/**
 * 主インターフェース。
 * - L1-L8: 同 hash の record があれば run=false (skip)、無ければ run=true
 * - L9 以降: 常に run=true (hash は記録するだけ)
 */
export async function shouldRunLayer(args: {
  slug: string;
  layer: LayerId;
  scope: string;
  inputs: InputSource[];
  /** --force で強制再実行 */
  force?: boolean;
}): Promise<ShouldRunResult & { newRecord: InputHashRecord }> {
  const { aggregate, details } = await computeAggregateHash(args.inputs);
  const det = isDeterministic(args.layer);
  const newRecord: InputHashRecord = {
    schema_version: 1,
    layer: args.layer,
    scope: args.scope,
    input_hash: aggregate,
    computed_at: new Date().toISOString(),
    is_deterministic: det,
    inputs: details,
  };

  if (args.force) {
    return { run: true, reason: "no-cache", newRecord };
  }
  if (!det) {
    // L9+ は常に run=true、ただし hash は記録 (監査用)
    newRecord.note = "non_deterministic_layer: hash recorded for audit only";
    return { run: true, reason: "non-deterministic", newRecord };
  }
  const existing = await loadInputHash(args.slug, args.layer, args.scope);
  if (!existing) {
    return { run: true, reason: "no-cache", newRecord };
  }
  if (existing.input_hash !== aggregate) {
    return { run: true, reason: "hash-mismatch", record: existing, newRecord };
  }
  return { run: false, reason: "cache-hit", record: existing, newRecord };
}

/**
 * Layer 完了後に呼ぶ。決定論なら hash を保存、非決定論でも監査用に保存。
 */
export async function recordLayerRun(args: {
  slug: string;
  newRecord: InputHashRecord;
  note?: string;
}): Promise<{ savedTo: string }> {
  const rec: InputHashRecord = {
    ...args.newRecord,
    note: args.note ?? args.newRecord.note,
  };
  const savedTo = await saveInputHash(rec, args.slug);
  return { savedTo };
}

/** 監査用: 指定 slug 配下の全 layer hash を集計 */
export async function listAllHashes(slug: string): Promise<InputHashRecord[]> {
  const root = path.join(workDir(slug), "_cache");
  const out: InputHashRecord[] = [];
  let layers: string[] = [];
  try {
    layers = await fs.readdir(root);
  } catch {
    return out;
  }
  for (const layer of layers) {
    const dir = path.join(root, layer);
    let entries: string[] = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const f of entries.filter((x) => x.endsWith(".hash"))) {
      try {
        const txt = await fs.readFile(path.join(dir, f), "utf-8");
        out.push(JSON.parse(txt) as InputHashRecord);
      } catch {
        // ignore broken cache file
      }
    }
  }
  return out;
}
