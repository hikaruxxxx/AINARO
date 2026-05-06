/**
 * Running job 永続化ストア
 *
 * 目的: Console 再起動でジョブが abort されないようにする。
 *
 * 仕組み:
 *   - spawn 時に running メタ (id/pid/argv/log_path) を `.jobs/{id}.running.json` に書く
 *   - 子プロセスは detached + stdio:[ignore, logFd, logFd] で spawn → parent 死んでも独立生存
 *   - close 時に `.running.json` を削除
 *   - Console 起動時に `.running.json` を全 scan し、PID 生きていれば再 attach
 *     (log file を tail-poll して event を復元)、死んでいれば aborted として final 化
 *
 * Console 再起動 (POST /api/restart) でも、永続化された scope (.console-scope.json) と
 * running ジョブ (.jobs/) を新 process が拾い直すので、ユーザーから見ると
 * "再起動しても何も中断されていない" 体験になる。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../../../../../../scripts/manga/layers/_paths";

export const RUNNING_JOBS_DIR = path.join(REPO_ROOT, "data/manga/_ops_console/jobs/.running");

export type RunningJobMeta = {
  schema_version: 1;
  id: string;
  pid: number;
  key: string;
  layer: string;
  scope: { slug: string; episode?: number; volume?: number };
  startedAt: string;
  argv: string[];
  cwd: string;
  log_path: string;
  /** revision_id / panel_ids — UI 側で必要なら拾える */
  revision_id?: string;
  panel_ids?: string[];
};

export async function persistRunning(meta: RunningJobMeta): Promise<void> {
  await fs.mkdir(RUNNING_JOBS_DIR, { recursive: true });
  const file = path.join(RUNNING_JOBS_DIR, `${meta.id}.json`);
  await fs.writeFile(file, JSON.stringify(meta, null, 2), "utf-8");
}

export async function deleteRunning(id: string): Promise<void> {
  const file = path.join(RUNNING_JOBS_DIR, `${id}.json`);
  await fs.unlink(file).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "ENOENT") throw e;
  });
}

export async function listRunning(): Promise<RunningJobMeta[]> {
  let files: string[];
  try {
    files = await fs.readdir(RUNNING_JOBS_DIR);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const metas: RunningJobMeta[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(RUNNING_JOBS_DIR, f), "utf-8");
      const meta = JSON.parse(raw) as RunningJobMeta;
      if (meta && typeof meta.pid === "number" && typeof meta.id === "string") {
        metas.push(meta);
      }
    } catch (e) {
      console.warn(`[ops-console] invalid running meta ${f}:`, e);
    }
  }
  return metas;
}

/**
 * PID が生きているかチェック。signal 0 は「シグナルを実際には送らず存在チェックのみ」。
 * - alive: true (process is running, owned by us or zombie)
 * - dead: false (process not found or we don't own it)
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    // EPERM = process exists but we don't own it (treat as alive defensively)
    // ESRCH = no such process
    return err.code === "EPERM";
  }
}
