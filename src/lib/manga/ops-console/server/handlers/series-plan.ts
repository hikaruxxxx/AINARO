/**
 * GET /api/works/{slug}/series-plan
 *
 * L2b --phase=series が生成する本作レベル長期計画 (series_plan.json) の取得。
 * Read-only (人間編集は volume-plot view 経由で行う想定。series 全体の再生成は
 * L02b CLI で行う)。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import { seriesPlanPath } from "../../../../../../scripts/manga/layers/_paths";
import { isValidSlug } from "../lib/path-guards";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export async function handleSeriesPlanGet(
  slug: string,
  res: http.ServerResponse,
): Promise<void> {
  if (!isValidSlug(slug)) {
    return send(res, 400, { error: "作品 ID が不正です" });
  }

  let plan: unknown;
  try {
    plan = JSON.parse(await fs.readFile(seriesPlanPath(slug), "utf-8"));
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return send(res, 404, {
        error: "series_plan.json は未生成です。L02b --phase=series で生成してください",
      });
    }
    return send(res, 500, { error: `series_plan 読み込み失敗: ${String(e)}` });
  }

  return send(res, 200, { slug, plan });
}
