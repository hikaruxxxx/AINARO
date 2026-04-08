// 冪等化用 _progress.json ヘルパ
// バッチ途中で落ちた場合の再開を可能にする。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { ProgressFile, ProgressEntry, SlugState } from "./types";

export function progressPath(batchDir: string): string {
  return join(batchDir, "_progress.json");
}

/** 既存ファイルがあれば読む。なければ初期化する */
export function loadOrInitProgress(
  batchDir: string,
  batchId: string,
  parallelism: number,
  totalTarget: number,
): ProgressFile {
  const path = progressPath(batchDir);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8")) as ProgressFile;
  }
  mkdirSync(dirname(path), { recursive: true });
  const fresh: ProgressFile = {
    batchId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parallelism,
    totalTarget,
    entries: {},
  };
  writeFileSync(path, JSON.stringify(fresh, null, 2));
  return fresh;
}

export function saveProgress(batchDir: string, progress: ProgressFile): void {
  progress.updatedAt = new Date().toISOString();
  writeFileSync(progressPath(batchDir), JSON.stringify(progress, null, 2));
}

/** あるslugの状態を更新する（既存はマージ） */
export function updateEntry(
  progress: ProgressFile,
  slug: string,
  patch: Partial<ProgressEntry>,
): ProgressEntry {
  const prev = progress.entries[slug] ?? {
    slug,
    state: "pending" as SlugState,
    updatedAt: new Date().toISOString(),
  };
  const next: ProgressEntry = {
    ...prev,
    ...patch,
    slug,
    updatedAt: new Date().toISOString(),
  };
  progress.entries[slug] = next;
  return next;
}

/** 特定状態のslug一覧を返す */
export function slugsByState(progress: ProgressFile, ...states: SlugState[]): string[] {
  return Object.values(progress.entries)
    .filter((e) => states.includes(e.state))
    .map((e) => e.slug);
}

/** 再開時、未処理のslug一覧（pending / generating で止まったもの） */
export function pendingSlugs(progress: ProgressFile): string[] {
  return slugsByState(progress, "pending", "generating");
}
