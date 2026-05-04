/**
 * L5 Page Director
 *
 * storyboard.json → page_plan.json (deterministic mapper, テンプレ駆動)
 */
import "../_env";
import { promises as fs } from "node:fs";
import {
  storyboardPath,
  pagePlanPath,
  episodeDir,
  capabilityProfilePath,
  DEFAULT_CAPABILITY_MODEL,
} from "./_paths";
import { buildPagePlanFromStoryboard } from "../../../src/lib/manga/page-director-v2/page-mapper-v2";
import { loadCapabilityProfile } from "../../../src/lib/manga/capability/capability";
import type { EpisodeStoryboardV2 } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number; capabilityModel: string };

function parseArgs(): Args {
  const a: Partial<Args> = { capabilityModel: DEFAULT_CAPABILITY_MODEL };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
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

async function main() {
  const args = parseArgs();
  console.log(`[L05] slug=${args.slug} ep=${args.episode}`);

  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const capability = await loadCapabilityProfile(capabilityProfilePath(args.capabilityModel));

  const plan = buildPagePlanFromStoryboard({ storyboard, capability });

  await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
  await fs.writeFile(pagePlanPath(args.slug, args.episode), JSON.stringify(plan, null, 2));
  console.log(`[L05] DONE: ${pagePlanPath(args.slug, args.episode)}`);
  console.log(`[L05] pages=${plan.pages.length} strategies=${[...new Set(plan.pages.map(p => p.render_strategy))].join(",")}`);
}

main().catch((e) => { console.error("[L05] FAILED:", e); process.exit(1); });
