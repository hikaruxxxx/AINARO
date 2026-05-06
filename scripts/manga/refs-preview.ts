/**
 * Bible refs 確認用の最小UI。
 * bible/refs/ 配下を grid HTML として生成し、http サーバで host する。
 *
 * Usage:
 *   npx tsx scripts/manga/refs-preview.ts --slug a07-modern-dungeon
 *   # → http://localhost:8765/refs-preview.html
 */
import "./_env";
import http from "node:http";
import { promises as fs, createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

type Args = { slug: string; port: number };

function parseArgs(): Args {
  const a: Partial<Args> = { port: 8765 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "port") a.port = Number(val);
  }
  if (!a.slug) throw new Error("--slug required");
  return a as Args;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function buildHtml(workRoot: string): Promise<string> {
  const refsDir = path.join(workRoot, "bible", "refs");
  const sections: string[] = [];

  const renderGroup = async (kind: "characters" | "locations" | "props") => {
    const root = path.join(refsDir, kind);
    if (!existsSync(root)) return;
    const ids = (await fs.readdir(root)).filter((e) => !e.startsWith("_") && !e.endsWith(".json")).sort();
    sections.push(`<h2 class="kind">${kind} (${ids.length})</h2>`);
    for (const id of ids) {
      const dir = path.join(root, id);
      const st = await fs.stat(dir);
      if (!st.isDirectory()) continue;
      const pngs = (await fs.readdir(dir)).filter((e) => e.toLowerCase().endsWith(".png")).sort();
      sections.push(`<section class="entity"><h3>${escapeHtml(id)} <small>(${pngs.length} variants)</small></h3><div class="grid">`);
      for (const png of pngs) {
        const variant = png.replace(/\.png$/i, "");
        // 画像は /static/<rel-from-workRoot> でアクセスさせる
        const rel = path.relative(workRoot, path.join(dir, png));
        const url = `/static/${rel.split(path.sep).map(encodeURIComponent).join("/")}`;
        sections.push(`<figure><a href="${url}" target="_blank"><img src="${url}" alt="${escapeHtml(variant)}" loading="lazy" /></a><figcaption>${escapeHtml(variant)}</figcaption></figure>`);
      }
      sections.push(`</div></section>`);
    }
  };

  await renderGroup("characters");
  await renderGroup("locations");
  await renderGroup("props");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>Bible refs preview</title>
<style>
  body { font-family: -apple-system, "Hiragino Sans", sans-serif; margin: 24px; background: #1a1a1a; color: #e8e8e8; }
  h1 { margin: 0 0 16px; font-size: 22px; }
  h2.kind { margin-top: 32px; padding-bottom: 6px; border-bottom: 2px solid #444; font-size: 18px; }
  section.entity { margin: 20px 0; }
  section.entity h3 { font-size: 15px; margin: 8px 0 6px; color: #aef; }
  section.entity h3 small { color: #888; font-weight: normal; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  figure { margin: 0; background: #2a2a2a; padding: 8px; border-radius: 6px; }
  figure img { width: 100%; height: 220px; object-fit: contain; background: #fff; border-radius: 4px; display: block; }
  figcaption { font-size: 11px; color: #ccc; text-align: center; margin-top: 4px; word-break: break-all; }
  .summary { margin-bottom: 16px; padding: 8px 12px; background: #224; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<h1>Bible refs preview — ${path.basename(workRoot)}</h1>
<div class="summary">refs ディレクトリ: <code>${escapeHtml(refsDir)}</code> &middot; 自動更新: 無 (リロードで再読込)</div>
${sections.join("\n")}
</body>
</html>`;
}

function contentTypeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function main() {
  const args = parseArgs();
  const workRoot = path.resolve("data/manga/works", args.slug);
  if (!existsSync(workRoot)) {
    console.error(`[refs-preview] work root not found: ${workRoot}`);
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${args.port}`);
    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/refs-preview.html") {
      try {
        const html = await buildHtml(workRoot);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`build error: ${(e as Error).message}`);
      }
      return;
    }
    if (url.pathname.startsWith("/static/")) {
      // workRoot 配下の任意のファイルを素直に返す。`..` 等の脱出を防ぐため resolve+startsWith でチェック。
      const rel = decodeURIComponent(url.pathname.slice("/static/".length));
      const target = path.resolve(workRoot, rel);
      if (!target.startsWith(workRoot + path.sep)) {
        res.writeHead(403); res.end("forbidden"); return;
      }
      if (!existsSync(target)) { res.writeHead(404); res.end("not found"); return; }
      const st = statSync(target);
      if (!st.isFile()) { res.writeHead(404); res.end("not a file"); return; }
      res.writeHead(200, { "Content-Type": contentTypeFor(target), "Content-Length": st.size });
      createReadStream(target).pipe(res);
      return;
    }
    res.writeHead(404); res.end("not found");
  });

  server.listen(args.port, () => {
    const url = `http://localhost:${args.port}/`;
    console.log(`[refs-preview] ${url} (slug=${args.slug})`);
    try {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } catch {}
  });
}

main().catch((e) => { console.error("[refs-preview] FAILED:", e); process.exit(1); });
