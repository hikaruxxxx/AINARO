import fs from "node:fs/promises";
import path from "node:path";

import type { BibleSnapshotV2, Layer } from "../../../src/lib/manga/schemas-v2";
import {
  countFactsByLayer,
  type LlmRefineProgressRecord,
  type MigrationResult,
  type MigrationWithLlmRefineResult,
  runMigration,
  runMigrationWithLlmRefine,
} from "../../../src/lib/manga/bible/migrate-classify";
import { bibleDir, bibleSnapshotPath } from "../layers/_paths";

type Args = {
  slug?: string;
  outputDir?: string;
  withLlmRefine: boolean;
  rounds: number;
  maxParallel: number;
};

const OUTPUT_FILES = {
  preview: "v3-classified-preview.json",
  needsReview: "v3-classified-needs-review.json",
  llmRefine: "v3-classified-llm-refine.json",
  llmProgress: "v3-classified-llm-progress.jsonl",
  unresolvedReferences: "unresolved_references.json",
  roleEnumViolations: "role_enum_violations.json",
  factSourcePathIndex: "fact_source_path_index.json",
} as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) throw new Error("--slug <slug> is required");

  const snapshotPath = bibleSnapshotPath(args.slug);
  const outputDir = args.outputDir ?? bibleDir(args.slug);
  const v2 = JSON.parse(
    await fs.readFile(snapshotPath, "utf-8")
  ) as BibleSnapshotV2;

  await fs.mkdir(outputDir, { recursive: true });
  const progressPath = path.join(outputDir, OUTPUT_FILES.llmProgress);
  const result = args.withLlmRefine
    ? await runMigrationWithLlmRefine(v2, {
        rounds: args.rounds,
        maxParallel: args.maxParallel,
        cwd: process.cwd(),
        existingProgress: await readProgress(progressPath),
        onProgress: createLlmProgressLogger(v2, args.rounds),
        onRoundResult: async (record) => {
          await fs.appendFile(
            progressPath,
            `${JSON.stringify(record)}\n`,
            "utf-8"
          );
        },
      })
    : runMigration(v2);

  await writeJson(path.join(outputDir, OUTPUT_FILES.preview), result.v3);
  await writeJson(path.join(outputDir, OUTPUT_FILES.needsReview), result.needsReview);
  if (hasLlmRefine(result)) {
    await writeJson(path.join(outputDir, OUTPUT_FILES.llmRefine), result);
  }
  await writeJson(
    path.join(outputDir, OUTPUT_FILES.unresolvedReferences),
    result.unresolvedReferences
  );
  await writeJson(
    path.join(outputDir, OUTPUT_FILES.roleEnumViolations),
    result.roleEnumViolations
  );
  await writeJson(
    path.join(outputDir, OUTPUT_FILES.factSourcePathIndex),
    result.factSourcePathIndex
  );

  logSummary(args.slug, outputDir, result);
  if (hasLlmRefine(result)) {
    logLlmSummary(result);
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = { withLlmRefine: false, rounds: 3, maxParallel: 5 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--with-llm-refine") {
      args.withLlmRefine = true;
      continue;
    }
    if (arg === "--slug") {
      args.slug = argv[++i];
      continue;
    }
    if (arg.startsWith("--slug=")) {
      args.slug = arg.slice("--slug=".length);
      continue;
    }
    if (arg === "--output-dir") {
      args.outputDir = argv[++i];
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      args.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--rounds") {
      args.rounds = parsePositiveInt("--rounds", argv[++i]);
      continue;
    }
    if (arg.startsWith("--rounds=")) {
      args.rounds = parsePositiveInt("--rounds", arg.slice("--rounds=".length));
      continue;
    }
    if (arg === "--max-parallel") {
      args.maxParallel = parsePositiveInt("--max-parallel", argv[++i]);
      continue;
    }
    if (arg.startsWith("--max-parallel=")) {
      args.maxParallel = parsePositiveInt(
        "--max-parallel",
        arg.slice("--max-parallel=".length)
      );
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parsePositiveInt(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function readProgress(filePath: string): Promise<LlmRefineProgressRecord[]> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as LlmRefineProgressRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function logSummary(
  slug: string,
  outputDir: string,
  result: MigrationResult
): void {
  const layerBreakdown = countFactsByLayer(result.v3);
  const roleNames = result.roleEnumViolations
    .map((v) => `${v.character_name} → subrole=${v.recommended_subrole ?? ""}`)
    .join(", ");
  const unresolvedPreview = result.unresolvedReferences
    .slice(0, 3)
    .map((ref) => ref.matched_text)
    .join(", ");

  console.log(`[migrate] slug=${slug}`);
  console.log("[migrate] v2 → v3 classified");
  console.log(`[migrate]   characters: ${countEntities(result.v3, "character")}`);
  console.log(`[migrate]   facts generated: ${result.v3.facts.length}`);
  console.log(`[migrate]   layer breakdown: ${formatLayerBreakdown(layerBreakdown)}`);
  console.log(
    `[migrate] role enum violations: ${result.roleEnumViolations.length}${roleNames ? ` (${roleNames})` : ""}`
  );
  console.log(
    `[migrate] unresolved references: ${result.unresolvedReferences.length}${unresolvedPreview ? ` (${unresolvedPreview}, ...)` : ""}`
  );
  console.log(
    `[migrate] preview: ${path.join(outputDir, OUTPUT_FILES.preview)}`
  );
  console.log(
    `[migrate] needs review: ${path.join(outputDir, OUTPUT_FILES.needsReview)}`
  );
}

function countEntities(
  v3: ReturnType<typeof runMigration>["v3"],
  kind: string
): number {
  return v3.entities.filter((entity) => entity.kind === kind).length;
}

function createLlmProgressLogger(v2: BibleSnapshotV2, totalRounds: number) {
  const deterministic = runMigration(v2);
  const facts = deterministic.v3.facts;
  const indexByFact = new Map(
    facts.map((fact, index) => [fact.fact_id, { fact, index }])
  );
  const totalFacts = facts.length;

  return (event: {
    fact_id: string;
    round: number;
    status: "start" | "ok" | "failed";
    result?: { confidence: number };
  }): void => {
    if (event.status === "start") return;
    const entry = indexByFact.get(event.fact_id);
    const fact = entry?.fact;
    const position = entry ? entry.index + 1 : "?";
    const confidence =
      event.result?.confidence === undefined
        ? "n/a"
        : event.result.confidence.toFixed(2);
    console.log(
      `[migrate-llm] round ${event.round}/${totalRounds} fact ${position}/${totalFacts}: ${fact?.entity_id ?? "_world"} ${fact?.aspect ?? "unknown"} ${fact?.layer ?? "unknown"} → confidence=${confidence} (${event.status})`
    );
  };
}

function hasLlmRefine(
  result: MigrationResult | MigrationWithLlmRefineResult
): result is MigrationWithLlmRefineResult {
  return "llm_refine" in result;
}

function logLlmSummary(result: MigrationWithLlmRefineResult): void {
  const { summary, rounds } = result.llm_refine;
  const lowConfidence = result.v3.facts.filter(
    (fact) => (fact.evidence?.confidence ?? fact.confidence ?? 1) < 0.7
  ).length;

  console.log(`[migrate-llm] rounds: ${rounds}`);
  console.log(`[migrate-llm] total facts: ${summary.total_facts}`);
  console.log(
    `[migrate-llm] stable facts: ${summary.stable_facts} (${formatPct(summary.stable_facts, summary.total_facts)})`
  );
  console.log(
    `[migrate-llm] unstable facts: ${summary.unstable_facts} (${formatPct(summary.unstable_facts, summary.total_facts)})`
  );
  console.log(`[migrate-llm] avg confidence: ${summary.avg_confidence.toFixed(2)}`);
  console.log(
    `[migrate-llm] median confidence: ${summary.median_confidence.toFixed(2)}`
  );
  console.log(
    `[migrate-llm] confidence < 0.7: ${lowConfidence} facts (${formatPct(lowConfidence, summary.total_facts)})`
  );
}

function formatPct(value: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatLayerBreakdown(breakdown: Record<Layer, number>): string {
  return [
    "in_world_belief",
    "meta_truth",
    "system_specification",
    "character_arc_state",
    "revealed_at_volume",
  ]
    .map((layer) => `${layer}=${breakdown[layer as Layer]}`)
    .join(", ");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
