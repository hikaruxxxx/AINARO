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
import { handleDashboardNextActions } from "./handlers/dashboard";
import { handleQualityOverview } from "./handlers/quality";
import {
  handleGetAuditOverrides,
  handlePostAuditOverride,
} from "./handlers/audit-overrides";
import {
  handleRevisionQueueGet,
  handleRevisionQueuePost,
} from "./handlers/revision-queue";
import {
  handleAdoptedGet,
  handleAdoptedPost,
} from "./handlers/adopted-versions";
import {
  handleAdoptedStoryboardGet,
  handleAdoptedStoryboardPost,
} from "./handlers/adopted-storyboard";
import { handleStoryboardProposalsGet } from "./handlers/storyboard-proposals";
import { handleBootstrap } from "./handlers/bootstrap";
import { handleBible } from "./handlers/bible";
import { handleBibleMetaPut } from "./handlers/bible-meta";
import {
  handleBibleAdoptedVariantsGet,
  handleBibleAdoptedVariantsPost,
} from "./handlers/bible-adopted-variants";
import { handleVolumePlot, handleVolumePlotPut } from "./handlers/volume-plot";
import {
  handleAdoptedVolumePlotGet,
  handleAdoptedVolumePlotPost,
} from "./handlers/adopted-volume-plot";
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
import {
  handleTrademarkCheckGet,
  handleTrademarkCheckPost,
} from "./handlers/trademark";
import { handleImprovementsGet } from "./handlers/improvements";
import { handleRestartPost } from "./handlers/restart";
import { getScope, setScope } from "./scope-store";

export type RouterDefaults = {
  /**
   * 「現在の操作対象 slug」。書き込みはこの値と body/path の slug が一致する場合のみ許可。
   * null の間は scope 固定の handler はすべて 400 を返し、SPA は scope switcher で
   * 作品+話を選ぶよう促す。
   *
   * 過去 (旧設計): CLI 引数 `--slug` でしか pin できなかった。
   * 現在: scope-store (UI から `POST /api/scope` で動的更新可) を毎リクエスト読み込む。
   */
  defaultSlug: string | null;
  /** 「現在の操作対象 episode」。null = 未選択。 */
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

type TrademarkCheckSaveBody = Parameters<typeof handleTrademarkCheckPost>[2];

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function asBodyRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

/** url のクエリ slug/episode が defaults に一致するか */
function checkLegacyScope(
  url: URL,
  defaults: RouterDefaults
): { ok: true } | { ok: false; status: number; error: string } {
  if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
    return { ok: false, status: 400, error: "操作対象の作品が未選択です。ヘッダーの「scope 切替」から作品+話を選んでください" };
  }
  const slug = url.searchParams.get("slug");
  const ep = Number(url.searchParams.get("episode"));
  if (slug !== defaults.defaultSlug || ep !== defaults.defaultEpisode) {
    return { ok: false, status: 403, error: "現在の scope と異なる作品です。ヘッダーの「scope 切替」で対象を変更してください" };
  }
  return { ok: true };
}

function checkLegacyBodyScope(
  body: unknown,
  defaults: RouterDefaults
): { ok: true } | { ok: false; status: number; error: string } {
  if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
    return { ok: false, status: 400, error: "操作対象の作品が未選択です。ヘッダーの「scope 切替」から作品+話を選んでください" };
  }
  const obj = asBodyRecord(body);
  if (obj.slug !== defaults.defaultSlug || Number(obj.episode) !== defaults.defaultEpisode) {
    return { ok: false, status: 403, error: "現在の scope と異なる作品です。ヘッダーの「scope 切替」で対象を変更してください" };
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
      error: "書き込みには scope (作品+話) の固定が必要です。ヘッダーの「scope 切替」から選択してください",
    };
  }
  if (scoped.slug !== defaults.defaultSlug || scoped.episode !== defaults.defaultEpisode) {
    return {
      ok: false,
      status: 403,
      error: "現在の scope と異なる作品です。ヘッダーの「scope 切替」で対象を変更してください",
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

  // 「現在の scope」は CLI 引数ではなく scope-store (UI 切替対応) を毎リクエスト読み込む。
  // 起動時 defaults は allowCrossScopeRead など scope 以外の設定だけ受け継ぐ。
  const liveScope = getScope();
  defaults = {
    defaultSlug: liveScope.slug,
    defaultEpisode: liveScope.episode,
    allowCrossScopeRead: defaults.allowCrossScopeRead,
  };

  // health probe (slash command / launchd の生死確認用)。fs アクセスを伴わない最薄 endpoint。
  if (p === "/api/health") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return send(res, 200, { ok: true, ts: Date.now() });
  }

  if (p === "/api/bootstrap") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleBootstrap(defaults, res);
  }

  // Console 自身の再起動 (UI ボタンから)。詳細は handlers/restart.ts 参照。
  if (p === "/api/restart") {
    if (req.method !== "POST") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleRestartPost(res);
  }

  // scope 切替 (UI から POST)。GET は現在 scope を返すだけ。
  if (p === "/api/scope") {
    if (req.method === "GET") {
      return send(res, 200, { slug: liveScope.slug, episode: liveScope.episode });
    }
    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { error: String(e) });
      }
      // body.slug/episode が両方 null/undefined なら scope 解除。それ以外は両方必須。
      const bodyObj = asBodyRecord(body);
      const wantClear = bodyObj.slug == null && bodyObj.episode == null;
      const slug = wantClear ? null : (typeof bodyObj.slug === "string" ? bodyObj.slug : null);
      const episode = wantClear ? null : (typeof bodyObj.episode === "number" ? bodyObj.episode : Number(bodyObj.episode));
      try {
        const next = await setScope(slug, wantClear ? null : episode);
        return send(res, 200, next);
      } catch (e) {
        return send(res, 400, { error: (e as Error).message });
      }
    }
    return send(res, 405, { error: "このメソッドは許可されていません" });
  }

  if (p === "/api/quality/overview") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleQualityOverview(res);
  }

  if (p === "/api/dashboard/next-actions") {
    if (req.method === "GET") return handleDashboardNextActions(req, res, url);
    return send(res, 405, { error: "method not allowed" });
  }

  if (p === "/api/ai-edit/diff") {
    if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
    return handleAiEditDiff(res);
  }
  if (p === "/api/ai-edit/commit") {
    if (req.method !== "POST") return send(res, 405, { error: "このメソッドは許可されていません" });
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (e) {
      return send(res, 400, { error: String(e) });
    }
    return handleAiEditCommit(asBodyRecord(body), res);
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
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        const bodyObj = asBodyRecord(body);
        const requestedJobSlug = typeof bodyObj.slug === "string" ? bodyObj.slug : null;
        const isAiEditConsole = bodyObj.layer === "L99" && requestedJobSlug === "_console";
        // 一覧モードの L99 AI 編集では実 slug はジョブ一覧の scope hint なので、
        // repo 全体編集の安全性は ai-edit の diff/commit review に委ねて bypass 対象にする。
        const isAiEditWorkInListMode =
          bodyObj.layer === "L99" &&
          requestedJobSlug !== null &&
          requestedJobSlug !== "_console" &&
          isValidSlug(requestedJobSlug) &&
          (defaults.defaultSlug === null || defaults.defaultEpisode === null);
        if (
          !isAiEditConsole &&
          !isAiEditWorkInListMode &&
          (defaults.defaultSlug === null || defaults.defaultEpisode === null)
        ) {
          return send(res, 400, { error: "操作対象の作品が未選択です。ヘッダーの「scope 切替」から作品+話を選んでください" });
        }
        const scopedDefaults: ScopedRouterDefaults = isAiEditConsole
            ? { defaultSlug: "_console", defaultEpisode: 0, allowCrossScopeRead: defaults.allowCrossScopeRead }
          : isAiEditWorkInListMode
            ? { defaultSlug: requestedJobSlug!, defaultEpisode: 0, allowCrossScopeRead: defaults.allowCrossScopeRead }
            : {
                defaultSlug: defaults.defaultSlug!,
                defaultEpisode: defaults.defaultEpisode!,
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
          return send(res, 400, { error: "操作対象の作品が未選択です。ヘッダーの「scope 切替」から作品+話を選んでください" });
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
      let body: unknown;
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
      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { error: String(e) });
      }
      return handleWorkKdpMetadataPut(slug, body, res);
    }
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/bible\/meta$/);
    if (m) {
      if (req.method !== "PUT") return send(res, 405, { error: "このメソッドは許可されていません" });
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
      if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
        return send(res, 400, { error: "書き込みには scope 固定モードが必要です。`npm run console -- --slug <slug> --episode <NN>` で起動してください" });
      }
      if (slug !== defaults.defaultSlug) {
        return send(res, 403, { error: "起動 scope と異なる作品です" });
      }
      return handleBibleMetaPut(slug, req, res);
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
    const m = p.match(/^\/api\/works\/([^/]+)\/bible\/adopted-variants$/);
    if (m) {
      const slug = m[1];
      if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
      if (req.method === "GET") {
        return handleBibleAdoptedVariantsGet(slug, res);
      }
      if (req.method === "POST") {
        if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
          return send(res, 400, { error: "書き込みには scope 固定モードが必要です。`npm run console -- --slug <slug> --episode <NN>` で起動してください" });
        }
        if (slug !== defaults.defaultSlug) {
          return send(res, 403, { error: "起動 scope と異なる作品です" });
        }
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleBibleAdoptedVariantsPost(slug, body, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
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
      const slug = m[1];
      const volume = Number(m[2]);
      if (!isValidSlug(slug) || !Number.isInteger(volume) || volume <= 0) {
        return send(res, 400, { error: "作品 ID または巻番号が不正です" });
      }
      if (req.method === "GET") return handleVolumePlot(slug, volume, res);
      if (req.method === "PUT") {
        // 既存の write 系と同じく scope-fixed mode に限定。
        if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
          return send(res, 400, { error: "書き込みには scope 固定モードが必要です。`npm run console -- --slug <slug> --episode <NN>` で起動してください" });
        }
        if (slug !== defaults.defaultSlug) {
          return send(res, 403, { error: "起動 scope と異なる作品です" });
        }
        return handleVolumePlotPut(slug, volume, req, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
  }
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/volumes\/v(\d+)\/adopted-plot$/);
    if (m) {
      const slug = m[1];
      const volume = Number(m[2]);
      if (!isValidSlug(slug) || !Number.isInteger(volume) || volume <= 0) {
        return send(res, 400, { error: "作品 ID または巻番号が不正です" });
      }
      if (req.method === "GET") return handleAdoptedVolumePlotGet(slug, volume, res);
      if (req.method === "POST") {
        if (defaults.defaultSlug === null || defaults.defaultEpisode === null) {
          return send(res, 400, { error: "書き込みには scope 固定モードが必要です" });
        }
        if (slug !== defaults.defaultSlug) {
          return send(res, 403, { error: "起動 scope と異なる作品です" });
        }
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleAdoptedVolumePlotPost(slug, volume, body, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
  }
  // Phase X WX-5: trademark / IP 類似チェックの人間判定
  {
    const m = p.match(/^\/api\/works\/([^/]+)\/volumes\/v(\d+)\/trademark-check$/);
    if (m) {
      const slug = m[1];
      const volume = Number(m[2]);
      if (!isValidSlug(slug) || !Number.isInteger(volume) || volume <= 0) {
        return send(res, 400, { error: "作品 ID または巻番号が不正です" });
      }
      if (req.method === "GET") {
        return handleTrademarkCheckGet(res, slug, volume);
      }
      if (req.method === "POST") {
        if (defaults.defaultSlug === null) {
          return send(res, 400, {
            error:
              "書き込みには scope 固定モードが必要です。`npm run console -- --slug <slug> --episode <NN>` で起動してください",
          });
        }
        if (slug !== defaults.defaultSlug) {
          return send(res, 403, {
            error: "起動 scope と異なる作品です (`npm run console -- --slug X` で起動してください)",
          });
        }
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleTrademarkCheckPost(req, res, body as TrademarkCheckSaveBody, slug, volume);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
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
        let body: unknown;
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
    if (tail === "/improvements") {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      return handleImprovementsGet(res, scoped.slug, scoped.episode);
    }
    if (tail === "/audit-overrides") {
      if (req.method === "GET") return handleGetAuditOverrides(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        // override は人間判断の永続化なので、scope 制限は通常 write 系と同じ。
        const guard = checkScopedWritePath(scoped, defaults);
        if (!guard.ok) return send(res, guard.status, { error: guard.error });
        return handlePostAuditOverride(scoped.slug, scoped.episode, req, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
    if (tail === "/revision-queue") {
      if (req.method === "GET") return handleRevisionQueueGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        const guard = checkScopedWritePath(scoped, defaults);
        if (!guard.ok) return send(res, guard.status, { error: guard.error });
        let body: unknown;
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
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleAdoptedPost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
    if (tail === "/adopted-storyboard") {
      if (req.method === "GET") return handleAdoptedStoryboardGet(scoped.slug, scoped.episode, res);
      if (req.method === "POST") {
        const guard = checkScopedWritePath(scoped, defaults);
        if (!guard.ok) return send(res, guard.status, { error: guard.error });
        let body: unknown;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          return send(res, 400, { error: String(e) });
        }
        return handleAdoptedStoryboardPost(scoped.slug, scoped.episode, body, res);
      }
      return send(res, 405, { error: "このメソッドは許可されていません" });
    }
    if (tail === "/storyboard-proposals") {
      if (req.method !== "GET") return send(res, 405, { error: "このメソッドは許可されていません" });
      return handleStoryboardProposalsGet(scoped.slug, scoped.episode, res);
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
      let body: unknown;
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
      let body: unknown;
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
      let body: unknown;
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
