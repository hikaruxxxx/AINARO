/**
 * L9.5 Page Compose
 *
 * panel_composite 戦略のページについて、panel PNG 群を 1 page PNG に合成。
 * page_one_shot 戦略のページはスキップ (既に 1 page PNG が出ている前提)。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L09b-page-compose.ts --slug a07-modern-dungeon --episode 1
 *   --pages 2,3 で対象ページを限定
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pagePlanPath, rendersDir } from "./_paths";
import { composePanelsIntoPage } from "../../../src/lib/manga/render-v2/page-composer";
import type { PagePlanV2 } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; episode: number; pages?: number[] };

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
    else if (key === "pages") a.pages = val.split(",").map((s) => Number(s));
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const plan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const dir = rendersDir(args.slug, args.episode);
  const target = args.pages ? new Set(args.pages) : null;

  let composed = 0; let skipped = 0;
  for (const page of plan.pages) {
    if (target && !target.has(page.page_no)) continue;
    if (page.render_strategy !== "panel_composite") { skipped++; continue; }
    const out = path.join(dir, `p${String(page.page_no).padStart(2, "0")}.png`);
    const r = await composePanelsIntoPage({
      pageNo: page.page_no, rendersDir: dir, pagePlanPage: page, outputPath: out,
    });
    console.log(`[L09b] p${page.page_no}: composed=${r.panelsComposed}/${page.panels.length} missing=${r.missingPanels.length}${r.missingPanels.length > 0 ? ` (${r.missingPanels.join(",")})` : ""}`);
    composed++;
  }
  console.log(`[L09b] DONE: composed=${composed} skipped(non-panel_composite or out-of-range)=${skipped}`);
}

main().catch((e) => { console.error("[L09b] FAILED:", e); process.exit(1); });
