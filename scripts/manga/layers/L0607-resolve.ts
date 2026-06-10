/**
 * L0607 Resolve
 *
 * L06 continuity_group_ids injection + L07 resolved_refs.json generation.
 * 入出力は既存 L06/L07 と互換: page_plan.json を更新し resolved_refs.json を生成する。
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  resolvedRefsPath,
  bibleRefsDir,
  capabilityProfilePath,
  STYLE_PLATES_DIR,
  DEFAULT_CAPABILITY_MODEL,
} from "./_paths";
import { loadCapabilityProfile } from "../../../src/lib/manga/capability/capability";
import { injectContinuityGroupIds } from "../../../src/lib/manga/page-director-v2/continuity-resolve-v2";
import { resolveRefsForEpisode } from "../../../src/lib/manga/page-director-v2/refs-resolver-v2";
import type { BibleSnapshotV2, EpisodeStoryboardV2, PagePlanV2 } from "../../../src/lib/manga/schemas-v2";

export type L0607ResolveArgs = { slug: string; episode: number; capabilityModel?: string };
export type L0607ResolveResult = {
  pagePlanPath: string; resolvedRefsPath: string; continuityBindings: number;
  packetCount: number; totalRefs: number; unresolvedEntities: string[]; renderStrategy: string;
};

function parseArgs(argv = process.argv.slice(2)): Required<L0607ResolveArgs> {
  const a: Partial<Required<L0607ResolveArgs>> = { capabilityModel: DEFAULT_CAPABILITY_MODEL };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "capability-model") a.capabilityModel = val;
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Required<L0607ResolveArgs>;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
}

async function findStylePlate(artStyle: string): Promise<string | null> {
  const candidate = path.join(STYLE_PLATES_DIR, `${artStyle}.png`);
  try { await fs.access(candidate); return candidate; } catch { return null; }
}

function countContinuityBindings(pagePlan: PagePlanV2): number {
  let total = 0;
  for (const page of pagePlan.pages) for (const panel of page.panels) total += (panel.continuity_group_ids ?? []).length;
  return total;
}

export async function runL0607Resolve(args: L0607ResolveArgs): Promise<L0607ResolveResult> {
  const capabilityModel = args.capabilityModel ?? DEFAULT_CAPABILITY_MODEL;
  const bible = await readJson<BibleSnapshotV2>(bibleSnapshotPath(args.slug));
  const storyboard = await readJson<EpisodeStoryboardV2>(storyboardPath(args.slug, args.episode));
  const pagePlan = await readJson<PagePlanV2>(pagePlanPath(args.slug, args.episode));

  const updatedPagePlan = injectContinuityGroupIds({ pagePlan, storyboard, bible });
  await fs.writeFile(pagePlanPath(args.slug, args.episode), JSON.stringify(updatedPagePlan, null, 2));

  const capability = await loadCapabilityProfile(capabilityProfilePath(capabilityModel));
  const stylePlatePath = await findStylePlate(bible.meta.art_style);
  if (!stylePlatePath) console.warn(`[L0607] WARN: style plate not found for ${bible.meta.art_style}`);

  const resolved = await resolveRefsForEpisode({
    pagePlan: updatedPagePlan, storyboard, bible, refsDir: bibleRefsDir(args.slug), capability, stylePlatePath,
  });
  await fs.writeFile(resolvedRefsPath(args.slug, args.episode), JSON.stringify(resolved, null, 2));

  const totalRefs = Object.values(resolved.packets).reduce((n, p) => n + p.refs.length, 0);
  const unresolved = new Set<string>();
  for (const packet of Object.values(resolved.packets)) for (const entityId of packet.unresolved_entities) unresolved.add(entityId);

  return {
    pagePlanPath: pagePlanPath(args.slug, args.episode),
    resolvedRefsPath: resolvedRefsPath(args.slug, args.episode),
    continuityBindings: countContinuityBindings(updatedPagePlan),
    packetCount: Object.keys(resolved.packets).length,
    totalRefs,
    unresolvedEntities: [...unresolved],
    renderStrategy: resolved.render_strategy,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(`[L0607] slug=${args.slug} ep=${args.episode}`);
  const result = await runL0607Resolve(args);
  console.log(`[L0607] continuity_group_ids injected, total bindings=${result.continuityBindings}`);
  console.log(`[L0607] DONE: ${result.resolvedRefsPath}`);
  console.log(`[L0607] strategy=${result.renderStrategy} packets=${result.packetCount} total_refs=${result.totalRefs} unresolved_entities=${result.unresolvedEntities.length}`);
  if (result.unresolvedEntities.length > 0) {
    console.log(`[L0607] unresolved: ${result.unresolvedEntities.join(", ")}`);
    console.log("[L0607] -> run L08 to generate incremental refs");
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((e) => {
    console.error("[L0607] FAILED:", e);
    process.exit(1);
  });
}
