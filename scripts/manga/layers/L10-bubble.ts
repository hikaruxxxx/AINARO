/**
 * L10 Bubble Overlay
 *
 * renders/p{NN}.png + storyboard.json + page_plan.json → bubbles/p{NN}.png
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  storyboardPath,
  pagePlanPath,
  rendersDir,
  bubblesDir,
} from "./_paths";
import { overlayPageBubbles } from "../../../src/lib/manga/bubble-v2/vertical-typesetter";
import type { EpisodeStoryboardV2, PagePlanV2 } from "../../../src/lib/manga/schemas-v2";
import { appendRenderManifest } from "../../../src/lib/manga/revision-ui/manifest";

function workdirRelative(slug: string, absPath: string): string {
  const root = path.resolve("data/manga/works", slug);
  const abs = path.resolve(absPath);
  if (abs.startsWith(root + path.sep)) return abs.slice(root.length + 1);
  return abs;
}

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

  await fs.mkdir(bubblesDir(args.slug, args.episode), { recursive: true });

  let totalOverlaid = 0; let totalSkipped = 0; let processed = 0; let missing = 0;

  for (const planPage of pagePlan.pages) {
    const sbPage = storyboard.pages.find((p) => p.page_no === planPage.page_no);
    if (!sbPage) continue;
    const renderPath = path.join(rendersDir(args.slug, args.episode), `p${String(planPage.page_no).padStart(2, "0")}.png`);
    try {
      await fs.access(renderPath);
    } catch {
      console.warn(`[L10] missing render: p${planPage.page_no}`);
      missing++;
      continue;
    }
    const outPath = path.join(bubblesDir(args.slug, args.episode), `p${String(planPage.page_no).padStart(2, "0")}.png`);
    const r = await overlayPageBubbles({
      pageRenderPath: renderPath, storyboardPage: sbPage, pagePlanPage: planPage, outputPath: outPath,
    });
    totalOverlaid += r.overlaid; totalSkipped += r.skipped; processed++;
    // bubble は page 単位の合成出力 → page_${N} で記録
    await appendRenderManifest({
      schema_version: 1,
      ts: new Date().toISOString(),
      slug: args.slug,
      episode: args.episode,
      page_no: planPage.page_no,
      panel_id: `page_${planPage.page_no}`,
      version: "v1",
      layer: "bubble",
      image_path: workdirRelative(args.slug, outPath),
      origin: "initial",
    });
    console.log(`[L10] p${planPage.page_no}: overlaid=${r.overlaid} skipped=${r.skipped}`);
  }

  console.log(`[L10] DONE: pages=${processed} missing_renders=${missing} total_overlaid=${totalOverlaid} total_skipped=${totalSkipped}`);
}

main().catch((e) => { console.error("[L10] FAILED:", e); process.exit(1); });
