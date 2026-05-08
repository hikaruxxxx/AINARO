/**
 * GET /api/works/{slug}/episodes/ep{NN}/storyboard-proposals
 *
 * Phase 2D: storyboard 複数案比較 lightbox 用の read-only aggregate。
 */
import type http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  adoptedStoryboardPath,
  episodeDir,
  nameDir,
  storyboardAltsDir,
} from "../../../../../../scripts/manga/layers/_paths";
import {
  emptyAdoptedStoryboard,
  type AdoptedStoryboard,
} from "../../../revision-ui/types";
import type {
  StoryboardProposal,
  StoryboardProposalsIndex,
} from "../../../storyboard-v2/storyboard-alts";
import type { StoryboardAuditReport } from "../../../qa-v2/storyboard-audit";
import { isValidEpisode, isValidSlug } from "../lib/path-guards";

export type StoryboardProposalsResponse = {
  proposals: StoryboardProposal[];
  audit: StoryboardAuditReport | null;
  adopted: AdoptedStoryboard;
  variant_svgs: Record<string, string[]>;
};

function send(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function latestFile(dir: string, re: RegExp): Promise<string | null> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && re.test(entry.name))
      .map(async (entry) => {
        const abs = path.join(dir, entry.name);
        const stat = await fs.stat(abs);
        return { abs, mtimeMs: stat.mtimeMs };
      })
  );
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.abs.localeCompare(a.abs));
  return files[0]?.abs ?? null;
}

async function readJsonOrNull<T>(filePath: string | null): Promise<T | null> {
  if (!filePath) return null;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

async function loadAdopted(slug: string, episode: number): Promise<AdoptedStoryboard> {
  const parsed = await readJsonOrNull<Partial<AdoptedStoryboard>>(adoptedStoryboardPath(slug, episode));
  if (!parsed) return emptyAdoptedStoryboard(slug, episode);
  return {
    schema_version: 1,
    slug,
    episode,
    chosen_proposal_id: typeof parsed.chosen_proposal_id === "string" ? parsed.chosen_proposal_id : "current",
    chosen_at: typeof parsed.chosen_at === "string" ? parsed.chosen_at : new Date(0).toISOString(),
    note: typeof parsed.note === "string" ? parsed.note : undefined,
  };
}

async function listVariantSvgs(slug: string, episode: number, proposalId: string): Promise<string[]> {
  const dir = path.join(nameDir(slug, episode), "_variants", proposalId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
  const epRoot = episodeDir(slug, episode);
  return entries
    .filter((entry) => /^p\d+\.svg$/i.test(entry))
    .sort()
    .map((entry) => path.relative(epRoot, path.join(dir, entry)).split(path.sep).join("/"));
}

function emptyResponse(slug: string, episode: number, adopted: AdoptedStoryboard): StoryboardProposalsResponse {
  void slug;
  void episode;
  return { proposals: [], audit: null, adopted, variant_svgs: {} };
}

export async function handleStoryboardProposalsGet(
  slug: string,
  episode: number,
  res: http.ServerResponse
): Promise<void> {
  if (!isValidSlug(slug) || !isValidEpisode(episode)) {
    return send(res, 400, { error: "作品 ID または episode が不正です" });
  }
  try {
    const adopted = await loadAdopted(slug, episode);
    const altsDir = storyboardAltsDir(slug, episode);
    const proposalsPath = await latestFile(altsDir, /^proposals-\d{4}-\d{2}-\d{2}\.json$/);
    if (!proposalsPath) return send(res, 200, emptyResponse(slug, episode, adopted));

    const proposalsIndex = await readJsonOrNull<StoryboardProposalsIndex>(proposalsPath);
    const proposals = proposalsIndex?.proposals ?? [];
    const auditPath = await latestFile(altsDir, /^audit-\d{4}-\d{2}-\d{2}\.json$/);
    const audit = await readJsonOrNull<StoryboardAuditReport>(auditPath);
    const variantSvgs: Record<string, string[]> = {};
    for (const proposal of proposals) {
      variantSvgs[proposal.proposal_id] = await listVariantSvgs(slug, episode, proposal.proposal_id);
    }

    return send(res, 200, {
      proposals,
      audit,
      adopted,
      variant_svgs: variantSvgs,
    } satisfies StoryboardProposalsResponse);
  } catch (error) {
    return send(res, 500, { error: String(error) });
  }
}
