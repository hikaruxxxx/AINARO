/**
 * GET /api/works              -> [{slug, title?, episodes:[1,2,...]}]
 * GET /api/works/{slug}/episodes -> {slug, episodes:[1,2,...]}
 *
 * data/manga/works/ を enumerate する。除外:
 *  - `README.md` `_smoke_hash` などのドット/アンダースコア接頭/拡張子付きエントリ
 *  - `archive/` ディレクトリ
 *  - meta.json が読めない slug (workdir として成立していない)
 *
 * episode 列挙: works/{slug}/episodes/ep\d+ をスキャン、数値抽出。
 * meta.json から title を読めればそれを title 表示に使う。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  WORKS_DIR,
  workDir,
  workMetaPath,
} from "../../../../../../scripts/manga/layers/_paths";
import { isValidSlug } from "../lib/path-guards";

const EXCLUDED_TOP = new Set(["archive", "node_modules"]);

export type WorkInfo = {
  slug: string;
  title: string | null;
  episodes: number[];
};

async function readDirEntriesSafe(
  dir: string
): Promise<Array<{ name: string; isDirectory: boolean }>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  } catch {
    return [];
  }
}

async function listSlugs(): Promise<string[]> {
  const entries = await readDirEntriesSafe(WORKS_DIR);
  const slugs: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory) continue;
    const name = e.name;
    if (name.startsWith(".") || name.startsWith("_")) continue;
    if (EXCLUDED_TOP.has(name)) continue;
    if (!isValidSlug(name)) continue;
    slugs.push(name);
  }
  slugs.sort();
  return slugs;
}

async function listEpisodesForSlug(slug: string): Promise<number[]> {
  const dir = path.join(workDir(slug), "episodes");
  const entries = await readDirEntriesSafe(dir);
  const eps: number[] = [];
  for (const e of entries) {
    if (!e.isDirectory) continue;
    const m = e.name.match(/^ep(\d+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n <= 0) continue;
    eps.push(n);
  }
  eps.sort((a, b) => a - b);
  return eps;
}

async function readTitle(slug: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(workMetaPath(slug), "utf-8");
    const meta = JSON.parse(buf) as { title?: unknown };
    if (typeof meta.title === "string" && meta.title.length > 0) return meta.title;
  } catch {
    // ignore
  }
  return null;
}

export async function listWorksInfo(): Promise<WorkInfo[]> {
  const slugs = await listSlugs();
  return Promise.all(
    slugs.map(async (slug) => {
      const [title, episodes] = await Promise.all([readTitle(slug), listEpisodesForSlug(slug)]);
      return { slug, title, episodes };
    })
  );
}

export async function handleWorksList(res: http.ServerResponse): Promise<void> {
  const works = await listWorksInfo();
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ works }));
}

export async function handleWorkEpisodes(
  slug: string,
  res: http.ServerResponse
): Promise<void> {
  const episodes = await listEpisodesForSlug(slug);
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ slug, episodes }));
}
