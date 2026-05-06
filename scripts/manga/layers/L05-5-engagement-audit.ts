/**
 * L5.5 Engagement Audit CLI (Phase Y WY-4)
 *
 * storyboard.json + page_plan.json + bible/snapshot.v2.json を入力に、
 * LLM (claude opus 経由) で engagement (読者離脱リスク/退屈page/好感度推移/報酬間隔) を判定。
 *
 * 出力: episodes/ep{NN}/engagement_audit.json
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L05-5-engagement-audit.ts --slug a07-modern-dungeon --episode 1
 */
import "../_env";
import { promises as fs } from "node:fs";
import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
} from "./_paths";
import {
  generateEngagementAudit,
  saveEngagementAudit,
} from "../../../src/lib/manga/qa-v2/engagement-audit";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
} from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode: number;
};

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key) continue;
    if (key === "slug") a.slug = val ?? "";
    else if (key === "episode") a.episode = Number(val);
  }
  if (!a.slug) throw new Error("--slug is required");
  if (!Number.isInteger(a.episode) || (a.episode ?? 0) <= 0)
    throw new Error("--episode is required");
  return a as Args;
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf-8")) as T;
}

async function readJsonOrUndefined<T>(p: string): Promise<T | undefined> {
  try {
    return await readJson<T>(p);
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseArgs();
  console.log(`[L5.5] engagement-audit start: slug=${args.slug} episode=${args.episode}`);

  const bible = await readJson<BibleSnapshotV2>(bibleSnapshotPath(args.slug));
  const storyboard = await readJson<EpisodeStoryboardV2>(
    storyboardPath(args.slug, args.episode),
  );
  const pagePlan = await readJsonOrUndefined<PagePlanV2>(
    pagePlanPath(args.slug, args.episode),
  );

  const result = await generateEngagementAudit({
    bible,
    storyboard,
    pagePlan,
  });

  console.log(`[L5.5] audit complete:`);
  console.log(`  overall_drop_off_risk: ${result.overall_drop_off_risk.toFixed(1)}`);
  console.log(`  boring_pages: [${result.boring_pages.join(", ")}]`);
  if (result.worst_page) {
    console.log(
      `  worst_page: page ${result.worst_page.page_no} (risk ${result.worst_page.drop_off_risk}) — ${result.worst_page.reason}`,
    );
  }
  console.log(`  human_review_required: ${result.human_review_required}`);
  console.log(`  rationale: ${result.rationale_summary}`);

  const outPath = await saveEngagementAudit({
    slug: args.slug,
    episode: args.episode,
    result,
  });
  console.log(`[L5.5] saved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
