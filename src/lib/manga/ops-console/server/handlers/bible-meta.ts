/**
 * PUT /api/works/{slug}/bible/meta
 *
 * bible/snapshot.json の meta だけを人間編集で更新する gateway。
 * LLM は呼ばず、既存 snapshot を読み込み -> shallow merge -> atomic write する。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath } from "../../../../../../scripts/manga/layers/_paths";
import type { BibleSnapshotV2, CoreHookV2 } from "../../../schemas-v2";
import { readJsonBody } from "../lib/body";
import { isValidSlug } from "../lib/path-guards";

type BibleMetaPutBody = {
  core_hook?: CoreHookV2 | null;
  meta?: Partial<BibleSnapshotV2["meta"]>;
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCoreHook(value: unknown): value is CoreHookV2 {
  if (!isRecord(value)) return false;
  return (
    typeof value.one_liner === "string" &&
    (value.type === "A" || value.type === "B" || value.type === "C") &&
    Array.isArray(value.hit_references) &&
    value.hit_references.every((item) => typeof item === "string")
  );
}

async function loadSnapshot(fp: string): Promise<BibleSnapshotV2 | null> {
  try {
    return JSON.parse(await fs.readFile(fp, "utf-8")) as BibleSnapshotV2;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function handleBibleMetaPut(
  slug: string,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug)) {
    return send(res, 400, { error: "作品 ID が不正です" });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return send(res, 400, { error: `JSON parse error: ${String(error)}` });
  }
  if (!isRecord(body)) {
    return send(res, 400, { error: "body は object である必要があります" });
  }

  const requestBody = body as BibleMetaPutBody;
  const hasCoreHook = Object.prototype.hasOwnProperty.call(body, "core_hook");
  const hasMeta = Object.prototype.hasOwnProperty.call(body, "meta");
  if (!hasCoreHook && !hasMeta) {
    return send(res, 400, { error: "core_hook または meta が必要です" });
  }
  if (hasMeta && requestBody.meta !== undefined && !isRecord(requestBody.meta)) {
    return send(res, 400, { error: "meta は object である必要があります" });
  }
  if (
    hasCoreHook &&
    requestBody.core_hook !== null &&
    requestBody.core_hook !== undefined &&
    !isCoreHook(requestBody.core_hook)
  ) {
    return send(res, 400, { error: "core_hook は { one_liner, type, hit_references } である必要があります" });
  }

  const targetPath = bibleSnapshotPath(slug);
  const snapshot = await loadSnapshot(targetPath);
  if (!snapshot) {
    return send(res, 404, { error: "bible snapshot missing" });
  }

  // meta は shallow merge。core_hook が明示されていれば最後に gateway として優先する。
  snapshot.meta = {
    ...snapshot.meta,
    ...(hasMeta && requestBody.meta ? requestBody.meta : {}),
  };
  if (hasCoreHook) {
    if (requestBody.core_hook === null) {
      delete snapshot.meta.core_hook;
    } else if (requestBody.core_hook !== undefined) {
      snapshot.meta.core_hook = requestBody.core_hook;
    }
  }

  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, targetPath);

  return send(res, 200, { ok: true, meta: snapshot.meta, saved_at: new Date().toISOString() });
}
