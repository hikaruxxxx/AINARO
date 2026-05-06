/**
 * GET /api/bootstrap
 *
 * SPA 初期化に必要な default scope と works 一覧をまとめて返す。
 */
import type http from "node:http";
import { listWorksInfo } from "./works";

export async function handleBootstrap(
  defaults: { defaultSlug: string | null; defaultEpisode: number | null },
  res: http.ServerResponse
): Promise<void> {
  const works = await listWorksInfo();
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      default_slug: defaults.defaultSlug,
      default_episode: defaults.defaultEpisode,
      works,
    })
  );
}
