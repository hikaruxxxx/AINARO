/**
 * L8 Incremental Refs
 *
 * resolved_refs.json の unresolved_entities をスキャンし、
 * 不足 ref を bible.refs/ に追加生成する。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L08-incremental-refs.ts --slug a07-modern-dungeon --episode 1
 */
import "../_env";
import { promises as fs } from "node:fs";
import {
  bibleSnapshotPath,
  bibleRefsDir,
  resolvedRefsPath,
} from "./_paths";
import {
  generateCharacterRefsForBible,
  generateLocationRefsForBible,
  generatePropRefsForBible,
} from "../../../src/lib/manga/bible/v2-images";
import type { BibleSnapshotV2, ResolvedRefs } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number; concurrency: number };

function parseArgs(): Args {
  const a: Partial<Args> = { concurrency: 2 };
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
    else if (key === "concurrency") a.concurrency = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const resolved = JSON.parse(await fs.readFile(resolvedRefsPath(args.slug, args.episode), "utf-8")) as ResolvedRefs;

  const unresolved = new Set<string>();
  for (const p of Object.values(resolved.packets)) for (const u of p.unresolved_entities) unresolved.add(u);

  console.log(`[L08] unresolved entities=${unresolved.size}`);
  if (unresolved.size === 0) { console.log("[L08] nothing to do"); return; }

  const charsToGen = bible.characters.filter((c) => unresolved.has(c.id));
  const locsToGen = bible.locations.filter((l) => unresolved.has(l.id));
  const propsToGen = bible.props.filter((p) => unresolved.has(p.id));

  const refsDir = bibleRefsDir(args.slug);

  if (charsToGen.length > 0) {
    console.log(`[L08] generating ${charsToGen.length} character refs`);
    const r = await generateCharacterRefsForBible({
      snapshot: bible, refsDir, characters: charsToGen, concurrency: args.concurrency, skipExisting: true,
    });
    console.log(`[L08] characters: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
  }
  if (locsToGen.length > 0) {
    console.log(`[L08] generating ${locsToGen.length} location refs`);
    const r = await generateLocationRefsForBible({
      snapshot: bible, refsDir, locations: locsToGen, concurrency: args.concurrency, skipExisting: true,
    });
    console.log(`[L08] locations: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
  }
  if (propsToGen.length > 0) {
    console.log(`[L08] generating ${propsToGen.length} prop refs`);
    const r = await generatePropRefsForBible({
      snapshot: bible, refsDir, props: propsToGen, concurrency: args.concurrency, skipExisting: true,
    });
    console.log(`[L08] props: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
  }

  console.log(`[L08] DONE`);
  console.log(`[L08] → re-run L07 to refresh resolved_refs.json`);
}

main().catch((e) => { console.error("[L08] FAILED:", e); process.exit(1); });
