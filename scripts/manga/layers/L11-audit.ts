/**
 * L11 Audit
 *
 * renders/p{NN}.png を検査して audit.json を生成
 */
import "../_env";
import { promises as fs } from "node:fs";
import { storyboardPath, pagePlanPath, rendersDir, auditPath, resolvedRefsPath } from "./_paths";
import { auditEpisode } from "../../../src/lib/manga/qa-v2/audit";
import type { EpisodeStoryboardV2, PagePlanV2, ResolvedRefs } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number };

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
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

  await fs.writeFile(auditPath(args.slug, args.episode), JSON.stringify(report, null, 2));
  console.log(`[L11] DONE: ${auditPath(args.slug, args.episode)}`);
  console.log(`[L11] panels: ${report.panels_passed}/${report.panels_total} passed, ${report.panels_failed} failed`);
  if (report.failed_panel_ids.length > 0) {
    console.log(`[L11] failed: ${report.failed_panel_ids.join(", ")}`);
    console.log(`[L11] → run L12 for repair`);
  }
}

main().catch((e) => { console.error("[L11] FAILED:", e); process.exit(1); });
