import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { PagePlanV2 } from "../../src/lib/manga/schemas-v2";
import { composePanelsIntoPage } from "../../src/lib/manga/render-v2/page-composer";
import { pagePlanPath } from "./layers/_paths";

const SLUG = "a07-modern-dungeon";
const EPISODE = 1;
const PAGE_NO = 11;
const TMP_RENDERS_DIR = "/tmp/render-polygon-smoketest-panels";
const OUT = "/tmp/render-polygon-smoketest.png";

const COLORS = ["#d74f35", "#2f7fbd", "#43a047", "#8e44ad", "#f2a900"];

async function writePlaceholderPanel(panelNo: number, w = 512, h = 512): Promise<void> {
  const label = String(panelNo);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${COLORS[(panelNo - 1) % COLORS.length]}"/>
    <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial, sans-serif" font-size="220" font-weight="700" fill="white">${label}</text>
  </svg>`;
  const out = path.join(TMP_RENDERS_DIR, `p${String(PAGE_NO).padStart(2, "0")}_panel_${String(panelNo).padStart(2, "0")}.png`);
  await sharp(Buffer.from(svg)).png().toFile(out);
}

function makeSmokePage(page: PagePlanV2["pages"][number]): PagePlanV2["pages"][number] {
  const panels = page.panels.map((panel, index) => {
    const rect = panel.rect;
    const polygon = panel.polygon ?? [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x, rect.y + rect.h],
    ];
    return { ...panel, polygon: polygon.map(([x, y]) => [x, y] as [number, number]) };
  });

  if (panels[1]) {
    const { x, y, w, h } = panels[1].rect;
    panels[1].polygon = [
      [x + 35, y],
      [x + w, y + 20],
      [x + w - 30, y + h],
      [x, y + h - 40],
    ];
  }
  if (panels[0]) panels[0].bleed_polygon = true;
  if (panels[panels.length - 1]) panels[panels.length - 1].is_borderless = true;

  return { ...page, panels };
}

async function main(): Promise<void> {
  const plan = JSON.parse(await fs.readFile(pagePlanPath(SLUG, EPISODE), "utf-8")) as PagePlanV2;
  const sourcePage = plan.pages.find((page) => page.page_no === PAGE_NO);
  if (!sourcePage) throw new Error(`page ${PAGE_NO} not found in ${pagePlanPath(SLUG, EPISODE)}`);

  await fs.rm(TMP_RENDERS_DIR, { recursive: true, force: true });
  await fs.mkdir(TMP_RENDERS_DIR, { recursive: true });
  await Promise.all(sourcePage.panels.map((panel) => writePlaceholderPanel(panel.reading_order)));

  const result = await composePanelsIntoPage({
    pageNo: PAGE_NO,
    rendersDir: TMP_RENDERS_DIR,
    pagePlanPage: makeSmokePage(sourcePage),
    outputPath: OUT,
  });

  console.log(JSON.stringify({ outputPath: OUT, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
