/**
 * 一回限り: a07 ep01 の p2/p3 の v5 panel PNG を page_plan の rect/polygon に従って
 * 1748x2480 のページに合成する。既存 page-composer.ts は v1 ファイル名ハードコードで
 * v5 を拾えないため、品質確認用にこのスクリプトで合成する。
 */
import sharp, { type OverlayOptions } from "sharp";
import { promises as fs } from "node:fs";
import { polygonSvgFrame, polygonToSvgMask, type Polygon } from "../../src/lib/manga/render/polygon-utils";

const PAGE_W = 1748;
const PAGE_H = 2480;
const FRAME_BORDER = 4;

const SLUG = "a07-modern-dungeon";
const EP_DIR = `/Users/hikarumori/Developer/AINARO/data/manga/works/${SLUG}/episodes/ep01`;

async function composePage(pageNo: number, version: string): Promise<void> {
  const pagePlan = JSON.parse(await fs.readFile(`${EP_DIR}/page_plan.json`, "utf8"));
  const page = pagePlan.pages.find((p: any) => p.page_no === pageNo);
  if (!page) throw new Error(`page ${pageNo} not found`);

  const composites: OverlayOptions[] = [];
  const missing: string[] = [];
  const pn = String(pageNo).padStart(2, "0");

  for (const pp of page.panels) {
    const ro = String(pp.reading_order).padStart(2, "0");
    const suffix = version === "v1" ? "" : `_${version}`;
    const panelPath = `${EP_DIR}/renders/p${pn}_panel_${ro}${suffix}.png`;
    try {
      await fs.access(panelPath);
    } catch {
      missing.push(pp.panel_id);
      continue;
    }

    const w = Math.round(pp.rect.w);
    const h = Math.round(pp.rect.h);
    const x = Math.round(pp.rect.x);
    const y = Math.round(pp.rect.y);
    const polygon: Polygon | undefined = pp.polygon;
    const usePolygon = polygon && polygon.length >= 3;

    const resized = await sharp(panelPath)
      .resize({ width: w, height: h, fit: "cover", position: "center" })
      .png()
      .toBuffer();

    if (usePolygon) {
      const mask = polygonToSvgMask(polygon, w, h, -x, -y);
      const clipped = await sharp(resized)
        .ensureAlpha()
        .composite([{ input: Buffer.from(mask), blend: "dest-in" }])
        .png()
        .toBuffer();
      composites.push({ input: clipped, top: y, left: x });
    } else {
      composites.push({ input: resized, top: y, left: x });
    }

    if (pp.is_borderless || pp.bleed_polygon) continue;

    const frameBody = usePolygon
      ? polygonSvgFrame(
          polygon.map(([px, py]) => [px - x, py - y]) as Polygon,
          { borderWidth: FRAME_BORDER, borderColor: "black" }
        )
      : `<rect x="${FRAME_BORDER / 2}" y="${FRAME_BORDER / 2}" width="${w - FRAME_BORDER}" height="${h - FRAME_BORDER}" fill="none" stroke="black" stroke-width="${FRAME_BORDER}"/>`;
    const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${frameBody}</svg>`;
    composites.push({ input: Buffer.from(frameSvg), top: y, left: x });
  }

  const outPath = `${EP_DIR}/renders/p${pn}_composed_${version}.png`;
  await sharp({
    create: { width: PAGE_W, height: PAGE_H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
    .png()
    .toFile(outPath);

  console.log(`OUT: ${outPath} (panels=${page.panels.length - missing.length}/${page.panels.length}, missing=[${missing.join(",")}])`);
}

(async () => {
  const version = process.argv[2] ?? "v5";
  await composePage(2, version);
  await composePage(3, version);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
