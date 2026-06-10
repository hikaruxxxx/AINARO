/**
 * L11 Audit
 *
 * renders/p{NN}.png を検査して audit.json を生成
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { storyboardPath, pagePlanPath, rendersDir, auditPath, resolvedRefsPath, episodeDir, sceneGraphPath } from "./_paths";
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
import type { SceneGraphV1 } from "../../../src/lib/manga/scene-graph/schema";
import type { EpisodeStoryboardV2, PagePlanPage, PagePlanV2, ResolvedRefs, AuditReport, StoryboardPageV2 } from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode: number;
  visionAudit: boolean;
  visionAuditDryRun: boolean;
  visionMajorViolationThreshold?: number;
  skipCompliance: boolean;
  allowComplianceWarn: boolean;
  triage: boolean;
};

type ComplianceAuditSource = "storyboard" | "page_plan" | "resolved_refs" | "scene_graph";
type TriagePage = PagePlanPage | StoryboardPageV2;

function parseArgs(): Args {
  const a: Partial<Args> = {
    visionAudit: false,
    visionAuditDryRun: false,
    skipCompliance: false,
    allowComplianceWarn: false,
    triage: false,
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
          key === "allow-compliance-warn" ||
          key === "triage"
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
    } else if (key === "triage") {
      a.triage = val !== "false";
    }
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

function readCharacterId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function addCharacterId(ids: Set<string>, value: unknown): void {
  const id = readCharacterId(value);
  if (id) ids.add(id);
}

function storyboardPageCharacterIds(page: StoryboardPageV2 | undefined): Set<string> {
  const ids = new Set<string>();
  if (!page) return ids;

  for (const panel of page.panels) {
    for (const character of panel.entities.characters) addCharacterId(ids, character.character_id);
    for (const dialogue of panel.dialogue) addCharacterId(ids, dialogue.character_id);
    for (const monologue of panel.monologue) addCharacterId(ids, monologue.character_id);
    for (const prop of panel.entities.props) addCharacterId(ids, prop.held_by_character_id);
    if (panel.entities.focus_entity_id.startsWith("char_")) addCharacterId(ids, panel.entities.focus_entity_id);
  }

  return ids;
}

function sceneCharacterIds(scene: SceneGraphV1["scenes"][number]): Set<string> {
  const ids = new Set<string>();
  for (const character of scene.cast) addCharacterId(ids, character.character_id);
  for (const wardrobe of scene.wardrobe_state ?? []) addCharacterId(ids, wardrobe.character_id);
  for (const prop of scene.props_in_play ?? []) addCharacterId(ids, prop.held_by);
  for (const characterId of Object.keys(scene.attribute_tags_focus ?? {})) addCharacterId(ids, characterId);
  for (const characterId of Object.keys(scene.voice_bible_active_traits ?? {})) addCharacterId(ids, characterId);
  return ids;
}

function firstStoryboardCharacterPages(storyboard: EpisodeStoryboardV2): Map<string, number> {
  const firstPages = new Map<string, number>();
  for (const page of [...storyboard.pages].sort((a, b) => a.page_no - b.page_no)) {
    for (const characterId of storyboardPageCharacterIds(page)) {
      if (!firstPages.has(characterId)) firstPages.set(characterId, page.page_no);
    }
  }
  return firstPages;
}

function firstSceneGraphCharacterPages(sceneGraph: SceneGraphV1 | undefined): Map<string, number> {
  const firstPages = new Map<string, number>();
  if (!sceneGraph) return firstPages;

  for (const scene of [...sceneGraph.scenes].sort((a, b) => a.page_range.start - b.page_range.start)) {
    for (const characterId of sceneCharacterIds(scene)) {
      const current = firstPages.get(characterId);
      if (current === undefined || scene.page_range.start < current) {
        firstPages.set(characterId, scene.page_range.start);
      }
    }
  }
  return firstPages;
}

function pageSceneGraphCharacterIds(pageNo: number, sceneGraph: SceneGraphV1 | undefined): Set<string> {
  const ids = new Set<string>();
  if (!sceneGraph) return ids;

  for (const scene of sceneGraph.scenes) {
    if (pageNo < scene.page_range.start || pageNo > scene.page_range.end) continue;
    for (const characterId of sceneCharacterIds(scene)) ids.add(characterId);
  }
  return ids;
}

function isPoint(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function readPolygon(value: unknown): [number, number][] | null {
  return Array.isArray(value) && value.length >= 3 && value.every(isPoint)
    ? value
    : null;
}

function readRect(value: unknown): { x: number; y: number; w: number; h: number } | null {
  if (!value || typeof value !== "object") return null;
  const rect = value as { x?: unknown; y?: unknown; w?: unknown; h?: unknown };
  return (
    typeof rect.x === "number" &&
    typeof rect.y === "number" &&
    typeof rect.w === "number" &&
    typeof rect.h === "number"
  )
    ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
    : null;
}

function pointKey(point: [number, number]): string {
  return `${point[0].toFixed(4)},${point[1].toFixed(4)}`;
}

function polygonMatchesRect(polygon: [number, number][], rect: { x: number; y: number; w: number; h: number }): boolean {
  if (polygon.length !== 4) return false;
  const expected = new Set([
    pointKey([rect.x, rect.y]),
    pointKey([rect.x + rect.w, rect.y]),
    pointKey([rect.x + rect.w, rect.y + rect.h]),
    pointKey([rect.x, rect.y + rect.h]),
  ]);
  return polygon.every((point) => expected.has(pointKey(point)));
}

function hasPolygonPanel(page: TriagePage): boolean {
  for (const panel of page.panels) {
    const rawPanel = panel as unknown as { rect?: unknown; polygon?: unknown };
    if (readPolygon(rawPanel.rect)) return true;

    const polygon = readPolygon(rawPanel.polygon);
    if (!polygon) continue;

    const rect = readRect(rawPanel.rect);
    if (!rect || !polygonMatchesRect(polygon, rect)) return true;
  }
  return false;
}

export function shouldAuditPage(
  page: TriagePage,
  sceneGraph: SceneGraphV1 | undefined,
  storyboard: EpisodeStoryboardV2,
  pagePlan: PagePlanV2
): boolean {
  const storyboardPage = storyboard.pages.find((p) => p.page_no === page.page_no);
  const planPage = pagePlan.pages.find((p) => p.page_no === page.page_no);
  const pageRole = page.page_role ?? storyboardPage?.page_role ?? planPage?.page_role;
  if (pageRole === "opening_hook" || pageRole === "cliffhanger") return true;

  const pageCharacterIds = new Set([
    ...storyboardPageCharacterIds(storyboardPage),
    ...pageSceneGraphCharacterIds(page.page_no, sceneGraph),
  ]);
  const firstStoryboardPages = firstStoryboardCharacterPages(storyboard);
  const firstSceneGraphPages = firstSceneGraphCharacterPages(sceneGraph);
  for (const characterId of pageCharacterIds) {
    if (firstStoryboardPages.get(characterId) === page.page_no) return true;
    if (firstSceneGraphPages.get(characterId) === page.page_no) return true;
  }

  if (hasPolygonPanel(page)) return true;
  if (planPage && planPage !== page && hasPolygonPanel(planPage)) return true;

  return false;
}

function filterStoryboard(storyboard: EpisodeStoryboardV2, pageNos: Set<number>): EpisodeStoryboardV2 {
  return { ...storyboard, pages: storyboard.pages.filter((page) => pageNos.has(page.page_no)) };
}

function filterPagePlan(pagePlan: PagePlanV2, pageNos: Set<number>): PagePlanV2 {
  return { ...pagePlan, pages: pagePlan.pages.filter((page) => pageNos.has(page.page_no)) };
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
  let sceneGraph: SceneGraphV1 | undefined;
  if (args.triage) {
    sceneGraph = JSON.parse(await fs.readFile(sceneGraphPath(args.slug, args.episode), "utf-8")) as SceneGraphV1;
  }

  const triagePageNos = args.triage
    ? new Set(
        pagePlan.pages
          .filter((page) => shouldAuditPage(page, sceneGraph, storyboard, pagePlan))
          .map((page) => page.page_no)
      )
    : new Set(pagePlan.pages.map((page) => page.page_no));
  const auditStoryboard = args.triage ? filterStoryboard(storyboard, triagePageNos) : storyboard;
  const auditPagePlan = args.triage ? filterPagePlan(pagePlan, triagePageNos) : pagePlan;
  if (args.triage) {
    console.log(
      `[L11] triage: pages=${auditPagePlan.pages.length}/${pagePlan.pages.length} (${auditPagePlan.pages.map((p) => p.page_no).join(", ")})`
    );
  }

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
    rendersDir: rendersDir(args.slug, args.episode), storyboard: auditStoryboard, pagePlan: auditPagePlan, resolvedRefs,
  });

  if (args.visionAudit) {
    const visionAuditDir = path.join(episodeDir(args.slug, args.episode), "_audit_vision");
    const vision = await runVisionAudit({
      pagePlan: auditPagePlan,
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

      const storyboardFindings = scanStoryboard(auditStoryboard, blocklist, fp);
      allFindings.push(...storyboardFindings.map((f) => ({ ...f, source: "storyboard" as const })));

      const pagePlanText = JSON.stringify(auditPagePlan);
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

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((e) => { console.error("[L11] FAILED:", e); process.exit(1); });
}
