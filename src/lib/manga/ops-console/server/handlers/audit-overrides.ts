/**
 * L11 audit findings の override (false positive / fixed マーク) を管理。
 *
 * 設計:
 *   - audit.json 本体は L11 が決定論的に書き換えるため、人間の判断は別ファイルに保持する
 *   - audit_overrides.jsonl: append-only。同 panel_id + check_kind の最新行が現在の override 状態
 *   - GET: 全 override を array で返す (client 側で reduce して最新状態を取る)
 *   - POST: 新しい override を 1 行 append
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  auditOverridesPath,
  episodeDir,
} from "../../../../../../scripts/manga/layers/_paths";
import { isValidEpisode, isValidSlug } from "../lib/path-guards";

export type AuditOverrideAction = "ignore" | "fixed" | "clear";

export type AuditOverrideEntry = {
  panel_id: string;
  check_kind: string;
  action: AuditOverrideAction;
  reason: string;
  created_at: string;
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function loadOverrides(slug: string, episode: number): Promise<AuditOverrideEntry[]> {
  const filePath = auditOverridesPath(slug, episode);
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  if (!text.trim()) return [];
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as AuditOverrideEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is AuditOverrideEntry => entry !== null);
}

export async function handleGetAuditOverrides(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidEpisode(episode)) {
    return send(res, 400, { error: "作品 ID または episode 番号が不正です" });
  }
  const entries = await loadOverrides(slug, episode);
  return send(res, 200, { entries });
}

export async function handlePostAuditOverride(
  slug: string,
  episode: number,
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidEpisode(episode)) {
    return send(res, 400, { error: "作品 ID または episode 番号が不正です" });
  }
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { error: "JSON parse error" });
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const panel_id = typeof obj.panel_id === "string" ? obj.panel_id : "";
  const check_kind = typeof obj.check_kind === "string" ? obj.check_kind : "";
  const action = obj.action;
  const reason = typeof obj.reason === "string" ? obj.reason : "";
  if (!panel_id || !check_kind) {
    return send(res, 400, { error: "panel_id と check_kind は必須" });
  }
  if (action !== "ignore" && action !== "fixed" && action !== "clear") {
    return send(res, 400, { error: "action は ignore / fixed / clear のいずれか" });
  }
  const entry: AuditOverrideEntry = {
    panel_id,
    check_kind,
    action,
    reason,
    created_at: new Date().toISOString(),
  };
  const filePath = auditOverridesPath(slug, episode);
  await fs.mkdir(episodeDir(slug, episode), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return send(res, 200, { ok: true, entry });
}
