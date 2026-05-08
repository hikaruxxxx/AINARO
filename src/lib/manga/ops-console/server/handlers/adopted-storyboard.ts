/**
 * GET/POST /api/works/{slug}/episodes/ep{NN}/adopted-storyboard
 *
 * Phase C-1β: storyboard.json (現存単一案) を「採用」記録する file。
 * 将来 _storyboard_alts/ に複数案が並んだら chosen_proposal_id で切替する。
 *
 * scope 確定は呼び出し側 (router) の責務。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  adoptedStoryboardPath,
  storyboardAltsDir,
  storyboardPath,
} from "../../../../../../scripts/manga/layers/_paths";
import {
  emptyAdoptedStoryboard,
  type AdoptedStoryboard,
} from "../../../revision-ui/types";
import { withFileLock } from "../lib/lock";
import { isValidSlug } from "../lib/path-guards";

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function loadAdopted(slug: string, episode: number): Promise<AdoptedStoryboard> {
  try {
    const raw = await fs.readFile(adoptedStoryboardPath(slug, episode), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AdoptedStoryboard>;
    return {
      schema_version: 1,
      slug,
      episode,
      chosen_proposal_id: typeof parsed.chosen_proposal_id === "string" ? parsed.chosen_proposal_id : "current",
      chosen_at: typeof parsed.chosen_at === "string" ? parsed.chosen_at : new Date(0).toISOString(),
      note: typeof parsed.note === "string" ? parsed.note : undefined,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyAdoptedStoryboard(slug, episode);
    throw error;
  }
}

async function writeAdopted(
  slug: string,
  episode: number,
  value: AdoptedStoryboard
): Promise<void> {
  const target = adoptedStoryboardPath(slug, episode);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await fs.rename(tmp, target);
}

/** proposal_id 検証: "current" or "proposal-YYYY-MM-DD..." 形式 */
function isSafeProposalId(id: unknown): id is string {
  if (typeof id !== "string" || id.length === 0 || id.length > 200) return false;
  return /^[A-Za-z0-9_\-.]+$/.test(id);
}

async function proposalExists(slug: string, episode: number, proposalId: string): Promise<boolean> {
  if (proposalId === "current") {
    try {
      await fs.access(storyboardPath(slug, episode));
      return true;
    } catch {
      return false;
    }
  }
  // _storyboard_alts/{proposalId}.json
  try {
    await fs.access(path.join(storyboardAltsDir(slug, episode), `${proposalId}.json`));
    return true;
  } catch {
    return false;
  }
}

export async function handleAdoptedStoryboardGet(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug)) return send(res, 400, { error: "作品 ID が不正です" });
  const adopted = await loadAdopted(slug, episode);
  send(res, 200, adopted);
}

export async function handleAdoptedStoryboardPost(
  slug: string,
  episode: number,
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
  if (!(await proposalExists(slug, episode, proposalId))) {
    return send(res, 404, { error: `proposal が存在しません: ${proposalId}` });
  }
  const note = typeof noteRaw === "string" ? noteRaw.slice(0, 500) : undefined;

  const updated = await withFileLock(adoptedStoryboardPath(slug, episode), async () => {
    const next: AdoptedStoryboard = {
      schema_version: 1,
      slug,
      episode,
      chosen_proposal_id: proposalId,
      chosen_at: new Date().toISOString(),
      note,
    };
    await writeAdopted(slug, episode, next);
    return next;
  });

  send(res, 200, { ok: true, slug, episode, adopted: updated });
}
