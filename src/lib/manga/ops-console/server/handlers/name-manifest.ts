/**
 * GET /api/works/{slug}/episodes/epNN/name-manifest
 *
 * L8.5 が生成した name_manifest.json を SPA へ返す。
 * 判定ロジックは含めず、ファイル内容をそのまま返す薄い read endpoint。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import { nameManifestPath } from "../../../../../../scripts/manga/layers/_paths";

export async function handleNameManifest(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await fs.readFile(nameManifestPath(slug, episode), "utf-8");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "name_manifest not found" }));
  }
}
