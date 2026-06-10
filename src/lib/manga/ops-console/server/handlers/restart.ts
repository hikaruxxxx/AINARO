/**
 * POST /api/restart
 *
 * Console 自身の再起動。手元のコード変更を反映させたいとき or process が変な状態に
 * なったときに UI から押せる。
 *
 * 仕組み:
 *   1. detached child process で `bash -c 'sleep 1 && npm run console -- --no-open'` を spawn
 *      - sleep 1 = 旧プロセスが port 5174 を release するまで待つ余裕
 *      - --no-open = 新 console は browser を開かない (UI が自分で reload するから)
 *   2. 200 レスポンス返却
 *   3. 200ms 後に self exit → child が起動を継続 → port 5174 で listen 開始
 *   4. UI 側は /api/health を 500ms 毎にポーリングし、200 が返ったら location.reload()
 *
 * 注意:
 *   - scope は `data/manga/.console-scope.json` で永続化されているので、再起動後も
 *     同じ作品 + 話に pin される。
 *   - PATH/cwd は親プロセスから引き継ぐ。
 */
import type http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";

const REPO_ROOT = process.env.AINARO_REPO_ROOT ?? path.resolve(__dirname, "../../../../../..");

export function handleRestartPost(res: http.ServerResponse): void {
  // detached child に「sleep 1 → npm run console」を任せる。
  // detached + stdio:ignore + unref で親プロセス終了後も生存。
  const child = spawn("bash", ["-c", "sleep 1 && npm run console -- --no-open"], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, restarting: true, eta_seconds: 5 }));

  // レスポンス flush の余裕を取って exit。child は sleep 1 中なのでまだ port を取りに来ない。
  setTimeout(() => process.exit(0), 200);
}
