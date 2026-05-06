/**
 * L9.5 Page Composer
 *
 * panel_composite 戦略で生成された panel PNG 群を、page_plan.rect に従って
 * 1 ページ PNG (B6 1748x2480) に合成する。
 *
 * - 余白白で塗りつぶし
 * - 各 panel の rect に panel PNG を fit (cover) で貼り付け、枠線 2px を描画
 * - 出力は renders/p{NN}.png に上書き
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PagePlanV2 } from "../schemas-v2";
import { polygonSvgFrame, polygonToSvgMask } from "../render/polygon-utils";
import type { Polygon } from "../render/polygon-utils";

const PAGE_W = 1748;
const PAGE_H = 2480;
const FRAME_BORDER = 4; // px

export async function composePanelsIntoPage(args: {
  pageNo: number;
  rendersDir: string;
  pagePlanPage: PagePlanV2["pages"][number];
  outputPath: string;
}): Promise<{ panelsComposed: number; missingPanels: string[] }> {
  const { pageNo, rendersDir, pagePlanPage, outputPath } = args;

  // 白背景の base canvas
  const base = sharp({
    create: { width: PAGE_W, height: PAGE_H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png();

  const composites: sharp.OverlayOptions[] = [];
  const missing: string[] = [];

  for (const pp of pagePlanPage.panels) {
    const panelPath = path.join(
      rendersDir,
      `p${String(pageNo).padStart(2, "0")}_panel_${String(pp.reading_order).padStart(2, "0")}.png`
    );
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

    // panel を rect にフィット (cover)
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
          polygon.map(([px, py]) => [px - x, py - y]),
          { borderWidth: FRAME_BORDER, borderColor: "black" }
        )
      : `<rect x="${FRAME_BORDER / 2}" y="${FRAME_BORDER / 2}" width="${w - FRAME_BORDER}" height="${h - FRAME_BORDER}" fill="none" stroke="black" stroke-width="${FRAME_BORDER}"/>`;
    const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${frameBody}</svg>`;

    composites.push({ input: Buffer.from(frameSvg), top: y, left: x });
  }

  await base.composite(composites).png().toFile(outputPath);
  return { panelsComposed: pagePlanPage.panels.length - missing.length, missingPanels: missing };
}
