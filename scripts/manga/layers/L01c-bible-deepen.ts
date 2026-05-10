/**
 * L01c Bible Deepen
 *
 * Phase 1-2b: 1 Codex CLI call = 1 target の stage 分割 deepen。
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath, bibleDir } from "./_paths";
import { loadV2Concept } from "../../../src/lib/manga/bible/v2-adapter";
import { lintBible } from "../../../src/lib/manga/qa-v2/bible-lint";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";
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
  runStage1Character,
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
} from "../../../src/lib/manga/bible/deep-extractor";

type StageName =
  | "1-character"
  | "2-location"
  | "3-world"
  | "4-motif"
  | "5-prop"
  | "6-costume"
  | "7-relation"
  | "8-volume"
  | "9-cross-reference";

type Args = {
  slug: string;
  concept: string;
  stage?: StageName;
  target?: string;
  aspect?: WorldAspect;
  volumeNo?: number;
  styleRefNote?: string;
  styleRefNoteFile?: string;
  all: boolean;
  dryRun: boolean;
  reLint: boolean;
};

const WORLD_ASPECTS: WorldAspect[] = ["history", "power_system", "cosmology", "economy", "social", "daily_life", "language", "forbidden_lore"];

function parseArgs(): Args {
  const a: Partial<Args> = { reLint: true, all: false, dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") {
      a.all = true;
      continue;
    }
    if (arg === "--dry-run") {
      a.dryRun = true;
      continue;
    }
    if (arg === "--no-relint") {
      a.reLint = false;
      continue;
    }
    const eq = arg.match(/^--([^=]+)=(.*)$/u);
    const key = eq?.[1] ?? (arg.startsWith("--") ? arg.slice(2) : "");
    const val = eq?.[2] ?? (key && i + 1 < argv.length ? argv[++i] : undefined);
    if (!key || val === undefined) continue;
    if (key === "slug") a.slug = val;
    else if (key === "concept") a.concept = val;
    else if (key === "stage") a.stage = parseStage(val);
    else if (key === "target") a.target = val;
    else if (key === "aspect") a.aspect = parseAspect(val);
    else if (key === "volume" || key === "volume-no") a.volumeNo = Number(val);
    else if (key === "style-ref-note") a.styleRefNote = val;
    else if (key === "style-ref-note-file") a.styleRefNoteFile = val;
  }
  if (!a.slug || !a.concept) throw new Error("--slug and --concept required");
  if (!a.all && !a.stage) throw new Error("--stage or --all required");
  return a as Args;
}

function parseStage(value: string): StageName {
  const stages: StageName[] = ["1-character", "2-location", "3-world", "4-motif", "5-prop", "6-costume", "7-relation", "8-volume", "9-cross-reference"];
  if (!stages.includes(value as StageName)) throw new Error(`unknown --stage: ${value}`);
  return value as StageName;
}

function parseAspect(value: string): WorldAspect {
  if (!WORLD_ASPECTS.includes(value as WorldAspect)) throw new Error(`unknown --aspect: ${value}`);
  return value as WorldAspect;
}

const DEFAULT_STYLE_REF_NOTE = `参考: 「現代ダンジョン × ガチャ × システム音声」系のなろう系コミカライズ。
- 画風: ライト青年漫画
- 線: 細め、確信のある主線、ハッチング控えめ
- ベタ: 主要キャラの黒髪と影に集中、画面全体は白多め
- 背景: establishing 以外はミニマル、コマ内は人物優先
- 吹き出し: 縦書き、丁寧に整列、SE は手書きカタカナで控えめ
NEGATIVES: 重い陰影 / 過剰なトーン / 写真風 / 3D塗り / 海外コミック調`;

async function main() {
  const args = parseArgs();
  const concept = await loadV2Concept(path.resolve(args.concept));
  let bible = await readBible(args.slug);
  const styleRefNote = args.styleRefNoteFile
    ? await fs.readFile(args.styleRefNoteFile, "utf-8")
    : args.styleRefNote ?? DEFAULT_STYLE_REF_NOTE;

  console.log(`[L01c] slug=${args.slug} mode=${args.all ? "all" : args.stage} dry-run=${args.dryRun}`);
  const preLint = await lintBible({ bible, skipLlm: true });
  console.log(`[L01c] pre-lint: fatal=${preLint.fatal_count} warn=${preLint.warn_count}`);

  if (args.all) {
    bible = await runAllSequential({ slug: args.slug, bible, concept, styleRefNote, dryRun: args.dryRun });
  } else if (args.stage) {
    bible = await runSingleStage({ args, bible, concept, styleRefNote });
  }

  if (!args.dryRun) {
    await fs.writeFile(bibleSnapshotPath(args.slug), JSON.stringify(bible, null, 2));
    console.log(`[L01c] saved enhanced -> ${bibleSnapshotPath(args.slug)}`);
  }

  if (args.reLint && !args.dryRun) {
    const postLint = await lintBible({ bible, skipLlm: true });
    console.log(`[L01c] post-lint: fatal=${postLint.fatal_count} warn=${postLint.warn_count} (improved fatal -${preLint.fatal_count - postLint.fatal_count} / warn -${preLint.warn_count - postLint.warn_count})`);
    await fs.writeFile(path.join(bibleDir(args.slug), "lint_report.json"), JSON.stringify(postLint, null, 2));
  }
  console.log("[L01c] DONE");
}

async function runSingleStage(input: {
  args: Args;
  bible: BibleSnapshotV2;
  concept: Awaited<ReturnType<typeof loadV2Concept>>;
  styleRefNote: string;
}): Promise<BibleSnapshotV2> {
  const { args, concept, styleRefNote } = input;
  let bible = input.bible;
  const common = { bible, styleReferenceNote: styleRefNote, dryRun: args.dryRun };
  const stage = requireValue(args.stage, "--stage");
  const target = args.target;
  const startedAt = Date.now();

  if (stage === "1-character") {
    const patch = await runStage1Character({ ...common, v2Concept: concept, characterId: requireValue(target, "--target") });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyCharacterPatch(bible, patch);
  } else if (stage === "2-location") {
    const patch = await runStage2Location({ ...common, locationId: requireValue(target, "--target") });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyLocationPatch(bible, patch);
  } else if (stage === "3-world") {
    const patch = await runStage3World({ ...common, v2Concept: concept, aspect: args.aspect ?? "history" });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyWorldPatch(bible, patch);
  } else if (stage === "4-motif") {
    const patch = await runStage4Motif({ ...common, motifId: requireValue(target, "--target") });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyMotifPatch(bible, patch);
  } else if (stage === "5-prop") {
    const patch = await runStage5Prop({ ...common, propId: requireValue(target, "--target") });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyPropPatch(bible, patch);
  } else if (stage === "6-costume") {
    const patch = await runStage6Costume({ ...common, costumeId: requireValue(target, "--target") });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyCostumePatch(bible, patch);
  } else if (stage === "7-relation") {
    const [aId, bId] = requireValue(target, "--target").split(/->|:/u);
    if (!aId || !bId) throw new Error("--target for 7-relation must be a_id->b_id");
    const patch = await runStage7Relation({ ...common, relation: { a_id: aId, b_id: bId } });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyRelationPatch(bible, patch);
  } else if (stage === "8-volume") {
    const patch = await runStage8Volume({ ...common, v2Concept: concept, volumeNo: args.volumeNo ?? Number(requireValue(target, "--target")) });
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyVolumePatch(bible, patch);
  } else {
    const patch = await runStage9CrossReference(common);
    if (isDryRun(patch)) return printDryRun(patch, input.bible);
    bible = applyCrossRefPatch(bible, patch);
  }

  await backupStage(args.slug, input.bible, stage, target ?? args.aspect ?? String(args.volumeNo ?? "all"));
  console.log(`[L01c] ${stage} complete in ${Math.round((Date.now() - startedAt) / 1000)}s chars=${JSON.stringify(bible).length}`);
  return bible;
}

async function runAllSequential(input: {
  slug: string;
  bible: BibleSnapshotV2;
  concept: Awaited<ReturnType<typeof loadV2Concept>>;
  styleRefNote: string;
  dryRun: boolean;
}): Promise<BibleSnapshotV2> {
  let bible = input.bible;
  for (const character of bible.characters) {
    bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "1-character", target: character.id, all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  }
  for (const location of bible.locations) {
    bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "2-location", target: location.id, all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  }
  for (const aspect of WORLD_ASPECTS) {
    bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "3-world", aspect, all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  }
  for (const motif of bible.visual_motifs) {
    bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "4-motif", target: motif.name.trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/gu, "_"), all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  }
  for (const prop of bible.props) {
    bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "5-prop", target: prop.id, all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  }
  for (const costume of bible.costumes) {
    bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "6-costume", target: costume.id, all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  }
  for (const relation of bible.relations) {
    bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "7-relation", target: `${relation.from_character_id}->${relation.to_character_id}`, all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  }
  bible = await runSingleStage({ args: { slug: input.slug, concept: "", stage: "8-volume", volumeNo: 1, all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
  return runSingleStage({ args: { slug: input.slug, concept: "", stage: "9-cross-reference", all: false, dryRun: input.dryRun, reLint: false }, bible, concept: input.concept, styleRefNote: input.styleRefNote });
}

async function readBible(slug: string): Promise<BibleSnapshotV2> {
  return JSON.parse(await fs.readFile(bibleSnapshotPath(slug), "utf-8")) as BibleSnapshotV2;
}

async function backupStage(slug: string, bible: BibleSnapshotV2, stage: string, target: string): Promise<void> {
  const ts = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  const safeTarget = target.replace(/[^a-zA-Z0-9_.-]+/gu, "_");
  const backup = path.join(bibleDir(slug), `snapshot.bak-${ts}-stage${stage}-${safeTarget}.json`);
  await fs.writeFile(backup, JSON.stringify(bible, null, 2));
  console.log(`[L01c] backup -> ${backup}`);
}

function isDryRun(value: unknown): value is { dryRunPrompt: string } {
  return typeof value === "object" && value !== null && "dryRunPrompt" in value;
}

function printDryRun(dryRun: { dryRunPrompt: string }, bible: BibleSnapshotV2): BibleSnapshotV2 {
  console.log(dryRun.dryRunPrompt);
  return bible;
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} required`);
  return value;
}

void (async () => {
  await main();
})().catch((e: unknown) => {
  console.error("[L01c] FAILED:", e);
  process.exit(1);
});
