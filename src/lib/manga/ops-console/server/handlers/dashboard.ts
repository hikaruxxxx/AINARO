import type http from "node:http";
import { scanDashboard } from "../lib/dashboard-scanner";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseLimit(url: URL): number {
  const raw = Number(url.searchParams.get("limit") ?? 3);
  if (!Number.isFinite(raw)) return 3;
  return Math.max(1, Math.min(10, Math.trunc(raw)));
}

export async function handleDashboardNextActions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL
): Promise<void> {
  void req;
  try {
    const limit = parseLimit(url);
    return send(res, 200, await scanDashboard({ nextActionLimit: limit }));
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}
