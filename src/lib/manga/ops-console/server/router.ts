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
  handleAiEditCommit,
  handleAiEditDiff,
  handleAiEditDiscard,
} from "./handlers/ai-edit";
import {
  handleNameApprovalGet,
  handleNameApprovalPost,
} from "./handlers/name-approval";
import { handleNameManifest } from "./handlers/name-manifest";
import { handleManifest } from "./handlers/manifest";
import { handlePipelineStatus } from "./handlers/pipeline-status";
import { handleQualityOverview } from "./handlers/quality";
import {
  handleRevisionQueueGet,
  handleRevisionQueuePost,
} from "./handlers/revision-queue";
import {
  handleAdoptedGet,
  handleAdoptedPost,
} from "./handlers/adopted-versions";
import { handleBootstrap } from "./handlers/bootstrap";
import { handleBible } from "./handlers/bible";
import { handleVolumePlot } from "./handlers/volume-plot";
import { handleVolumesList } from "./handlers/volumes";
import {
  handleWorkCreate,
  handleWorkKdpMetadataPut,
  handleWorkMetaGet,
} from "./handlers/work-meta";
import {
  handleJobsAbort,
  handleJobsList,
  handleJobsStart,
  handleJobsStream,
} from "./handlers/jobs";
import { handleWorkEpisodes, handleWorksList } from "./handlers/works";

export type RouterDefaults = {
  /**
   * 起動引数で固定された slug。Phase 1 では cross-scope 書き込みを許さない。
   * 一覧モード (`npm run console` 引数なし) では null。null の間は scope 固定の handler は
   * すべて 400 を返し、SPA 側は作品一覧 (index view) から scope を選んでもらう。
   */
  defaultSlug: string | null;
  /** 起動引数で固定された episode。一覧モードでは null。 */
  defaultEpisode: number | null;
  /** Phase 2 以降で `true` にすると複数 slug 横断 read を許可する (write は引き続き default-only)。 */
  allowCrossScopeRead?: boolean;
};

/** scope が確定している場合の defaults。jobs / legacy handler が期待する non-null 型。 */
export type ScopedRouterDefaults = {
  defaultSlug: string;
  defaultEpisode: number;
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
  if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
    return { ok: false, status: 400, error: "操作対象の作品が未選択です。作品一覧から選択してください" };
  }
  const slug = url.searchParams.get("slug");
  const ep = Number(url.searchParams.get("episode"));
  if (slug !== defaults.defaultSlug || ep !== defaults.defaultEpisode) {
    return { ok: false, status: 403, error: "起動 scope と異なる作品です (`npm run console -- --slug X` で起動してください)" };
  }
  return { ok: true };
}

function checkLegacyBodyScope(
  body: any,
  defaults: RouterDefaults
): { ok: true } | { ok: false; status: number; error: string } {
  if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
    return { ok: false, status: 400, error: "操作対象の作品が未選択です。作品一覧から選択してください" };
  }
  if (body?.slug !== defaults.defaultSlug || Number(body?.episode) !== defaults.defaultEpisode) {
    return { ok: false, status: 403, error: "起動 scope と異なる作品です (`npm run console -- --slug X` で起動してください)" };
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

/** new path の write scope check。GET は cross-scope read を許可し、write だけ default scope に固定する。 */
function checkScopedWritePath(
  scoped: { slug: string; episode: number },
  defaults: RouterDefaults
): { ok: true } | { ok: false; status: number; error: string } {
  if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
    return {
      ok: false,
      status: 400,
      error: "書き込みには scope 固定モードが必要です。`npm run console -- --slug <slug> --episode <NN>` で起動してください",
    };
  }
  if (scoped.slug !== defaults.defaultSlug || scoped.episode !== defaults.defaultEpisode) {
    return {
      ok: false,
      status: 403,
      error: "起動 scope と異なる作品です (`npm run console -- --slug X` で起動してください)",
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

  // health probe (slash command / launchd の生死確認用)。fs アクセスを伴わない最薄 endpoint。
  if (p === "/api/health") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return send(res, 200, { ok: true, ts: Date.now() });
  }

  if (p === "/api/bootstrap") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleBootstrap(defaults, res);
  }

  if (p === "/api/quality/overview") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleQualityOverview(res);
  }

  if (p === "/api/ai-edit/diff") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleAiEditDiff(res);
  }
  if (p === "/api/ai-edit/commit") {
    if (req.method !== "POST") return send(res, 405, { error: "このメソッドは許可されていません" });
    let body: any;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return send(res, 400, { error: String(e) });
    }
    return handleAiEditCommit(body, res);
  }
  if (p === "/api/ai-edit/discard") {
    if (req.method !== "POST") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleAiEditDiscard(res);
  }

  // jobs API の read は横断可。write/abort は default scope (slug+episode) が必須。
  if (p === "/api/jobs" || p.match(/^\/api\/jobs\/[^/]+\/(stream|abort)$/)) {
    if (p === "/api/jobs") {
      if (req.method === "GET") return handleJobsList(req, res, url, defaults);
      if (req.method === "POST") {
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        const isAiEdit = body?.layer === "L99" && body?.slug === "_console";
        if (!isAiEdit && (defaults.defaultSlug === null || defaults.defaultEpisode === null)) {
          return send(res, 400, { error: "操作対象の作品が未選択です。作品一覧から選択してください" });
        }
        const scopedDefaults: ScopedRouterDefaults = {
          defaultSlug: isAiEdit ? "_console" : defaults.defaultSlug!,
          defaultEpisode: isAiEdit ? 0 : defaults.defaultEpisode!,
          allowCrossScopeRead: defaults.allowCrossScopeRead,
        };
        return handleJobsStart(req, res, body, scopedDefaults);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
    const m = p.match(/^\/api\/jobs\/([^/]+)\/(stream|abort)$/);
    if (m) {
      const jobId = m[1];
      const action = m[2];
      if (action === "stream" && req.method === "GET") {
        const scopedDefaults: ScopedRouterDefaults = {
          defaultSlug: defaults.defaultSlug ?? "_console",
          defaultEpisode: defaults.defaultEpisode ?? 0,
          allowCrossScopeRead: defaults.allowCrossScopeRead,
        };
        return handleJobsStream(req, res, jobId, scopedDefaults);
      }
      if (action === "abort" && req.method === "POST") {
        if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
          return send(res, 400, { error: "操作対象の作品が未選択です。作品一覧から選択してください" });
        }
        const scopedDefaults: ScopedRouterDefaults = {
          defaultSlug: defaults.defaultSlug,
          defaultEpisode: defaults.defaultEpisode,
          allowCrossScopeRead: defaults.allowCrossScopeRead,
        };
        return handleJobsAbort(req, res, jobId, scopedDefaults);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
  }

  // ===== works enumerate (Phase 1 で新規追加、scope check 不要) =====
  if (p === "/api/works") {
    if (req.method === "GET") return handleWorksList(res);
    if (req.method === "POST") {
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { error: String(e) });
      }
      // 新規作品作成は scope を作る側なので、Phase 2A の default scope 制約から除外する。
      return handleWorkCreate(body, res);
    }
    return send(res, 405, { error: "このメソッドは許可されていません" });
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/meta$/);
    if (m) {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
      return handleWorkMetaGet(slug, res);
    }
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/meta\/kdp-metadata$/);
    if (m) {
      if (req.method !== "PUT") return send(res, 405, { error: "このメソッドは許可されていません" });
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
      if (defaults.defaultSlug === null) {
        return send(res, 400, { error: "書き込みには scope 固定モードが必要です。`npm run console -- --slug <slug> --episode <NN>` で起動してください" });
      }
      if (slug !== defaults.defaultSlug) return send(res, 403, { error: "起動 scope と異なる作品です (`npm run console -- --slug X` で起動してください)" });
      let body: any;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { error: String(e) });
      }
      return handleWorkKdpMetadataPut(slug, body, res);
    }
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/bible$/);
    if (m) {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
      return handleBible(slug, res);
    }
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/volumes$/);
    if (m) {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
      return handleVolumesList(slug, res);
    }
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/volumes\/v(\d+)\/plot$/);
    if (m) {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      const slug = m[1];
      const volume = Number(m[2]);
      if (!isValidSlug(slug) || !Number.isInteger(volume) || volume <= 0) {
        return send(res, 400, { error: "作品 ID または巻番号が不正です" });
      }
      return handleVolumePlot(slug, volume, res);
    }
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/episodes$/);
    if (m) {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
      return handleWorkEpisodes(slug, res);
    }
  }

  // ===== 新 path: /api/works/{slug}/episodes/{ep}/... (Phase 2 で解禁予定) =====
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/episodes\/ep(\d+)\/pipeline-status$/);
    if (m && (!isValidSlug(m[1]) || !isValidEpisode(Number(m[2])))) {
      return send(res, 400, { error: "作品 ID または episode 番号が不正です" });
    }
  }
  const scoped = parseScopedPath(p);
  if (scoped) {
    const tail = scoped.tail;

    if (tail === "/name-approval") {
      if (req.method === "GET") return handleNameApprovalGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        const guard = checkScopedWritePath(scoped, defaults);
        if (!guard.ok) return send(res, guard.status, { error: guard.error });
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleNameApprovalPost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
    if (tail === "/name-manifest") {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      return handleNameManifest(scoped.slug, scoped.episode, res);
    }
    if (tail === "/manifest") {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      return handleManifest(scoped.slug, scoped.episode, res);
    }
    if (tail === "/pipeline-status") {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      return handlePipelineStatus(scoped.slug, scoped.episode, res);
    }
    if (tail === "/revision-queue") {
      if (req.method === "GET") return handleRevisionQueueGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        const guard = checkScopedWritePath(scoped, defaults);
        if (!guard.ok) return send(res, guard.status, { error: guard.error });
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleRevisionQueuePost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
    if (tail === "/adopted-versions") {
      if (req.method === "GET") return handleAdoptedGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        const guard = checkScopedWritePath(scoped, defaults);
        if (!guard.ok) return send(res, guard.status, { error: guard.error });
        let body: any;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleAdoptedPost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
    return send(res, 404, { error: "not found" });
  }

  // ===== legacy paths =====
  if (p === "/api/name-approval") {
    if (req.method === "GET") {
      const g = checkLegacyScope(url, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleNameApprovalGet(defaults.defaultSlug!, defaults.defaultEpisode!, res);
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
      return handleNameApprovalPost(defaults.defaultSlug!, defaults.defaultEpisode!, body, res);
    }
    return send(res, 405, { error: "このメソッドは許可されていません" });
  }

  if (p === "/api/manifest") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    const g = checkLegacyScope(url, defaults);
    if (!g.ok) return send(res, g.status, { error: g.error });
    return handleManifest(defaults.defaultSlug!, defaults.defaultEpisode!, res);
  }

  if (p === "/api/revision-queue") {
    if (req.method === "GET") {
      const g = checkLegacyScope(url, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleRevisionQueueGet(defaults.defaultSlug!, defaults.defaultEpisode!, res);
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
      return handleRevisionQueuePost(defaults.defaultSlug!, defaults.defaultEpisode!, body, res);
    }
    return send(res, 405, { error: "このメソッドは許可されていません" });
  }

  if (p === "/api/adopted-versions") {
    if (req.method === "GET") {
      const g = checkLegacyScope(url, defaults);
      if (!g.ok) return send(res, g.status, { error: g.error });
      return handleAdoptedGet(defaults.defaultSlug!, defaults.defaultEpisode!, res);
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
      return handleAdoptedPost(defaults.defaultSlug!, defaults.defaultEpisode!, body, res);
    }
    return send(res, 405, { error: "このメソッドは許可されていません" });
  }

  return send(res, 404, { error: "not found" });
}
