/**
 * L8.7 Name Lint
 *
 * storyboard.json / page_plan.json / scene_graph.json を static rule で監査
 * → name/lint_report.json + 標準出力にサマリ
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L08-7-name-lint.ts --slug a07-modern-dungeon --episode 1 --skip-llm
 *   --fail-on-fatal で fatal が 1 件でもあれば exit 2
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  episodeBriefV2Path,
  nameDir,
  pagePlanPath,
  sceneGraphPath,
  storyboardPath,
} from "./_paths";
import { lintName, type NameLintFinding } from "../../../src/lib/manga/qa-v2/name-lint";

type Args = {
  slug: string;
  episode: number;
  skipLlm: boolean;
  failOnFatal: boolean;
};

const SEVERITY_RANK: Record<NameLintFinding["severity"], number> = {
  fatal: 0,
  warn: 1,
  info: 2,
};

const BOOLEAN_FLAGS = new Set(["skip-llm", "fail-on-fatal"]);
const STATIC_RULES = new Set([
  "panel_content_duplicate",
  "placeholder_text",
  "shot_type_diversity_low",
  "camera_angle_static",
  "importance_flat",
  "importance_overload",
  "establishing_misplaced",
  "cliff_panel_too_many",
  "action_panel_too_few",
  "dialogue_overflow",
]);

// TODO(Sprint 2): scene_graph.render_constraints の panel-level 検証は
// page_plan/storyboard stats を lintName 側で集約してから追加する。
// Sprint 1 では schema validator の caller-provided stats 対応までに留める。

function parseArgs(): Args {
  const a: Partial<Args> = { skipLlm: false, failOnFatal: false };
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
      if (flag) {
        key = flag[1];
        if (BOOLEAN_FLAGS.has(key)) {
          val = "true";
        } else {
          const next = argv[i + 1];
          if (next && !next.startsWith("--")) {
            val = next;
            i++;
          } else {
            val = "true";
          }
        }
      }
    }

    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "skip-llm") a.skipLlm = val === "true";
    else if (key === "fail-on-fatal") a.failOnFatal = val === "true";
  }

  if (!a.slug) throw new Error("--slug required");
  if (!Number.isInteger(a.episode) || Number(a.episode) <= 0) throw new Error("--episode required");
  return a as Args;
}

function colorize(sev: string): string {
  if (sev === "fatal") return `\x1b[31m[fatal]\x1b[0m`;
  if (sev === "warn") return `\x1b[33m[warn ]\x1b[0m`;
  return `\x1b[36m[info ]\x1b[0m`;
}

function locationLabel(finding: NameLintFinding): string {
  const parts = [finding.scope];
  if (finding.scene_id) parts.push(`scene=${finding.scene_id}`);
  if (finding.page_no !== undefined) parts.push(`p=${finding.page_no}`);
  if (finding.panel_no !== undefined) parts.push(`panel=${finding.panel_no}`);
  return parts.join(" ");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as unknown;
}

async function main() {
  const args = parseArgs();

  const [storyboard, pagePlan, sceneGraph, brief, bible] = await Promise.all([
    readJson(storyboardPath(args.slug, args.episode)),
    readJson(pagePlanPath(args.slug, args.episode)),
    readJson(sceneGraphPath(args.slug, args.episode)),
    fs.readFile(episodeBriefV2Path(args.slug, args.episode), "utf-8"),
    readJson(bibleSnapshotPath(args.slug)),
  ]);

  console.log(`[L08.7] slug=${args.slug} episode=${args.episode}`);
  console.log(`[L08.7] running ${args.skipLlm ? "static-only" : "static + LLM judge"} ...`);

  const report = await lintName({
    storyboard,
    pagePlan,
    sceneGraph,
    brief,
    bible,
    slug: args.slug,
    episode: args.episode,
    skipLlm: args.skipLlm,
    cwd: process.cwd(),
  });

  const outDir = nameDir(args.slug, args.episode);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "lint_report.json");
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));

  const staticCount = report.findings.filter((finding) => STATIC_RULES.has(finding.rule)).length;
  const llmCount = report.findings.length - staticCount;
  const assessments = report.findings
    .filter((finding) => finding.rule === "overall_assessment")
    .map((finding) => finding.message.replace(/^LLM scene assessment: /, ""));

  console.log(`[L08.7] fatal=${report.fatal_count} warn=${report.warn_count} info=${report.info_count}`);
  console.log(`[L08.7] summary: static=${staticCount} llm=${llmCount} overall_assessment=${assessments.length > 0 ? assessments.join(" | ") : "none"}`);
  console.log("");
  console.log("=== findings (max 20) ===");
  const sorted = [...report.findings].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return (a.page_no ?? 9999) - (b.page_no ?? 9999) || (a.panel_no ?? 9999) - (b.panel_no ?? 9999);
  });
  for (const finding of sorted.slice(0, 20)) {
    console.log(`${colorize(finding.severity)} ${locationLabel(finding)} :: ${finding.rule}`);
    console.log(`        ${finding.message}`);
    if (finding.hint) console.log(`        hint: ${finding.hint}`);
  }
  if (sorted.length > 20) console.log(`        ... ${sorted.length - 20} more`);
  console.log("");
  console.log(`[L08.7] DONE: ${outPath}`);

  if (args.failOnFatal && report.fatal_count > 0) {
    console.error("[L08.7] FAIL: fatal findings present");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("[L08.7] FAILED:", e);
  process.exit(1);
});
