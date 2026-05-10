/**
 * L11 Audit
 *
 * renders/p{NN}.png を検査して audit.json を生成
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { storyboardPath, pagePlanPath, rendersDir, auditPath, resolvedRefsPath, episodeDir } from "./_paths";
import { auditEpisode } from "../../../src/lib/manga/qa-v2/audit";
import {
  countMajorBgViolations,
  runVisionAudit,
  visionAuditToChecks,
} from "../../../src/lib/manga/qa-v2/audit-vision";
import {
  loadBlocklist,
  loadFalsePositives,
  scanStoryboard,
  scanText,
} from "../../../src/lib/manga/compliance/scanner";
import type { ComplianceFinding } from "../../../src/lib/manga/compliance/types";
import type { EpisodeStoryboardV2, PagePlanV2, ResolvedRefs, AuditReport } from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode: number;
  visionAudit: boolean;
  visionAuditDryRun: boolean;
  visionMajorViolationThreshold?: number;
  skipCompliance: boolean;
  allowComplianceWarn: boolean;
};

type ComplianceAuditSource = "storyboard" | "page_plan" | "resolved_refs" | "scene_graph";

function parseArgs(): Args {
  const a: Partial<Args> = {
    visionAudit: false,
    visionAuditDryRun: false,
    skipCompliance: false,
    allowComplianceWarn: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (flag) {
        key = flag[1];
        if (
          key === "vision-audit" ||
          key === "vision-audit-dry-run" ||
          key === "skip-compliance" ||
          key === "allow-compliance-warn"
        ) val = "true";
        else if (i + 1 < argv.length) val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "vision-audit") a.visionAudit = val !== "false";
    else if (key === "vision-audit-dry-run") {
      a.visionAudit = true;
      a.visionAuditDryRun = val !== "false";
    } else if (key === "vision-major-violation-threshold") {
      a.visionMajorViolationThreshold = Number(val);
    } else if (key === "skip-compliance") {
      a.skipCompliance = val !== "false";
    } else if (key === "allow-compliance-warn") {
      a.allowComplianceWarn = val !== "false";
    }
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

function recomputePanelSummary(report: AuditReport): void {
  const failed = new Set(report.failed_panel_ids);
  for (const c of report.checks) {
    if (!c.passed && c.panel_id.startsWith("p_")) failed.add(c.panel_id);
  }
  report.failed_panel_ids = [...failed];
  report.panels_failed = report.failed_panel_ids.length;
  report.panels_passed = Math.max(0, report.panels_total - report.panels_failed);
}

async function main() {
  const args = parseArgs();
  let visionGateFailed = false;
  let complianceFatalCount = 0;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  // resolved_refs.json があれば bg_treatment_compliance も実施 (任意、無くても従前挙動)
  let resolvedRefs: ResolvedRefs | undefined;
  try {
    resolvedRefs = JSON.parse(
      await fs.readFile(resolvedRefsPath(args.slug, args.episode), "utf-8")
    ) as ResolvedRefs;
  } catch {
    /* no resolved_refs → skip bg compliance check */
  }

  const report = await auditEpisode({
    rendersDir: rendersDir(args.slug, args.episode), storyboard, pagePlan, resolvedRefs,
  });

  if (args.visionAudit) {
    const visionAuditDir = path.join(episodeDir(args.slug, args.episode), "_audit_vision");
    const vision = await runVisionAudit({
      pagePlan,
      rendersDir: rendersDir(args.slug, args.episode),
      auditDir: visionAuditDir,
      dryRun: args.visionAuditDryRun,
    });
    report.vision = vision;
    const visionChecks = visionAuditToChecks(vision);
    report.checks.push(...visionChecks);

    const majorViolations = countMajorBgViolations(vision);
    if (
      args.visionMajorViolationThreshold !== undefined &&
      majorViolations >= args.visionMajorViolationThreshold
    ) {
      report.checks.push({
        panel_id: "vision_gate",
        check_kind: "regulation_violation",
        passed: false,
        score: majorViolations,
        threshold: args.visionMajorViolationThreshold,
        detail: `vision major_violation=${majorViolations} >= threshold=${args.visionMajorViolationThreshold}`,
      });
      visionGateFailed = true;
    }
    const taskCount = args.visionAuditDryRun
      ? (JSON.parse(
          await fs.readFile(path.join(visionAuditDir, "audit-vision.tasks.json"), "utf-8")
        ) as { tasks: unknown[] }).tasks.length
      : vision.bg_treatment_compliance.length;
    console.log(
      `[L11] vision audit: panels=${taskCount}, major_violations=${majorViolations}, dry_run=${args.visionAuditDryRun}`
    );
  }

  if (!args.skipCompliance) {
    try {
      const blocklist = await loadBlocklist();
      const fp = await loadFalsePositives();
      const allFindings: Array<ComplianceFinding & { source: ComplianceAuditSource }> = [];

      const storyboardFindings = scanStoryboard(storyboard, blocklist, fp);
      allFindings.push(...storyboardFindings.map((f) => ({ ...f, source: "storyboard" as const })));

      const pagePlanText = JSON.stringify(pagePlan);
      const pagePlanFindings = scanText(pagePlanText, blocklist, fp, { fieldPath: "page_plan" });
      allFindings.push(...pagePlanFindings.map((f) => ({ ...f, source: "page_plan" as const })));

      if (resolvedRefs) {
        const resolvedRefsText = JSON.stringify(resolvedRefs);
        const resolvedRefsFindings = scanText(resolvedRefsText, blocklist, fp, { fieldPath: "resolved_refs" });
        allFindings.push(...resolvedRefsFindings.map((f) => ({ ...f, source: "resolved_refs" as const })));
      }

      const fatal = allFindings.filter((f) => f.severity === "fatal");
      const warn = allFindings.filter((f) => f.severity === "warn");
      complianceFatalCount = fatal.length;

      report.compliance_report = {
        schema_version: 1,
        fatal_count: fatal.length,
        warn_count: warn.length,
        findings: allFindings.map((f) => ({
          severity: f.severity,
          category: f.category,
          matched_term: f.matched_term,
          source: f.source,
          field_path: f.field_path,
          line: f.line,
          text_excerpt: f.text_excerpt,
          suggestion: f.suggestion,
        })),
      };

      console.log(`[L11] compliance: fatal=${fatal.length} warn=${warn.length}`);
      if (fatal.length > 0) {
        console.log("[L11] compliance fatal sample:");
        for (const f of fatal.slice(0, 5)) {
          console.log(`  [${f.category}] '${f.matched_term}' @ ${f.source}.${f.field_path}`);
          if (f.suggestion?.fictional_name_hint) {
            console.log(`    hint: ${f.suggestion.fictional_name_hint}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[L11] compliance scan failed: ${(e as Error).message}`);
    }
  } else {
    console.log("[L11] compliance: skipped");
  }

  const complianceGateFailed = complianceFatalCount > 0;
  recomputePanelSummary(report);

  await fs.writeFile(auditPath(args.slug, args.episode), JSON.stringify(report, null, 2));
  console.log(`[L11] DONE: ${auditPath(args.slug, args.episode)}`);
  console.log(`[L11] panels: ${report.panels_passed}/${report.panels_total} passed, ${report.panels_failed} failed`);
  if (report.failed_panel_ids.length > 0) {
    console.log(`[L11] failed: ${report.failed_panel_ids.join(", ")}`);
    console.log(`[L11] → run L12 for repair`);
  }
  if (visionGateFailed) {
    console.error("[L11] vision gate failed");
    process.exitCode = 2;
  }
  if (complianceGateFailed && !args.allowComplianceWarn) {
    console.error(`[L11] compliance gate failed: ${complianceFatalCount} fatal findings — fix before render/publish`);
    process.exitCode = 2;
  }
}

main().catch((e) => { console.error("[L11] FAILED:", e); process.exit(1); });
