/**
 * page_one_shot で生成された PNG の上に、page_plan.polygon に基づく
 * 多角形コマ枠を SVG overlay で後合成する。
 *
 * 動機:
 *   gpt-image-2 は LAYOUT GEOMETRY 指示でも polygon (5+ vertex) コマ枠を
 *   再現できず rect で描いてしまう。これを強制的に上書きする。
 *
 * 適用対象: pagePlanPage.panels の中で axis-aligned rect ではない panel。
 *           rect 4 vertex polygon は AI 描画で十分なので skip。
 *
 * SVG halo 必須 (memory: feedback_manga_overlay_halo_required):
 *   - 背面: 白縁 8px (haloで写実画像から黒枠を浮かせる)
 *   - 前面: 黒枠 4px
 */
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { PagePlanPage } from "../schemas-v2";
import { isAxisAlignedRect } from "../page-director-v2/pattern-matcher";
import { polygonSvgFrame } from "./polygon-utils";

export async function overlayPolygonFramesOntoPage(args: {
  pagePngPath: string;
  outputPath: string;
  pagePlanPage: PagePlanPage;
  pageWidth: number;
  pageHeight: number;
}): Promise<{ framedCount: number }> {
  const { pagePngPath, outputPath, pagePlanPage, pageWidth, pageHeight } = args;

  // axis-aligned rect ではない panel のみ抽出 (rect は AI 任せでよい)
  const polygonPanels = pagePlanPage.panels.filter(
    (p) => !!p.polygon && !isAxisAlignedRect(p.polygon)
  );

  if (polygonPanels.length === 0) {
    // overlay 不要、元画像をそのまま outputPath にコピー (in-place の場合は no-op)
    if (pagePngPath !== outputPath) {
      await fs.copyFile(pagePngPath, outputPath);
    }
    return { framedCount: 0 };
  }

  // SVG: halo (白縁背面) + 黒枠 (前面) を polygon ごとに重ねる
  const haloFrames = polygonPanels
    .map((p) => polygonSvgFrame(p.polygon!, { borderWidth: 12, borderColor: "white" }))
    .join("\n  ");
  const blackFrames = polygonPanels
    .map((p) => polygonSvgFrame(p.polygon!, { borderWidth: 4, borderColor: "black" }))
    .join("\n  ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">
  ${haloFrames}
  ${blackFrames}
</svg>`;

  // sharp で page PNG の上に SVG composite
  await sharp(pagePngPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath + ".tmp.png");
  await fs.rename(outputPath + ".tmp.png", outputPath);

  return { framedCount: polygonPanels.length };
}
