import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs, openSync, closeSync, statSync, openSync as fsOpenSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../../../../../../scripts/manga/layers/_paths";
import { LAYER_REGISTRY, type LayerId } from "./registry";
import {
  deleteRunning,
  isProcessAlive,
  listRunning,
  persistRunning,
  RUNNING_JOBS_DIR,
  type RunningJobMeta,
} from "./running-store";
import { loadRecentJobs, persistJob, type StoredJob } from "./storage";
import { validateJobRequest, type JobRequest } from "./validate";

export type JobEvent = {
  seq: number;
  ts: string;
  channel: "stdout" | "stderr" | "system";
  line: string;
};

export type JobState = "running" | "succeeded" | "failed" | "aborted";

export type JobRecord = {
  id: string;
  key: string;
  layer: LayerId;
  scope: { slug: string; episode?: number; volume?: number };
  state: JobState;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  events: JobEvent[];
  revision_id?: string;
  panel_ids?: string[];
  subscribers: Set<(event: JobEvent) => void>;
  abortFn: () => void;
  aborted: boolean;
  killTimer: NodeJS.Timeout | null;
  timeoutTimer: NodeJS.Timeout | null;
  /** detached spawn された子プロセスの PID。abort や生存確認に使う。 */
  pid?: number;
  /** stdout+stderr が書き出されている log file path。再 attach 後の tail にも使用。 */
  logPath?: string;
  /** log polling 用 interval。close 時に clearInterval する。 */
  logPoll?: NodeJS.Timeout;
  /** log file 内で次に読むべき byte offset。 */
  logOffset?: number;
};

const MAX_EVENTS = 5000;
const MAX_BYTES = 8 * 1024 * 1024;
const EXPIRE_MS = 60 * 60 * 1000;
const MAX_CONCURRENT = 3;
const MAX_LINE_CHARS = 4096;
const TSX_BIN = path.join(REPO_ROOT, "node_modules/.bin/tsx");

const FORWARDED_ENV = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "AINARO_REPO_ROOT",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_PROJECT",
  "ANTHROPIC_PROJECT",
  "AINARO_OPS_JOB_ID",
] as const;

export class JobError extends Error {
  constructor(
    message: string,
    readonly code: number
  ) {
    super(message);
  }
}

export function buildChildEnv(jobId: string): NodeJS.ProcessEnv {
  const env: Partial<NodeJS.ProcessEnv> = {};
  for (const key of FORWARDED_ENV) {
    if (key === "AINARO_OPS_JOB_ID") {
      env[key] = jobId;
    } else if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env as NodeJS.ProcessEnv;
}

export class JobRegistry {
  private jobs = new Map<string, JobRecord>();
  private runningByKey = new Map<string, string>();
  private eventBytes = new Map<string, number>();
  private truncated = new Set<string>();
  private expireTimers = new Map<string, NodeJS.Timeout>();

  spawn(req: JobRequest): JobRecord {
    const validated = validateJobRequest(req);
    if (this.runningByKey.size >= MAX_CONCURRENT) {
      throw new JobError(`too many concurrent jobs (cap ${MAX_CONCURRENT})`, 429);
    }
    if (this.runningByKey.has(validated.key)) {
      throw new JobError(`job already running for key: ${validated.key}`, 409);
    }

    const id = randomUUID();
    const startedAt = new Date().toISOString();
    const logPath = path.join(RUNNING_JOBS_DIR, `${id}.log`);

    const record: JobRecord = {
      id,
      key: validated.key,
      layer: req.layer,
      scope: { slug: req.slug, episode: req.episode, volume: req.volume },
      state: "running",
      startedAt,
      events: [],
      subscribers: new Set(),
      abortFn: () => undefined,
      aborted: false,
      killTimer: null,
      timeoutTimer: null,
      logPath,
      logOffset: 0,
    };
    this.jobs.set(id, record);
    this.runningByKey.set(validated.key, id);
    this.eventBytes.set(id, 0);

    let abortRequested = false;
    const push = (channel: JobEvent["channel"], line: string) => this.pushEvent(record, channel, line);

    // log file をあらかじめ open。stdout/stderr 両方をこの fd に流す (混在で行単位順序保持)。
    let logFd: number;
    try {
      // 同期 mkdir + open。spawn より前に確実に存在させる必要がある。
      require("node:fs").mkdirSync(RUNNING_JOBS_DIR, { recursive: true });
      logFd = openSync(logPath, "a");
    } catch (e) {
      record.state = "failed";
      record.finishedAt = new Date().toISOString();
      this.runningByKey.delete(validated.key);
      push("system", `log file open failed: ${String(e)}`);
      this.persistFinal(record);
      return record;
    }

    let child: import("node:child_process").ChildProcess;
    try {
      child = spawn(TSX_BIN, validated.argv, {
        cwd: validated.cwd,
        env: buildChildEnv(id),
        shell: false,
        // detached + ignore stdin + stdout/stderr → log file fd
        // → parent (Console) が exit しても child は独立 process group で生存
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      child.unref();
    } catch (e) {
      closeSync(logFd);
      record.state = "failed";
      record.finishedAt = new Date().toISOString();
      this.runningByKey.delete(validated.key);
      push("system", `spawn failed: ${String(e)}`);
      this.persistFinal(record);
      return record;
    }
    closeSync(logFd); // child が継承しているので parent 側は閉じてよい
    record.pid = child.pid;

    push("system", `spawn: ${TSX_BIN} ${validated.argv.join(" ")} (pid=${child.pid}, detached)`);

    // running meta を永続化 (Console 再起動後の re-attach 用)
    if (child.pid) {
      void persistRunning({
        schema_version: 1,
        id,
        pid: child.pid,
        key: validated.key,
        layer: req.layer,
        scope: record.scope,
        startedAt,
        argv: [TSX_BIN, ...validated.argv],
        cwd: validated.cwd,
        log_path: logPath,
        revision_id: record.revision_id,
        panel_ids: record.panel_ids,
      }).catch((e) => console.warn(`[ops-console] persistRunning failed for ${id}:`, e));
    }

    // abort: detached child でも process.kill(pid) で動く
    record.abortFn = () => {
      if (record.state !== "running" || record.aborted) return;
      record.aborted = true;
      abortRequested = true;
      push("system", "abort requested");
      try {
        if (child.pid) process.kill(child.pid, "SIGTERM");
      } catch (e) {
        push("system", `kill SIGTERM failed: ${String(e)}`);
      }
      record.killTimer = windowlessTimeout(() => {
        if (record.state === "running" && child.pid) {
          push("system", "SIGTERM timeout; sending SIGKILL");
          try {
            process.kill(child.pid, "SIGKILL");
          } catch {
            /* already dead */
          }
        }
      }, 5000);
    };

    child.on("error", (err) => push("system", `process error: ${err.message}`));

    record.timeoutTimer = windowlessTimeout(() => {
      if (record.state !== "running") return;
      record.aborted = true;
      abortRequested = true;
      push("system", "timeout");
      try {
        if (child.pid) process.kill(child.pid, "SIGTERM");
      } catch {
        /* already dead */
      }
      record.killTimer = windowlessTimeout(() => {
        if (record.state === "running" && child.pid) {
          try {
            process.kill(child.pid, "SIGKILL");
          } catch {
            /* already dead */
          }
        }
      }, 5000);
    }, LAYER_REGISTRY[req.layer].timeoutMs);

    // log file の tail polling: stdio が file fd 経由なので parent は data event を受けない。
    // 200ms 毎に file size 差分を読み出して event 化する。
    record.logPoll = windowlessInterval(() => this.pollLogFile(record), 200);

    child.on("close", (code) => {
      if (record.timeoutTimer) clearTimeout(record.timeoutTimer);
      if (record.killTimer) clearTimeout(record.killTimer);
      if (record.logPoll) clearInterval(record.logPoll);
      record.timeoutTimer = null;
      record.killTimer = null;
      record.logPoll = undefined;
      // 最終 flush
      this.pollLogFile(record);
      record.finishedAt = new Date().toISOString();
      record.exitCode = code ?? undefined;
      record.state = abortRequested ? "aborted" : code === 0 ? "succeeded" : "failed";
      this.runningByKey.delete(validated.key);
      push("system", `done: ${record.state}${code === null ? "" : ` exit=${code}`}`);
      this.persistFinal(record);
      this.scheduleExpire(record.id);
      void deleteRunning(record.id).catch(() => {});
    });

    return record;
  }

  /** log file の新規追加分を読み出して event に変換 (in-memory + subscribers へ push)。 */
  private pollLogFile(record: JobRecord): void {
    if (!record.logPath) return;
    let size: number;
    try {
      size = statSync(record.logPath).size;
    } catch {
      return; // file not yet exists or removed
    }
    const offset = record.logOffset ?? 0;
    if (size <= offset) return;
    let fd: number;
    try {
      fd = fsOpenSync(record.logPath, "r");
    } catch {
      return;
    }
    try {
      const buf = Buffer.alloc(size - offset);
      const fsSync = require("node:fs") as typeof import("node:fs");
      fsSync.readSync(fd, buf, 0, buf.length, offset);
      record.logOffset = size;
      const text = buf.toString("utf-8");
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) this.pushEvent(record, "stdout", line);
      }
    } finally {
      closeSync(fd);
    }
  }

  get(id: string): JobRecord | null {
    return this.jobs.get(id) ?? null;
  }

  list(filter?: { slug?: string; episode?: number; volume?: number; layer?: LayerId }): JobRecord[] {
    return Array.from(this.jobs.values()).filter((job) => {
      if (filter?.slug && job.scope.slug !== filter.slug) return false;
      if (filter?.episode !== undefined && job.scope.episode !== filter.episode) return false;
      if (filter?.volume !== undefined && job.scope.volume !== filter.volume) return false;
      if (filter?.layer !== undefined && job.layer !== filter.layer) return false;
      return true;
    });
  }

  async loadPersisted(days = 7): Promise<void> {
    const stored = await loadRecentJobs(days);
    for (const job of stored) {
      if (this.jobs.has(job.id)) continue;
      this.jobs.set(job.id, this.fromStored(job));
    }
  }

  /**
   * Console 起動時に呼ぶ。`.jobs/.running/*.json` を scan し:
   *   - PID が生きている → JobRecord を再構築して running 扱い、log tail を再開
   *   - PID が死んでいる → aborted 扱いで final 化 + .running.json 削除
   *
   * これにより POST /api/restart で Console 自体を再起動しても、ジョブの実体は
   * 殺されずに継続し、新 Console が SSE/log 経由で進捗を引き継ぐ。
   */
  async reattachRunning(): Promise<void> {
    const metas = await listRunning();
    for (const meta of metas) {
      if (this.jobs.has(meta.id)) continue;
      const alive = isProcessAlive(meta.pid);
      if (!alive) {
        // 死んでいるので aborted として final 化
        const aborted: StoredJob = {
          id: meta.id,
          key: meta.key,
          layer: meta.layer,
          scope: meta.scope,
          state: "aborted",
          startedAt: meta.startedAt,
          finishedAt: new Date().toISOString(),
          exitCode: undefined,
          events: [],
          revision_id: meta.revision_id,
          panel_ids: meta.panel_ids,
        };
        await persistJob(aborted).catch(() => {});
        await deleteRunning(meta.id).catch(() => {});
        const record = this.fromStored(aborted);
        this.jobs.set(record.id, record);
        continue;
      }
      // 生きてる → running として再登録 + log tail 再開
      this.attachRunningRecord(meta);
    }
  }

  private attachRunningRecord(meta: RunningJobMeta): void {
    const record: JobRecord = {
      id: meta.id,
      key: meta.key,
      layer: meta.layer as LayerId,
      scope: meta.scope,
      state: "running",
      startedAt: meta.startedAt,
      events: [],
      revision_id: meta.revision_id,
      panel_ids: meta.panel_ids,
      subscribers: new Set(),
      abortFn: () => undefined,
      aborted: false,
      killTimer: null,
      timeoutTimer: null,
      pid: meta.pid,
      logPath: meta.log_path,
      logOffset: 0,
    };

    // abort: stored PID に対して直接 SIGTERM/SIGKILL
    record.abortFn = () => {
      if (record.state !== "running" || record.aborted) return;
      record.aborted = true;
      this.pushEvent(record, "system", "abort requested (re-attached job)");
      try {
        process.kill(meta.pid, "SIGTERM");
      } catch (e) {
        this.pushEvent(record, "system", `kill failed (process gone): ${String(e)}`);
      }
      record.killTimer = windowlessTimeout(() => {
        if (record.state === "running") {
          try {
            process.kill(meta.pid, "SIGKILL");
          } catch {
            /* already dead */
          }
        }
      }, 5000);
    };

    this.jobs.set(record.id, record);
    this.runningByKey.set(meta.key, record.id);
    this.eventBytes.set(record.id, 0);
    this.pushEvent(record, "system", `re-attached to running pid=${meta.pid}`);

    // log tail polling 再開
    record.logPoll = windowlessInterval(() => this.pollLogFile(record), 200);

    // PID 死亡監視: 1秒毎に process.kill(pid, 0) で確認、死んでいれば close 相当処理
    const liveCheck = windowlessInterval(() => {
      if (record.state !== "running") {
        clearInterval(liveCheck);
        return;
      }
      if (!isProcessAlive(meta.pid)) {
        clearInterval(liveCheck);
        if (record.logPoll) clearInterval(record.logPoll);
        record.logPoll = undefined;
        // 最終 log flush
        this.pollLogFile(record);
        // exit code は不明 (我々が spawn したわけでないので waitpid できない)
        // log の最後の数行から推測しないが、aborted/succeeded の判別は付かないので
        // record.aborted フラグ (= ユーザーが abort を要求していたか) で決める。
        record.finishedAt = new Date().toISOString();
        record.state = record.aborted ? "aborted" : "succeeded";
        this.runningByKey.delete(record.key);
        this.pushEvent(record, "system", `re-attached job exited: ${record.state} (exit code unknown)`);
        this.persistFinal(record);
        this.scheduleExpire(record.id);
        void deleteRunning(record.id).catch(() => {});
      }
    }, 1000);
  }

  abort(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new JobError("job not found", 404);
    if (job.state !== "running") throw new JobError("job is not running", 409);
    job.abortFn();
  }

  // pushLines は detached spawn 化に伴い不要になった (log file polling に置換)。
  // pollLogFile() が file からまとめて読んで pushEvent する。

  private persistFinal(record: JobRecord): void {
    if (record.state === "running") return;
    const job: StoredJob = {
      id: record.id,
      key: record.key,
      layer: record.layer,
      scope: record.scope,
      state: record.state,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      exitCode: record.exitCode,
      events: record.events.slice(-MAX_EVENTS),
      revision_id: record.revision_id,
      panel_ids: record.panel_ids,
    };
    void persistJob(job).catch((error) => {
      console.warn(`[ops-console] failed to persist job ${record.id}:`, error);
    });
  }

  private fromStored(job: StoredJob): JobRecord {
    return {
      id: job.id,
      key: job.key,
      layer: job.layer as LayerId,
      scope: job.scope,
      state: job.state,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      events: job.events.slice(-MAX_EVENTS),
      revision_id: job.revision_id,
      panel_ids: job.panel_ids,
      subscribers: new Set(),
      abortFn: () => undefined,
      aborted: job.state === "aborted",
      killTimer: null,
      timeoutTimer: null,
    };
  }

  private pushEvent(record: JobRecord, channel: JobEvent["channel"], line: string): void {
    const safeLine =
      line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}...[truncated]` : line;
    const event: JobEvent = {
      seq: record.events.length > 0 ? record.events[record.events.length - 1].seq + 1 : 1,
      ts: new Date().toISOString(),
      channel,
      line: safeLine,
    };
    record.events.push(event);
    this.eventBytes.set(record.id, (this.eventBytes.get(record.id) ?? 0) + Buffer.byteLength(safeLine, "utf-8"));
    this.trim(record);
    for (const subscriber of record.subscribers) subscriber(event);
  }

  private trim(record: JobRecord): void {
    let bytes = this.eventBytes.get(record.id) ?? 0;
    let dropped = false;
    while (record.events.length > MAX_EVENTS || bytes > MAX_BYTES) {
      const event = record.events.shift();
      if (!event) break;
      bytes -= Buffer.byteLength(event.line, "utf-8");
      dropped = true;
    }
    this.eventBytes.set(record.id, Math.max(0, bytes));
    if (dropped && !this.truncated.has(record.id)) {
      this.truncated.add(record.id);
      const seq = record.events.length > 0 ? record.events[record.events.length - 1].seq + 1 : 1;
      const event = {
        seq,
        ts: new Date().toISOString(),
        channel: "system",
        line: "buffer truncated",
      } satisfies JobEvent;
      record.events.push(event);
      for (const subscriber of record.subscribers) subscriber(event);
    }
  }

  private scheduleExpire(id: string): void {
    const old = this.expireTimers.get(id);
    if (old) clearTimeout(old);
    const timer = windowlessTimeout(() => {
      this.jobs.delete(id);
      this.eventBytes.delete(id);
      this.truncated.delete(id);
      this.expireTimers.delete(id);
    }, EXPIRE_MS);
    this.expireTimers.set(id, timer);
  }
}

function windowlessTimeout(fn: () => void, ms: number): NodeJS.Timeout {
  const timer = setTimeout(fn, ms);
  timer.unref();
  return timer;
}

function windowlessInterval(fn: () => void, ms: number): NodeJS.Timeout {
  const timer = setInterval(fn, ms);
  timer.unref();
  return timer;
}

export const jobRegistry = new JobRegistry();
void jobRegistry.loadPersisted(7).catch((error) => {
  console.warn("[ops-console] failed to load stored jobs:", error);
});
// Console 再起動でジョブが abort されないよう、起動時に running ジョブを再 attach する。
void jobRegistry.reattachRunning().catch((error) => {
  console.warn("[ops-console] failed to reattach running jobs:", error);
});
