/**
 * 静的ファイル配信 (両 server の防御パターンを merge)
 *
 * - decodeURIComponent 失敗で 400 (malformed percent encoding)
 * - `..` を含むパスは 400 (traversal 防止)
 * - `path.sep` 境界で root 配下のみ許可 (旧 serve-revision の修正を採用、startsWith 単純比較は弾かれる)
 * - ディレクトリは index.html を試し、無ければ 403
 * - Cache-Control: no-store (開発用、stale を生まない)
 *
 * `slug` を path から取って per-slug root に切り替えられるよう、
 * resolveRoot コールバックを呼び出し側に注入する。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MIME } from "./lib/mime";

export type StaticOptions = {
  /** path から root ディレクトリを解決する。null を返したら 404。 */
  resolveRoot: (urlPath: string) => { root: string; subPath: string } | null;
  /** root の index (`/` アクセス時) を返す。文字列を返したらそれを HTML として返す。 */
  rootIndex?: (urlPath: string) => string | null;
};

export async function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  opts: StaticOptions
): Promise<void> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end("malformed path");
    return;
  }
  if (pathname.includes("..")) {
    res.writeHead(400);
    res.end("bad path");
    return;
  }

  // root index (HTML shell)
  if (opts.rootIndex) {
    const html = opts.rootIndex(pathname);
    if (html !== null && html !== undefined) {
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
      res.end(html);
      return;
    }
  }

  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  const resolved = opts.resolveRoot(pathname);
  if (!resolved) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const { root, subPath } = resolved;
  const fp = path.join(root, subPath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (fp !== root && !fp.startsWith(rootWithSep)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  try {
    const stat = await fs.stat(fp);
    if (stat.isDirectory()) {
      const idx = path.join(fp, "index.html");
      const st2 = await fs.stat(idx).catch(() => null);
      if (st2 && st2.isFile()) {
        const buf = await fs.readFile(idx);
        res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
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
