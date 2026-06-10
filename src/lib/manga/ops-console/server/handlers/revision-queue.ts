/**
 * GET/POST /api/revision-queue ハンドラ (旧 serve-revision.ts:handleRevisionQueueGet/Post)
 *
 * scope 確定は呼び出し側の責務。本 handler は (slug, episode) を信頼前提で受け取る。
 * 修正指示の追記 (append-only)、id/ts は server 生成、panel_id は page_one_shot を正規化。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  pagePlanPath,
  revisionQueuePath,
} from "../../../../../../scripts/manga/layers/_paths";
import { readJsonl } from "../../../revision-ui/manifest";
import {
  isRevisionTag,
  type RevisionEntry,
  type RevisionTag,
} from "../../../revision-ui/types";
import type { PagePlanV2 } from "../../../schemas-v2";
import { withFileLock } from "../lib/lock";
import { isSafeImagePath, normalizePanelId } from "../lib/path-guards";

async function loadJsonOpt<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function handleRevisionQueueGet(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  const q = await readJsonl<RevisionEntry>(revisionQueuePath(slug, episode));
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ entries: q }));
}

export async function handleRevisionQueuePost(
  slug: string,
  episode: number,
  body: any,
  res: http.ServerResponse
): Promise<void> {
  const rawPanelId = String(body?.panel_id ?? "");
  const page_no = Number(body?.page_no ?? 0);
  const panel_no = body?.panel_no !== undefined ? Number(body.panel_no) : undefined;
  const instruction = String(body?.instruction ?? "").slice(0, 1000);
  const checked_tags: RevisionTag[] = Array.isArray(body?.checked_tags)
    ? body.checked_tags.filter(isRevisionTag)
    : [];
  const image_path = String(body?.image_path ?? "");
  const for_version = String(body?.for_version ?? "v1");

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

  const pagePlan = await loadJsonOpt<PagePlanV2>(pagePlanPath(slug, episode));
  const panel_id = normalizePanelId(pagePlan, rawPanelId, page_no);

  const entry: RevisionEntry = {
    schema_version: 1,
    id: randomUUID(),
    ts: new Date().toISOString(),
    slug,
    episode,
    page_no,
    panel_id,
    panel_no,
    instruction,
    checked_tags,
    image_path,
    for_version,
  };
  const filePath = revisionQueuePath(slug, episode);
  let duplicateWarning: string | null = null;
  await withFileLock(`queue#${slug}#${episode}`, async () => {
    const existing = await readJsonl<RevisionEntry>(filePath);
    const unresolvedSamePanel = existing.find(
      (e) => e.panel_id === panel_id && !e.resolved_version
    );
    if (unresolvedSamePanel) {
      duplicateWarning = `panel "${panel_id}" に未消化の指示が既に ${
        existing.filter((e) => e.panel_id === panel_id && !e.resolved_version).length
      } 件あります`;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
  });
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, id: entry.id, duplicate_warning: duplicateWarning }));
}
