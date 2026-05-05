import type { WorkInfo } from "./store";
import type {
  NameApproval as SourceNameApproval,
  NameManifest as SourceNameManifest,
} from "../../../name-preview/types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`API error ${status}: ${body}`);
  }
}

export type Bootstrap = {
  default_slug: string;
  default_episode: number;
  works: WorkInfo[];
};

export type Manifest = {
  schema_version: number;
  slug: string;
  episode: number;
  episode_id: string;
  generated_at: string;
  page_plan?: unknown;
  storyboard?: unknown;
  audit?: unknown;
  render_manifest?: unknown[];
  revision_queue?: unknown[];
  adopted?: unknown;
  bible_characters?: Array<{ id: string; name: string }>;
};

export type NameManifest = SourceNameManifest;
export type NameApproval = SourceNameApproval;

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

async function postJson<T>(path: string, body: unknown): Promise<T> {
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
