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

type Args = {
  slug: string;
  episode: number;
  /** Phase C: 出力 version。"v1" は既存命名 (p{NN}.png)、v2+ は p{NN}_vN.png */
  version: string;
  /** Phase C: 特定ページのみ処理 (queue 消化用) */
  pages?: number[];
};

function parseArgs(): Args {
  const a: Partial<Args> = { version: "v1" };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    let key: string | null = null;
    let val: string | null = null;
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (!flag) continue;
      key = flag[1];
      const nextToken = argv[i + 1];
      if (i + 1 >= argv.length || (nextToken && nextToken.startsWith("--"))) continue;
      val = nextToken;
      i++;
    }
    if (val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "version") a.version = val;
    else if (key === "pages") a.pages = val.split(",").map((s) => Number(s));
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  if (a.version && !/^v\d+$/.test(a.version)) throw new Error(`--version must be vN (got ${a.version})`);
  return a as Args;
}

function pagePngName(pageNo: number, version: string): string {
  const pn = String(pageNo).padStart(2, "0");
  return version === "v1" ? `p${pn}.png` : `p${pn}_${version}.png`;
}

async function main() {
  const args = parseArgs();
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;

  await fs.mkdir(bubblesDir(args.slug, args.episode), { recursive: true });

  let totalOverlaid = 0; let totalSkipped = 0; let processed = 0; let missing = 0;

  const targetPages = args.pages ? new Set(args.pages) : null;
  for (const planPage of pagePlan.pages) {
    if (targetPages && !targetPages.has(planPage.page_no)) continue;
    const sbPage = storyboard.pages.find((p) => p.page_no === planPage.page_no);
    if (!sbPage) continue;
    const renderName = pagePngName(planPage.page_no, args.version);
    const renderPath = path.join(rendersDir(args.slug, args.episode), renderName);
    try {
      await fs.access(renderPath);
    } catch {
      console.warn(`[L10] missing render: ${renderName}`);
      missing++;
      continue;
    }
    const outPath = path.join(bubblesDir(args.slug, args.episode), renderName);
    const r = await overlayPageBubbles({
      pageRenderPath: renderPath, storyboardPage: sbPage, pagePlanPage: planPage, outputPath: outPath,
    });
    totalOverlaid += r.overlaid; totalSkipped += r.skipped; processed++;
    await appendRenderManifest({
      schema_version: 1,
      ts: new Date().toISOString(),
      slug: args.slug,
      episode: args.episode,
      page_no: planPage.page_no,
      panel_id: `page_${planPage.page_no}`,
      version: args.version,
      layer: "bubble",
      image_path: workdirRelative(args.slug, outPath),
      origin: args.version === "v1" ? "initial" : "revision_queue",
    });
    console.log(`[L10] ${renderName}: overlaid=${r.overlaid} skipped=${r.skipped}`);
  }

  console.log(`[L10] DONE: pages=${processed} missing_renders=${missing} total_overlaid=${totalOverlaid} total_skipped=${totalSkipped}`);
}

main().catch((e) => { console.error("[L10] FAILED:", e); process.exit(1); });
