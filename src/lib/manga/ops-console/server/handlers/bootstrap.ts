/**
 * GET /api/bootstrap
 *
 * SPA 初期化に必要な「現在の scope」と works 一覧をまとめて返す。
 *
 * 旧 (CLI 引数固定) → 新 (UI 切替対応) 移行のため、
 * `default_slug`/`default_episode` は引き続き「現在 pin されている scope」を意味する。
 * UI 側はこの値で初期 scope を決め、scope switcher で `POST /api/scope` を呼んで切替える。
 */
import type http from "node:http";
import { listWorksInfo } from "./works";
import { getScope } from "../scope-store";

export async function handleBootstrap(
  defaults: { defaultSlug: string | null; defaultEpisode: number | null },
  res: http.ServerResponse
): Promise<void> {
  const works = await listWorksInfo();
  // defaults は router 層で scope-store から注入済み (handleApi 冒頭参照)。念のため getScope() でも上書きしておく。
  const scope = getScope();
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      default_slug: scope.slug ?? defaults.defaultSlug,
      default_episode: scope.episode ?? defaults.defaultEpisode,
      works,
    })
  );
}
