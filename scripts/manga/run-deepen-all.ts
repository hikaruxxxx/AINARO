/**
 * Phase 1-2b deepen orchestrator
 *
 * 1 Codex CLI call = 1 target を stage 単位で並列実行し、patch は stage ごとに順序 apply する。
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleDir, bibleSnapshotPath } from "./layers/_paths";
import { loadV2Concept } from "../../src/lib/manga/bible/v2-adapter";
import { depthCoverageReport } from "../../src/lib/manga/bible/depth-lint";
import { lintBible } from "../../src/lib/manga/qa-v2/bible-lint";
import type { BibleSnapshotV2 } from "../../src/lib/manga/schemas-v2";
import {
  applyCharacterPatch,
  applyCostumePatch,
  applyCrossRefPatch,
  applyLocationPatch,
  applyMotifPatch,
  applyPropPatch,
  applyRelationPatch,
  applyVolumePatch,
  applyWorldPatch,
  runStage1aCharacterBackground,
  runStage1bCharacterPsychology,
  runStage1cCharacterDailyAndRelations,
  runStage2Location,
  runStage3World,
  runStage4Motif,
  runStage5Prop,
  runStage6Costume,
  runStage7Relation,
  runStage8Volume,
  runStage9CrossReference,
  type CharacterDeepPatch,
  type CostumeDeepPatch,
  type CrossRefPatch,
  type LocationDeepPatch,
  type MotifDeepPatch,
  type PropDeepPatch,
  type RelationDeepPatch,
  type VolumeDeepPatch,
  type WorldAspect,
  type WorldDeepPatch,
} from "../../src/lib/manga/bible/deep-extractor";

type Args = {
  slug: string;
  concept: string;
  concurrency: number;
  styleRefNote?: string;
  styleRefNoteFile?: string;
};

type StageStats = {
  name: string;
  calls: number;
  durationMs: number;
  outputChars: number;
};

const WORLD_ASPECTS: WorldAspect[] = ["history", "power_system", "cosmology", "economy", "social", "daily_life", "language", "forbidden_lore"];

const DEFAULT_STYLE_REF_NOTE = `参考: 現代ダンジョン系なろうコミカライズ。線細め、白多め、人物優先、縦書き吹き出し、背景は establishing 以外ミニマル。`;

function parseArgs(): Args {
  const out: Partial<Args> = { concurrency: 5 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/u);
    const key = eq?.[1] ?? (arg.startsWith("--") ? arg.slice(2) : "");
    const val = eq?.[2] ?? (key && i + 1 < argv.length ? argv[++i] : undefined);
    if (!key || val === undefined) continue;
    if (key === "slug") out.slug = val;
    else if (key === "concept") out.concept = val;
    else if (key === "concurrency") out.concurrency = Math.max(1, Number(val));
    else if (key === "style-ref-note") out.styleRefNote = val;
    else if (key === "style-ref-note-file") out.styleRefNoteFile = val;
  }
  if (!out.slug || !out.concept) throw new Error("--slug and --concept required");
  return out as Args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const concept = await loadV2Concept(path.resolve(args.concept));
  let bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const styleRefNote = args.styleRefNoteFile
    ? await fs.readFile(args.styleRefNoteFile, "utf-8")
    : args.styleRefNote ?? DEFAULT_STYLE_REF_NOTE;
  const stats: StageStats[] = [];

  console.log(`[deepen-all] slug=${args.slug} concurrency=${args.concurrency}`);
  await backup(args.slug, bible, "pre-deepen-all");

  const characterBackgroundPatches = await runStage("1a-character-background", bible.characters, args.concurrency, stats, (character) =>
    runStage1aCharacterBackground({ bible, v2Concept: concept, characterId: character.id, styleReferenceNote: styleRefNote }) as Promise<CharacterDeepPatch>,
  );
  for (const patch of characterBackgroundPatches) bible = applyCharacterPatch(bible, patch);
  await finishStage(args.slug, bible, "1a-character-background");

  const characterPsychologyPatches = await runStage("1b-character-psychology", bible.characters, args.concurrency, stats, (character) =>
    runStage1bCharacterPsychology({ bible, v2Concept: concept, characterId: character.id, styleReferenceNote: styleRefNote }) as Promise<CharacterDeepPatch>,
  );
  for (const patch of characterPsychologyPatches) bible = applyCharacterPatch(bible, patch);
  await finishStage(args.slug, bible, "1b-character-psychology");

  const characterDailyPatches = await runStage("1c-character-daily-relations", bible.characters, args.concurrency, stats, (character) =>
    runStage1cCharacterDailyAndRelations({ bible, v2Concept: concept, characterId: character.id, styleReferenceNote: styleRefNote }) as Promise<CharacterDeepPatch>,
  );
  for (const patch of characterDailyPatches) bible = applyCharacterPatch(bible, patch);
  await finishStage(args.slug, bible, "1c-character-daily-relations");

  const locationPatches = await runStage("2-location", bible.locations, args.concurrency, stats, (location) =>
    runStage2Location({ bible, locationId: location.id, styleReferenceNote: styleRefNote }) as Promise<LocationDeepPatch>,
  );
  for (const patch of locationPatches) bible = applyLocationPatch(bible, patch);
  await finishStage(args.slug, bible, "2-location");

  const worldPatches = await runStage("3-world", WORLD_ASPECTS, args.concurrency, stats, (aspect) =>
    runStage3World({ bible, v2Concept: concept, aspect, styleReferenceNote: styleRefNote }) as Promise<WorldDeepPatch>,
  );
  for (const patch of worldPatches) bible = applyWorldPatch(bible, patch);
  await finishStage(args.slug, bible, "3-world");

  const motifTargets = bible.visual_motifs.map((motif) => motif.name.trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/gu, "_"));
  const motifPatches = await runStage("4-motif", motifTargets, args.concurrency, stats, (motifId) =>
    runStage4Motif({ bible, motifId, styleReferenceNote: styleRefNote }) as Promise<MotifDeepPatch>,
  );
  for (const patch of motifPatches) bible = applyMotifPatch(bible, patch);
  await finishStage(args.slug, bible, "4-motif");

  const propPatches = await runStage("5-prop", bible.props, args.concurrency, stats, (prop) =>
    runStage5Prop({ bible, propId: prop.id, styleReferenceNote: styleRefNote }) as Promise<PropDeepPatch>,
  );
  for (const patch of propPatches) bible = applyPropPatch(bible, patch);
  await finishStage(args.slug, bible, "5-prop");

  const costumePatches = await runStage("6-costume", bible.costumes, args.concurrency, stats, (costume) =>
    runStage6Costume({ bible, costumeId: costume.id, styleReferenceNote: styleRefNote }) as Promise<CostumeDeepPatch>,
  );
  for (const patch of costumePatches) bible = applyCostumePatch(bible, patch);
  await finishStage(args.slug, bible, "6-costume");

  const relationPatches = await runStage("7-relation", bible.relations, args.concurrency, stats, (relation) =>
    runStage7Relation({ bible, relation: { a_id: relation.from_character_id, b_id: relation.to_character_id }, styleReferenceNote: styleRefNote }) as Promise<RelationDeepPatch>,
  );
  for (const patch of relationPatches) bible = applyRelationPatch(bible, patch);
  await finishStage(args.slug, bible, "7-relation");

  const volumeCount = Math.max(1, bible.meta.estimated_volumes ?? 1);
  const volumePatches = await runStage("8-volume", Array.from({ length: volumeCount }, (_, index) => index + 1), args.concurrency, stats, (volumeNo) =>
    runStage8Volume({ bible, v2Concept: concept, volumeNo, styleReferenceNote: styleRefNote }) as Promise<VolumeDeepPatch>,
  );
  for (const patch of volumePatches) bible = applyVolumePatch(bible, patch);
  await finishStage(args.slug, bible, "8-volume");

  const crossStarted = Date.now();
  const crossPatch = await runStage9CrossReference({ bible, styleReferenceNote: styleRefNote }) as CrossRefPatch;
  stats.push({ name: "9-cross-reference", calls: 1, durationMs: Date.now() - crossStarted, outputChars: JSON.stringify(crossPatch).length });
  bible = applyCrossRefPatch(bible, crossPatch);
  await finishStage(args.slug, bible, "9-cross-reference");

  await fs.writeFile(bibleSnapshotPath(args.slug), JSON.stringify(bible, null, 2));
  const postLint = await lintBible({ bible, skipLlm: true });
  await fs.writeFile(path.join(bibleDir(args.slug), "lint_report.json"), JSON.stringify(postLint, null, 2));

  console.log("[deepen-all] summary");
  for (const stat of stats) {
    console.log(`  ${stat.name}: calls=${stat.calls} sec=${Math.round(stat.durationMs / 1000)} output_chars=${stat.outputChars}`);
  }
  console.log(`[deepen-all] post-lint fatal=${postLint.fatal_count} warn=${postLint.warn_count}`);
}

async function runStage<T, P>(
  name: string,
  items: T[],
  concurrency: number,
  stats: StageStats[],
  worker: (item: T, index: number) => Promise<P>,
): Promise<P[]> {
  const startedAt = Date.now();
  const results: P[] = [];
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await worker(items[index], index);
      results[index] = result;
      console.log(`[deepen-all] ${name} ${index + 1}/${items.length} done`);
    }
  });
  await Promise.all(runners);
  const outputChars = results.reduce((sum, result) => sum + JSON.stringify(result).length, 0);
  stats.push({ name, calls: items.length, durationMs: Date.now() - startedAt, outputChars });
  return results;
}

async function finishStage(slug: string, bible: BibleSnapshotV2, stage: string): Promise<void> {
  await backup(slug, bible, stage);
  const reports = depthCoverageReport(bible);
  const totalMatches = reports.reduce((sum, report) => sum + report.per_match.length, 0);
  const coverage = totalMatches > 0
    ? reports.reduce((sum, report) => sum + report.per_match.reduce((inner, match) => inner + Math.min(100, match.coverage_pct), 0), 0) / totalMatches
    : 0;
  console.log(`[deepen-all] ${stage} coverage_pct=${Math.round(coverage * 10) / 10}`);
}

async function backup(slug: string, bible: BibleSnapshotV2, label: string): Promise<void> {
  const ts = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  const backupPath = path.join(bibleDir(slug), `snapshot.bak-${ts}-${label}.json`);
  await fs.writeFile(backupPath, JSON.stringify(bible, null, 2));
  console.log(`[deepen-all] backup -> ${backupPath}`);
}

void main().catch((error: unknown) => {
  console.error("[deepen-all] FAILED:", error);
  process.exit(1);
});
