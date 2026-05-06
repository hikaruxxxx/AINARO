/**
 * GET /api/works/{slug}/volumes/v{NN}/plot
 *
 * L02b が生成する volume plot を read-only で返す。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import { volumePlotPath } from "../../../../../../scripts/manga/layers/_paths";
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
    return send(res, 400, { error: "invalid slug or volume" });
  }

  let plot: unknown;
  try {
    plot = JSON.parse(await fs.readFile(volumePlotPath(slug, volume), "utf-8"));
  } catch {
    return send(res, 404, { error: "volume plot not found" });
  }

  return send(res, 200, { slug, volume, plot });
}
