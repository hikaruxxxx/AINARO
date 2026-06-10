import { promises as fs } from "node:fs";
import path from "node:path";
import {
  WORKS_DIR,
  auditPath,
  episodeDir,
  kdpDir,
  nameApprovalPath,
  workDir,
  workMetaPath,
} from "../../../../../../scripts/manga/layers/_paths";
import { FAILURE_RECIPES, isFailureReason } from "../../web/lib/failure-recipes";
import { layerLabel } from "../../web/labels";
import { jobRegistry, type JobRecord, type JobState } from "../jobs/runner";
import { isValidSlug } from "./path-guards";

export type WorkSnapshot = {
  slug: string;
  title?: string;
  phase?: string;
  audit_failed_total: number;
  pending_name_total: number;
  last_job?: { state: "succeeded" | "failed" | "aborted" | "running"; ts: string; layer: string };
  last_modified_at?: string;
  state: "stale" | "failed" | "not_started" | "ok";
  episodes: Array<{
    episode: number;
    audit_failed_count: number;
    audit_status: "ready" | "missing" | "stale";
    pending_name_count: number;
    last_audit_at?: string;
    last_modified_at?: string;
  }>;
  volumes: Array<{
    volume: number;
    kdp_package_ready: boolean;
    kdp_metadata_present: boolean;
  }>;
};

export type NextActionKind =
  | "job_failed"
  | "pending_name"
  | "audit_failed"
  | "kdp_meta_missing"
  | "new_work";

export type NextActionItem = {
  kind: NextActionKind;
  slug?: string;
  title?: string;
  episode?: number;
  volume?: number;
  message: string;
  detail?: string;
  cta_label: string;
  cta_view?: "index" | "name-gate" | "revision" | "quality" | "kdp-metadata" | "volumes" | "pipeline";
  failure_reason?: string;
};

export type DashboardData = {
  generated_at: string;
  works_snapshot: WorkSnapshot[];
  next_actions: NextActionItem[];
};

type WorkMeta = {
  title?: unknown;
  phase?: unknown;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIT_STALE_MS = 7 * DAY_MS;
const WORK_STALE_MS = 14 * DAY_MS;
const RECENT_FAILED_JOB_MS = 60 * 60 * 1000;

async function readJsonOpt<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function listSlugs(): Promise<string[]> {
  const entries = await fs.readdir(WORKS_DIR, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_") && name !== "archive" && isValidSlug(name))
    .sort();
}

async function listEpisodes(slug: string): Promise<number[]> {
  const entries = await fs.readdir(path.join(workDir(slug), "episodes"), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.match(/^ep(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

async function listVolumes(slug: string): Promise<number[]> {
  const entries = await fs.readdir(path.join(workDir(slug), "volumes"), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name.match(/^v(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

function parseDateMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function countAuditFailures(audit: Record<string, unknown>): number {
  if (typeof audit.failed_count === "number") return audit.failed_count;
  if (typeof audit.panels_failed === "number") return audit.panels_failed;
  if (Array.isArray(audit.failed_panel_ids)) return audit.failed_panel_ids.length;
  if (Array.isArray(audit.panels)) {
    return audit.panels.filter((panel) => {
      return panel !== null && typeof panel === "object" && (panel as { state?: unknown }).state === "failed";
    }).length;
  }
  if (Array.isArray(audit.checks)) {
    const failedPanels = new Set<string>();
    for (const check of audit.checks) {
      if (check === null || typeof check !== "object") continue;
      const row = check as { panel_id?: unknown; passed?: unknown };
      if (row.passed === false && typeof row.panel_id === "string") failedPanels.add(row.panel_id);
    }
    return failedPanels.size;
  }
  return 0;
}

async function auditSummary(slug: string, episode: number, nowMs: number): Promise<{
  audit_failed_count: number;
  audit_status: "ready" | "missing" | "stale";
  last_audit_at?: string;
}> {
  const file = auditPath(slug, episode);
  try {
    const [raw, stat] = await Promise.all([fs.readFile(file, "utf-8"), fs.stat(file)]);
    const audit = JSON.parse(raw) as Record<string, unknown>;
    const auditMs = parseDateMs(audit.generated_at) ?? parseDateMs(audit.audited_at) ?? stat.mtimeMs;
    return {
      audit_failed_count: countAuditFailures(audit),
      audit_status: nowMs - auditMs > AUDIT_STALE_MS ? "stale" : "ready",
      last_audit_at:
        typeof audit.generated_at === "string"
          ? audit.generated_at
          : typeof audit.audited_at === "string"
            ? audit.audited_at
            : stat.mtime.toISOString(),
    };
  } catch {
    return { audit_failed_count: 0, audit_status: "missing" };
  }
}

function countPendingNamePages(data: unknown): number {
  if (data === null || typeof data !== "object") return 0;
  const pages = (data as { pages?: unknown }).pages;
  const rows = Array.isArray(pages)
    ? pages
    : pages !== null && typeof pages === "object"
      ? Object.values(pages as Record<string, unknown>)
      : [];
  return rows.filter((row) => {
    if (row === null || typeof row !== "object") return false;
    const page = row as { state?: unknown; status?: unknown };
    return page.state === "pending" || page.status === "pending";
  }).length;
}

async function pendingNameCount(slug: string, episode: number): Promise<number> {
  const data = await readJsonOpt<unknown>(nameApprovalPath(slug, episode));
  return countPendingNamePages(data);
}

async function latestMtimeMs(dir: string): Promise<number | null> {
  let rootStat;
  try {
    rootStat = await fs.stat(dir);
  } catch {
    return null;
  }
  let latest = rootStat.mtimeMs;
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const childLatest = await latestMtimeMs(child);
      if (childLatest !== null && childLatest > latest) latest = childLatest;
    } else {
      const stat = await fs.stat(child).catch(() => null);
      if (stat && stat.mtimeMs > latest) latest = stat.mtimeMs;
    }
  }
  return latest;
}

async function episodeSnapshot(slug: string, episode: number, nowMs: number): Promise<WorkSnapshot["episodes"][number]> {
  const [audit, pending_name_count, modifiedMs] = await Promise.all([
    auditSummary(slug, episode, nowMs),
    pendingNameCount(slug, episode),
    latestMtimeMs(episodeDir(slug, episode)),
  ]);
  return {
    episode,
    ...audit,
    pending_name_count,
    last_modified_at: modifiedMs === null ? undefined : new Date(modifiedMs).toISOString(),
  };
}

async function volumeSnapshot(slug: string, volume: number): Promise<WorkSnapshot["volumes"][number]> {
  const dir = kdpDir(slug, volume);
  const [manuscript, cover, metadata] = await Promise.all([
    exists(path.join(dir, "manuscript.pdf")),
    exists(path.join(dir, "cover.pdf")),
    exists(path.join(dir, "metadata.json")),
  ]);
  return {
    volume,
    kdp_package_ready: manuscript && cover,
    kdp_metadata_present: metadata,
  };
}

function latestJob(slug: string): JobRecord | undefined {
  return jobRegistry
    .list({ slug })
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
}

async function workSnapshot(slug: string, nowMs: number): Promise<WorkSnapshot> {
  const [meta, episodes, volumes, modifiedMs] = await Promise.all([
    readJsonOpt<WorkMeta>(workMetaPath(slug)),
    listEpisodes(slug),
    listVolumes(slug),
    latestMtimeMs(workDir(slug)),
  ]);
  const [episodeRows, volumeRows] = await Promise.all([
    Promise.all(episodes.map((episode) => episodeSnapshot(slug, episode, nowMs))),
    Promise.all(volumes.map((volume) => volumeSnapshot(slug, volume))),
  ]);
  const audit_failed_total = episodeRows.reduce((sum, row) => sum + row.audit_failed_count, 0);
  const pending_name_total = episodeRows.reduce((sum, row) => sum + row.pending_name_count, 0);
  const job = latestJob(slug);
  const last_modified_at = modifiedMs === null ? undefined : new Date(modifiedMs).toISOString();
  const state =
    audit_failed_total > 0
      ? "failed"
      : episodeRows.length === 0
        ? "not_started"
        : modifiedMs !== null && nowMs - modifiedMs > WORK_STALE_MS
          ? "stale"
          : "ok";
  return {
    slug,
    title: typeof meta?.title === "string" && meta.title ? meta.title : undefined,
    phase: typeof meta?.phase === "string" && meta.phase ? meta.phase : undefined,
    audit_failed_total,
    pending_name_total,
    last_job: job ? { state: job.state as JobState, ts: job.startedAt, layer: job.layer } : undefined,
    last_modified_at,
    state,
    episodes: episodeRows,
    volumes: volumeRows,
  };
}

function workTitle(work: Pick<WorkSnapshot, "slug" | "title">): string {
  return work.title || work.slug;
}

function epLabel(episode: number): string {
  return String(episode).padStart(2, "0");
}

function volLabel(volume: number): string {
  return String(volume).padStart(2, "0");
}

function stderrTail(job: JobRecord): string | undefined {
  const line = [...job.events].reverse().find((event) => event.channel === "stderr")?.line
    ?? [...job.events].reverse().find((event) => event.line.trim().length > 0)?.line;
  if (!line) return undefined;
  return line.length > 80 ? line.slice(-80) : line;
}

function addIfRoom(items: NextActionItem[], limit: number, item: NextActionItem): void {
  if (items.length < limit) items.push(item);
}

function buildNextActions(works: WorkSnapshot[], limit: number, nowMs: number): NextActionItem[] {
  const items: NextActionItem[] = [];
  const failedJob = jobRegistry
    .list()
    .filter((job) => job.state === "failed" && nowMs - Date.parse(job.startedAt) <= RECENT_FAILED_JOB_MS)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (failedJob) {
    const work = works.find((row) => row.slug === failedJob.scope.slug);
    const reason = failedJob.failure_reason;
    const detail = reason && isFailureReason(reason) ? FAILURE_RECIPES[reason].summary : stderrTail(failedJob);
    addIfRoom(items, limit, {
      kind: "job_failed",
      slug: failedJob.scope.slug,
      title: work?.title,
      episode: failedJob.scope.episode,
      volume: failedJob.scope.volume,
      message: `${workTitle(work ?? { slug: failedJob.scope.slug })} の ${layerLabel(failedJob.layer).title} が失敗`,
      detail,
      cta_label: "ログを見る",
      cta_view: "pipeline",
      failure_reason: reason,
    });
  }

  const pending = works
    .flatMap((work) => work.episodes.map((episode) => ({ work, episode })))
    .filter(({ episode }) => episode.pending_name_count > 0)
    .sort((a, b) => b.episode.pending_name_count - a.episode.pending_name_count)[0];
  if (pending) {
    addIfRoom(items, limit, {
      kind: "pending_name",
      slug: pending.work.slug,
      title: pending.work.title,
      episode: pending.episode.episode,
      message: `${workTitle(pending.work)} ep${epLabel(pending.episode.episode)} のネーム判定 - 未判定 ${pending.episode.pending_name_count} 件`,
      cta_label: "開く",
      cta_view: "name-gate",
    });
  }

  const audit = works
    .flatMap((work) => work.episodes.map((episode) => ({ work, episode })))
    .filter(({ episode }) => episode.audit_failed_count > 0)
    .sort((a, b) => b.episode.audit_failed_count - a.episode.audit_failed_count)[0];
  if (audit) {
    addIfRoom(items, limit, {
      kind: "audit_failed",
      slug: audit.work.slug,
      title: audit.work.title,
      episode: audit.episode.episode,
      message: `${workTitle(audit.work)} ep${epLabel(audit.episode.episode)} で audit failed ${audit.episode.audit_failed_count} 件`,
      cta_label: "修正・採用を開く",
      cta_view: "revision",
    });
  }

  const kdp = works
    .flatMap((work) => work.volumes.map((volume) => ({ work, volume })))
    .filter(({ volume }) => volume.kdp_package_ready && !volume.kdp_metadata_present)
    .sort((a, b) => a.work.slug.localeCompare(b.work.slug) || a.volume.volume - b.volume.volume)[0];
  if (kdp) {
    addIfRoom(items, limit, {
      kind: "kdp_meta_missing",
      slug: kdp.work.slug,
      title: kdp.work.title,
      volume: kdp.volume.volume,
      message: `${workTitle(kdp.work)} v${volLabel(kdp.volume.volume)} の KDP メタを書く`,
      cta_label: "KDP メタを開く",
      cta_view: "kdp-metadata",
    });
  }

  if (items.length === 0) {
    addIfRoom(items, limit, {
      kind: "new_work",
      message: "新規作品を始めますか？",
      cta_label: "+ 新規作品",
      cta_view: "index",
    });
  }
  return items;
}

export async function scanDashboard(opts?: { nextActionLimit?: number }): Promise<DashboardData> {
  const limit = opts?.nextActionLimit ?? 3;
  const now = new Date();
  const nowMs = now.getTime();
  const slugs = await listSlugs();
  const works_snapshot = await Promise.all(slugs.map((slug) => workSnapshot(slug, nowMs)));
  works_snapshot.sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    generated_at: now.toISOString(),
    works_snapshot,
    next_actions: buildNextActions(works_snapshot, limit, nowMs),
  };
}
