/**
 * 漫画 ops console HTTP server
 *
 * Phase 2C:
 *   - root `/` は ops console shell を返す
 *   - 新 URL `/works/{slug}/episodes/epNN/` は SPA shell を返す
 *   - 旧 URL `/episodes/epNN/name/index.html` は SPA name-gate へ 302 redirect
 *   - scope は起動引数 --slug --episode で固定 (Phase 3 以降で複数 slug 横断を解禁予定)
 *
 * Usage:
 *   npx tsx scripts/manga/serve-ops.ts --slug a07-modern-dungeon --episode 1
 *   # → http://localhost:5174/works/a07-modern-dungeon/episodes/ep01/#name-gate
 */
import "./_env";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  workDir,
  nameManifestPath,
} from "./layers/_paths";
import { handleApi } from "../../src/lib/manga/ops-console/server/router";
import { serveStatic } from "../../src/lib/manga/ops-console/server/static";
import { renderOpsConsoleShellHtml } from "../../src/lib/manga/ops-console/index-html";
import { buildOpsConsoleClient } from "../../src/lib/manga/ops-console/web/build";
import { isValidEpisode, isValidSlug } from "../../src/lib/manga/ops-console/server/lib/path-guards";

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

function maybeOpenBrowser(url: string): void {
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* ignore */
  }
}

async function main() {
  const args = parseArgs();
  let clientBuild: { outFile: string };
  try {
    clientBuild = await buildOpsConsoleClient({ outDir: "dist/ops-console" });
  } catch (e) {
    console.error("[serve-ops] client build failed:", e);
    process.exit(1);
  }
  if (!isValidSlug(args.slug)) {
    throw new Error(`invalid slug "${args.slug}": must match /^[a-z0-9][a-z0-9_-]*$/`);
  }
  if (!isValidEpisode(args.episode)) {
    throw new Error(`invalid episode ${args.episode}: must be positive integer`);
  }
  const root = workDir(args.slug);
  await fs.access(root);

  // L8.5 前置きチェック。Phase 2C 以降は index.html ではなく SPA が操作 UI。
  const manifestP = nameManifestPath(args.slug, args.episode);
  if (!(await fs.stat(manifestP).catch(() => null))) {
    console.warn(
      `[serve-ops] WARN: ${manifestP} not found. Run L8.5 first:\n` +
        `  npx tsx scripts/manga/layers/L08-5-name-preview.ts --slug ${args.slug} --episode ${args.episode}\n` +
        `  SPA URL: http://localhost:${args.port}/works/${args.slug}/episodes/ep${String(args.episode).padStart(2, "0")}/#name-gate`
    );
  }

  const opsShellHtml = renderOpsConsoleShellHtml();
  const opsDistRoot = path.resolve(process.cwd(), "dist/ops-console");

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://localhost:${args.port}`);

    const oldName = url.pathname.match(/^\/episodes\/ep(\d+)\/name\/index\.html$/);
    if (oldName) {
      const ep = oldName[1].padStart(2, "0");
      const location = `/works/${args.slug}/episodes/ep${ep}/#name-gate`;
      res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
      res.end();
      return;
    }

    // /api/* は router へ
    if (url.pathname.startsWith("/api/")) {
      try {
        await handleApi(req, res, url, {
          defaultSlug: args.slug,
          defaultEpisode: args.episode,
        });
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }

    // 静的配信: 二系統の root を提供
    //   - `/`, `/works/{slug}/episodes/epNN/` → ops console shell
    //   - `/_ops/*` → esbuild bundle
    //   - `/episodes/...`, その他 → workDir(slug) 配下 (SVG 等の静的 asset)
    //   - `/works/{slug}/episodes/.../path` → default scope のみ legacy static に解決
    await serveStatic(req, res, url, {
      rootIndex: (p) => {
        if (p === "/" || p === "") return opsShellHtml;
        if (p.match(/^\/works\/[^/]+\/episodes\/ep\d+\/?$/)) return opsShellHtml;
        return null;
      },
      resolveRoot: (p) => {
        if (p.startsWith("/_ops/")) {
          return { root: opsDistRoot, subPath: p.slice("/_ops".length) };
        }
        // Phase 1: /works/{slug}/episodes/epNN/path をサポート、default scope のみ通す
        const m = p.match(/^\/works\/([^/]+)\/episodes\/(ep\d+)(\/.*)?$/);
        if (m) {
          const slug = m[1];
          const ep = m[2];
          const sub = m[3] ?? "/";
          if (slug !== args.slug) return null; // Phase 1: default のみ
          return { root, subPath: path.posix.join("/episodes", ep, sub) };
        }
        return { root, subPath: p };
      },
    });
  });

  // listen 失敗 (主に EADDRINUSE) を意味のあるメッセージに置換する。
  server.on("error", (err) => {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EADDRINUSE") {
      console.error(
        `[serve-ops] port ${args.port} は既に使用されています。` +
          `別の serve-ops インスタンスが起動していないか確認してください。\n` +
          `  既に ops console が立っている場合: http://localhost:${args.port}/`
      );
    } else if (e.code === "EACCES") {
      console.error(`[serve-ops] port ${args.port} の bind が権限不足で拒否されました (EACCES)`);
    } else {
      console.error("[serve-ops] server error:", err);
    }
    process.exit(1);
  });

  server.listen(args.port, () => {
    const consoleUrl = `http://localhost:${args.port}/`;
    const scopedUrl = `http://localhost:${args.port}/works/${args.slug}/episodes/ep${String(args.episode).padStart(2, "0")}/`;
    console.log(`[serve-ops] root=${root} slug=${args.slug} ep=${args.episode}`);
    console.log(`[serve-ops] client bundle: ${clientBuild.outFile}`);
    console.log(`[serve-ops] console: ${consoleUrl}`);
    console.log(`[serve-ops] console scope: ${scopedUrl}`);
    console.log(`[serve-ops] name gate: ${scopedUrl}#name-gate`);
    console.log(`[serve-ops] revision:  ${scopedUrl}#revision`);
    if (args.openBrowser) maybeOpenBrowser(consoleUrl);
  });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}

main().catch((e) => {
  console.error("[serve-ops] FAILED:", e);
  process.exit(1);
});
