/**
 * Snapshot-field deepen runner.
 *
 * Existing bible snapshots may not have the original V2 concept JSON. This CLI
 * reconstructs the minimum V2Concept from snapshot.json, runs one targeted
 * deep-extractor stage, applies the patch, and writes the snapshot back.
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bibleDir, bibleSnapshotPath } from "../layers/_paths";
import {
  applyCharacterPatch,
  applyLocationPatch,
  applyMotifPatch,
  runStage1bCharacterPsychology,
  runStage1cCharacterDailyAndRelations,
  runStage2Location,
  runStage4Motif,
  type CharacterDeepPatch,
  type LocationDeepPatch,
  type MotifDeepPatch,
} from "../../../src/lib/manga/bible/deep-extractor";
import type { V2Concept } from "../../../src/lib/manga/bible/v2-adapter";
import { lintBible } from "../../../src/lib/manga/qa-v2/bible-lint";
import type { BibleLintReport } from "../../../src/lib/manga/qa-v2/bible-lint";
import type { BibleSnapshotV2, VisualMotifV2 } from "../../../src/lib/manga/schemas-v2";
import { isBibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";

type Scope = "character" | "location" | "motif";
type CharacterSubStage = "psychology" | "daily" | "all";

type Args = {
  slug: string;
  scope: Scope;
  target: string;
  subStage: CharacterSubStage;
  dryRun: boolean;
};

type DryRunResult = { dryRunPrompt: string };
type DeepPatch = CharacterDeepPatch | LocationDeepPatch | MotifDeepPatch;

const DEFAULT_STYLE_REF_NOTE = `参考: 現代ダンジョン系なろうコミカライズ。線細め、白多め、人物優先、縦書き吹き出し、背景は establishing 以外ミニマル。`;
const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

export function buildConceptFromSnapshot(bible: BibleSnapshotV2): V2Concept {
  const protagonist = bible.characters.find((character) => character.role === "protagonist") ?? bible.characters[0];
  const supporting = bible.characters.filter((character) => character !== protagonist);

  return {
    id: bible.meta.slug,
    title: bible.meta.title,
    core_hook: bible.meta.core_hook,
    synopsis: bible.volume_synopsis?.summary ?? "",
    protagonist: {
      name: protagonist?.name ?? "",
      appearance: protagonist?.appearance_notes ?? "",
      personality: protagonist?.psychology_deep ?? "",
      background: protagonist?.backstory ?? "",
      motivation: protagonist?.psychology_deep ?? "",
    },
    supporting_chars: supporting.map((character) => ({
      name: character.name,
      role: character.role,
      summary: character.backstory?.slice(0, 200) ?? "",
    })),
    world: {
      premise: bible.world.premise,
      rules: bible.world.rules ?? [],
      system: bible.world.system ?? "",
      timeline: bible.world.timeline ?? "",
      factions: bible.world.factions ?? [],
      ...(bible.world.lexicon ? { lexicon: bible.world.lexicon } : {}),
    },
    ...(bible.narration_style_guide ? { narration_style_guide: bible.narration_style_guide } : {}),
    ...(bible.nav_full_spec ? { nav_full_spec: bible.nav_full_spec } : {}),
  };
}

export function parseArgs(argv = process.argv.slice(2)): Args {
  const out: Partial<Args> = { dryRun: false, subStage: "all" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    const eq = arg.match(/^--([^=]+)=(.*)$/u);
    const key = eq?.[1] ?? (arg.startsWith("--") ? arg.slice(2) : "");
    const val = eq?.[2] ?? (key && i + 1 < argv.length ? argv[++i] : undefined);
    if (!key || val === undefined) continue;

    if (key === "slug") out.slug = val;
    else if (key === "scope") out.scope = parseScope(val);
    else if (key === "target") out.target = val;
    else if (key === "sub-stage") out.subStage = parseSubStage(val);
  }

  if (!out.slug) throw new Error("--slug required");
  if (!out.scope) throw new Error("--scope required");
  if (!out.target) throw new Error("--target required");
  if (out.scope !== "character" && out.subStage !== "all") {
    throw new Error("--sub-stage is only valid with --scope character");
  }
  return out as Args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const snapshotPath = bibleSnapshotPath(args.slug);
  const bible = await readBibleSnapshot(snapshotPath);
  const concept = buildConceptFromSnapshot(bible);
  const preLint = await runLint(bible, "pre");

  validateTarget(bible, args);
  console.log(
    `[deepen] slug=${args.slug} scope=${args.scope} target=${args.target} sub-stage=${args.subStage} dry-run=${args.dryRun}`,
  );
  console.log(`[deepen] lint before: fatal=${preLint.fatal_count} warn=${preLint.warn_count}`);
  console.log(`[deepen] calling Codex CLI (timeout ${Math.round(CODEX_TIMEOUT_MS / 60000)}min)...`);

  const stageResult = await runTargetStages({ bible, concept, args });
  if (isDryRun(stageResult)) {
    console.warn("[deepen] warning: DryRunResult returned; snapshot was not written");
    console.log(stageResult.dryRunPrompt);
    return;
  }

  const backupPath = await backupSnapshot(snapshotPath);
  console.log(`[deepen] backup: ${backupPath}`);
  console.log(`[deepen] patch received: fields=${stageResult.fields.join(",") || "(none)"}`);

  await fs.writeFile(snapshotPath, `${JSON.stringify(stageResult.bible, null, 2)}\n`);
  console.log("[deepen] applied patch, snapshot updated");

  const postLint = await runLint(stageResult.bible, "post");
  await fs.writeFile(path.join(bibleDir(args.slug), "lint_report.json"), `${JSON.stringify(postLint, null, 2)}\n`);
  console.log(
    `[deepen] lint after: fatal=${preLint.fatal_count} -> ${postLint.fatal_count} (${formatDelta(postLint.fatal_count - preLint.fatal_count)}), warn=${preLint.warn_count} -> ${postLint.warn_count} (${formatDelta(postLint.warn_count - preLint.warn_count)})`,
  );
  if (postLint.fatal_count > preLint.fatal_count) {
    console.warn("[deepen] warning: fatal lint count increased after deepen; rollback is manual via the backup above");
  }
  console.log("[deepen] DONE");
}

async function runTargetStages(input: {
  bible: BibleSnapshotV2;
  concept: V2Concept;
  args: Args;
}): Promise<{ bible: BibleSnapshotV2; fields: string[] } | DryRunResult> {
  let bible = input.bible;
  const fields: string[] = [];
  const common = {
    bible,
    styleReferenceNote: DEFAULT_STYLE_REF_NOTE,
    timeoutMs: CODEX_TIMEOUT_MS,
    dryRun: input.args.dryRun,
  };

  if (input.args.scope === "character") {
    if (input.args.subStage === "psychology" || input.args.subStage === "all") {
      const patch = await runStage1bCharacterPsychology({
        ...common,
        v2Concept: input.concept,
        characterId: input.args.target,
      });
      if (isDryRun(patch)) return patch;
      bible = applyCharacterPatch(bible, patch);
      fields.push(...patchFields(patch.patch));
    }

    if (input.args.subStage === "daily" || input.args.subStage === "all") {
      const patch = await runStage1cCharacterDailyAndRelations({
        ...common,
        bible,
        v2Concept: input.concept,
        characterId: input.args.target,
      });
      if (isDryRun(patch)) return patch;
      bible = applyCharacterPatch(bible, patch);
      fields.push(...patchFields(patch.patch));
    }
    return { bible, fields };
  }

  if (input.args.scope === "location") {
    const patch = await runStage2Location({ ...common, locationId: input.args.target });
    if (isDryRun(patch)) return patch;
    bible = applyLocationPatch(bible, patch);
    return { bible, fields: patchFields(patch.patch) };
  }

  const motifId = resolveMotifTarget(bible, input.args.target);
  const patch = await runStage4Motif({ ...common, motifId });
  if (isDryRun(patch)) return patch;
  bible = applyMotifPatch(bible, patch);
  return { bible, fields: patchFields(patch.patch) };
}

async function readBibleSnapshot(snapshotPath: string): Promise<BibleSnapshotV2> {
  let raw: string;
  try {
    raw = await fs.readFile(snapshotPath, "utf-8");
  } catch (error) {
    throw new Error(`snapshot.json not found: ${snapshotPath} (${errorMessage(error)})`);
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!isBibleSnapshotV2(parsed)) {
    throw new Error(`not a BibleSnapshotV2: ${snapshotPath}`);
  }
  return parsed;
}

async function backupSnapshot(snapshotPath: string): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = snapshotPath.replace(/\.json$/u, `.bak-deepen-${ts}.json`);
  await fs.copyFile(snapshotPath, backupPath);
  return backupPath;
}

async function runLint(bible: BibleSnapshotV2, stagePosition: "pre" | "post"): Promise<BibleLintReport> {
  return lintBible({
    bible,
    useBibleV3: true,
    skipLlm: true,
    executor: "deepen-snapshot-field",
    stagePosition,
  });
}

function validateTarget(bible: BibleSnapshotV2, args: Args): void {
  if (args.scope === "character" && !bible.characters.some((character) => character.id === args.target)) {
    throw new Error(`target character not found: ${args.target}`);
  }
  if (args.scope === "location" && !bible.locations.some((location) => location.id === args.target)) {
    throw new Error(`target location not found: ${args.target}`);
  }
  if (args.scope === "motif") {
    resolveMotifTarget(bible, args.target);
  }
}

function resolveMotifTarget(bible: BibleSnapshotV2, target: string): string {
  const motif = bible.visual_motifs.find((item) => motifId(item) === target || motifExtraId(item) === target);
  if (!motif) throw new Error(`target motif not found: ${target}`);
  return motifId(motif);
}

function motifExtraId(motif: VisualMotifV2): string | undefined {
  const value = (motif as VisualMotifV2 & { id?: unknown }).id;
  return typeof value === "string" ? value : undefined;
}

function motifId(motif: VisualMotifV2): string {
  return motif.name.trim().toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠]+/gu, "_");
}

function patchFields(patch: DeepPatch["patch"]): string[] {
  return Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined);
}

function parseScope(value: string): Scope {
  if (value === "character" || value === "location" || value === "motif") return value;
  throw new Error(`unknown --scope: ${value}`);
}

function parseSubStage(value: string): CharacterSubStage {
  if (value === "psychology" || value === "daily" || value === "all") return value;
  throw new Error(`unknown --sub-stage: ${value}`);
}

function isDryRun(value: unknown): value is DryRunResult {
  return typeof value === "object" && value !== null && "dryRunPrompt" in value;
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const isCliEntry = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isCliEntry) {
  void main().catch((error: unknown) => {
    console.error("[deepen] FAILED:", error);
    process.exit(1);
  });
}
