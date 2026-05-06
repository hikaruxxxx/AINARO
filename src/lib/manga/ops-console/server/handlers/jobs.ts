import type http from "node:http";
import { isValidEpisode, isValidSlug } from "../lib/path-guards";
import type { ScopedRouterDefaults } from "../router";
import { streamJob } from "../jobs/sse";
import { isLayerId, type LayerId } from "../jobs/registry";
import { JobError, jobRegistry, type JobRecord } from "../jobs/runner";
import { validateJobRequest, type JobRequest } from "../jobs/validate";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function summarize(job: JobRecord, eventLimit = 100): unknown {
  return {
    id: job.id,
    key: job.key,
    layer: job.layer,
    scope: job.scope,
    state: job.state,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    exitCode: job.exitCode,
    events: job.events.slice(-eventLimit),
  };
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
  defaults: ScopedRouterDefaults
): Promise<void> {
  void req;
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
  const filterSlug = slug && slug === defaults.defaultSlug ? slug : defaults.defaultSlug;
  const jobs = jobRegistry
    .list({ slug: filterSlug, episode, volume, layer: layer as LayerId | undefined })
    .map((job) => summarize(job));
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
  void defaults;
  try {
    jobRegistry.abort(jobId);
    const job = jobRegistry.get(jobId);
    return send(res, 200, { ok: true, state: job?.state ?? "aborted" });
  } catch (e) {
    return send(res, statusForError(e), { error: e instanceof Error ? e.message : String(e) });
  }
}
