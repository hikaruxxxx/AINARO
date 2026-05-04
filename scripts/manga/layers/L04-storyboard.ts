/**
 * L4 Storyboard
 *
 * shotlist.json + bible/snapshot.json → episodes/epNN/storyboard.json
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L04-storyboard.ts --slug a07-modern-dungeon --episode 1
 */
import "../_env";
import { promises as fs } from "node:fs";
import { bibleSnapshotPath, shotlistPath, storyboardPath, episodeDir } from "./_paths";
import { extractStoryboardFromShotlist, validateStoryboardEntityBinding } from "../../../src/lib/manga/storyboard-v2/storyboard-extractor";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";
import type { ShotlistV2 } from "../../../src/lib/manga/shotlist-v2/scene-extractor";

type Args = { slug: string; episode: number };

function parseArgs(): Args {
  const a: Partial<Args> = {};
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
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  console.log(`[L04] slug=${args.slug} ep=${args.episode}`);

  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const shotlist = JSON.parse(await fs.readFile(shotlistPath(args.slug, args.episode), "utf-8")) as ShotlistV2;

  const storyboard = await extractStoryboardFromShotlist({ bible, shotlist });
  const v = validateStoryboardEntityBinding(storyboard, bible);
  if (!v.ok) {
    console.error(`[L04] VALIDATION FAILED:\n${v.errors.join("\n")}`);
    process.exit(2);
  }

  await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
  await fs.writeFile(storyboardPath(args.slug, args.episode), JSON.stringify(storyboard, null, 2));
  console.log(`[L04] DONE: ${storyboardPath(args.slug, args.episode)}`);
  console.log(`[L04] pages=${storyboard.total_pages} total_panels=${storyboard.pages.reduce((n, p) => n + p.panels.length, 0)}`);
}

main().catch((e) => { console.error("[L04] FAILED:", e); process.exit(1); });
