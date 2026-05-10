import fs from "node:fs/promises";
import path from "node:path";

import type { BibleSnapshotV2, Layer } from "../../../src/lib/manga/schemas-v2";
import {
  countFactsByLayer,
  runMigration,
} from "../../../src/lib/manga/bible/migrate-classify";
import { bibleDir, bibleSnapshotPath } from "../layers/_paths";

type Args = {
  slug?: string;
  outputDir?: string;
  withLlmRefine: boolean;
};

const OUTPUT_FILES = {
  preview: "v3-classified-preview.json",
  needsReview: "v3-classified-needs-review.json",
  unresolvedReferences: "unresolved_references.json",
  roleEnumViolations: "role_enum_violations.json",
  factSourcePathIndex: "fact_source_path_index.json",
} as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) throw new Error("--slug <slug> is required");
  if (args.withLlmRefine) {
    console.warn(
      "[migrate] WARN: --with-llm-refine は Phase 5-B で実装予定。deterministic 1 周回で続行します。"
    );
  }

  const snapshotPath = bibleSnapshotPath(args.slug);
  const outputDir = args.outputDir ?? bibleDir(args.slug);
  const v2 = JSON.parse(
    await fs.readFile(snapshotPath, "utf-8")
  ) as BibleSnapshotV2;
  const result = runMigration(v2);

  await fs.mkdir(outputDir, { recursive: true });
  await writeJson(path.join(outputDir, OUTPUT_FILES.preview), result.v3);
  await writeJson(path.join(outputDir, OUTPUT_FILES.needsReview), result.needsReview);
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
}

function parseArgs(argv: string[]): Args {
  const args: Args = { withLlmRefine: false };
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
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function logSummary(
  slug: string,
  outputDir: string,
  result: ReturnType<typeof runMigration>
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
