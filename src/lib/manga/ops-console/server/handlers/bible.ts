/**
 * GET /api/works/{slug}/bible
 *
 * bible/snapshot.json と refs 画像一覧を read-only で返す。
 * refs ディレクトリは snapshot 内 ID と照合し、UI 側に path 判定を持たせない。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleRefsDir,
  bibleSnapshotPath,
} from "../../../../../../scripts/manga/layers/_paths";
import type { BibleSnapshotV2 } from "../../../schemas-v2";

type RefGroup = { id: string; files: string[] };

type BibleWithRefs = BibleSnapshotV2 & {
  refs: {
    characters: RefGroup[];
    locations: RefGroup[];
    props: RefGroup[];
  };
};

async function loadJson<T>(fp: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(fp, "utf-8")) as T;
  } catch {
    return null;
  }
}

function isImageFile(name: string): boolean {
  return /\.(png|jpe?g)$/i.test(name);
}

async function listRefFiles(root: string, kind: string, id: string): Promise<string[]> {
  const dir = path.join(root, kind, id);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function listRefs(
  root: string,
  kind: "characters" | "locations" | "props",
  ids: string[]
): Promise<RefGroup[]> {
  const out: RefGroup[] = [];
  for (const id of ids) {
    const files = await listRefFiles(root, kind, id);
    if (files.length > 0) out.push({ id, files });
  }
  return out;
}

export async function handleBible(slug: string, res: http.ServerResponse): Promise<void> {
  const bible = await loadJson<BibleSnapshotV2>(bibleSnapshotPath(slug));
  if (!bible) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "bible snapshot missing" }));
    return;
  }

  const refsRoot = bibleRefsDir(slug);
  const [characters, locations, props] = await Promise.all([
    listRefs(refsRoot, "characters", (bible.characters ?? []).map((item) => item.id)),
    listRefs(refsRoot, "locations", (bible.locations ?? []).map((item) => item.id)),
    listRefs(refsRoot, "props", (bible.props ?? []).map((item) => item.id)),
  ]);

  const body: BibleWithRefs = {
    ...bible,
    refs: { characters, locations, props },
  };

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
