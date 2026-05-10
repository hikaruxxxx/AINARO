import type http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { REPO_ROOT, sceneGraphPath } from "../../../../../../scripts/manga/layers/_paths";
import { isSceneGraphV1, type SceneGraphV1 } from "../../../scene-graph/schema";

type NameLintFixBody = {
  slug?: unknown;
  episode?: unknown;
  panel_nos?: unknown;
  scene_ids?: unknown;
  finding_rules?: unknown;
};

function sendSse(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function lineSplitter(onLine: (line: string) => void): (chunk: Buffer) => void {
  let pending = "";
  return (chunk: Buffer) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length > 0) onLine(line);
    }
  };
}

function parseBody(body: NameLintFixBody): {
  slug: string;
  episode: number;
  panelNos: number[];
  sceneIds: string[];
  findingRules: string[];
} {
  const slug = typeof body.slug === "string" ? body.slug : "";
  const episode = typeof body.episode === "number" ? body.episode : Number(body.episode);
  const panelNos = Array.isArray(body.panel_nos)
    ? body.panel_nos.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const sceneIds = Array.isArray(body.scene_ids)
    ? body.scene_ids.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const findingRules = Array.isArray(body.finding_rules)
    ? body.finding_rules.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];

  if (!slug) throw new Error("slug required");
  if (!Number.isInteger(episode) || episode <= 0) throw new Error("episode required");
  if (panelNos.length === 0 && sceneIds.length === 0) throw new Error("panel_nos or scene_ids required");
  return { slug, episode, panelNos, sceneIds, findingRules };
}

export function panelNosFromSceneIds(sceneGraph: SceneGraphV1, sceneIds: string[]): number[] {
  const targets = new Set(sceneIds);
  const panelNos = new Set<number>();
  for (const scene of sceneGraph.scenes) {
    if (!targets.has(scene.scene_id)) continue;
    for (let panelNo = scene.panel_range.start_panel_no; panelNo <= scene.panel_range.end_panel_no; panelNo++) {
      panelNos.add(panelNo);
    }
  }
  return Array.from(panelNos).sort((a, b) => a - b);
}

async function resolvePanelNos(parsed: ReturnType<typeof parseBody>): Promise<number[]> {
  const panelNos = new Set(parsed.panelNos);
  if (parsed.sceneIds.length > 0) {
    const raw = JSON.parse(await fs.readFile(sceneGraphPath(parsed.slug, parsed.episode), "utf-8")) as unknown;
    if (!isSceneGraphV1(raw)) throw new Error("scene_graph.json is not a valid SceneGraphV1");
    for (const panelNo of panelNosFromSceneIds(raw, parsed.sceneIds)) panelNos.add(panelNo);
  }
  return Array.from(panelNos).sort((a, b) => a - b);
}

export async function handleNameLintFixPost(body: unknown, res: http.ServerResponse): Promise<void> {
  let parsed: ReturnType<typeof parseBody>;
  let panelNos: number[];
  try {
    parsed = parseBody((body ?? {}) as NameLintFixBody);
    panelNos = await resolvePanelNos(parsed);
    if (panelNos.length === 0) throw new Error("no target panels resolved");
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const script = path.join(REPO_ROOT, "scripts/manga/layers/L08-9-lint-enrich-loop.ts");
  const args = [
    "--import",
    "tsx",
    script,
    "--slug",
    parsed.slug,
    "--episode",
    String(parsed.episode),
    "--target-panels",
    panelNos.join(","),
    "--improvement-threshold",
    "0",
    "--max-iterations",
    "1",
  ];
  sendSse(res, "data", {
    message:
      `[name-lint-fix] panel=${panelNos.join(",")}` +
      (parsed.sceneIds.length > 0 ? ` scene=${parsed.sceneIds.join(",")}` : "") +
      ` rules=${parsed.findingRules.join(",") || "all"}`,
  });

  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onStdout = lineSplitter((line) => sendSse(res, "data", { channel: "stdout", message: line }));
  const onStderr = lineSplitter((line) => sendSse(res, "data", { channel: "stderr", message: line }));
  child.stdout.on("data", onStdout);
  child.stderr.on("data", onStderr);
  child.on("error", (error) => {
    sendSse(res, "error", { message: error.message });
    res.end();
  });
  child.on("close", (code) => {
    if (code === 0) {
      sendSse(res, "done", { exitCode: code });
    } else {
      sendSse(res, "error", { message: `L08-9 exited with code ${code ?? "unknown"}`, exitCode: code });
    }
    res.end();
  });
}
