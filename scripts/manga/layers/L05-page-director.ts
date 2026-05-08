/**
 * L5 Page Director
 *
 * storyboard.json → page_plan.json (deterministic mapper, テンプレ駆動)
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
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
import { loadPatternDict } from "../../../src/lib/manga/page-director-v2/pattern-loader";
import { loadCapabilityProfile } from "../../../src/lib/manga/capability/capability";
import type { EpisodeStoryboardV2 } from "../../../src/lib/manga/schemas-v2";

type MapperVersion = "v2" | "v3" | "v4";
type Args = { slug: string; episode: number; capabilityModel: string; mapperVersion?: MapperVersion };
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

function parseMapperVersion(value: string, label: string): MapperVersion {
  if (value !== "v2" && value !== "v3" && value !== "v4") {
    throw new Error(`${label} must be v2, v3, or v4`);
  }
  return value;
}

function parseArgs(): Args {
  const a: Partial<Args> = { capabilityModel: DEFAULT_CAPABILITY_MODEL };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
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
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  // 2026-05-06: a07 ep01 で v4 (pattern dictionary + RULE 11 + BACKGROUND DIRECTIVE) の
  // 実 render → vision audit が PASS したため default を v3 → v4 に変更。
  // a08+ で問題が出たら `--mapper v3` または `MANGA_MAPPER=v3` で従前挙動に戻せる。
  const mapperVersion = parseMapperVersion(process.env.MANGA_MAPPER ?? args.mapperVersion ?? "v4", "MANGA_MAPPER");
  console.log(`[L05] slug=${args.slug} ep=${args.episode} mapper=${mapperVersion}`);
  console.log("[L05] default mapper: v4 (env MANGA_MAPPER=v3 で旧挙動へ切替可)");

  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const capability = await loadCapabilityProfile(capabilityProfilePath(args.capabilityModel));

  const plan = mapperVersion === "v4"
    ? buildPagePlanFromStoryboardV4({
        storyboard,
        capability,
        dict: await loadPatternDict(path.join(REPO_ROOT, "data/manga/layout_patterns/v1.json")),
      })
    : mapperVersion === "v3"
      ? buildPagePlanFromStoryboardV3({ storyboard, capability })
      : buildPagePlanFromStoryboard({ storyboard, capability });

  const pagesWithMatchMeta = plan.pages as LayoutMatchSummaryPage[];
  process.stderr.write("[L05] match summary:\n");
  for (const page of pagesWithMatchMeta) {
    const meta = page._layout_match_meta;
    if (!meta) continue;
    process.stderr.write(
      `  P.${page.page_no}: pattern=${meta.pattern_id} score=${meta.score.toFixed(2)} phase=${meta.phase} ${meta.nonRect ? "nonRect" : "rect"}${meta.actualApplied ? "" : " [v3-fallback]"}\n`
    );
  }

  await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
  await fs.writeFile(pagePlanPath(args.slug, args.episode), JSON.stringify(plan, null, 2));
  console.log(`[L05] DONE: ${pagePlanPath(args.slug, args.episode)}`);
  console.log(`[L05] pages=${plan.pages.length} strategies=${[...new Set(plan.pages.map(p => p.render_strategy))].join(",")} templates=${[...new Set(plan.pages.map(p => p.layout_template_id))].slice(0, 5).join(",")}...`);
}

main().catch((e) => { console.error("[L05] FAILED:", e); process.exit(1); });
