import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { composePageBubbles, type PageBubbleInput } from "../bubble/page-bubble-composer";
import type { BreakoutCandidate } from "../bubble/breakout-detector";

export async function overlayBubblesOntoPage(args: {
  pagePngPath: string;
  pageBubbleInput: PageBubbleInput;
  outputPath: string;
}): Promise<{ bubbleCount: number; warnings: string[]; breakouts: BreakoutCandidate[] }> {
  const { svg, bubbleCount, warnings, breakouts, breakoutMasks } = composePageBubbles(args.pageBubbleInput);
  if (bubbleCount === 0) return { bubbleCount, warnings, breakouts };

  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });

  const composites: sharp.OverlayOptions[] = [
    ...breakoutMasks.map((mask) => ({
      input: Buffer.from(renderBreakoutEraseMask({
        pageWidth: args.pageBubbleInput.pageWidth,
        pageHeight: args.pageBubbleInput.pageHeight,
        rect: mask.rect,
      })),
      top: 0,
      left: 0,
    })),
    { input: Buffer.from(svg), top: 0, left: 0 },
  ];

  if (path.resolve(args.pagePngPath) === path.resolve(args.outputPath)) {
    const tmpPath = `${args.outputPath}.bubble-tmp-${process.pid}.png`;
    await sharp(args.pagePngPath)
      .composite(composites)
      .png()
      .toFile(tmpPath);
    await fs.rename(tmpPath, args.outputPath);
    return { bubbleCount, warnings, breakouts };
  }

  await sharp(args.pagePngPath)
    .composite(composites)
    .png()
    .toFile(args.outputPath);
  return { bubbleCount, warnings, breakouts };
}

function renderBreakoutEraseMask(args: {
  pageWidth: number;
  pageHeight: number;
  rect: { x: number; y: number; w: number; h: number };
}): string {
  const { x, y, w, h } = args.rect;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${args.pageWidth} ${args.pageHeight}" width="${args.pageWidth}" height="${args.pageHeight}">`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" />`,
    "</svg>",
  ].join("");
}
