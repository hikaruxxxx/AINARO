/**
 * 修正指示 UI HTTP server (Phase A〜D)
 *
 * Port: 5180 (既存 serve-name.ts は 5174 と分離)
 * Scope: 起動時 args (slug / episode) で固定。body / query が一致しなければ 403
 *
 * 静的配信: data/manga/works/{slug}/ 配下を root に。 SVG/PNG/HTML を返す
 * API:
 *   GET  /api/manifest               統合 manifest (page_plan / storyboard / audit / render_manifest / revision_queue / adopted)
 *   POST /api/revision-queue         (Phase B) 修正指示 append (id/ts は server で生成)
 *   GET  /api/revision-queue         queue 全件
 *   GET  /api/adopted-versions       (Phase D) adopted_versions.json を返す
 *   POST /api/adopted-versions       採用 version 更新 (mutex)
 *
 * 既存 serve-name.ts の防御パターン (slug regex / decodeURI try / scope match / mutex) を踏襲。
 */
import "./_env";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  workDir,
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  auditPath,
  renderManifestPath,
  revisionQueuePath,
  adoptedVersionsPath,
  episodeDir,
} from "./layers/_paths";
import { renderRevisionUiHtml } from "../../src/lib/manga/revision-ui/index-html";
import { readJsonl } from "../../src/lib/manga/revision-ui/manifest";
import {
  REVISION_TAGS,
  isRevisionTag,
  emptyAdoptedVersions,
  type AdoptedPanelChoice,
  type AdoptedVersions,
  type RenderManifestEntry,
  type RevisionEntry,
  type RevisionTag,
} from "../../src/lib/manga/revision-ui/types";
import type {
  AuditReport,
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
} from "../../src/lib/manga/schemas-v2";

/**
 * Codex review: page_one_shot 戦略のページに対して storyboard panel_id を
 * そのまま queue に入れると L09 manifest (panel_id="page_${N}") と不整合になり、
 * nextVersion が既存 v1 を見つけられなくなる。
 * server 境界で panel_id を正規化することで、UI/CLI の不一致を防ぐ。
 */
function normalizePanelId(
  pagePlan: PagePlanV2 | null,
  panelId: string,
  pageNo: number
): string {
  if (!pagePlan) return panelId;
  const page = pagePlan.pages.find((p) => p.page_no === pageNo);
  if (!page) return panelId;
  if (page.render_strategy === "page_one_shot") {
    return `page_${pageNo}`;
  }
  return panelId;
}

/** adopted_versions の image_path / panel_id を厳格チェック */
function isSafeImagePath(p: string): boolean {
  // workdir 起点の相対パス、`..` を含まない、`episodes/ep\d+/(renders|bubbles)/p\d+...` 形
  if (typeof p !== "string" || p.length === 0 || p.length > 500) return false;
  if (p.includes("..") || p.startsWith("/") || p.includes("\\")) return false;
  return /^episodes\/ep\d+\/(renders|bubbles)\/p\d+(_panel_\d+)?(_v\d+)?\.png$/.test(p);
}

function isPageLevelPanelId(panelId: string): boolean {
  return /^page_\d+$/.test(panelId);
}

type Args = { slug: string; episode: number; port: number; openBrowser: boolean };

function parseArgs(): Args {
  const a: Partial<Args> = { port: 5180, openBrowser: true };
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
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

// ===== mutex =====
const writeQueues = new Map<string, Promise<unknown>>();
function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tracked = next.catch(() => undefined);
  writeQueues.set(key, tracked);
  tracked.then(() => { if (writeQueues.get(key) === tracked) writeQueues.delete(key); });
  return next;
}

// ===== loaders =====
async function loadJsonOpt<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, "utf-8")) as T; } catch { return null; }
}

async function loadAdopted(slug: string, episode: number, episodeId: string): Promise<AdoptedVersions> {
  const x = await loadJsonOpt<AdoptedVersions>(adoptedVersionsPath(slug, episode));
  return x ?? emptyAdoptedVersions(slug, episode, episodeId);
}

// ===== read/body helpers =====
async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c) => {
      const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
      total += b.length;
      if (total > 200_000) { req.destroy(); reject(new Error("body too large")); return; }
      chunks.push(b);
    });
    req.on("end", () => {
      try {
        const s = Buffer.concat(chunks).toString("utf-8");
        resolve(s ? JSON.parse(s) : {});
      } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// ===== API handlers =====

/** Codex review: _revision_resolved.jsonl を読んで queue entry に resolved_version を inject */
type ResolvedRecord = {
  revision_id: string;
  resolved_version: string;
  ts: string;
  succeeded: boolean;
};

async function loadRevisionResolvedMap(slug: string, episode: number): Promise<Map<string, ResolvedRecord>> {
  const fp = path.join(episodeDir(slug, episode), "_revision_resolved.jsonl");
  const records = await readJsonl<ResolvedRecord>(fp);
  const m = new Map<string, ResolvedRecord>();
  // 同 id が複数あれば後勝ち (再消化対応)
  for (const r of records) m.set(r.revision_id, r);
  return m;
}

async function handleManifest(slug: string, episode: number, res: http.ServerResponse): Promise<void> {
  const [bible, storyboard, pagePlan, audit, renderManifest, revisionQueueRaw, resolvedMap] = await Promise.all([
    loadJsonOpt<BibleSnapshotV2>(bibleSnapshotPath(slug)),
    loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(slug, episode)),
    loadJsonOpt<PagePlanV2>(pagePlanPath(slug, episode)),
    loadJsonOpt<AuditReport>(auditPath(slug, episode)),
    readJsonl<RenderManifestEntry>(renderManifestPath(slug, episode)),
    readJsonl<RevisionEntry>(revisionQueuePath(slug, episode)),
    loadRevisionResolvedMap(slug, episode),
  ]);
  if (!storyboard || !pagePlan) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "storyboard or page_plan missing" }));
    return;
  }
  // queue は append-only。resolved 情報を merge して UI 用に injected view を作る
  const revisionQueue = revisionQueueRaw.map((entry) => {
    const r = resolvedMap.get(entry.id);
    if (!r || !r.succeeded) return entry;
    return { ...entry, resolved_version: r.resolved_version, resolved_at: r.ts };
  });
  const adopted = await loadAdopted(slug, episode, storyboard.episode_id);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({
    schema_version: 1,
    slug,
    episode,
    episode_id: storyboard.episode_id,
    generated_at: new Date().toISOString(),
    page_plan: pagePlan,
    storyboard,
    audit,
    render_manifest: renderManifest,
    revision_queue: revisionQueue,
    adopted,
    bible_characters: (bible?.characters ?? []).map((c) => ({ id: c.id, name: c.name })),
  }));
}

async function handleRevisionQueueGet(slug: string, episode: number, res: http.ServerResponse): Promise<void> {
  const q = await readJsonl<RevisionEntry>(revisionQueuePath(slug, episode));
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ entries: q }));
}

async function handleRevisionQueuePost(
  body: any,
  fixedSlug: string,
  fixedEpisode: number,
  res: http.ServerResponse
): Promise<void> {
  if (body.slug !== fixedSlug || Number(body.episode) !== fixedEpisode) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "scope mismatch" }));
    return;
  }
  const rawPanelId = String(body.panel_id ?? "");
  const page_no = Number(body.page_no ?? 0);
  const panel_no = body.panel_no !== undefined ? Number(body.panel_no) : undefined;
  const instruction = String(body.instruction ?? "").slice(0, 1000);
  const checked_tags: RevisionTag[] = Array.isArray(body.checked_tags)
    ? body.checked_tags.filter(isRevisionTag)
    : [];
  const image_path = String(body.image_path ?? "");
  const for_version = String(body.for_version ?? "v1");

  if (!rawPanelId || !page_no || !image_path) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "missing fields" }));
    return;
  }
  if (!isSafeImagePath(image_path)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `invalid image_path: ${image_path}` }));
    return;
  }
  if (!instruction && checked_tags.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "instruction or checked_tags required" }));
    return;
  }

  // 戦略 §6 / Codex review: page_one_shot は panel_id を `page_${N}` に正規化
  const pagePlan = await loadJsonOpt<PagePlanV2>(pagePlanPath(fixedSlug, fixedEpisode));
  const panel_id = normalizePanelId(pagePlan, rawPanelId, page_no);

  const entry: RevisionEntry = {
    schema_version: 1,
    id: randomUUID(),
    ts: new Date().toISOString(),
    slug: fixedSlug,
    episode: fixedEpisode,
    page_no,
    panel_id,
    panel_no,
    instruction,
    checked_tags,
    image_path,
    for_version,
  };
  const filePath = revisionQueuePath(fixedSlug, fixedEpisode);
  let duplicateWarning: string | null = null;
  await withFileLock(`queue#${fixedSlug}#${fixedEpisode}`, async () => {
    // 既存 queue を読んで、同 panel_id で resolved_version 未設定のものがあれば警告
    const existing = await readJsonl<RevisionEntry>(filePath);
    const unresolvedSamePanel = existing.find(
      (e) => e.panel_id === panel_id && !e.resolved_version
    );
    if (unresolvedSamePanel) {
      duplicateWarning = `panel "${panel_id}" に未消化の指示が既に ${existing.filter((e) => e.panel_id === panel_id && !e.resolved_version).length} 件あります`;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
  });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, id: entry.id, duplicate_warning: duplicateWarning }));
}

async function handleAdoptedGet(slug: string, episode: number, res: http.ServerResponse): Promise<void> {
  const sb = await loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(slug, episode));
  const adopted = await loadAdopted(slug, episode, sb?.episode_id ?? `${slug}-ep${String(episode).padStart(2, "0")}`);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(adopted));
}

async function handleAdoptedPost(
  body: any,
  fixedSlug: string,
  fixedEpisode: number,
  res: http.ServerResponse
): Promise<void> {
  if (body.slug !== fixedSlug || Number(body.episode) !== fixedEpisode) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "scope mismatch" }));
    return;
  }
  const panel_id = String(body.panel_id ?? "");
  const chosen_version = String(body.chosen_version ?? "");
  const image_path = String(body.image_path ?? "");
  const note = body.note ? String(body.note).slice(0, 500) : undefined;
  if (!panel_id || !chosen_version || !image_path) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "missing fields" }));
    return;
  }
  // Codex review (重大3): panel-level adopted は L13 が読まない (page_${N} のみ)。
  // panel_composite 用 panel_id は Phase E の page composer 後に解禁する。
  if (!isPageLevelPanelId(panel_id)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: `panel_id "${panel_id}" is not page-level. Only page_${"${N}"} keys are supported until Phase E (page composer).`,
    }));
    return;
  }
  // Codex review (中2): image_path は traversal 防止の strict regex
  if (!isSafeImagePath(image_path)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `invalid image_path: ${image_path}` }));
    return;
  }
  if (!/^v\d+$/.test(chosen_version)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `invalid chosen_version: ${chosen_version}` }));
    return;
  }
  // image_path が render_manifest に存在することを確認 (manifest 由来のみ採用可)
  const manifest = await readJsonl<RenderManifestEntry>(renderManifestPath(fixedSlug, fixedEpisode));
  const matched = manifest.find(
    (m) => m.image_path === image_path && m.panel_id === panel_id && m.version === chosen_version
  );
  if (!matched) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: `no manifest entry matches (panel_id="${panel_id}", version="${chosen_version}", image_path="${image_path}")`,
    }));
    return;
  }
  const filePath = adoptedVersionsPath(fixedSlug, fixedEpisode);
  const result = await withFileLock(`adopted#${fixedSlug}#${fixedEpisode}`, async () => {
    const sb = await loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(fixedSlug, fixedEpisode));
    const adopted = await loadAdopted(fixedSlug, fixedEpisode, sb?.episode_id ?? `${fixedSlug}-ep${String(fixedEpisode).padStart(2, "0")}`);
    const choice: AdoptedPanelChoice = {
      chosen: chosen_version,
      image_path,
      chosen_at: new Date().toISOString(),
      note,
    };
    adopted.panels[panel_id] = choice;
    adopted.updated_at = new Date().toISOString();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(adopted, null, 2), "utf-8");
    return choice;
  });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, panel_id, choice: result }));
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  fixedSlug: string,
  fixedEpisode: number
): Promise<void> {
  const p = url.pathname;
  if (p === "/api/manifest") {
    if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
    const slug = url.searchParams.get("slug");
    const ep = Number(url.searchParams.get("episode"));
    if (slug !== fixedSlug || ep !== fixedEpisode) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "scope mismatch" }));
      return;
    }
    return handleManifest(fixedSlug, fixedEpisode, res);
  }
  if (p === "/api/revision-queue") {
    if (req.method === "GET") {
      const slug = url.searchParams.get("slug");
      const ep = Number(url.searchParams.get("episode"));
      if (slug !== fixedSlug || ep !== fixedEpisode) {
        res.writeHead(403); res.end(); return;
      }
      return handleRevisionQueueGet(fixedSlug, fixedEpisode, res);
    }
    if (req.method === "POST") {
      let body: any;
      try { body = await readJsonBody(req); } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
        return;
      }
      return handleRevisionQueuePost(body, fixedSlug, fixedEpisode, res);
    }
    res.writeHead(405); res.end(); return;
  }
  if (p === "/api/adopted-versions") {
    if (req.method === "GET") {
      const slug = url.searchParams.get("slug");
      const ep = Number(url.searchParams.get("episode"));
      if (slug !== fixedSlug || ep !== fixedEpisode) {
        res.writeHead(403); res.end(); return;
      }
      return handleAdoptedGet(fixedSlug, fixedEpisode, res);
    }
    if (req.method === "POST") {
      let body: any;
      try { body = await readJsonBody(req); } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
        return;
      }
      return handleAdoptedPost(body, fixedSlug, fixedEpisode, res);
    }
    res.writeHead(405); res.end(); return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

// ===== static handler =====
async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL, root: string, indexHtml: string): Promise<void> {
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); res.end("malformed path"); return; }
  if (pathname.includes("..")) { res.writeHead(400); res.end("bad path"); return; }
  if (pathname === "/" || pathname === "") {
    // root に index UI を返す
    res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
    res.end(indexHtml);
    return;
  }
  const fp = path.join(root, pathname);
  // Codex review: 単純 startsWith では root="/foo" / fp="/foobar/x" が通ってしまう。
  // path.sep を境界として比較する (root 配下のみ許可)。
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (fp !== root && !fp.startsWith(rootWithSep)) { res.writeHead(403); res.end("forbidden"); return; }
  try {
    const stat = await fs.stat(fp);
    if (stat.isDirectory()) {
      res.writeHead(403); res.end("directory listing disabled"); return;
    }
    const ext = path.extname(fp).toLowerCase();
    const ct = MIME[ext] ?? "application/octet-stream";
    const buf = await fs.readFile(fp);
    res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}

function maybeOpenBrowser(url: string): void {
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try { spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref(); } catch {}
}

async function main() {
  const args = parseArgs();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(args.slug)) {
    throw new Error(`invalid slug "${args.slug}": must match /^[a-z0-9][a-z0-9_-]*$/`);
  }
  if (!Number.isInteger(args.episode) || args.episode <= 0) {
    throw new Error(`invalid episode ${args.episode}`);
  }
  const root = workDir(args.slug);
  await fs.access(root);

  const sb = await loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(args.slug, args.episode));
  const episodeId = sb?.episode_id ?? `${args.slug}-ep${String(args.episode).padStart(2, "0")}`;
  const indexHtml = renderRevisionUiHtml(args.slug, args.episode, episodeId);

  const server = http.createServer(async (req, res) => {
    if (!req.url) { res.writeHead(400); res.end(); return; }
    const url = new URL(req.url, `http://localhost:${args.port}`);
    if (url.pathname.startsWith("/api/")) {
      try { await handleApi(req, res, url, args.slug, args.episode); }
      catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }
    await serveStatic(req, res, url, root, indexHtml);
  });

  server.listen(args.port, () => {
    const url = `http://localhost:${args.port}/`;
    console.log(`[serve-revision] root=${root} slug=${args.slug} ep=${args.episode}`);
    console.log(`[serve-revision] open ${url}`);
    if (args.openBrowser) maybeOpenBrowser(url);
  });

  process.on("SIGINT", () => server.close(() => process.exit(0)));
}

main().catch((e) => { console.error("[serve-revision] FAILED:", e); process.exit(1); });
