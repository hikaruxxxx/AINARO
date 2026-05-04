/**
 * L2 Bible Images
 *
 * snapshot.json から characters / locations / props の参照画像を生成。
 * Codex CLI 経由で gpt-image-2 を呼び (ChatGPT Pro $200/月 枠内)。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L02-bible-images.ts --slug a07-modern-dungeon
 *   npx tsx scripts/manga/layers/L02-bible-images.ts --slug a07-modern-dungeon --only=protagonist
 *   npx tsx scripts/manga/layers/L02-bible-images.ts --slug a07-modern-dungeon --kinds=characters,locations
 */
import "../_env";
import { promises as fs } from "node:fs";
import {
  bibleSnapshotPath,
  bibleRefsDir,
} from "./_paths";
import {
  generateCharacterRefsForBible,
  generateLocationRefsForBible,
  generatePropRefsForBible,
} from "../../../src/lib/manga/bible/v2-images";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  kinds: Set<"characters" | "locations" | "props">;
  only?: "protagonist" | "all";
  concurrency: number;
  skipExisting: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    kinds: new Set(["characters", "locations", "props"]),
    only: "all",
    concurrency: 2,
    skipExisting: true,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "kinds")
      a.kinds = new Set(val.split(",").map((s) => s.trim() as "characters" | "locations" | "props"));
    else if (key === "only") a.only = val as "protagonist" | "all";
    else if (key === "concurrency") a.concurrency = Number(val);
    else if (key === "skip-existing") a.skipExisting = val !== "false";
  }
  if (!a.slug) throw new Error("--slug=<slug> required");
  return a as Args;
}

async function loadSnapshot(slug: string): Promise<BibleSnapshotV2> {
  const txt = await fs.readFile(bibleSnapshotPath(slug), "utf-8");
  return JSON.parse(txt) as BibleSnapshotV2;
}

async function main() {
  const args = parseArgs();
  console.log(`[L02] slug=${args.slug} kinds=${[...args.kinds].join(",")} only=${args.only} concurrency=${args.concurrency}`);

  const snapshot = await loadSnapshot(args.slug);
  const refsDir = bibleRefsDir(args.slug);
  await fs.mkdir(refsDir, { recursive: true });

  const totals = { generated: 0, skipped: 0, failed: 0 };

  if (args.kinds.has("characters")) {
    const chars =
      args.only === "protagonist"
        ? snapshot.characters.filter((c) => c.role === "protagonist")
        : snapshot.characters;
    console.log(`[L02] characters: ${chars.length} entries`);
    const r = await generateCharacterRefsForBible({
      snapshot,
      refsDir,
      characters: chars,
      concurrency: args.concurrency,
      skipExisting: args.skipExisting,
    });
    console.log(`[L02] characters: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
    totals.generated += r.generated;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  if (args.kinds.has("locations")) {
    console.log(`[L02] locations: ${snapshot.locations.length} entries`);
    const r = await generateLocationRefsForBible({
      snapshot,
      refsDir,
      concurrency: args.concurrency,
      skipExisting: args.skipExisting,
    });
    console.log(`[L02] locations: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
    totals.generated += r.generated;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  if (args.kinds.has("props")) {
    console.log(`[L02] props: ${snapshot.props.length} entries`);
    const r = await generatePropRefsForBible({
      snapshot,
      refsDir,
      concurrency: args.concurrency,
      skipExisting: args.skipExisting,
    });
    console.log(`[L02] props: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
    totals.generated += r.generated;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  console.log("");
  console.log(`[L02] DONE: generated=${totals.generated} skipped=${totals.skipped} failed=${totals.failed}`);
  if (totals.failed > 0) process.exit(2);
}

main().catch((e) => {
  console.error("[L02] FAILED:", e);
  process.exit(1);
});
