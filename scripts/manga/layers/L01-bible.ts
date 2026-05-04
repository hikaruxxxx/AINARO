/**
 * L1 Bible Snapshot
 *
 * V2企画書 → bible/snapshot.json (BibleSnapshotV2) を生成。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L01-bible.ts \
 *     --slug a07-modern-dungeon \
 *     --concept data/manga/_archive/2026-05-02-pre-redesign/modern_dungeon-stage1-8/stage2/A07_v2.json
 */
import "../_env";
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  loadV2Concept,
  adaptV2ConceptToBibleSnapshot,
  writeBibleSnapshot,
} from "../../../src/lib/manga/bible/v2-adapter";
import { workDir, workMetaPath } from "./_paths";
import type { ArtStyle } from "../../../src/lib/manga/types";

type Args = {
  slug: string;
  concept: string;
  artStyle?: ArtStyle;
};

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      const [, k, v] = eq;
      if (k === "slug") a.slug = v;
      else if (k === "concept") a.concept = v;
      else if (k === "art-style") a.artStyle = v as ArtStyle;
      continue;
    }
    const flag = arg.match(/^--(.+)$/);
    if (flag && i + 1 < argv.length) {
      const k = flag[1];
      const v = argv[++i];
      if (k === "slug") a.slug = v;
      else if (k === "concept") a.concept = v;
      else if (k === "art-style") a.artStyle = v as ArtStyle;
    }
  }
  if (!a.slug) throw new Error("--slug=<slug> required");
  if (!a.concept) throw new Error("--concept=<v2_concept_json_path> required");
  return a as Args;
}

async function loadMeta(slug: string) {
  const txt = await fs.readFile(workMetaPath(slug), "utf-8");
  return JSON.parse(txt);
}

async function main() {
  const args = parseArgs();
  console.log(`[L01] slug=${args.slug} concept=${args.concept}`);

  const concept = await loadV2Concept(path.resolve(args.concept));
  const meta = await loadMeta(args.slug);

  const snapshot = adaptV2ConceptToBibleSnapshot(concept, {
    slug: args.slug,
    sourcePath: args.concept,
    artStyle: (args.artStyle ?? meta.art_style ?? "manga_bw_seinen_urban") as ArtStyle,
    targetPagesPerVolume: meta.volume_plan?.target_pages_per_volume ?? 200,
    targetEpisodesPerVolume: meta.volume_plan?.target_episodes_per_volume ?? 10,
    targetPagesPerEpisode: meta.volume_plan?.target_pages_per_episode ?? 22,
    estimatedVolumes: meta.volume_plan?.estimated_volumes ?? 13,
    titleShort: meta.title_short,
    targetAudience: meta.target_audience,
  });

  const outFile = await writeBibleSnapshot(workDir(args.slug), snapshot);
  console.log(`[L01] DONE: ${outFile}`);
  console.log(
    `[L01] characters=${snapshot.characters.length}, locations=${snapshot.locations.length}, props=${snapshot.props.length}, costumes=${snapshot.costumes.length}, continuity_seeds=${snapshot.continuity_seeds.length}`
  );
}

main().catch((e) => {
  console.error("[L01] FAILED:", e);
  process.exit(1);
});
