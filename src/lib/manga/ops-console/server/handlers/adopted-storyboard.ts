/**
 * GET/POST /api/works/{slug}/episodes/ep{NN}/adopted-storyboard
 *
 * Phase 2B: storyboard の採用 SSoT。
 * proposal 採用時は _storyboard_alts/{proposal_id}/storyboard.json を
 * episodes/epNN/storyboard.json に materialize し、既存 layer 互換を保つ。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  adoptedStoryboardPath,
  storyboardAltProposalPath,
  storyboardPath,
  storyboardPreAdoptBackupPath,
} from "../../../../../../scripts/manga/layers/_paths";
import {
  emptyAdoptedStoryboard,
  type AdoptedStoryboard,
} from "../../../revision-ui/types";
import { withFileLock } from "../lib/lock";
import { isValidEpisode, isValidSlug } from "../lib/path-guards";

const PROPOSAL_ID_RE = /^[A-Za-z0-9_\-]{1,128}$/;

function isSafeProposalId(value: unknown): value is string {
  return typeof value === "string" && (value === "current" || PROPOSAL_ID_RE.test(value));
}

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

async function writeAdopted(slug: string, episode: number, value: AdoptedStoryboard): Promise<void> {
  const targetPath = adoptedStoryboardPath(slug, episode);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, targetPath);
}

async function proposalExists(slug: string, episode: number, proposalId: string): Promise<boolean> {
  if (proposalId === "current") return true;
  try {
    await fs.access(storyboardAltProposalPath(slug, episode, proposalId));
    return true;
  } catch {
    return false;
  }
}

async function ensurePreAdoptBackup(slug: string, episode: number): Promise<void> {
  const sbPath = storyboardPath(slug, episode);
  const backupPath = storyboardPreAdoptBackupPath(slug, episode);
  try {
    await fs.access(backupPath);
  } catch {
    try {
      await fs.copyFile(sbPath, backupPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }
}

async function materializeProposal(slug: string, episode: number, proposalId: string): Promise<void> {
  if (proposalId === "current") return;
  const sbPath = storyboardPath(slug, episode);
  const proposalText = await fs.readFile(storyboardAltProposalPath(slug, episode, proposalId), "utf-8");
  const tmpPath = `${sbPath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, proposalText, "utf-8");
  await fs.rename(tmpPath, sbPath);
}

export async function handleAdoptedStoryboardGet(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidEpisode(episode)) {
    return send(res, 400, { error: "作品 ID または episode が不正です" });
  }
  try {
    const adopted = await loadAdopted(slug, episode);
    return send(res, 200, adopted);
  } catch (error) {
    return send(res, 500, { error: String(error) });
  }
}

export async function handleAdoptedStoryboardPost(
  slug: string,
  episode: number,
  body: unknown,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidEpisode(episode)) {
    return send(res, 400, { error: "作品 ID または episode が不正です" });
  }
  if (!body || typeof body !== "object") {
    return send(res, 400, { error: "body must be object" });
  }

  const b = body as { chosen_proposal_id?: unknown; note?: unknown };
  if (!isSafeProposalId(b.chosen_proposal_id)) {
    return send(res, 400, { error: "chosen_proposal_id must be 'current' or [A-Za-z0-9_-]{1,128}" });
  }

  const chosenId = b.chosen_proposal_id;
  const note = typeof b.note === "string" && b.note.length <= 500 ? b.note : undefined;
  if (!(await proposalExists(slug, episode, chosenId))) {
    return send(res, 404, { error: `proposal not found: ${chosenId}` });
  }

  try {
    const adopted = await withFileLock(adoptedStoryboardPath(slug, episode), async () => {
      if (chosenId !== "current") {
        await ensurePreAdoptBackup(slug, episode);
        await materializeProposal(slug, episode, chosenId);
      }

      const next: AdoptedStoryboard = {
        schema_version: 1,
        slug,
        episode,
        chosen_proposal_id: chosenId,
        chosen_at: new Date().toISOString(),
        ...(note ? { note } : {}),
      };
      await writeAdopted(slug, episode, next);
      return next;
    });

    return send(res, 200, { ok: true, slug, episode, adopted });
  } catch (error) {
    return send(res, 500, { error: String(error) });
  }
}
