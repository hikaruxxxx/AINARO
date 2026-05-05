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
import { workDir, nameApprovalPath, nameIndexHtmlPath } from "./layers/_paths";
import type {
  NameApproval,
  NamePageDecision,
  NameRejectReason,
  NameRerunFrom,
} from "../../src/lib/manga/name-preview/types";

type Args = { slug: string; episode: number; port: number; openBrowser: boolean };

function parseArgs(): Args {
  const a: Partial<Args> = { port: 5174, openBrowser: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key) {
      const bool = arg.match(/^--(.+)$/);
      if (bool && bool[1] === "no-open") a.openBrowser = false;
      continue;
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

function isRerunFrom(s: unknown): s is NameRerunFrom {
  return s === null || s === "L3" || s === "L4" || s === "L5" || s === "L6" || s === "L7";
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

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  if (url.pathname !== "/api/name-approval") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (req.method === "GET") {
    const slug = url.searchParams.get("slug");
    const episode = Number(url.searchParams.get("episode"));
    if (!slug || !episode) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "slug & episode required" }));
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
    const slug = String(body.slug ?? "");
    const episode = Number(body.episode ?? 0);
    const pageNo = Number(body.page_no ?? 0);
    const status = body.status as string | undefined;
    const reasonsRaw = Array.isArray(body.reasons) ? body.reasons : [];
    const rerunFrom = body.rerun_from;
    const note = String(body.note ?? "");

    if (!slug || !episode || !pageNo || !status) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing fields" }));
      return;
    }
    if (status !== "approved" && status !== "rejected" && status !== "pending") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid status" }));
      return;
    }
    const reasons: NameRejectReason[] = reasonsRaw.filter(isReason);
    const rerun: NameRerunFrom = isRerunFrom(rerunFrom) ? rerunFrom : null;

    let approval = await loadApproval(slug, episode);
    if (!approval) {
      approval = {
        schema_version: 1,
        episode_id: `${slug}-ep${String(episode).padStart(2, "0")}`,
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
    await saveApproval(slug, episode, approval);

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, page_no: pageNo, status }));
    return;
  }

  res.writeHead(405, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "method not allowed" }));
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL, root: string): Promise<void> {
  let pathname = decodeURIComponent(url.pathname);
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
      try { await handleApi(req, res, url); } catch (e) {
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
