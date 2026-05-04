/**
 * L7 Refs Resolution
 *
 * page_plan.json + bible/refs/_provenance.json + capability → resolved_refs.json
 */
import "../_env";
import { promises as fs } from "node:fs";
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
import { resolveRefsForEpisode } from "../../../src/lib/manga/page-director-v2/refs-resolver-v2";
import { loadCapabilityProfile } from "../../../src/lib/manga/capability/capability";
import path from "node:path";
import type { BibleSnapshotV2, EpisodeStoryboardV2, PagePlanV2 } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number; capabilityModel: string };

function parseArgs(): Args {
  const a: Partial<Args> = { capabilityModel: DEFAULT_CAPABILITY_MODEL };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "capability-model") a.capabilityModel = val;
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function findStylePlate(artStyle: string): Promise<string | null> {
  const candidate = path.join(STYLE_PLATES_DIR, `${artStyle}.png`);
  try { await fs.access(candidate); return candidate; } catch { return null; }
}

async function main() {
  const args = parseArgs();
  console.log(`[L07] slug=${args.slug} ep=${args.episode}`);

  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const capability = await loadCapabilityProfile(capabilityProfilePath(args.capabilityModel));
  const stylePlatePath = await findStylePlate(bible.meta.art_style);
  if (!stylePlatePath) console.warn(`[L07] WARN: style plate not found for ${bible.meta.art_style}`);

  const resolved = await resolveRefsForEpisode({
    pagePlan, storyboard, bible,
    refsDir: bibleRefsDir(args.slug),
    capability,
    stylePlatePath,
  });

  await fs.writeFile(resolvedRefsPath(args.slug, args.episode), JSON.stringify(resolved, null, 2));
  const totalRefs = Object.values(resolved.packets).reduce((n, p) => n + p.refs.length, 0);
  const totalUnresolved = new Set<string>();
  for (const p of Object.values(resolved.packets)) for (const u of p.unresolved_entities) totalUnresolved.add(u);
  console.log(`[L07] DONE: ${resolvedRefsPath(args.slug, args.episode)}`);
  console.log(`[L07] strategy=${resolved.render_strategy} packets=${Object.keys(resolved.packets).length} total_refs=${totalRefs} unresolved_entities=${totalUnresolved.size}`);
  if (totalUnresolved.size > 0) {
    console.log(`[L07] unresolved: ${[...totalUnresolved].join(", ")}`);
    console.log(`[L07] → run L08 to generate incremental refs`);
  }
}

main().catch((e) => { console.error("[L07] FAILED:", e); process.exit(1); });
