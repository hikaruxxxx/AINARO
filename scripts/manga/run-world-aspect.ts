/**
 * Run a single Stage 3 world aspect deepening pass.
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleDir, bibleSnapshotPath } from "./layers/_paths";
import { loadV2Concept } from "../../src/lib/manga/bible/v2-adapter";
import { lintBible } from "../../src/lib/manga/qa-v2/bible-lint";
import type { BibleSnapshotV2 } from "../../src/lib/manga/schemas-v2";
import {
  applyWorldPatch,
  runStage3World,
  type WorldAspect,
} from "../../src/lib/manga/bible/deep-extractor";

type Args = {
  slug: string;
  concept: string;
  aspect: WorldAspect;
  styleRefNoteFile?: string;
};

const WORLD_ASPECTS: WorldAspect[] = ["history", "power_system", "cosmology", "economy", "social", "daily_life", "language", "forbidden_lore", "foundation"];

const DEFAULT_STYLE_REF_NOTE = `参考: 現代ダンジョン系なろうコミカライズ。線細め、白多め、人物優先、縦書き吹き出し、背景は establishing 以外ミニマル。`;

function parseArgs(): Args {
  const out: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/u);
    const key = eq?.[1] ?? (arg.startsWith("--") ? arg.slice(2) : "");
    const val = eq?.[2] ?? (key && i + 1 < argv.length ? argv[++i] : undefined);
    if (!key || val === undefined) continue;
    if (key === "slug") out.slug = val;
    else if (key === "concept") out.concept = val;
    else if (key === "aspect") out.aspect = parseAspect(val);
    else if (key === "style-ref-note-file") out.styleRefNoteFile = val;
  }
  if (!out.slug || !out.concept || !out.aspect) throw new Error("--slug, --concept, and --aspect required");
  return out as Args;
}

function parseAspect(value: string): WorldAspect {
  if (!WORLD_ASPECTS.includes(value as WorldAspect)) {
    throw new Error(`unknown --aspect: ${value} (expected one of: ${WORLD_ASPECTS.join(", ")})`);
  }
  return value as WorldAspect;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const snapshotPath = bibleSnapshotPath(args.slug);
  const concept = await loadV2Concept(path.resolve(args.concept));
  let bible = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as BibleSnapshotV2;
  const styleReferenceNote = args.styleRefNoteFile
    ? await fs.readFile(path.resolve(args.styleRefNoteFile), "utf-8")
    : DEFAULT_STYLE_REF_NOTE;

  console.log(`[world-aspect] slug=${args.slug} aspect=${args.aspect}`);
  await backup(args.slug, bible, `pre-world-aspect-${args.aspect}`);

  const patch = await runStage3World({
    bible,
    v2Concept: concept,
    aspect: args.aspect,
    styleReferenceNote,
  });
  const outputChars = JSON.stringify(patch).length;
  bible = applyWorldPatch(bible, patch);

  await fs.writeFile(snapshotPath, JSON.stringify(bible, null, 2));
  await backup(args.slug, bible, `post-world-aspect-${args.aspect}`);

  const postLint = await lintBible({
    bible,
    skipLlm: true,
    executor: "run-world-aspect",
    stagePosition: "post",
  });
  await fs.writeFile(path.join(bibleDir(args.slug), "lint_report.json"), JSON.stringify(postLint, null, 2));

  console.log(`[world-aspect] summary aspect=${args.aspect} output_chars=${outputChars} fatal=${postLint.fatal_count} warn=${postLint.warn_count}`);
}

async function backup(slug: string, bible: BibleSnapshotV2, label: string): Promise<void> {
  const ts = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
  const backupPath = path.join(bibleDir(slug), `snapshot.bak-${ts}-${label}.json`);
  await fs.writeFile(backupPath, JSON.stringify(bible, null, 2));
  console.log(`[world-aspect] backup -> ${backupPath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
