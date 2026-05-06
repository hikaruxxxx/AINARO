import type { WorkInfo } from "./store";
import type {
  NameApproval as SourceNameApproval,
  NameManifest as SourceNameManifest,
} from "../../../name-preview/types";
import type {
  AdoptedVersions,
  RenderManifestEntry,
  RevisionEntry,
  RevisionTag,
} from "../../../revision-ui/types";
import type {
  AuditReport,
  EpisodeStoryboardV2,
  PagePlanV2,
} from "../../../schemas-v2";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`API error ${status}: ${body}`);
  }
}

export type Bootstrap = {
  /** 一覧モード (`npm run console` 引数なし) では null。SPA は index view を表示する。 */
  default_slug: string | null;
  default_episode: number | null;
  works: WorkInfo[];
};

export type Manifest = {
  schema_version: number;
  slug: string;
  episode: number;
  episode_id: string;
  generated_at: string;
  page_plan: PagePlanV2;
  storyboard: EpisodeStoryboardV2;
  audit: AuditReport | null;
  render_manifest: RenderManifestEntry[];
  revision_queue: RevisionEntry[];
  adopted: AdoptedVersions;
  bible_characters?: Array<{ id: string; name: string }>;
};

export type NameManifest = SourceNameManifest;
export type NameApproval = SourceNameApproval;
export type {
  AdoptedPanelChoice,
  AdoptedVersions,
  RenderManifestEntry,
  RevisionEntry,
  RevisionTag,
} from "../../../revision-ui/types";

/**
 * 全エラーを ApiError に正規化する fetch wrapper。
 * 呼び出し側は `instanceof ApiError` だけで分岐できる:
 *  - status === 0: network error (fetch 自体が throw)
 *  - status >= 400: server エラー (body は JSON or plain text)
 *  - status === res.status (200 帯) で JSON parse 失敗: invalid response
 */
async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new ApiError(0, `network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const body = await res.text();
  if (!res.ok) throw new ApiError(res.status, body);
  try {
    return JSON.parse(body) as T;
  } catch (e) {
    throw new ApiError(
      res.status,
      `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(0, `network error: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new ApiError(
      res.status,
      `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export function apiGetBootstrap(): Promise<Bootstrap> {
  return getJson<Bootstrap>("/api/bootstrap");
}

export function apiGetWorks(): Promise<{ works: WorkInfo[] }> {
  return getJson<{ works: WorkInfo[] }>("/api/works");
}

export function apiGetWorkEpisodes(slug: string): Promise<{ slug: string; episodes: number[] }> {
  return getJson<{ slug: string; episodes: number[] }>(
    `/api/works/${encodeURIComponent(slug)}/episodes`
  );
}

export function apiGetManifest(slug: string, episode: number): Promise<Manifest> {
  return getJson<Manifest>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/manifest`
  );
}

export type PipelineStatusLayer = {
  id: string;
  label: string;
  status: "missing" | "ready" | "stale";
  artifacts: string[];
  last_modified?: string;
  next_view?: string;
  next_layer_id?: string | null;
};

export type PipelineStatus = {
  slug: string;
  episode: number;
  layers: PipelineStatusLayer[];
  generated_at: string;
};

export function apiGetPipelineStatus(slug: string, episode: number): Promise<PipelineStatus> {
  return getJson<PipelineStatus>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/pipeline-status`
  );
}

export function apiGetNameApproval(slug: string, episode: number): Promise<NameApproval> {
  return getJson<NameApproval>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/name-approval`
  );
}

export function apiGetNameManifest(slug: string, episode: number): Promise<NameManifest> {
  return getJson<NameManifest>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/name-manifest`
  );
}

export function apiPostNameApproval(
  slug: string,
  episode: number,
  body: { page_no: number; status: string; reasons: string[]; note: string }
): Promise<{ ok: true; page_no: number; status: string; rerun_from: string | null }> {
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/name-approval`,
    body
  );
}

export function apiGetRevisionQueue(
  slug: string,
  episode: number
): Promise<{ entries: RevisionEntry[] }> {
  return getJson<{ entries: RevisionEntry[] }>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/revision-queue`
  );
}

export function apiPostRevisionQueue(
  slug: string,
  episode: number,
  body: {
    panel_id: string;
    page_no: number;
    panel_no?: number;
    instruction: string;
    checked_tags: RevisionTag[];
    image_path: string;
    for_version: string;
  }
): Promise<{ ok: true; id: string; duplicate_warning: string | null }> {
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/revision-queue`,
    body
  );
}

export function apiGetAdopted(slug: string, episode: number): Promise<AdoptedVersions> {
  return getJson<AdoptedVersions>(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/adopted-versions`
  );
}

export function apiPostAdopted(
  slug: string,
  episode: number,
  body: { panel_id: string; chosen_version: string; image_path: string; note?: string }
): Promise<{ ok: true; panel_id: string; choice: AdoptedVersions["panels"][string] }> {
  return postJson(
    `/api/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/adopted-versions`,
    body
  );
}

export type LayerId =
  | "L01"
  | "L01b"
  | "L01c"
  | "L02"
  | "L02b"
  | "L09"
  | "L10"
  | "L11"
  | "L12"
  | "L13"
  | "kdp-dry-run"
  | "scrape-bsr";

export type JobScope = "work" | "episode" | "volume";

export type JobEvent = {
  seq: number;
  ts: string;
  channel: "stdout" | "stderr" | "system";
  line: string;
};

export type JobState = "running" | "succeeded" | "failed" | "aborted";

export type JobSummary = {
  id: string;
  layer: LayerId;
  key: string;
  scope: { slug: string; episode?: number; volume?: number };
  state: JobState;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  events?: JobEvent[];
};

export type JobStartRequest = {
  layer: LayerId;
  slug: string;
  episode?: number;
  volume?: number;
  args?: Record<string, string>;
};

export function apiPostJob(
  req: JobStartRequest
): Promise<{ job_id: string; layer: LayerId; key: string; state: JobState }> {
  return postJson("/api/jobs", req);
}

export function apiGetJobs(filter?: {
  slug?: string;
  episode?: number;
  volume?: number;
  layer?: LayerId;
}): Promise<{ jobs: JobSummary[] }> {
  const params = new URLSearchParams();
  if (filter?.slug) params.set("slug", filter.slug);
  if (filter?.episode !== undefined) params.set("episode", String(filter.episode));
  if (filter?.volume !== undefined) params.set("volume", String(filter.volume));
  if (filter?.layer) params.set("layer", filter.layer);
  const qs = params.toString();
  return getJson<{ jobs: JobSummary[] }>(`/api/jobs${qs ? `?${qs}` : ""}`);
}

export function apiAbortJob(jobId: string): Promise<{ ok: true; state: JobState }> {
  return postJson(`/api/jobs/${encodeURIComponent(jobId)}/abort`, {});
}

export function openJobStream(
  jobId: string,
  opts: {
    onEvent: (e: JobEvent) => void;
    onDone: (info: { state: JobState; exitCode: number | null }) => void;
    onError?: (err: Error) => void;
    lastEventId?: number;
  }
): { close: () => void } {
  const qs = opts.lastEventId !== undefined ? `?lastEventId=${opts.lastEventId}` : "";
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/stream${qs}`);
  source.addEventListener("data", (event) => {
    opts.onEvent(JSON.parse((event as MessageEvent).data) as JobEvent);
  });
  source.addEventListener("done", (event) => {
    opts.onDone(JSON.parse((event as MessageEvent).data) as { state: JobState; exitCode: number | null });
    source.close();
  });
  source.onerror = () => {
    // EventSource は default で自動再接続するが、ジョブ完了済みや 503 (cap 超過) で
    // 永続的にリトライされるとサーバ負荷とメモリリークの原因になる。
    // ここで close して呼び出し側に通知し、必要なら refetch で復帰させる。
    source.close();
    opts.onError?.(new Error("job stream error"));
  };
  return { close: () => source.close() };
}

export type BibleCharacterRef = { id: string; files: string[] };

export type BibleAssetView = {
  schema_version: number;
  generated_at?: string;
  generated_from?: unknown;
  meta: unknown;
  world: unknown;
  characters: unknown[];
  locations: unknown[];
  props: unknown[];
  costumes?: unknown[];
  relations?: unknown[];
  style_directives?: unknown;
  visual_motifs?: unknown;
  continuity_seeds?: unknown;
  volume_synopsis?: unknown;
  refs: {
    characters: BibleCharacterRef[];
    locations: BibleCharacterRef[];
    props: BibleCharacterRef[];
  };
};

export function apiGetBible(slug: string): Promise<BibleAssetView> {
  return getJson<BibleAssetView>(`/api/works/${encodeURIComponent(slug)}/bible`);
}

export type VolumePlot = {
  slug: string;
  volume: number;
  plot: unknown;
};

export function apiGetVolumePlot(slug: string, volume: number): Promise<VolumePlot> {
  return getJson<VolumePlot>(
    `/api/works/${encodeURIComponent(slug)}/volumes/v${String(volume).padStart(2, "0")}/plot`
  );
}
