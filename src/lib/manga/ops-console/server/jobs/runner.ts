import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { REPO_ROOT } from "../../../../../../scripts/manga/layers/_paths";
import { LAYER_REGISTRY, type LayerId } from "./registry";
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
    const record: JobRecord = {
      id,
      key: validated.key,
      layer: req.layer,
      scope: { slug: req.slug, episode: req.episode, volume: req.volume },
      state: "running",
      startedAt: new Date().toISOString(),
      events: [],
      subscribers: new Set(),
      abortFn: () => undefined,
      aborted: false,
      killTimer: null,
      timeoutTimer: null,
    };
    this.jobs.set(id, record);
    this.runningByKey.set(validated.key, id);
    this.eventBytes.set(id, 0);

    let child: ChildProcessWithoutNullStreams;
    let abortRequested = false;
    const push = (channel: JobEvent["channel"], line: string) => this.pushEvent(record, channel, line);
    try {
      child = spawn(TSX_BIN, validated.argv, {
        cwd: validated.cwd,
        env: buildChildEnv(id),
        shell: false,
      });
    } catch (e) {
      record.state = "failed";
      record.finishedAt = new Date().toISOString();
      this.runningByKey.delete(validated.key);
      push("system", `spawn failed: ${String(e)}`);
      this.persistFinal(record);
      return record;
    }

    push("system", `spawn: ${TSX_BIN} ${validated.argv.join(" ")}`);
    record.abortFn = () => {
      if (record.state !== "running" || record.aborted) return;
      record.aborted = true;
      abortRequested = true;
      push("system", "abort requested");
      child.kill("SIGTERM");
      record.killTimer = windowlessTimeout(() => {
        if (record.state === "running") {
          push("system", "SIGTERM timeout; sending SIGKILL");
          child.kill("SIGKILL");
        }
      }, 5000);
    };

    child.stdout.on("data", (buf) => this.pushLines(record, "stdout", buf));
    child.stderr.on("data", (buf) => this.pushLines(record, "stderr", buf));
    child.on("error", (err) => push("system", `process error: ${err.message}`));

    record.timeoutTimer = windowlessTimeout(() => {
      if (record.state !== "running") return;
      record.aborted = true;
      abortRequested = true;
      push("system", "timeout");
      child.kill("SIGTERM");
      record.killTimer = windowlessTimeout(() => {
        if (record.state === "running") child.kill("SIGKILL");
      }, 5000);
    }, LAYER_REGISTRY[req.layer].timeoutMs);

    child.on("close", (code) => {
      if (record.timeoutTimer) clearTimeout(record.timeoutTimer);
      if (record.killTimer) clearTimeout(record.killTimer);
      record.timeoutTimer = null;
      record.killTimer = null;
      record.finishedAt = new Date().toISOString();
      record.exitCode = code ?? undefined;
      record.state = abortRequested ? "aborted" : code === 0 ? "succeeded" : "failed";
      this.runningByKey.delete(validated.key);
      push("system", `done: ${record.state}${code === null ? "" : ` exit=${code}`}`);
      this.persistFinal(record);
      this.scheduleExpire(record.id);
    });

    return record;
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

  abort(id: string): void {
    const job = this.jobs.get(id);
    if (!job) throw new JobError("job not found", 404);
    if (job.state !== "running") throw new JobError("job is not running", 409);
    job.abortFn();
  }

  private pushLines(record: JobRecord, channel: "stdout" | "stderr", buf: Buffer): void {
    const text = buf.toString("utf-8");
    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) this.pushEvent(record, channel, line);
    }
  }

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

export const jobRegistry = new JobRegistry();
void jobRegistry.loadPersisted(7).catch((error) => {
  console.warn("[ops-console] failed to load stored jobs:", error);
});
