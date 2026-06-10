/**
 * GET/POST /api/works/{slug}/volumes/v{NN}/adopted-plot
 *
 * Phase C-3: volume plot.json (現存単一案) を「採用」記録する file。
 * 将来 _plot_alts/ に複数案が並んだら chosen_proposal_id で切替する。
 *
 * scope 確定は呼び出し側 (router) の責務。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  adoptedVolumePlotPath,
  volumePlotAltsDir,
  volumePlotPath,
} from "../../../../../../scripts/manga/layers/_paths";
import {
  emptyAdoptedVolumePlot,
  type AdoptedVolumePlot,
} from "../../../revision-ui/types";
import { withFileLock } from "../lib/lock";
import { isValidSlug } from "../lib/path-guards";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function loadAdopted(slug: string, volume: number): Promise<AdoptedVolumePlot> {
  try {
    const raw = await fs.readFile(adoptedVolumePlotPath(slug, volume), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AdoptedVolumePlot>;
    return {
      schema_version: 1,
      slug,
      volume,
      chosen_proposal_id: typeof parsed.chosen_proposal_id === "string" ? parsed.chosen_proposal_id : "current",
      chosen_at: typeof parsed.chosen_at === "string" ? parsed.chosen_at : new Date(0).toISOString(),
      note: typeof parsed.note === "string" ? parsed.note : undefined,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyAdoptedVolumePlot(slug, volume);
    throw error;
  }
}

async function writeAdopted(
  slug: string,
  volume: number,
  value: AdoptedVolumePlot
): Promise<void> {
  const target = adoptedVolumePlotPath(slug, volume);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await fs.rename(tmp, target);
}

function isSafeProposalId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.length > 200) return false;
  return /^[A-Za-z0-9_\-.]+$/.test(id);
}

async function proposalExists(slug: string, volume: number, proposalId: string): Promise<boolean> {
  if (proposalId === "current") {
    try {
      await fs.access(volumePlotPath(slug, volume));
      return true;
    } catch {
      return false;
    }
  }
  try {
    await fs.access(path.join(volumePlotAltsDir(slug, volume), `${proposalId}.json`));
    return true;
  } catch {
    return false;
  }
}

export async function handleAdoptedVolumePlotGet(
  slug: string,
  volume: number,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
  const adopted = await loadAdopted(slug, volume);
  send(res, 200, adopted);
}

export async function handleAdoptedVolumePlotPost(
  slug: string,
  volume: number,
  body: unknown,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
  if (!body || typeof body !== "object") {
    return send(res, 400, { error: "body は object である必要があります" });
  }
  const b = body as Record<string, unknown>;
  const proposalId = b.chosen_proposal_id ?? b.proposal_id;
  const noteRaw = b.note;
  if (!isSafeProposalId(proposalId)) {
    return send(res, 400, { error: "chosen_proposal_id が不正です" });
  }
  if (!(await proposalExists(slug, volume, proposalId))) {
    return send(res, 404, { error: `proposal が存在しません: ${proposalId}` });
  }
  const note = typeof noteRaw === "string" ? noteRaw.slice(0, 500) : undefined;

  const updated = await withFileLock(adoptedVolumePlotPath(slug, volume), async () => {
    const next: AdoptedVolumePlot = {
      schema_version: 1,
      slug,
      volume,
      chosen_proposal_id: proposalId,
      chosen_at: new Date().toISOString(),
      note,
    };
    await writeAdopted(slug, volume, next);
    return next;
  });

  send(res, 200, { ok: true, slug, volume, adopted: updated });
}
