/**
 * 漫画 ops console HTTP server (Phase 1)
 *
 * 旧 serve-name.ts (port 5174) と serve-revision.ts (port 5180) を統合。
 * 5174 を母体に両者の API/static を expose、Phase 2 以降で UI 統合と Jobs を追加していく。
 *
 * Phase 1 の互換ポリシー:
 *   - 旧 URL `/episodes/epNN/name/index.html` は引き続き 200
 *   - 旧 root `/` は revision UI HTML (serve-revision の挙動) を返す
 *   - 新 URL `/works/{slug}/episodes/epNN/...` は同じ root に redirect (Phase 2 で SPA 化)
 *   - 新 API `/api/works`, `/api/works/{slug}/episodes` を追加 (UI 用 enumerate)
 *   - scope は起動引数 --slug --episode で固定 (Phase 2 で複数 slug 横断を解禁予定)
 *
 * Usage:
 *   npx tsx scripts/manga/serve-ops.ts --slug a07-modern-dungeon --episode 1
 *   # → http://localhost:5174/episodes/ep01/name/index.html (旧 serve-name 互換)
 *   # → http://localhost:5174/                              (旧 serve-revision 互換)
 */
import "./_env";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  workDir,
  storyboardPath,
  nameIndexHtmlPath,
} from "./layers/_paths";
import { handleApi } from "../../src/lib/manga/ops-console/server/router";
import { serveStatic } from "../../src/lib/manga/ops-console/server/static";
import { renderRevisionUiHtml } from "../../src/lib/manga/revision-ui/index-html";
import { isValidEpisode, isValidSlug } from "../../src/lib/manga/ops-console/server/lib/path-guards";
import type { EpisodeStoryboardV2 } from "../../src/lib/manga/schemas-v2";

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

async function loadJsonOpt<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
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
  if (!isValidSlug(args.slug)) {
    throw new Error(`invalid slug "${args.slug}": must match /^[a-z0-9][a-z0-9_-]*$/`);
  }
  if (!isValidEpisode(args.episode)) {
    throw new Error(`invalid episode ${args.episode}: must be positive integer`);
  }
  const root = workDir(args.slug);
  await fs.access(root);

  // L8.5 前置きチェック (旧 serve-name と同じ警告)
  const indexP = nameIndexHtmlPath(args.slug, args.episode);
  if (!(await fs.stat(indexP).catch(() => null))) {
    console.warn(
      `[serve-ops] WARN: ${indexP} not found. Run L8.5 first:\n  npx tsx scripts/manga/layers/L08-5-name-preview.ts --slug ${args.slug} --episode ${args.episode}`
    );
  }

  // 旧 serve-revision の root index (revision UI HTML) を準備
  const sb = await loadJsonOpt<EpisodeStoryboardV2>(storyboardPath(args.slug, args.episode));
  const episodeId = sb?.episode_id ?? `${args.slug}-ep${String(args.episode).padStart(2, "0")}`;
  const revisionIndexHtml = renderRevisionUiHtml(args.slug, args.episode, episodeId);

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://localhost:${args.port}`);

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
    //   - `/` → revision UI HTML (旧 serve-revision 互換)
    //   - `/episodes/...`, その他 → workDir(slug) 配下 (旧 serve-name 互換)
    //   - `/works/{slug}/episodes/.../path` → Phase 1 では default scope のみ受けて
    //     workDir(slug) の相対 path に redirect (Phase 2 で SPA 化)
    await serveStatic(req, res, url, {
      rootIndex: (p) => {
        if (p === "/" || p === "") return revisionIndexHtml;
        return null;
      },
      resolveRoot: (p) => {
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
  // shim 経由 (serve-name.ts / serve-revision.ts) でも同じパスを通るため、
  // ここで一度補足しておけば全 entry で挙動が揃う。
  server.on("error", (err) => {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EADDRINUSE") {
      console.error(
        `[serve-ops] port ${args.port} は既に使用されています。` +
          `別の serve-ops / serve-name / serve-revision インスタンスが起動していないか確認してください。\n` +
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
    const nameUrl = `http://localhost:${args.port}/episodes/ep${String(args.episode).padStart(2, "0")}/name/index.html`;
    console.log(`[serve-ops] root=${root} slug=${args.slug} ep=${args.episode}`);
    console.log(`[serve-ops] name preview: ${nameUrl}`);
    console.log(`[serve-ops] revision UI:  http://localhost:${args.port}/`);
    if (args.openBrowser) maybeOpenBrowser(nameUrl);
  });

  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}

main().catch((e) => {
  console.error("[serve-ops] FAILED:", e);
  process.exit(1);
});
