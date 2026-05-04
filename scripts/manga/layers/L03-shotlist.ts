/**
 * L3 Shotlist
 *
 * bible/snapshot.json + episode brief → episodes/epNN/shotlist.json
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L03-shotlist.ts \
 *     --slug a07-modern-dungeon --episode 1 \
 *     --brief "<1話のあらすじ200字>"
 *   または
 *   npx tsx scripts/manga/layers/L03-shotlist.ts --slug a07-modern-dungeon --episode 1 --brief-file <path>
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  episodeDir,
  shotlistPath,
} from "./_paths";
import {
  extractShotlistFromBible,
  validateShotlistAgainstBible,
} from "../../../src/lib/manga/shotlist-v2/scene-extractor";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode: number;
  brief?: string;
  briefFile?: string;
  targetPages?: number;
};

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "brief") a.brief = val;
    else if (key === "brief-file") a.briefFile = val;
    else if (key === "target-pages") a.targetPages = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  if (!a.brief && !a.briefFile) throw new Error("--brief or --brief-file required");
  return a as Args;
}

async function loadSnapshot(slug: string): Promise<BibleSnapshotV2> {
  const txt = await fs.readFile(bibleSnapshotPath(slug), "utf-8");
  return JSON.parse(txt) as BibleSnapshotV2;
}

async function main() {
  const args = parseArgs();
  const brief = args.brief
    ? args.brief
    : await fs.readFile(path.resolve(args.briefFile!), "utf-8");
  const bible = await loadSnapshot(args.slug);
  const targetPages = args.targetPages ?? bible.meta.target_pages_per_episode ?? 22;

  console.log(`[L03] slug=${args.slug} ep=${args.episode} target_pages=${targetPages}`);
  console.log(`[L03] bible: characters=${bible.characters.length} locations=${bible.locations.length} props=${bible.props.length}`);

  const shotlist = await extractShotlistFromBible({
    bible,
    episodeNo: args.episode,
    episodeBrief: brief,
    targetPages,
    targetPanelsPerPage: 5,
  });

  const validation = validateShotlistAgainstBible(shotlist, bible);
  if (!validation.ok) {
    console.error(`[L03] VALIDATION FAILED:\n${validation.errors.join("\n")}`);
    process.exit(2);
  }

  await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
  const outPath = shotlistPath(args.slug, args.episode);
  await fs.writeFile(outPath, JSON.stringify(shotlist, null, 2));
  console.log(`[L03] DONE: ${outPath}`);
  console.log(`[L03] scenes=${shotlist.scenes.length} panels=${shotlist.total_panels}`);
}

main().catch((e) => { console.error("[L03] FAILED:", e); process.exit(1); });
