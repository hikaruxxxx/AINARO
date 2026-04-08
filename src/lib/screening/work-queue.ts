// 作品キュー: 各層(Layer 1〜6)が独立した待機列を持ち、デーモンが層ごとに処理する
//
// 設計:
// - JSONLベースの軽量キュー(SQLite依存を避ける)
// - 各層に1ファイル: data/generation/_queues/layer{N}.jsonl
// - エントリは作品slug + 状態 + 次の層への遷移条件
// - 作品本体は data/generation/works/{slug}/ にフラット保存
// - キューファイルは追記+定期コンパクション(完了済みエントリを削除)

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync } from "fs";
import { dirname, join } from "path";

export type LayerId = 1 | 2 | 3 | 4 | 5 | 6;

export type WorkState =
  | "pending" // キュー待機中
  | "processing" // 生成中(子プロセス起動済み)
  | "done" // 当該層完了、次層へ
  | "rejected" // 評価で没
  | "failed"; // エラーで失敗

export interface QueueEntry {
  slug: string;
  layer: LayerId;
  state: WorkState;
  isExploration: boolean; // 探索枠フラグ
  genre: string;
  createdAt: number; // ms
  updatedAt: number; // ms
  attempt: number; // リトライカウント
  meta?: Record<string, unknown>;
}

export interface QueueConfig {
  baseDir: string;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  baseDir: "data/generation/_queues",
};

function queuePath(layer: LayerId, cfg: QueueConfig): string {
  return join(cfg.baseDir, `layer${layer}.jsonl`);
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** キューに作品を追加 */
export function enqueue(
  entry: Omit<QueueEntry, "createdAt" | "updatedAt" | "attempt" | "state"> &
    Partial<Pick<QueueEntry, "state" | "attempt">>,
  cfg: QueueConfig = DEFAULT_QUEUE_CONFIG,
): void {
  const path = queuePath(entry.layer, cfg);
  ensureDir(path);
  const now = Date.now();
  const full: QueueEntry = {
    ...entry,
    state: entry.state ?? "pending",
    attempt: entry.attempt ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  appendFileSync(path, JSON.stringify(full) + "\n");
}

/** キュー全件を読み込む(コンパクション目的でも使用) */
export function readQueue(layer: LayerId, cfg: QueueConfig = DEFAULT_QUEUE_CONFIG): QueueEntry[] {
  const path = queuePath(layer, cfg);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as QueueEntry);
}

/** 同一slugの最新状態だけを残してマージ(JSONL追記方式の前提) */
export function getLatestEntries(
  layer: LayerId,
  cfg: QueueConfig = DEFAULT_QUEUE_CONFIG,
): Map<string, QueueEntry> {
  const entries = readQueue(layer, cfg);
  const latest = new Map<string, QueueEntry>();
  for (const e of entries) {
    const prev = latest.get(e.slug);
    if (!prev || e.updatedAt >= prev.updatedAt) {
      latest.set(e.slug, e);
    }
  }
  return latest;
}

/** pending状態の次の作品を1件取得(FIFO) */
export function dequeueNextPending(
  layer: LayerId,
  cfg: QueueConfig = DEFAULT_QUEUE_CONFIG,
): QueueEntry | null {
  const latest = getLatestEntries(layer, cfg);
  let oldest: QueueEntry | null = null;
  for (const e of latest.values()) {
    if (e.state !== "pending") continue;
    if (!oldest || e.createdAt < oldest.createdAt) {
      oldest = e;
    }
  }
  return oldest;
}

/** 状態を更新(JSONL追記) */
export function updateState(
  slug: string,
  layer: LayerId,
  state: WorkState,
  patch: Partial<QueueEntry> = {},
  cfg: QueueConfig = DEFAULT_QUEUE_CONFIG,
): void {
  const latest = getLatestEntries(layer, cfg);
  const prev = latest.get(slug);
  if (!prev) {
    throw new Error(`updateState: slug=${slug} layer=${layer} のエントリが見つかりません`);
  }
  const updated: QueueEntry = {
    ...prev,
    ...patch,
    state,
    updatedAt: Date.now(),
  };
  appendFileSync(queuePath(layer, cfg), JSON.stringify(updated) + "\n");
}

/** コンパクション: 完了/没/失敗の古いエントリをアーカイブして本体を圧縮 */
export function compactQueue(layer: LayerId, cfg: QueueConfig = DEFAULT_QUEUE_CONFIG): {
  before: number;
  after: number;
} {
  const path = queuePath(layer, cfg);
  if (!existsSync(path)) return { before: 0, after: 0 };

  const latest = getLatestEntries(layer, cfg);
  const before = latest.size;

  // pending と processing だけ残す
  const active = Array.from(latest.values()).filter(
    (e) => e.state === "pending" || e.state === "processing",
  );

  // アーカイブに完了済みを退避
  const archived = Array.from(latest.values()).filter(
    (e) => e.state === "done" || e.state === "rejected" || e.state === "failed",
  );
  if (archived.length > 0) {
    const archivePath = join(cfg.baseDir, "archive", `layer${layer}_${Date.now()}.jsonl`);
    ensureDir(archivePath);
    writeFileSync(archivePath, archived.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }

  // 本体を書き換え(atomic rename)
  const tmp = path + ".tmp";
  writeFileSync(tmp, active.map((e) => JSON.stringify(e)).join("\n") + (active.length > 0 ? "\n" : ""));
  renameSync(tmp, path);

  return { before, after: active.length };
}

/** 統計: 各層の状態別件数 */
export function queueStats(cfg: QueueConfig = DEFAULT_QUEUE_CONFIG): Record<
  string,
  Record<WorkState, number>
> {
  const result: Record<string, Record<WorkState, number>> = {};
  for (const layer of [1, 2, 3, 4, 5, 6] as LayerId[]) {
    const latest = getLatestEntries(layer, cfg);
    const counts: Record<WorkState, number> = {
      pending: 0,
      processing: 0,
      done: 0,
      rejected: 0,
      failed: 0,
    };
    for (const e of latest.values()) {
      counts[e.state]++;
    }
    result[`layer${layer}`] = counts;
  }
  return result;
}
