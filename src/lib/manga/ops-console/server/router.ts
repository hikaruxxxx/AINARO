/**
 * /api/* ルーティング dispatch
 *
 * Phase 1: legacy paths (旧 serve-name / serve-revision の API) を完全互換維持しつつ、
 * 新 path `/api/works/{slug}/episodes/{ep}/...` も同じ handler に流す。
 *
 * scope check:
 *  - legacy: body.slug / query.slug + episode が defaults と一致するか確認
 *  - new path: URL から slug/episode を抽出。Phase 1 では defaults 一致のみ許可。
 *    Phase 2 で複数 slug 横断を解禁する際にこの check を外す。
 */
import type http from "node:http";
import { readJsonBody } from "./lib/body";
import { isValidEpisode, isValidSlug } from "./lib/path-guards";
import {
  handleNameApprovalGet,
  handleNameApprovalPost,
} from "./handlers/name-approval";
import { handleManifest } from "./handlers/manifest";
import {
  handleRevisionQueueGet,
  handleRevisionQueuePost,
} from "./handlers/revision-queue";
import {
  handleAdoptedGet,
  handleAdoptedPost,
} from "./handlers/adopted-versions";
import { handleWorkEpisodes, handleWorksList } from "./handlers/works";

export type RouterDefaults = {
  /** 起動引数で固定された slug。Phase 1 では cross-scope 書き込みを許さない。 */
  defaultSlug: string;
  /** 起動引数で固定された episode。 */
  defaultEpisode: number;
  /** Phase 2 以降で `true` にすると複数 slug 横断 read を許可する (write は引き続き default-only)。 */
  allowCrossScopeRead?: boolean;
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** url のクエリ slug/episode が defaults に一致するか */
function checkLegacyScope(
  url: URL,
  defaults: RouterDefaults
): { ok: true } | { ok: false; status: number; error: string } {
  const slug = url.searchParams.get("slug");
  const ep = Number(url.searchParams.get("episode"));
  if (slug !== defaults.defaultSlug || ep !== defaults.defaultEpisode) {
    return { ok: false, status: 403, error: "slug/episode does not match server scope" };
  }
  return { ok: true };
}

function checkLegacyBodyScope(
  body: any,
  defaults: RouterDefaults
): { ok: true } | { ok: false; status: number; error: string } {
  if (body?.slug !== defaults.defaultSlug || Number(body?.episode) !== defaults.defaultEpisode) {
    return { ok: false, status: 403, error: "scope mismatch" };
  }
  return { ok: true };
}

/** new path から slug/episode を抽出。形式不正なら null。 */
function parseScopedPath(
  pathname: string
): { slug: string; episode: number; tail: string } | null {
  const m = pathname.match(/^\/api\/works\/([^/]+)\/episodes\/ep(\d+)(\/.*)?$/);
  if (!m) return null;
  const slug = m[1];
  const episode = Number(m[2]);
  const tail = m[3] ?? "";
  if (!isValidSlug(slug) || !isValidEpisode(episode)) return null;
  return { slug, episode, tail };
}

/** Phase 1: 新 path の scope は default と一致しなければ 403。 */
function checkScopedPath(
  scoped: { slug: string; episode: number },
  defaults: RouterDefaults
): { ok: true } | { ok: false; status: number; error: string } {
  if (scoped.slug !== defaults.defaultSlug || scoped.episode !== defaults.defaultEpisode) {
    return {
      ok: false,
      status: 403,
      error: "scope mismatch (Phase 1: only default slug/episode allowed)",
    };
  }
  return { ok: true };
}

export async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  defaults: RouterDefaults
): Promise<void> {
  const p = url.pathname;

  // ===== works enumerate (Phase 1 で新規追加、scope check 不要) =====
  if (p === "/api/works") {
    if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
    return handleWorksList(res);
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/episodes$/);
    if (m) {
      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "invalid slug" });
      return handleWorkEpisodes(slug, res);
    }
  }

  // ===== 新 path: /api/works/{slug}/episodes/{ep}/... (Phase 2 で解禁予定) =====
  const scoped = parseScopedPath(p);
  if (scoped) {
    const guard = checkScopedPath(scoped, defaults);
    if (!guard.ok) return send(res, guard.status, { error: guard.error });
    const tail = scoped.tail;

    if (tail === "/name-approval") {
      if (req.method === "GET") return handleNameApprovalGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleNameApprovalPost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "method not allowed" });
    }
    if (tail === "/manifest") {
      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
      return handleManifest(scoped.slug, scoped.episode, res);
    }
    if (tail === "/revision-queue") {
      if (req.method === "GET") return handleRevisionQueueGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleRevisionQueuePost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "method not allowed" });
    }
    if (tail === "/adopted-versions") {
      if (req.method === "GET") return handleAdoptedGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleAdoptedPost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "method not allowed" });
    }
    return send(res, 404, { error: "not found" });
  }

  // ===== legacy paths =====
  if (p === "/api/name-approval") {
    if (req.method === "GET") {
      const g = checkLegacyScope(url, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleNameApprovalGet(defaults.defaultSlug, defaults.defaultEpisode, res);
    }
    if (req.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch {
        return send(res, 400, { error: "invalid JSON" });
      }
      const g = checkLegacyBodyScope(body, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleNameApprovalPost(defaults.defaultSlug, defaults.defaultEpisode, body, res);
    }
    return send(res, 405, { error: "method not allowed" });
  }

  if (p === "/api/manifest") {
    if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
    const g = checkLegacyScope(url, defaults);
    if (!g.ok) return send(res, g.status, { error: g.error });
    return handleManifest(defaults.defaultSlug, defaults.defaultEpisode, res);
  }

  if (p === "/api/revision-queue") {
    if (req.method === "GET") {
      const g = checkLegacyScope(url, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleRevisionQueueGet(defaults.defaultSlug, defaults.defaultEpisode, res);
    }
    if (req.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { error: String(e) });
      }
      const g = checkLegacyBodyScope(body, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleRevisionQueuePost(defaults.defaultSlug, defaults.defaultEpisode, body, res);
    }
    return send(res, 405, { error: "method not allowed" });
  }

  if (p === "/api/adopted-versions") {
    if (req.method === "GET") {
      const g = checkLegacyScope(url, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleAdoptedGet(defaults.defaultSlug, defaults.defaultEpisode, res);
    }
    if (req.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { error: String(e) });
      }
      const g = checkLegacyBodyScope(body, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleAdoptedPost(defaults.defaultSlug, defaults.defaultEpisode, body, res);
    }
    return send(res, 405, { error: "method not allowed" });
  }

  return send(res, 404, { error: "not found" });
}
