/**
 * L4 Storyboard
 *
 * 二系統:
 *   従来: shotlist.json + bible/snapshot.json → storyboard.json (LLM 生成)
 *   新方式 (Phase β B5-5): scene_graph.json + bible/snapshot.json → storyboard.json (決定論)
 *
 * Usage:
 *   従来:    npx tsx scripts/manga/layers/L04-storyboard.ts --slug a07-modern-dungeon --episode 1
 *   新方式:  npx tsx scripts/manga/layers/L04-storyboard.ts --slug a07-modern-dungeon --episode 1 --from-scene-graph
 *   dry-run: 上記に --dry-run を加えると、storyboard.json を上書きせず stdout サマリーのみ出力
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  shotlistPath,
  sceneGraphPath,
  storyboardPath,
  episodeDir,
  storyboardAltsDir,
  storyboardAltProposalPath,
} from "./_paths";
import {
  extractStoryboardFromShotlist,
  validateStoryboardEntityBinding,
} from "../../../src/lib/manga/storyboard-v2/storyboard-extractor";
import { buildStoryboardFromSceneGraph, enrichStoryboardWithLLM } from "../../../src/lib/manga/scene-graph/storyboard-from-scenes";
import {
  repoRelativePath,
  saveStoryboardAlts,
  type StoryboardGenerationProfile,
  type StoryboardProposal,
  type StoryboardProposalsIndex,
} from "../../../src/lib/manga/storyboard-v2/storyboard-alts";
import {
  validatePanelSceneInheritance,
  isSceneGraphV1,
  type SceneGraphV1,
  type StoryboardLikeShape,
} from "../../../src/lib/manga/scene-graph/schema";
import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../../../src/lib/manga/schemas-v2";
import type { ShotlistV2 } from "../../../src/lib/manga/shotlist-v2/scene-extractor";

type Args = {
  slug: string;
  episode: number;
  fromSceneGraph: boolean;
  dryRun: boolean;
  enrich: boolean;
  variants: number;
  profile: StoryboardGenerationProfile;
  concurrency: number;
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    fromSceneGraph: false,
    dryRun: false,
    enrich: false,
    variants: 1,
    profile: "balanced",
    concurrency: 2,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from-scene-graph") { a.fromSceneGraph = true; continue; }
    if (arg === "--dry-run") { a.dryRun = true; continue; }
    if (arg === "--enrich") { a.enrich = true; continue; }
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "variants") a.variants = Number(val);
    else if (key === "profile") {
      if (!isStoryboardGenerationProfile(val)) throw new Error(`--profile must be balanced|cinematic|clarity-first: ${val}`);
      a.profile = val;
    }
    else if (key === "concurrency") a.concurrency = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  if (!Number.isInteger(a.variants) || a.variants < 1 || a.variants > 99) throw new Error("--variants must be 1-99");
  if (!Number.isInteger(a.concurrency) || a.concurrency < 1 || a.concurrency > 9) throw new Error("--concurrency must be 1-9");
  return a as Args;
}

function isStoryboardGenerationProfile(value: string): value is StoryboardGenerationProfile {
  return value === "balanced" || value === "cinematic" || value === "clarity-first";
}

function profileDirective(profile: StoryboardGenerationProfile): string | undefined {
  if (profile === "balanced") return undefined;
  if (profile === "cinematic") {
    return "カメラワークと panel 構図のダイナミックさを優先。wide / medium ショットを多めにし、page_one_shot を効果的に活用する。";
  }
  return "panel 構図の理解しやすさを最優先。close_up と medium を中心にし、各 panel の意図を明快にする。";
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function allocateProposalIds(slug: string, episode: number, count: number, date: string): Promise<string[]> {
  const dir = storyboardAltsDir(slug, episode);
  let max = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const re = new RegExp(`^p_${date.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_(\\d{2})$`);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const m = entry.name.match(re);
      if (m) max = Math.max(max, Number(m[1]));
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  if (max + count > 99) throw new Error(`proposal_id overflow for ${date}: max existing ${max}, requested ${count}`);
  return Array.from({ length: count }, (_, i) => `p_${date}_${String(max + i + 1).padStart(2, "0")}`);
}

async function loadExistingProposalsForDate(slug: string, episode: number, date: string): Promise<StoryboardProposal[]> {
  const indexPath = path.join(storyboardAltsDir(slug, episode), `proposals-${date}.json`);
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoryboardProposalsIndex>;
    return Array.isArray(parsed.proposals) ? parsed.proposals.filter((p): p is StoryboardProposal => (
      typeof p === "object" &&
      p !== null &&
      typeof p.proposal_id === "string" &&
      typeof p.generated_at === "string" &&
      typeof p.storyboard_path === "string" &&
      isStoryboardGenerationProfile(p.generation_profile)
    )) : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function buildStoryboard(args: Args, bible: BibleSnapshotV2, directive?: string): Promise<EpisodeStoryboardV2> {
  if (args.fromSceneGraph) {
    // Phase β B5-5 新方式: scene-graph から決定論的に storyboard を組む
    const sgRaw = JSON.parse(await fs.readFile(sceneGraphPath(args.slug, args.episode), "utf-8"));
    if (!isSceneGraphV1(sgRaw)) {
      throw new Error("scene_graph.json is not a valid SceneGraphV1");
    }
    const sceneGraph = sgRaw as SceneGraphV1;
    let storyboard = buildStoryboardFromSceneGraph(sceneGraph, bible);

    // panel-scene 継承検査 (B5-1) を兼ねる
    const inheritance = validatePanelSceneInheritance(
      storyboard as unknown as StoryboardLikeShape,
      sceneGraph
    );
    if (!inheritance.ok) {
      throw new Error(`panel-scene inheritance FAILED:\n${inheritance.errors.join("\n")}`);
    }

    // B5-5b: --enrich で Codex CLI 経由で panel 詳細を本番文化
    if (args.enrich) {
      console.log(`[L04] enriching panel details via Codex CLI (${sceneGraph.scenes.length} scenes)...`);
      const enrichStart = Date.now();
      storyboard = await enrichStoryboardWithLLM(storyboard, sceneGraph, {
        generationProfileDirective: directive,
      });
      console.log(`[L04] enrich done in ${((Date.now() - enrichStart) / 1000).toFixed(1)}s`);
    }
    return storyboard;
  }

  // 従来: shotlist + LLM 抽出
  const shotlist = JSON.parse(await fs.readFile(shotlistPath(args.slug, args.episode), "utf-8")) as ShotlistV2;
  return extractStoryboardFromShotlist({
    bible,
    shotlist,
    panelsPerPageRange: { min: 4, max: 7 },
    avgPanelsPerPage: 5,
    generationProfileDirective: directive,
  });
}

function validateOrThrow(storyboard: EpisodeStoryboardV2, bible: BibleSnapshotV2): void {
  const v = validateStoryboardEntityBinding(storyboard, bible);
  if (!v.ok) {
    throw new Error(`VALIDATION FAILED:\n${v.errors.join("\n")}`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.variants === 1) {
    console.log(`[L04] slug=${args.slug} ep=${args.episode} mode=${args.fromSceneGraph ? "scene-graph" : "shotlist"} dry-run=${args.dryRun}`);
  } else {
    console.log(`[L04] slug=${args.slug} ep=${args.episode} mode=${args.fromSceneGraph ? "scene-graph" : "shotlist"} dry-run=${args.dryRun} variants=${args.variants} profile=${args.profile} concurrency=${args.concurrency}`);
  }

  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;

  if (args.variants >= 2) {
    if (args.dryRun) {
      console.log(`[L04] DRY-RUN: multi-variant generation requested; no storyboard proposals will be written.`);
      return;
    }
    const now = new Date();
    const generatedAt = now.toISOString();
    const date = generatedAt.slice(0, 10);
    const proposalIds = await allocateProposalIds(args.slug, args.episode, args.variants, date);
    const proposals: StoryboardProposal[] = new Array(args.variants);
    const directive = profileDirective(args.profile);

    await runWithConcurrency(proposalIds, args.concurrency, async (proposalId, index) => {
      console.log(`[L04] generating proposal ${proposalId} (${index + 1}/${proposalIds.length}) profile=${args.profile}`);
      const storyboard = await buildStoryboard(args, bible, directive);
      validateOrThrow(storyboard, bible);
      const targetPath = storyboardAltProposalPath(args.slug, args.episode, proposalId);
      await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, `${JSON.stringify(storyboard, null, 2)}\n`, "utf-8");
      const totalPanels = storyboard.pages.reduce((n, p) => n + p.panels.length, 0);
      proposals[index] = {
        proposal_id: proposalId,
        generation_profile: args.profile,
        generated_at: new Date().toISOString(),
        storyboard_path: repoRelativePath(targetPath),
        summary: `${args.profile} で生成: pages=${storyboard.total_pages}, panels=${totalPanels}`,
      };
      console.log(`[L04] proposal ${proposalId} written: ${targetPath}`);
    });

    const existingProposals = await loadExistingProposalsForDate(args.slug, args.episode, date);
    const proposalById = new Map<string, StoryboardProposal>();
    for (const proposal of existingProposals) proposalById.set(proposal.proposal_id, proposal);
    for (const proposal of proposals) proposalById.set(proposal.proposal_id, proposal);
    const mergedProposals = [...proposalById.values()].sort((a, b) => a.proposal_id.localeCompare(b.proposal_id));

    await saveStoryboardAlts(args.slug, args.episode, {
      schema_version: 1,
      slug: args.slug,
      episode: args.episode,
      generated_at: generatedAt,
      proposals: mergedProposals,
    });
    console.log(`[L04] DONE: proposals=${proposals.length} index_total=${mergedProposals.length} index=${storyboardAltsDir(args.slug, args.episode)}/proposals-${date}.json`);
    console.log(`[L04] current storyboard.json was NOT modified.`);
    return;
  }

  const storyboard = await buildStoryboard(args, bible);
  validateOrThrow(storyboard, bible);

  const totalPanels = storyboard.pages.reduce((n, p) => n + p.panels.length, 0);
  if (args.dryRun) {
    console.log(`[L04] DRY-RUN: pages=${storyboard.total_pages} total_panels=${totalPanels}`);
    console.log(`[L04] DRY-RUN: storyboard.json was NOT written.`);
  } else {
    await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
    await fs.writeFile(storyboardPath(args.slug, args.episode), JSON.stringify(storyboard, null, 2));
    console.log(`[L04] DONE: ${storyboardPath(args.slug, args.episode)}`);
    console.log(`[L04] pages=${storyboard.total_pages} total_panels=${totalPanels}`);
  }
}

main().catch((e) => { console.error("[L04] FAILED:", e); process.exit(1); });
