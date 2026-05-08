import { promises as fs } from "node:fs";
import path from "node:path";
import { loadPatternDict, type Pattern, type PatternFrequency } from "@/lib/manga/page-director-v2/pattern-loader";
import { isAxisAlignedRect, isNonRect } from "@/lib/manga/page-director-v2/pattern-matcher";

type CliArgs = {
  version: string;
  out?: string;
};

type Shape = "rect" | "non_rect";

type CountSummary = {
  total: number;
  rect: number;
  non_rect: number;
};

type OverallAnalysis = {
  total_patterns: number;
  rect: number;
  non_rect: number;
  non_rect_ratio: number;
  total_slots: number;
  rect_slots: number;
  non_rect_slots: number;
};

type PanelCountAnalysis = CountSummary & {
  non_rect_ratio: number;
  archetypes: Array<{
    id: string;
    name: string;
    frequency: string;
    shape: Shape;
    page_role_hints: string[];
  }>;
};

type Recommendation = {
  panel_count: number;
  current_non_rect: number;
  target_additions: { medium: number; "rare-medium": number; rare: number };
  total_additions: number;
  reason: string;
};

type AnalysisReport = {
  version: string;
  generated_at: string;
  overall: OverallAnalysis;
  by_panel_count: Record<string, PanelCountAnalysis>;
  by_frequency: Record<string, CountSummary>;
  by_page_role: Record<string, CountSummary>;
  gaps: {
    non_rect_zero_panel_counts: number[];
    non_rect_zero_page_roles: string[];
    recommendations: Recommendation[];
  };
};

const RECOMMENDATION_PLAN: Array<Omit<Recommendation, "current_non_rect" | "total_additions">> = [
  {
    panel_count: 3,
    target_additions: { medium: 2, "rare-medium": 2, rare: 1 },
    reason: "establishing/reveal/cliffhanger 用 non-rect が 0 (最頻 non-rect レンジ)",
  },
  {
    panel_count: 4,
    target_additions: { medium: 0, "rare-medium": 2, rare: 0 },
    reason: "action/buildup pat_030 alternatives",
  },
  {
    panel_count: 5,
    target_additions: { medium: 2, "rare-medium": 2, rare: 2 },
    reason: "dialogue/buildup non-rect が 0 (storyboard 主流)",
  },
  {
    panel_count: 6,
    target_additions: { medium: 0, "rare-medium": 1, rare: 1 },
    reason: "dialogue/aftermath pat_018 alternatives",
  },
  {
    panel_count: 7,
    target_additions: { medium: 0, "rare-medium": 0, rare: 1 },
    reason: "dialogue heavy 専用 non-rect が 0",
  },
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { version: "v1" };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version") {
      args.version = normalizeVersion(readRequiredValue(argv, i, "--version"));
      i += 1;
    } else if (arg.startsWith("--version=")) {
      args.version = normalizeVersion(arg.slice("--version=".length));
    } else if (arg === "--out") {
      args.out = readRequiredValue(argv, i, "--out");
      i += 1;
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function readRequiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function normalizeVersion(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("--version requires a non-empty value");
  }
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function roundRatio(nonRect: number, total: number): number {
  return Number((total === 0 ? 0 : nonRect / total).toFixed(4));
}

function shapeOf(pattern: Pattern): Shape {
  return isNonRect(pattern) ? "non_rect" : "rect";
}

function emptyCountSummary(): CountSummary {
  return { total: 0, rect: 0, non_rect: 0 };
}

function incrementShape(summary: CountSummary, shape: Shape): void {
  summary.total += 1;
  if (shape === "non_rect") {
    summary.non_rect += 1;
  } else {
    summary.rect += 1;
  }
}

function analyzeOverall(patterns: Pattern[]): OverallAnalysis {
  const patternCounts = patterns.reduce(
    (summary, pattern) => {
      incrementShape(summary, shapeOf(pattern));
      return summary;
    },
    emptyCountSummary(),
  );

  const slotCounts = patterns.reduce(
    (summary, pattern) => {
      for (const slot of pattern.slots) {
        const shape: Shape = isAxisAlignedRect(slot.polygon) ? "rect" : "non_rect";
        incrementShape(summary, shape);
      }
      return summary;
    },
    emptyCountSummary(),
  );

  return {
    total_patterns: patternCounts.total,
    rect: patternCounts.rect,
    non_rect: patternCounts.non_rect,
    non_rect_ratio: roundRatio(patternCounts.non_rect, patternCounts.total),
    total_slots: slotCounts.total,
    rect_slots: slotCounts.rect,
    non_rect_slots: slotCounts.non_rect,
  };
}

function analyzeByPanelCount(patterns: Pattern[]): Record<string, PanelCountAnalysis> {
  const grouped = new Map<number, Pattern[]>();
  for (const pattern of patterns) {
    grouped.set(pattern.panel_count, [...(grouped.get(pattern.panel_count) ?? []), pattern]);
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .sort(([a], [b]) => a - b)
      .map(([panelCount, panelPatterns]) => {
        const sortedPatterns = [...panelPatterns].sort((a, b) => a.id.localeCompare(b.id));
        const summary = sortedPatterns.reduce(
          (counts, pattern) => {
            incrementShape(counts, shapeOf(pattern));
            return counts;
          },
          emptyCountSummary(),
        );

        const analysis: PanelCountAnalysis = {
          ...summary,
          non_rect_ratio: roundRatio(summary.non_rect, summary.total),
          archetypes: sortedPatterns.map((pattern) => ({
            id: pattern.id,
            name: pattern.name,
            frequency: pattern.frequency,
            shape: shapeOf(pattern),
            page_role_hints: pattern.page_role_hints,
          })),
        };

        return [String(panelCount), analysis];
      }),
  );
}

function analyzeByFrequency(patterns: Pattern[]): Record<string, CountSummary> {
  const grouped = new Map<PatternFrequency, CountSummary>();
  for (const pattern of patterns) {
    const summary = grouped.get(pattern.frequency) ?? emptyCountSummary();
    incrementShape(summary, shapeOf(pattern));
    grouped.set(pattern.frequency, summary);
  }

  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function analyzeByPageRole(patterns: Pattern[]): Record<string, CountSummary> {
  const grouped = new Map<string, CountSummary>();
  for (const pattern of patterns) {
    const shape = shapeOf(pattern);
    for (const role of pattern.page_role_hints) {
      const summary = grouped.get(role) ?? emptyCountSummary();
      incrementShape(summary, shape);
      grouped.set(role, summary);
    }
  }

  return Object.fromEntries([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function buildRecommendations(patterns: Pattern[]): Recommendation[] {
  const currentNonRectByPanelCount = new Map<number, number>();
  for (const pattern of patterns) {
    if (isNonRect(pattern)) {
      currentNonRectByPanelCount.set(pattern.panel_count, (currentNonRectByPanelCount.get(pattern.panel_count) ?? 0) + 1);
    }
  }

  return RECOMMENDATION_PLAN.map((item) => {
    const totalAdditions = item.target_additions.medium + item.target_additions["rare-medium"] + item.target_additions.rare;
    return {
      panel_count: item.panel_count,
      current_non_rect: currentNonRectByPanelCount.get(item.panel_count) ?? 0,
      target_additions: item.target_additions,
      total_additions: totalAdditions,
      reason: item.reason,
    };
  });
}

function buildGaps(args: {
  byPanelCount: Record<string, PanelCountAnalysis>;
  byPageRole: Record<string, CountSummary>;
  recommendations: Recommendation[];
}): AnalysisReport["gaps"] {
  return {
    non_rect_zero_panel_counts: Object.entries(args.byPanelCount)
      .filter(([, summary]) => summary.non_rect === 0)
      .map(([panelCount]) => Number(panelCount))
      .sort((a, b) => a - b),
    non_rect_zero_page_roles: Object.entries(args.byPageRole)
      .filter(([, summary]) => summary.non_rect === 0)
      .map(([role]) => role)
      .sort((a, b) => a.localeCompare(b)),
    recommendations: args.recommendations,
  };
}

function buildReport(version: string, patterns: Pattern[]): AnalysisReport {
  const byPanelCount = analyzeByPanelCount(patterns);
  const byPageRole = analyzeByPageRole(patterns);
  const recommendations = buildRecommendations(patterns);

  return {
    version,
    generated_at: new Date().toISOString(),
    overall: analyzeOverall(patterns),
    by_panel_count: byPanelCount,
    by_frequency: analyzeByFrequency(patterns),
    by_page_role: byPageRole,
    gaps: buildGaps({ byPanelCount, byPageRole, recommendations }),
  };
}

async function writeOutput(json: string, out?: string): Promise<void> {
  if (!out) {
    process.stdout.write(json);
    return;
  }

  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, json, "utf-8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dictPath = path.join(process.cwd(), "data", "manga", "layout_patterns", `${args.version}.json`);
  const dict = await loadPatternDict(dictPath);
  const report = buildReport(args.version, dict.patterns);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeOutput(json, args.out);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
