/**
 * GET / PUT /api/works/{slug}/volumes/v{NN}/plot
 *
 * L02b が生成する volume plot の取得・人間編集 (small inline edit) 用。
 * GET: read-only で返す
 * PUT: client が編集した plot 全体で上書き (atomic write)
 *      schema 検証は最小限 (JSON object + episodes が array)。詳細スキーマは
 *      L02b 生成側で保証されている前提で、人間編集は文言調整・数値微調整に限る想定。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { volumePlotPath } from "../../../../../../scripts/manga/layers/_paths";
import { readJsonBody } from "../lib/body";
import { isValidSlug } from "../lib/path-guards";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function isValidVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function handleVolumePlot(
  slug: string,
  volume: number,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidVolume(volume)) {
    return send(res, 400, { error: "作品 ID または巻番号が不正です" });
  }

  let plot: unknown;
  try {
    plot = JSON.parse(await fs.readFile(volumePlotPath(slug, volume), "utf-8"));
  } catch {
    return send(res, 404, { error: "Volume Plot は未生成です" });
  }

  return send(res, 200, { slug, volume, plot });
}

export async function handleVolumePlotPut(
  slug: string,
  volume: number,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidVolume(volume)) {
    return send(res, 400, { error: "作品 ID または巻番号が不正です" });
  }
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return send(res, 400, { error: `JSON parse error: ${String(e)}` });
  }
  // body は { plot: {...} } または plot 自体を直接受ける。
  const plot = body && typeof body === "object" && "plot" in (body as Record<string, unknown>)
    ? (body as Record<string, unknown>).plot
    : body;
  if (!plot || typeof plot !== "object" || Array.isArray(plot)) {
    return send(res, 400, { error: "plot は object である必要があります" });
  }
  const obj = plot as Record<string, unknown>;
  if (!Array.isArray(obj.episodes)) {
    return send(res, 400, { error: "plot.episodes は array である必要があります" });
  }
  const targetPath = volumePlotPath(slug, volume);
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(plot, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, targetPath);
  return send(res, 200, { slug, volume, plot, saved_at: new Date().toISOString() });
}
