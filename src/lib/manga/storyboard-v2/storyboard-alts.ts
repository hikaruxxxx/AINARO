import { promises as fs } from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  storyboardAltsDir,
} from "../../../../scripts/manga/layers/_paths";

export type StoryboardGenerationProfile = "balanced" | "cinematic" | "clarity-first";

export type StoryboardProposal = {
  proposal_id: string;
  generation_profile: StoryboardGenerationProfile;
  generated_at: string;
  storyboard_path: string;
  summary?: string;
};

export type StoryboardProposalsIndex = {
  schema_version: 1;
  slug: string;
  episode: number;
  generated_at: string;
  proposals: StoryboardProposal[];
  recommendation?: { proposal_id: string; rationale: string };
};

const PROPOSAL_ID_RE = /^p_\d{4}-\d{2}-\d{2}_\d{2}$/;

export async function saveStoryboardAlts(
  slug: string,
  episode: number,
  index: StoryboardProposalsIndex
): Promise<void> {
  if (index.schema_version !== 1) throw new Error("StoryboardProposalsIndex.schema_version must be 1");
  if (index.slug !== slug) throw new Error(`StoryboardProposalsIndex.slug mismatch: ${index.slug} !== ${slug}`);
  if (index.episode !== episode) throw new Error(`StoryboardProposalsIndex.episode mismatch: ${index.episode} !== ${episode}`);
  for (const proposal of index.proposals) {
    if (!PROPOSAL_ID_RE.test(proposal.proposal_id)) {
      throw new Error(`Invalid storyboard proposal_id: ${proposal.proposal_id}`);
    }
  }

  const date = index.generated_at.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid StoryboardProposalsIndex.generated_at: ${index.generated_at}`);
  }

  const dir = storyboardAltsDir(slug, episode);
  await fs.mkdir(dir, { recursive: true });
  const targetPath = path.join(dir, `proposals-${date}.json`);
  const tmpPath = `${targetPath}.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
  await fs.rename(tmpPath, targetPath);
}

export function repoRelativePath(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}
