/**
 * L6 Continuity Resolve
 *
 * page_plan.json の各 panel に bible.continuity_seeds から group_id を注入
 */
import "../_env";
import { promises as fs } from "node:fs";
import { bibleSnapshotPath, storyboardPath, pagePlanPath } from "./_paths";
import { injectContinuityGroupIds } from "../../../src/lib/manga/page-director-v2/continuity-resolve-v2";
import type { BibleSnapshotV2, EpisodeStoryboardV2, PagePlanV2 } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number };

function parseArgs(): Args {
  const a: Partial<Args> = {};
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
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  console.log(`[L06] slug=${args.slug} ep=${args.episode}`);

  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;

  const updated = injectContinuityGroupIds({ pagePlan, storyboard, bible });
  await fs.writeFile(pagePlanPath(args.slug, args.episode), JSON.stringify(updated, null, 2));

  let total = 0;
  for (const page of updated.pages) for (const p of page.panels) total += (p.continuity_group_ids ?? []).length;
  console.log(`[L06] DONE: continuity_group_ids injected, total bindings=${total}`);
}

main().catch((e) => { console.error("[L06] FAILED:", e); process.exit(1); });
