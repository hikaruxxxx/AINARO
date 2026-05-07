import type http from "node:http";
import { isValidEpisode, isValidSlug } from "../lib/path-guards";
import type { RouterDefaults, ScopedRouterDefaults } from "../router";
import { streamJob } from "../jobs/sse";
import { isLayerId, type LayerId } from "../jobs/registry";
import { JobError, jobRegistry, type JobRecord } from "../jobs/runner";
import { loadRecentJobs, type StoredJob } from "../jobs/storage";
import { validateJobRequest, type JobRequest } from "../jobs/validate";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function summarize(job: JobRecord | StoredJob, eventLimit = 100): unknown {
  return {
    id: job.id,
    key: job.key,
    layer: job.layer,
    scope: job.scope,
    state: job.state,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    failure_reason: job.failure_reason,
    events: job.events.slice(-eventLimit),
  };
}

function mergeJobs(jobs: Array<JobRecord | StoredJob>): Array<JobRecord | StoredJob> {
  const byId = new Map<string, JobRecord | StoredJob>();
  for (const job of jobs) byId.set(job.id, job);
  return Array.from(byId.values()).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function matchesFilter(
  job: JobRecord | StoredJob,
  filter?: { slug?: string; episode?: number; volume?: number; layer?: LayerId }
): boolean {
  if (filter?.slug && job.scope.slug !== filter.slug) return false;
  if (filter?.episode !== undefined && job.scope.episode !== filter.episode) return false;
  if (filter?.volume !== undefined && job.scope.volume !== filter.volume) return false;
  if (filter?.layer !== undefined && job.layer !== filter.layer) return false;
  return true;
}

function statusForError(e: unknown): number {
  if (e instanceof JobError) return e.code;
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("already running")) return 409;
  if (message.includes("not found")) return 404;
  if (message.includes("not running")) return 409;
  return 400;
}

export async function handleJobsList(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  defaults: RouterDefaults
): Promise<void> {
  void req;
  const all = url.searchParams.get("all") === "true";
  const slug = url.searchParams.get("slug") ?? undefined;
  const episodeRaw = url.searchParams.get("episode");
  const volumeRaw = url.searchParams.get("volume");
  const layerRaw = url.searchParams.get("layer");
  if (slug !== undefined && !isValidSlug(slug)) return send(res, 400, { error: "invalid slug" });
  const episode = episodeRaw === null ? undefined : Number(episodeRaw);
  if (episode !== undefined && !isValidEpisode(episode)) {
    return send(res, 400, { error: "invalid episode" });
  }
  const volume = volumeRaw === null ? undefined : Number(volumeRaw);
  if (volume !== undefined && (!Number.isInteger(volume) || volume <= 0)) {
    return send(res, 400, { error: "invalid volume" });
  }
  const layer = layerRaw === null ? undefined : layerRaw;
  if (layer !== undefined && !isLayerId(layer)) return send(res, 400, { error: "invalid layer" });
  const layerFilter = layer as LayerId | undefined;
  const stored = await loadRecentJobs(7);
  const filterSlug = all ? slug : slug ?? defaults.defaultSlug ?? undefined;
  const filter = { slug: filterSlug, episode, volume, layer: layerFilter };
  const memory = jobRegistry.list(all ? { slug, episode, volume, layer: layerFilter } : filter);
  const jobs = mergeJobs([...memory, ...stored.filter((job) => matchesFilter(job, filter))]).map((job) => summarize(job));
  return send(res, 200, { jobs });
}

export async function handleJobsStart(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: any,
  defaults: ScopedRouterDefaults
): Promise<void> {
  void req;
  if (body?.slug !== defaults.defaultSlug) {
    return send(res, 403, { error: "slug does not match server scope" });
  }
  if (body?.episode !== undefined && Number(body.episode) !== defaults.defaultEpisode) {
    return send(res, 403, { error: "episode does not match server scope" });
  }
  const request: JobRequest = {
    layer: body?.layer,
    slug: body?.slug,
    episode: body?.episode !== undefined ? Number(body.episode) : undefined,
    volume: body?.volume !== undefined ? Number(body.volume) : undefined,
    args: body?.args ?? {},
  };
  try {
    const validated = validateJobRequest(request);
    const job = jobRegistry.spawn(request);
    return send(res, 201, {
      job_id: job.id,
      layer: job.layer,
      key: validated.key,
      state: job.state,
    });
  } catch (e) {
    const status = statusForError(e);
    const message = e instanceof Error ? e.message : String(e);
    return send(res, status, { error: status === 429 ? "too many concurrent jobs (cap 3)" : message });
  }
}

export async function handleJobsStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  jobId: string,
  defaults: ScopedRouterDefaults
): Promise<void> {
  void defaults;
  const job = jobRegistry.get(jobId);
  if (!job) return send(res, 404, { error: "job not found" });
  return streamJob(req, res, job);
}

export async function handleJobsAbort(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  jobId: string,
  defaults: ScopedRouterDefaults
): Promise<void> {
  void req;
  try {
    const current = jobRegistry.get(jobId);
    if (current && current.scope.slug !== defaults.defaultSlug) {
      return send(res, 403, { error: "起動 scope と異なる作品です (`npm run console -- --slug X` で起動してください)" });
    }
    if (current?.scope.episode !== undefined && current.scope.episode !== defaults.defaultEpisode) {
      return send(res, 403, { error: "起動 scope と異なる episode です" });
    }
    jobRegistry.abort(jobId);
    const job = jobRegistry.get(jobId);
    return send(res, 200, { ok: true, state: job?.state ?? "aborted" });
  } catch (e) {
    return send(res, statusForError(e), { error: e instanceof Error ? e.message : String(e) });
  }
}
