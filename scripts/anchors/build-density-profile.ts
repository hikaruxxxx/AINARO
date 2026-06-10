/**
 * Build bg_treatment density profile from existing learner_runs.
 *
 * 実行:
 *   npx tsx scripts/anchors/build-density-profile.ts --genre level-gacha
 *   npx tsx scripts/anchors/build-density-profile.ts --genre level-gacha --sources level-gacha-vol1,level-gacha-vol2
 */

import fs from "node:fs";
import path from "node:path";

import type {
  BackgroundTreatment,
  DensityDistribution,
  DensityProfile,
} from "../../src/lib/manga/schemas-v2";

const ROOT = process.cwd();
const LEARNER_RUNS_DIR = path.join(ROOT, "data/manga/reference_pool/_learner_runs");
const OUTPUT_DIR = path.join(ROOT, "data/generation/density-profiles");

const BACKGROUND_TREATMENTS: BackgroundTreatment[] = [
  "detailed_bg",
  "atmospheric_fade",
  "tone_back",
  "solid_white",
  "solid_black",
  "floating_ui",
  "unspecified",
];

type Args = {
  genre?: string;
  sources?: string[];
};

type LearnerRun = {
  schema_version: number;
  source?: string;
  method?: string;
  page_count?: number;
  pages?: LearnerPage[];
};

type LearnerPage = {
  page_no: number;
  spread?: boolean;
  panels?: LearnerPanel[];
};

type LearnerPanel = {
  panel_no: number;
  bg_treatment?: string;
};

type CountDistribution = Record<BackgroundTreatment, number>;
type PanelPosition = "top" | "middle" | "bottom";

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--genre") {
      args.genre = argv[++i];
    } else if (arg.startsWith("--genre=")) {
      args.genre = arg.slice("--genre=".length);
    } else if (arg === "--sources") {
      args.sources = parseSources(argv[++i]);
    } else if (arg.startsWith("--sources=")) {
      args.sources = parseSources(arg.slice("--sources=".length));
    }
  }
  return args;
}

function parseSources(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
}

function usage(): string {
  return [
    "Usage:",
    "  npx tsx scripts/anchors/build-density-profile.ts --genre <genre>",
    "  npx tsx scripts/anchors/build-density-profile.ts --genre <genre> --sources source1,source2",
  ].join("\n");
}

function zeroCounts(): CountDistribution {
  return {
    detailed_bg: 0,
    atmospheric_fade: 0,
    tone_back: 0,
    solid_white: 0,
    solid_black: 0,
    floating_ui: 0,
    unspecified: 0,
  };
}

function toDistribution(counts: CountDistribution, total: number): DensityDistribution {
  const distribution = zeroCounts() as DensityDistribution;
  for (const treatment of BACKGROUND_TREATMENTS) {
    distribution[treatment] = total > 0 ? counts[treatment] / total : 0;
  }
  return distribution;
}

function isBackgroundTreatment(value: string | undefined): value is BackgroundTreatment {
  return BACKGROUND_TREATMENTS.includes(value as BackgroundTreatment);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function listLearnerRunFiles(genre: string, sources: string[] | undefined): string[] {
  if (!fs.existsSync(LEARNER_RUNS_DIR)) {
    throw new Error(`learner_runs directory not found: ${LEARNER_RUNS_DIR}`);
  }

  const files = fs.readdirSync(LEARNER_RUNS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();

  if (sources && sources.length > 0) {
    const resolved = sources.flatMap((source) => {
      if (source.endsWith(".json")) {
        return files.includes(source) ? [source] : [];
      }
      return files.filter((name) => name === `${source}.json` || name.startsWith(`${source}-`));
    });
    return Array.from(new Set(resolved)).map((name) => path.join(LEARNER_RUNS_DIR, name));
  }

  const volPattern = new RegExp(`^${escapeRegExp(genre)}-vol\\d+-.*\\.json$`);
  const volFiles = files.filter((name) => volPattern.test(name));
  const matched = volFiles.length > 0
    ? volFiles
    : files.filter((name) => name.startsWith(`${genre}-`));

  return matched.map((name) => path.join(LEARNER_RUNS_DIR, name));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function panelPosition(panelIndex: number, panelCount: number): PanelPosition {
  if (panelIndex === 0) return "top";
  if (panelIndex === panelCount - 1) return "bottom";
  return "middle";
}

function addCount(counts: CountDistribution, treatment: BackgroundTreatment) {
  counts[treatment] += 1;
}

function buildProfile(genre: string, filePaths: string[]): DensityProfile {
  const overallCounts = zeroCounts();
  const bySpreadCounts = {
    single_page: zeroCounts(),
    spread: zeroCounts(),
  };
  const byPanelPositionCounts = {
    top: zeroCounts(),
    middle: zeroCounts(),
    bottom: zeroCounts(),
  };
  const spreadTotals = { single_page: 0, spread: 0 };
  const positionTotals = { top: 0, middle: 0, bottom: 0 };

  let panelCount = 0;
  let pageCount = 0;
  const sources: string[] = [];

  for (const filePath of filePaths) {
    const learnerRun = readJson<LearnerRun>(filePath);
    sources.push(path.basename(filePath));

    const pages = learnerRun.pages ?? [];
    pageCount += pages.length;

    for (const page of pages) {
      const panels = page.panels ?? [];
      const spreadKey = page.spread ? "spread" : "single_page";

      for (let i = 0; i < panels.length; i++) {
        const treatment = panels[i].bg_treatment;
        if (treatment === "unspecified") continue;
        if (!isBackgroundTreatment(treatment)) continue;

        const position = panelPosition(i, panels.length);
        addCount(overallCounts, treatment);
        addCount(bySpreadCounts[spreadKey], treatment);
        addCount(byPanelPositionCounts[position], treatment);
        panelCount += 1;
        spreadTotals[spreadKey] += 1;
        positionTotals[position] += 1;
      }
    }
  }

  const overall = toDistribution(overallCounts, panelCount);
  const averagePanelsPerPage = pageCount > 0 ? panelCount / pageCount : 0;

  return {
    schema_version: 1,
    genre,
    sources,
    panel_count: panelCount,
    page_count: pageCount,
    generated_at: new Date().toISOString(),
    method: "llm-vision-v1-aggregate",
    overall,
    by_spread: {
      single_page: toDistribution(bySpreadCounts.single_page, spreadTotals.single_page),
      spread: toDistribution(bySpreadCounts.spread, spreadTotals.spread),
    },
    by_panel_position: {
      top: toDistribution(byPanelPositionCounts.top, positionTotals.top),
      middle: toDistribution(byPanelPositionCounts.middle, positionTotals.middle),
      bottom: toDistribution(byPanelPositionCounts.bottom, positionTotals.bottom),
    },
    policy: {
      max_detailed_bg_per_page: Math.max(1, Math.ceil(overall.detailed_bg * averagePanelsPerPage)),
      require_atmospheric_or_tone_each_page: overall.atmospheric_fade + overall.tone_back >= 0.5,
      detailed_bg_target_ratio: overall.detailed_bg,
      atmospheric_fade_target_ratio: overall.atmospheric_fade,
      solid_color_target_ratio: overall.solid_white + overall.solid_black,
    },
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printSummary(profile: DensityProfile, outputPath: string) {
  console.log(`density profile written: ${outputPath}`);
  console.log(`genre: ${profile.genre}`);
  console.log(`sources: ${profile.sources.join(", ")}`);
  console.log(`pages: ${profile.page_count}`);
  console.log(`panels: ${profile.panel_count}`);
  console.log("overall:");
  for (const treatment of BACKGROUND_TREATMENTS) {
    console.log(`  ${treatment}: ${formatPercent(profile.overall[treatment])}`);
  }
  console.log("policy:");
  console.log(`  max_detailed_bg_per_page: ${profile.policy.max_detailed_bg_per_page}`);
  console.log(`  require_atmospheric_or_tone_each_page: ${profile.policy.require_atmospheric_or_tone_each_page}`);
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.genre) {
      console.error(usage());
      process.exit(1);
    }

    const filePaths = listLearnerRunFiles(args.genre, args.sources);
    if (filePaths.length === 0) {
      const sourceHint = args.sources?.length ? ` sources=${args.sources.join(",")}` : "";
      throw new Error(
        `No learner_run JSON files found for genre=${args.genre}${sourceHint} in ${LEARNER_RUNS_DIR}`,
      );
    }

    const profile = buildProfile(args.genre, filePaths);
    ensureDir(OUTPUT_DIR);
    const outputPath = path.join(OUTPUT_DIR, `${args.genre}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    printSummary(profile, outputPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
