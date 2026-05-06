/**
 * Novelis Console (漫画 ops UI) HTTP server
 *
 * Phase 2C+:
 *   - 引数なし起動 → root `/` は作品一覧 (index view) を含む shell を返す
 *   - --slug/--episode 指定起動 → 旧 default scope を固定する Phase 1 互換モード
 *   - 新 URL `/works/{slug}/episodes/epNN/` は SPA shell を返す
 *   - 旧 URL `/episodes/epNN/name/index.html` は SPA name-gate へ 302 redirect (default scope のみ)
 *   - Phase 3 以降で複数 slug 横断を解禁予定
 *
 * Usage:
 *   npm run console
 *   npm run console -- --slug a07-modern-dungeon --episode 1
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

type Args = {
  slug: string | null;
  episode: number | null;
  port: number;
  openBrowser: boolean;
};

function parseArgs(): Args {
  const a: Args = { slug: null, episode: null, port: 5174, openBrowser: true };
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
  // 完全に未指定 (= 一覧モード) と、両方指定 (= scope 固定モード) のみ valid。
  // 片方だけは誤用なので明示エラー。
  if ((a.slug === null) !== (a.episode === null)) {
    throw new Error("--slug と --episode は両方指定するか、両方省略してください");
  }
  return a;
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
    console.error("[novelis-console] client build failed:", e);
    process.exit(1);
  }
  // scope 指定モード時のみ slug/episode を valid 形式チェック + 物理確認する。
  // 一覧モード (slug/episode 共に null) では scope 検証を skip し、UI 上で選んでもらう。
  let scopedRoot: string | null = null;
  if (args.slug !== null && args.episode !== null) {
    if (!isValidSlug(args.slug)) {
      throw new Error(`invalid slug "${args.slug}": must match /^[a-z0-9][a-z0-9_-]*$/`);
    }
    if (!isValidEpisode(args.episode)) {
      throw new Error(`invalid episode ${args.episode}: must be positive integer`);
    }
    scopedRoot = workDir(args.slug);
    await fs.access(scopedRoot);

    // L8.5 前置きチェック。Phase 2C 以降は index.html ではなく SPA が操作 UI。
    const manifestP = nameManifestPath(args.slug, args.episode);
    if (!(await fs.stat(manifestP).catch(() => null))) {
      console.warn(
        `[novelis-console] WARN: ${manifestP} not found. Run L8.5 first:\n` +
          `  npx tsx scripts/manga/layers/L08-5-name-preview.ts --slug ${args.slug} --episode ${args.episode}\n` +
          `  SPA URL: http://localhost:${args.port}/works/${args.slug}/episodes/ep${String(args.episode).padStart(2, "0")}/#name-gate`
      );
    }
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

    // 旧 URL → SPA name-gate redirect。default scope が固定されている場合だけ機能する。
    const oldName = url.pathname.match(/^\/episodes\/ep(\d+)\/name\/index\.html$/);
    if (oldName && args.slug) {
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
    //   - `/`, `/works/{slug}/episodes/epNN/` → Novelis Console shell
    //   - `/_ops/*` → esbuild bundle
    //   - `/episodes/...`, その他 → workDir(slug) 配下 (SVG 等の静的 asset)
    //   - `/works/{slug}/episodes/.../path` → default scope のみ legacy static に解決
    await serveStatic(req, res, url, {
      rootIndex: (p) => {
        if (p === "/" || p === "") return opsShellHtml;
        if (p === "/jobs" || p === "/quality" || p === "/ai-edit") return opsShellHtml;
        if (p.match(/^\/works\/[^/]+\/?$/)) return opsShellHtml;
        if (p.match(/^\/works\/[^/]+\/episodes\/ep\d+\/?$/)) return opsShellHtml;
        return null;
      },
      resolveRoot: (p) => {
        if (p.startsWith("/_ops/")) {
          return { root: opsDistRoot, subPath: p.slice("/_ops".length) };
        }
        // /works/{slug}/episodes/epNN/path: scope 固定モードは default のみ、一覧モードは任意 slug。
        // path から slug を取って workDir(slug) に解決するので、両モードで動く。
        const m = p.match(/^\/works\/([^/]+)\/episodes\/(ep\d+)(\/.*)?$/);
        if (m) {
          const slug = m[1];
          if (!isValidSlug(slug)) return null;
          if (args.slug && slug !== args.slug) return null; // scope 固定モードは default のみ
          const ep = m[2];
          const sub = m[3] ?? "/";
          return { root: workDir(slug), subPath: path.posix.join("/episodes", ep, sub) };
        }
        // /works/{slug}/bible/refs/{kind}/{id}/{file}: assets view が一覧モードでも参照できるよう、
        // path 経由で slug を取る。scope 固定モードは default のみ。
        const refMatch = p.match(/^\/works\/([^/]+)\/bible\/refs\/(.+)$/);
        if (refMatch) {
          const slug = refMatch[1];
          if (!isValidSlug(slug)) return null;
          if (args.slug && slug !== args.slug) return null;
          return { root: workDir(slug), subPath: `/bible/refs/${refMatch[2]}` };
        }
        // scope 固定モードの旧 path (/bible/refs/..., /episodes/...) は scopedRoot にフォールバック。
        if (scopedRoot) return { root: scopedRoot, subPath: p };
        return null;
      },
    });
  });

  // listen 失敗 (主に EADDRINUSE) を意味のあるメッセージに置換する。
  // EADDRINUSE は「同名 console がすでに立っている」可能性が高い。launchd 常駐を将来やる際に
  // 再起動ループを起こさないため、明示的に exit 0 で抜ける。
  server.on("error", (err) => {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EADDRINUSE") {
      console.warn(
        `[novelis-console] port ${args.port} は既に使用されています。` +
          `他の Novelis Console が起動中の可能性があります。\n` +
          `  既に立っている場合: http://localhost:${args.port}/`
      );
      process.exit(0);
    }
    if (e.code === "EACCES") {
      console.error(`[novelis-console] port ${args.port} の bind が権限不足で拒否されました (EACCES)`);
    } else {
      console.error("[novelis-console] server error:", err);
    }
    process.exit(1);
  });

  server.listen(args.port, () => {
    const consoleUrl = `http://localhost:${args.port}/`;
    console.log(`[novelis-console] client bundle: ${clientBuild.outFile}`);
    console.log(`[novelis-console] listening: ${consoleUrl}`);
    if (args.slug && args.episode) {
      const scopedUrl = `http://localhost:${args.port}/works/${args.slug}/episodes/ep${String(args.episode).padStart(2, "0")}/`;
      console.log(`[novelis-console] mode: scope-fixed (slug=${args.slug} ep=${args.episode})`);
      console.log(`[novelis-console] scope: ${scopedUrl}`);
      console.log(`[novelis-console] name gate: ${scopedUrl}#name-gate`);
      console.log(`[novelis-console] revision:  ${scopedUrl}#revision`);
    } else {
      console.log(`[novelis-console] mode: index (作品一覧から scope を選択)`);
    }
    if (args.openBrowser) maybeOpenBrowser(consoleUrl);
  });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}

main().catch((e) => {
  console.error("[novelis-console] FAILED:", e);
  process.exit(1);
});
