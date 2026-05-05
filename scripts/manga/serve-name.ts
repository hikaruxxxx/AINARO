/**
 * L8.7 Name Approval HTTP server
 *
 * 役割:
 * 1. data/manga/works/{slug}/ をルートにファイルを serve (SVG / PNG / HTML)
 * 2. POST /api/name-approval で人間判定を name_approval.json に書き込む
 * 3. GET  /api/name-approval?slug=...&episode=... で既存判定を返す
 *
 * Usage:
 *   npx tsx scripts/manga/serve-name.ts --slug a07-modern-dungeon --episode 1
 *   # → http://localhost:5174/episodes/ep01/name/index.html
 *
 * 依存は Node.js 標準のみ (http, fs, path)。Express を使わず軽量に。
 */
import "./_env";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { workDir, nameApprovalPath, nameIndexHtmlPath, pagePlanPath } from "./layers/_paths";
import {
  deriveRerunFrom,
  type NameApproval,
  type NamePageDecision,
  type NameRejectReason,
} from "../../src/lib/manga/name-preview/types";
import type { PagePlanV2 } from "../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number; port: number; openBrowser: boolean };

function parseArgs(): Args {
  const a: Partial<Args> = { port: 5174, openBrowser: true };
  const argv = process.argv.slice(2);
  const BOOLEAN_FLAGS = new Set(["no-open"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    let key: string | null = null;
    let val: string | null = null;
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (!flag) continue;
      key = flag[1];
      if (BOOLEAN_FLAGS.has(key)) {
        if (key === "no-open") a.openBrowser = false;
        continue;
      }
      const nextToken = argv[i + 1];
      if (i + 1 >= argv.length || (nextToken && nextToken.startsWith("--"))) continue;
      val = nextToken;
      i++;
    }
    if (val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "port") a.port = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => {
      try {
        const s = Buffer.concat(chunks).toString("utf-8");
        resolve(s ? JSON.parse(s) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function isReason(s: unknown): s is NameRejectReason {
  return (
    s === "story_problem" ||
    s === "panel_problem" ||
    s === "layout_problem" ||
    s === "dialogue_problem" ||
    s === "continuity_problem" ||
    s === "render_risk"
  );
}

/**
 * approval write は read-modify-write で race するため、
 * (slug,episode) 単位の write キューで直列化する。
 * 単一プロセス前提の素朴な mutex で十分 (server は 1 プロセスのみ)。
 */
const writeQueues = new Map<string, Promise<unknown>>();

function approvalKey(slug: string, episode: number): string {
  return `${slug}#${episode}`;
}

function withApprovalLock<T>(slug: string, episode: number, fn: () => Promise<T>): Promise<T> {
  const key = approvalKey(slug, episode);
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn); // 前段の throw を握り潰して順序維持
  const tracked = next.catch(() => undefined);
  writeQueues.set(key, tracked);
  // queue の末尾なら map から消す (Map が無限に残るのを防ぐ)
  tracked.then(() => {
    if (writeQueues.get(key) === tracked) writeQueues.delete(key);
  });
  return next;
}

async function loadApproval(slug: string, episode: number): Promise<NameApproval | null> {
  try {
    const buf = await fs.readFile(nameApprovalPath(slug, episode), "utf-8");
    return JSON.parse(buf) as NameApproval;
  } catch {
    return null;
  }
}

async function saveApproval(slug: string, episode: number, approval: NameApproval): Promise<void> {
  approval.updated_at = new Date().toISOString();
  const text = JSON.stringify(approval, null, 2);
  await fs.writeFile(nameApprovalPath(slug, episode), text, "utf-8");
}

/**
 * server 起動時 args (slug/episode) で approve の操作対象を固定する。
 * client から送られた slug/episode と一致しない場合は 403。
 *
 * これにより:
 * - body の slug が path traversal 形 (`../`) でも fixed args と一致しないため拒否
 * - 異なる作品/episode への誤書き込みを防止
 */
const PAGE_PLAN_CACHE = new Map<string, Set<number>>();

/**
 * page_plan.json から有効 page_no 集合を読み込む。
 * 失敗時は **throw** する (fail-closed)。
 *
 * fail-open (空 Set 返却) にすると、page_plan が欠けている時に任意 page_no が保存できてしまう。
 * これは v1 では bug として Codex に指摘されたため、ここは hard fail。
 */
async function loadPagePlanPageNos(slug: string, episode: number): Promise<Set<number>> {
  const key = `${slug}#${episode}`;
  const cached = PAGE_PLAN_CACHE.get(key);
  if (cached) return cached;
  const buf = await fs.readFile(pagePlanPath(slug, episode), "utf-8");
  const plan = JSON.parse(buf) as PagePlanV2;
  if (!plan?.pages || !Array.isArray(plan.pages) || plan.pages.length === 0) {
    throw new Error(`page_plan has no pages: ${pagePlanPath(slug, episode)}`);
  }
  const set = new Set<number>();
  for (const p of plan.pages) {
    if (typeof p.page_no === "number") set.add(p.page_no);
  }
  PAGE_PLAN_CACHE.set(key, set);
  return set;
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  fixedSlug: string,
  fixedEpisode: number
): Promise<void> {
  if (url.pathname !== "/api/name-approval") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (req.method === "GET") {
    const slug = url.searchParams.get("slug");
    const episode = Number(url.searchParams.get("episode"));
    if (slug !== fixedSlug || episode !== fixedEpisode) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "slug/episode does not match server scope" }));
      return;
    }
    const approval = await loadApproval(slug, episode);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(approval ?? { pages: {} }));
    return;
  }

  if (req.method === "POST") {
    let body: any;
    try { body = await readJsonBody(req); } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON" }));
      return;
    }

    // 起動時 args と一致するかチェック (path traversal/誤書き込み防御)
    if (body.slug !== fixedSlug || Number(body.episode) !== fixedEpisode) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "slug/episode does not match server scope" }));
      return;
    }

    const pageNo = Number(body.page_no ?? 0);
    const status = body.status as string | undefined;
    const reasonsRaw = Array.isArray(body.reasons) ? body.reasons : [];
    const note = String(body.note ?? "").slice(0, 500); // note は最長 500 字

    if (!Number.isInteger(pageNo) || pageNo <= 0 || !status) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing or invalid fields" }));
      return;
    }
    if (status !== "approved" && status !== "rejected" && status !== "pending") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid status" }));
      return;
    }

    // page_no は page_plan に存在するもののみ許可 (page_plan 不在/破損は 500)
    let validPageNos: Set<number>;
    try {
      validPageNos = await loadPagePlanPageNos(fixedSlug, fixedEpisode);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `cannot load page_plan: ${(e as Error).message}` }));
      return;
    }
    if (!validPageNos.has(pageNo)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `page_no ${pageNo} not in page_plan` }));
      return;
    }

    const reasons: NameRejectReason[] = reasonsRaw.filter(isReason);
    // SSoT: client から送られた rerun_from は無視、server で再計算する
    const rerun = deriveRerunFrom(reasons);

    // approval の read-modify-write は (slug,episode) 単位で直列化
    const result = await withApprovalLock(fixedSlug, fixedEpisode, async () => {
      let approval = await loadApproval(fixedSlug, fixedEpisode);
      if (!approval) {
        approval = {
          schema_version: 1,
          episode_id: `${fixedSlug}-ep${String(fixedEpisode).padStart(2, "0")}`,
          updated_at: new Date().toISOString(),
          pages: {},
        };
      }
      const now = new Date().toISOString();
      const decision: NamePageDecision = {
        status: status as NamePageDecision["status"],
        approval_source: "human",
        reasons,
        rerun_from: rerun,
        note,
        decided_at: now,
      };
      approval.pages[String(pageNo)] = decision;
      await saveApproval(fixedSlug, fixedEpisode, approval);
      return decision;
    });

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, page_no: pageNo, status: result.status, rerun_from: result.rerun_from }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "method not allowed" }));
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL, root: string): Promise<void> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    // malformed percent encoding (例: "%E0") は throw するので 400 で返す
    res.writeHead(400);
    res.end("malformed path");
    return;
  }
  // ディレクトリ traversal 防止
  if (pathname.includes("..")) {
    res.writeHead(400);
    res.end("bad path");
    return;
  }
  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const fp = path.join(root, pathname);
  // root の外に出ない
  if (!fp.startsWith(root)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const stat = await fs.stat(fp);
    if (stat.isDirectory()) {
      // index.html を試す
      const idx = path.join(fp, "index.html");
      const st2 = await fs.stat(idx).catch(() => null);
      if (st2 && st2.isFile()) {
        const buf = await fs.readFile(idx);
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(buf);
        return;
      }
      res.writeHead(403);
      res.end("directory listing disabled");
      return;
    }
    const ext = path.extname(fp).toLowerCase();
    const ct = MIME[ext] ?? "application/octet-stream";
    const buf = await fs.readFile(fp);
    res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

function maybeOpenBrowser(url: string): void {
  // macOS: open
  // 失敗しても無視
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try { spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref(); } catch {}
}

async function main() {
  const args = parseArgs();
  // slug は path-safe 形式のみ許可 (a-z0-9-_)
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(args.slug)) {
    throw new Error(`invalid slug "${args.slug}": must match /^[a-z0-9][a-z0-9_-]*$/`);
  }
  if (!Number.isInteger(args.episode) || args.episode <= 0) {
    throw new Error(`invalid episode ${args.episode}: must be positive integer`);
  }
  const root = workDir(args.slug);
  await fs.access(root); // 存在チェック

  // index.html が無ければ警告 (L8.5 を先に走らせる必要)
  const indexP = nameIndexHtmlPath(args.slug, args.episode);
  if (!(await fs.stat(indexP).catch(() => null))) {
    console.warn(`[serve-name] WARN: ${indexP} not found. Run L8.5 first:\n  npx tsx scripts/manga/layers/L08-5-name-preview.ts --slug ${args.slug} --episode ${args.episode}`);
  }

  const server = http.createServer(async (req, res) => {
    if (!req.url) { res.writeHead(400); res.end(); return; }
    const url = new URL(req.url, `http://localhost:${args.port}`);
    if (url.pathname.startsWith("/api/")) {
      try { await handleApi(req, res, url, args.slug, args.episode); } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }
    await serveStatic(req, res, url, root);
  });

  server.listen(args.port, () => {
    const url = `http://localhost:${args.port}/episodes/ep${String(args.episode).padStart(2, "0")}/name/index.html`;
    console.log(`[serve-name] root=${root}`);
    console.log(`[serve-name] open ${url}`);
    if (args.openBrowser) maybeOpenBrowser(url);
  });

  process.on("SIGINT", () => { server.close(() => process.exit(0)); });
}

main().catch((e) => { console.error("[serve-name] FAILED:", e); process.exit(1); });
