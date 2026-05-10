/**
 * L8.9 Lint -> Enrich Loop
 *
 * name-lint findings を enrich prompt に戻し、対象 scene だけ再 enrich する改善 loop。
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  episodeBriefV2Path,
  episodeDir,
  nameDir,
  pagePlanPath,
  sceneGraphPath,
  storyboardPath,
} from "./_paths";
import { enrichStoryboardWithLLM, type PanelLintFeedback } from "../../../src/lib/manga/scene-graph/storyboard-from-scenes";
import { isSceneGraphV1, type SceneGraphV1 } from "../../../src/lib/manga/scene-graph/schema";
import type { BibleSnapshotV2, EpisodeStoryboardV2, PagePlanV2 } from "../../../src/lib/manga/schemas-v2";
import { lintName, type NameLintReport } from "../../../src/lib/manga/qa-v2/name-lint";
import {
  aggregateLintFeedbackByScene,
  compareReports,
  filterFeedbackByPanelNos,
  selectScenesForReEnrich,
} from "../../../src/lib/manga/qa-v2/lint-loop";

type Args = {
  slug: string;
  episode: number;
  maxIterations: number;
  targetFindings: number;
  improvementThreshold: number;
  targetPanels: number[];
};

type LoopStepSummary = {
  iteration: number;
  before_findings: number;
  after_findings: number;
  improvement_rate: number;
  regressed: boolean;
  scene_ids: string[];
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    maxIterations: 3,
    targetFindings: 50,
    improvementThreshold: 0.05,
    targetPanels: [],
  };
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
      if (!flag) continue;
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        key = flag[1];
        val = next;
        i++;
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "max-iterations") a.maxIterations = Number(val);
    else if (key === "target-findings") a.targetFindings = Number(val);
    else if (key === "improvement-threshold") a.improvementThreshold = Number(val);
    else if (key === "target-panels") {
      a.targetPanels = val
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isInteger(x) && x > 0);
    }
  }
  if (!a.slug) throw new Error("--slug required");
  if (!Number.isInteger(a.episode) || Number(a.episode) <= 0) throw new Error("--episode required");
  if (!Number.isInteger(a.maxIterations) || Number(a.maxIterations) < 1) throw new Error("--max-iterations must be >= 1");
  if (!Number.isInteger(a.targetFindings) || Number(a.targetFindings) < 0) throw new Error("--target-findings must be >= 0");
  if (typeof a.improvementThreshold !== "number" || !Number.isFinite(a.improvementThreshold) || a.improvementThreshold < 0) {
    throw new Error("--improvement-threshold must be >= 0");
  }
  return a as Args;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
}

async function readJsonOpt<T>(filePath: string): Promise<T | null> {
  try {
    return await readJson<T>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function lintReportPath(slug: string, episode: number): string {
  return path.join(nameDir(slug, episode), "lint_report.json");
}

function loopDir(slug: string, episode: number): string {
  return path.join(episodeDir(slug, episode), "_lint_loop");
}

async function runNameLint(args: {
  storyboard: EpisodeStoryboardV2;
  pagePlan: PagePlanV2;
  sceneGraph: SceneGraphV1;
  brief: string;
  bible: BibleSnapshotV2;
  slug: string;
  episode: number;
}): Promise<NameLintReport> {
  const report = await lintName({
    storyboard: args.storyboard,
    pagePlan: args.pagePlan,
    sceneGraph: args.sceneGraph,
    brief: args.brief,
    bible: args.bible,
    slug: args.slug,
    episode: args.episode,
    cwd: process.cwd(),
  });
  await writeJson(lintReportPath(args.slug, args.episode), report);
  return report;
}

function flattenFeedback(feedbackByScene: Map<string, PanelLintFeedback[]>): PanelLintFeedback[] {
  return Array.from(feedbackByScene.values()).flat();
}

function assessmentSummary(report: NameLintReport): string[] {
  return report.findings
    .filter((finding) => finding.rule === "overall_assessment")
    .map((finding) => `${finding.scene_id ?? "episode"}:${finding.message.replace(/^LLM scene assessment: /, "")}`);
}

async function main() {
  const args = parseArgs();
  const sbPath = storyboardPath(args.slug, args.episode);
  const lpPath = lintReportPath(args.slug, args.episode);
  const ldir = loopDir(args.slug, args.episode);

  const [pagePlan, sceneGraphRaw, brief, bible] = await Promise.all([
    readJson<PagePlanV2>(pagePlanPath(args.slug, args.episode)),
    readJson<unknown>(sceneGraphPath(args.slug, args.episode)),
    fs.readFile(episodeBriefV2Path(args.slug, args.episode), "utf-8"),
    readJson<BibleSnapshotV2>(bibleSnapshotPath(args.slug)),
  ]);
  if (!isSceneGraphV1(sceneGraphRaw)) throw new Error("scene_graph.json is not a valid SceneGraphV1");
  const sceneGraph = sceneGraphRaw as SceneGraphV1;

  let storyboard = await readJson<EpisodeStoryboardV2>(sbPath);
  let report = await readJsonOpt<NameLintReport>(lpPath);
  if (!report) {
    console.log("[L08.9] initial lint_report.json missing; running name-lint first...");
    report = await runNameLint({ storyboard, pagePlan, sceneGraph, brief, bible, slug: args.slug, episode: args.episode });
  }

  const summaries: LoopStepSummary[] = [];
  console.log(
    `[L08.9] start: findings=${report.findings.length} target=${args.targetFindings} max_iterations=${args.maxIterations}` +
      (args.targetPanels.length > 0 ? ` target_panels=${args.targetPanels.join(",")}` : "")
  );

  for (let iteration = 1; iteration <= args.maxIterations; iteration++) {
    if (args.targetPanels.length === 0 && report.findings.length <= args.targetFindings) {
      console.log(`[L08.9] stop: target reached (${report.findings.length} <= ${args.targetFindings})`);
      break;
    }

    const allFeedbackByScene = aggregateLintFeedbackByScene(report.findings, sceneGraph);
    const feedbackByScene = args.targetPanels.length > 0
      ? filterFeedbackByPanelNos(allFeedbackByScene, args.targetPanels)
      : allFeedbackByScene;
    const sceneIds = selectScenesForReEnrich(feedbackByScene, {
      targetPanelNos: args.targetPanels.length > 0 ? args.targetPanels : undefined,
    });
    if (sceneIds.length === 0) {
      console.log(
        args.targetPanels.length > 0
          ? `[L08.9] stop: no actionable findings for target panels ${args.targetPanels.join(",")}`
          : "[L08.9] stop: no actionable fatal/warn panel/page findings"
      );
      break;
    }

    const beforeStoryboard = storyboard;
    const beforeReport = report;
    const beforePath = path.join(ldir, `iteration_${iteration}.before.json`);
    const afterPath = path.join(ldir, `iteration_${iteration}.after.json`);
    await writeJson(beforePath, beforeStoryboard);

    console.log(`[L08.9] iteration ${iteration}/${args.maxIterations}: re-enrich scenes=${sceneIds.join(", ")}`);
    storyboard = await enrichStoryboardWithLLM(storyboard, sceneGraph, {
      lintFeedback: flattenFeedback(feedbackByScene),
      targetSceneIds: sceneIds,
      cwd: process.cwd(),
    });
    await writeJson(afterPath, storyboard);
    await writeJson(sbPath, storyboard);

    report = await runNameLint({ storyboard, pagePlan, sceneGraph, brief, bible, slug: args.slug, episode: args.episode });
    const comparison = compareReports(beforeReport, report);
    summaries.push({
      iteration,
      before_findings: beforeReport.findings.length,
      after_findings: report.findings.length,
      improvement_rate: comparison.improvementRate,
      regressed: comparison.regressed,
      scene_ids: sceneIds,
    });

    console.log(
      `[L08.9] iteration ${iteration}/${args.maxIterations}: ${beforeReport.findings.length} -> ${report.findings.length} findings (improvement ${(comparison.improvementRate * 100).toFixed(1)}%)`
    );

    if (comparison.regressed) {
      storyboard = beforeStoryboard;
      report = beforeReport;
      await writeJson(sbPath, storyboard);
      await writeJson(lpPath, report);
      console.log("[L08.9] regression detected; reverted storyboard.json and lint_report.json to previous iteration");
      break;
    }

    if (args.targetPanels.length === 0 && report.findings.length <= args.targetFindings) {
      console.log(`[L08.9] stop: target reached (${report.findings.length} <= ${args.targetFindings})`);
      break;
    }

    if (comparison.improvementRate < args.improvementThreshold) {
      console.log(
        `[L08.9] stop: improvement below threshold (${(comparison.improvementRate * 100).toFixed(1)}% < ${(args.improvementThreshold * 100).toFixed(1)}%)`
      );
      break;
    }
  }

  await writeJson(path.join(ldir, "summary.json"), {
    slug: args.slug,
    episode: args.episode,
    generated_at: new Date().toISOString(),
    final_findings: report.findings.length,
    iterations: summaries,
    overall_assessment: assessmentSummary(report),
  });

  console.log("[L08.9] summary:");
  for (const summary of summaries) {
    console.log(
      `  iteration ${summary.iteration}: ${summary.before_findings} -> ${summary.after_findings} (${(summary.improvement_rate * 100).toFixed(1)}%) scenes=${summary.scene_ids.join(",")}`
    );
  }
  console.log(`[L08.9] final findings=${report.findings.length}`);
  const assessments = assessmentSummary(report);
  if (assessments.length > 0) console.log(`[L08.9] overall_assessment: ${assessments.join(" | ")}`);
}

main().catch((e) => {
  console.error("[L08.9] FAILED:", e);
  process.exit(1);
});
