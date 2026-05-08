#!/usr/bin/env tsx
/**
 * L11 vision-based background_treatment compliance audit 互換 wrapper。
 *
 * 正式実装は src/lib/manga/qa-v2/audit-vision.ts に移動した。
 * 既存の prepare/merge 運用と出力ディレクトリ (_audit_bg) は維持し、この utility は
 * 旧呼び出しを壊さないための薄い CLI として残す。
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import {
  mergeLegacyBgVisionAudit,
  prepareLegacyBgVisionAudit,
} from "../../../src/lib/manga/qa-v2/audit-vision";
import type { PagePlanV2 } from "../../../src/lib/manga/schemas-v2";

type Args = {
  mode: "prepare" | "merge";
  slug: string;
  episode: number;
  batchSize: number;
};

function parseArgs(argv: string[]): Args {
  let mode: Args["mode"] = "prepare";
  let slug: string | undefined;
  let episode: number | undefined;
  let batchSize = 8;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") mode = argv[++i] as Args["mode"];
    else if (a === "--slug") slug = argv[++i];
    else if (a === "--episode") episode = Number(argv[++i]);
    else if (a === "--batch-size") batchSize = Number(argv[++i]);
  }

  if (!slug || !episode) {
    console.error("--slug and --episode required");
    process.exit(1);
  }
  return { mode, slug, episode, batchSize };
}

function workDir(slug: string, episode: number): string {
  return path.resolve(`data/manga/works/${slug}/episodes/ep${String(episode).padStart(2, "0")}`);
}

function pagePlanPath(slug: string, episode: number): string {
  return path.join(workDir(slug, episode), "page_plan.json");
}

function rendersDir(slug: string, episode: number): string {
  return path.join(workDir(slug, episode), "renders");
}

function auditBgDir(slug: string, episode: number): string {
  return path.join(workDir(slug, episode), "_audit_bg");
}

async function prepare(args: Args): Promise<void> {
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const result = await prepareLegacyBgVisionAudit({
    pagePlan,
    rendersDir: rendersDir(args.slug, args.episode),
    auditDir: auditBgDir(args.slug, args.episode),
    batchSize: args.batchSize,
  });

  console.log(`[bg-vision/prepare] panels=${result.panels} batches=${result.batches}`);
  console.log(`[bg-vision/prepare] tasks dir: ${result.tasksDir}`);
  console.log(`[bg-vision/prepare] dispatch each batch via Agent -> ${result.responsesDir}`);
}

async function merge(args: Args): Promise<void> {
  const result = await mergeLegacyBgVisionAudit({
    auditDir: auditBgDir(args.slug, args.episode),
  });
  const passed = result.checks.filter((c) => c.passed).length;
  console.log(`[bg-vision/merge] ${result.checks.length} checks (${passed} passed, ${result.checks.length - passed} failed)`);
  console.log(`[bg-vision/merge] wrote ${result.outPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "prepare") await prepare(args);
  else if (args.mode === "merge") await merge(args);
  else throw new Error(`unknown mode: ${args.mode}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
