/**
 * L4.5 Reader Journey Simulation CLI
 *
 * scene_graph + storyboard を入力に、LLM で初見読者体験をシミュレートし
 * reader_journey.json を出力する。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L04_5-reader-journey.ts --slug a07-modern-dungeon --episode 1
 */
import "../_env";
import path from "node:path";
import {
  sceneGraphPath,
  storyboardPath,
  bibleSnapshotPath,
  episodeDir,
} from "./_paths";
import { loadAndRunJourney } from "../../../src/lib/manga/qa-v2/reader-journey-sim";

type Args = { slug: string; episode: number };

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    const key = eq ? eq[1] : arg.replace(/^--/, "");
    const val = eq ? eq[2] : argv[++i];
    if (key === "slug") a.slug = val;
    if (key === "episode") a.episode = Number(val);
  }
  if (!a.slug || !a.episode) {
    console.error("Usage: --slug <slug> --episode <N>");
    process.exit(1);
  }
  return a as Args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const outputPath = path.join(episodeDir(args.slug, args.episode), "reader_journey.json");

  console.log(`[L4.5] reader-journey-sim: ${args.slug} ep${args.episode}`);
  const result = await loadAndRunJourney({
    sceneGraphPath: sceneGraphPath(args.slug, args.episode),
    storyboardPath: storyboardPath(args.slug, args.episode),
    biblePath: bibleSnapshotPath(args.slug),
    outputPath,
  });

  console.log(`[L4.5] satisfaction=${result.summary.overall_satisfaction} hook=${result.summary.hook_effectiveness} pacing=${result.summary.pacing_assessment}`);
  console.log(`[L4.5] suggestions: ${result.suggestions.length} (critical: ${result.suggestions.filter((s) => s.severity === "critical").length})`);

  const atRisk = result.moments.filter((m) => m.page_turning_motivation === "at_risk");
  if (atRisk.length > 0) {
    console.warn(`[L4.5] ⚠️ at_risk pages: ${atRisk.map((m) => `p${m.page_no}`).join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
