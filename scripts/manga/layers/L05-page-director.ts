/**
 * L5 Page Director
 *
 * storyboard.json → page_plan.json (deterministic mapper, テンプレ駆動)
 */
import "../_env";
import { promises as fs } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  storyboardPath,
  pagePlanPath,
  episodeDir,
  capabilityProfilePath,
  DEFAULT_CAPABILITY_MODEL,
  REPO_ROOT,
} from "./_paths";
import { buildPagePlanFromStoryboard } from "../../../src/lib/manga/page-director-v2/page-mapper-v2";
import { buildPagePlanFromStoryboardV3 } from "../../../src/lib/manga/page-director-v2/page-mapper-v3";
import { buildPagePlanFromStoryboardV4 } from "../../../src/lib/manga/page-director-v2/page-mapper-v4";
import { loadDefaultPatternDict } from "../../../src/lib/manga/page-director-v2/pattern-loader";
import { loadCapabilityProfile } from "../../../src/lib/manga/capability/capability";
import type { EpisodeStoryboardV2, PagePlanPanel, PagePlanV2 } from "../../../src/lib/manga/schemas-v2";

type MapperVersion = "v2" | "v3" | "v4";
type Args = {
  slug: string;
  episode: number;
  capabilityModel: string;
  mapperVersion?: MapperVersion;
  enforceVariance: boolean;
};
export type PagePlan = PagePlanV2;
export type VarianceConfig = {
  largestMinRatio: number;
  smallestMaxRatio: number;
  varianceMinRatio: number;
};
export type Violation = {
  page_no: number;
  kind: "largest_too_small" | "smallest_too_large" | "variance_too_low";
  severity: "warning" | "corrected";
  message: string;
  before: {
    largestRatio: number;
    smallestRatio: number;
    varianceRatio: number;
  };
  after?: {
    largestRatio: number;
    smallestRatio: number;
    varianceRatio: number;
  };
};
type LayoutMatchSummaryPage = {
  page_no: number;
  _layout_match_meta?: {
    pattern_id: string;
    phase: 1 | 2 | 3;
    actualApplied: boolean;
    score: number;
    nonRect: boolean;
  };
};

const DEFAULT_PAGE_DIMS = { w: 1748, h: 2480 };
const DEFAULT_VARIANCE_CONFIG: VarianceConfig = {
  largestMinRatio: 0.35,
  smallestMaxRatio: 0.12,
  varianceMinRatio: 3.0,
};

function parseMapperVersion(value: string, label: string): MapperVersion {
  if (value !== "v2" && value !== "v3" && value !== "v4") {
    throw new Error(`${label} must be v2, v3, or v4`);
  }
  return value;
}

function parseArgs(): Args {
  const a: Partial<Args> = { capabilityModel: DEFAULT_CAPABILITY_MODEL, enforceVariance: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--enforce-variance") {
      a.enforceVariance = true;
      continue;
    }
    if (arg === "--no-enforce-variance") {
      a.enforceVariance = false;
      continue;
    }
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "capability-model") a.capabilityModel = val;
    else if (key === "mapper" || key === "mapperVersion") a.mapperVersion = parseMapperVersion(val, `--${key}`);
    else if (key === "enforce-variance") a.enforceVariance = val !== "false" && val !== "0";
    else if (key === "no-enforce-variance") a.enforceVariance = false;
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

function rectArea(panel: PagePlanPanel): number {
  return Math.max(0, panel.rect.w) * Math.max(0, panel.rect.h);
}

function varianceStats(panels: PagePlanPanel[], pageArea: number): Violation["before"] {
  const areas = panels.map(rectArea).filter((area) => area > 0);
  if (areas.length === 0 || pageArea <= 0) {
    return { largestRatio: 0, smallestRatio: 0, varianceRatio: 0 };
  }
  const largest = Math.max(...areas);
  const smallest = Math.min(...areas);
  return {
    largestRatio: largest / pageArea,
    smallestRatio: smallest / pageArea,
    varianceRatio: smallest > 0 ? largest / smallest : Number.POSITIVE_INFINITY,
  };
}

function rectPolygon(rect: PagePlanPanel["rect"]): [number, number][] {
  return [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ];
}

function targetRatios(panelCount: number): number[] {
  if (panelCount === 5) return [0.4, 0.1, 0.1, 0.2, 0.2];
  if (panelCount === 4) return [0.5, 0.12, 0.12, 0.26];
  if (panelCount === 3) return [0.55, 0.15, 0.3];
  if (panelCount === 2) return [0.76, 0.12];
  if (panelCount <= 1) return [1];

  const rest = panelCount - 2;
  const restRatio = 0.5 / rest;
  return [0.4, 0.1, ...Array.from({ length: rest }, () => restRatio)];
}

function buildVarianceRects(panelCount: number, pageDims: { w: number; h: number }): PagePlanPanel["rect"][] {
  const ratios = targetRatios(panelCount);
  const ratioSum = ratios.reduce((sum, ratio) => sum + ratio, 0);
  const rects: PagePlanPanel["rect"][] = [];
  let y = 0;
  let i = 0;
  while (i < ratios.length) {
    const current = ratios[i];
    const next = ratios[i + 1];
    const shouldPair =
      i > 0 &&
      next !== undefined &&
      Math.abs(current - next) <= 0.03;

    if (shouldPair) {
      const rowRatio = current + next;
      const rowH = pageDims.h * rowRatio;
      const rightW = pageDims.w * (current / rowRatio);
      const leftW = pageDims.w - rightW;
      rects.push({ x: leftW, y, w: rightW, h: rowH });
      rects.push({ x: 0, y, w: leftW, h: rowH });
      y += rowH;
      i += 2;
      continue;
    }

    const h = pageDims.h * current;
    rects.push({ x: 0, y, w: pageDims.w, h });
    y += h;
    i++;
  }

  if (rects.length > 0 && Math.abs(ratioSum - 1) < 0.000001) {
    const last = rects[rects.length - 1];
    last.h = Math.max(0, pageDims.h - last.y);
  }
  return rects;
}

function correctPagePanels(panels: PagePlanPanel[], pageDims: { w: number; h: number }): PagePlanPanel[] {
  const sorted = [...panels].sort((a, b) => a.reading_order - b.reading_order);
  const rects = buildVarianceRects(sorted.length, pageDims);
  const correctedById = new Map<string, PagePlanPanel>();

  for (let i = 0; i < sorted.length; i++) {
    const panel = sorted[i];
    const rect = rects[i] ?? panel.rect;
    correctedById.set(panel.panel_id, {
      ...panel,
      rect,
      polygon: rectPolygon(rect),
    });
  }

  return panels.map((panel) => correctedById.get(panel.panel_id) ?? panel);
}

export function enforceVarianceRule(
  pagePlan: PagePlan,
  pageDims: { w: number; h: number },
  config: Partial<VarianceConfig> = {},
): { violations: Violation[]; corrected: PagePlan } {
  const cfg = { ...DEFAULT_VARIANCE_CONFIG, ...config };
  const pageArea = pageDims.w * pageDims.h;
  const violations: Violation[] = [];
  let changed = false;

  const correctedPages = pagePlan.pages.map((page) => {
    if (page.panels.length <= 1) return page;

    const before = varianceStats(page.panels, pageArea);
    const pageViolations: Violation[] = [];
    if (before.largestRatio < cfg.largestMinRatio) {
      pageViolations.push({
        page_no: page.page_no,
        kind: "largest_too_small",
        severity: "corrected",
        message: `largest panel ratio ${before.largestRatio.toFixed(3)} < ${cfg.largestMinRatio}`,
        before,
      });
    }
    if (before.smallestRatio > cfg.smallestMaxRatio) {
      pageViolations.push({
        page_no: page.page_no,
        kind: "smallest_too_large",
        severity: "corrected",
        message: `smallest panel ratio ${before.smallestRatio.toFixed(3)} > ${cfg.smallestMaxRatio}`,
        before,
      });
    }
    if (before.varianceRatio < cfg.varianceMinRatio) {
      pageViolations.push({
        page_no: page.page_no,
        kind: "variance_too_low",
        severity: "warning",
        message: `panel area variance ${before.varianceRatio.toFixed(2)}x < ${cfg.varianceMinRatio}x`,
        before,
      });
    }

    if (pageViolations.length === 0) return page;

    const correctedPanels = correctPagePanels(page.panels, pageDims);
    const after = varianceStats(correctedPanels, pageArea);
    const unresolvedVariance = after.varianceRatio < cfg.varianceMinRatio;
    const finalizedViolations = pageViolations.map((violation) => ({
      ...violation,
      severity: violation.kind === "variance_too_low" && unresolvedVariance ? "warning" as const : "corrected" as const,
      after,
    }));
    violations.push(...finalizedViolations);
    changed = true;
    return {
      ...page,
      layout_template_id: `${page.layout_template_id}_variance`,
      panels: correctedPanels,
    };
  });

  return {
    violations,
    corrected: changed ? { ...pagePlan, pages: correctedPages } : pagePlan,
  };
}

async function main() {
  const args = parseArgs();
  // 2026-05-06: a07 ep01 で v4 (pattern dictionary + RULE 11 + BACKGROUND DIRECTIVE) の
  // 実 render → vision audit が PASS したため default を v3 → v4 に変更。
  // a08+ で問題が出たら `--mapper v3` または `MANGA_MAPPER=v3` で従前挙動に戻せる。
  const mapperVersion = parseMapperVersion(process.env.MANGA_MAPPER ?? args.mapperVersion ?? "v4", "MANGA_MAPPER");
  console.log(`[L05] slug=${args.slug} ep=${args.episode} mapper=${mapperVersion}`);
  console.log("[L05] default mapper: v4 (env MANGA_MAPPER=v3 で旧挙動へ切替可)");
  const layoutDict = await loadDefaultPatternDict({ repoRoot: REPO_ROOT });
  console.log(`[L05] layout dict: ${layoutDict.version}${layoutDict.fallback ? " (fallback to v1)" : ""}`);

  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const capability = await loadCapabilityProfile(capabilityProfilePath(args.capabilityModel));

  const rawPlan = mapperVersion === "v4"
    ? buildPagePlanFromStoryboardV4({
        storyboard,
        capability,
        dict: layoutDict.dict,
      })
    : mapperVersion === "v3"
      ? buildPagePlanFromStoryboardV3({ storyboard, capability })
      : buildPagePlanFromStoryboard({ storyboard, capability });
  const { violations: varianceViolations, corrected: plan } = args.enforceVariance
    ? enforceVarianceRule(rawPlan, DEFAULT_PAGE_DIMS)
    : { violations: [], corrected: rawPlan };

  const pagesWithMatchMeta = plan.pages as LayoutMatchSummaryPage[];
  process.stderr.write("[L05] match summary:\n");
  for (const page of pagesWithMatchMeta) {
    const meta = page._layout_match_meta;
    if (!meta) continue;
    process.stderr.write(
      `  P.${page.page_no}: pattern=${meta.pattern_id} score=${meta.score.toFixed(2)} phase=${meta.phase} ${meta.nonRect ? "nonRect" : "rect"}${meta.actualApplied ? "" : " [v3-fallback]"}\n`
    );
  }
  if (args.enforceVariance) {
    console.log(`[L05] variance rule: enabled violations=${varianceViolations.length}`);
    for (const violation of varianceViolations) {
      const after = violation.after
        ? ` after=${violation.after.varianceRatio.toFixed(2)}x`
        : "";
      console.log(`[L05] variance P.${violation.page_no}: ${violation.kind} ${violation.severity}${after}`);
    }
  } else {
    console.log("[L05] variance rule: disabled (--no-enforce-variance)");
  }

  await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
  await fs.writeFile(pagePlanPath(args.slug, args.episode), JSON.stringify(plan, null, 2));
  console.log(`[L05] DONE: ${pagePlanPath(args.slug, args.episode)}`);
  console.log(`[L05] pages=${plan.pages.length} strategies=${[...new Set(plan.pages.map(p => p.render_strategy))].join(",")} templates=${[...new Set(plan.pages.map(p => p.layout_template_id))].slice(0, 5).join(",")}...`);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((e) => { console.error("[L05] FAILED:", e); process.exit(1); });
}
