/**
 * append-only JSONL ヘルパー
 *
 * render_manifest.jsonl と _revision_queue.jsonl で共有。
 * - 単一プロセス内で (slug, episode, kind) 単位で write をシリアライズ
 * - 行末改行は厳格に \n のみ
 * - 失敗時は throw (silent skip しない)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  renderManifestPath,
  revisionQueuePath,
} from "../../../../scripts/manga/layers/_paths";
import type { RenderManifestEntry, RevisionEntry } from "./types";

type Kind = "render_manifest" | "revision_queue";

const writeQueues = new Map<string, Promise<unknown>>();

function key(slug: string, ep: number, kind: Kind): string {
  return `${kind}#${slug}#${ep}`;
}

function withLock<T>(slug: string, ep: number, kind: Kind, fn: () => Promise<T>): Promise<T> {
  const k = key(slug, ep, kind);
  const prev = writeQueues.get(k) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tracked = next.catch(() => undefined);
  writeQueues.set(k, tracked);
  tracked.then(() => {
    if (writeQueues.get(k) === tracked) writeQueues.delete(k);
  });
  return next;
}

async function appendJsonl(filePath: string, entry: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

export async function appendRenderManifest(entry: RenderManifestEntry): Promise<void> {
  await withLock(entry.slug, entry.episode, "render_manifest", () =>
    appendJsonl(renderManifestPath(entry.slug, entry.episode), entry)
  );
}

export async function appendRevisionEntry(entry: RevisionEntry): Promise<void> {
  await withLock(entry.slug, entry.episode, "revision_queue", () =>
    appendJsonl(revisionQueuePath(entry.slug, entry.episode), entry)
  );
}

/** JSONL 全体を読む。空ファイル/不在は [] を返す */
export async function readJsonl<T>(filePath: string): Promise<T[]> {
  let text: string;
  try { text = await fs.readFile(filePath, "utf-8"); } catch { return []; }
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

/**
 * 指定 panel に対する次 version 文字列を決める。
 * 既存 manifest にある最大 version を見て v(N+1)。最初は v1。
 */
export function nextVersion(existingManifest: RenderManifestEntry[], panelId: string, layer: "render"): string {
  const versions = existingManifest
    .filter((m) => m.panel_id === panelId && m.layer === layer)
    .map((m) => parseVersion(m.version))
    .filter((n) => n > 0);
  const max = versions.length > 0 ? Math.max(...versions) : 0;
  return `v${max + 1}`;
}

function parseVersion(v: string): number {
  const m = v.match(/^v(\d+)$/);
  return m ? Number(m[1]) : 0;
}
