import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { composePageBubbles, type PageBubbleInput } from "../bubble/page-bubble-composer";

export async function overlayBubblesOntoPage(args: {
  pagePngPath: string;
  pageBubbleInput: PageBubbleInput;
  outputPath: string;
}): Promise<{ bubbleCount: number; warnings: string[] }> {
  const { svg, bubbleCount, warnings } = composePageBubbles(args.pageBubbleInput);
  if (bubbleCount === 0) return { bubbleCount, warnings };

  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });

  if (path.resolve(args.pagePngPath) === path.resolve(args.outputPath)) {
    const tmpPath = `${args.outputPath}.bubble-tmp-${process.pid}.png`;
    await sharp(args.pagePngPath)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toFile(tmpPath);
    await fs.rename(tmpPath, args.outputPath);
    return { bubbleCount, warnings };
  }

  await sharp(args.pagePngPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(args.outputPath);
  return { bubbleCount, warnings };
}
