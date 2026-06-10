import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { composePageEffects } from "../effect-lines/page-effect-composer";
import type { EpisodeStoryboardV2, PagePlanV2 } from "../schemas-v2";

export async function overlayEffectLinesOntoPage(args: {
  pageOutputPath: string;
  pagePlanPage: PagePlanV2["pages"][number];
  storyboardPage: EpisodeStoryboardV2["pages"][number];
  pageWidth: number;
  pageHeight: number;
}): Promise<{ effectCount: number }> {
  const { svg, effectCount } = composePageEffects({
    pagePlanPage: args.pagePlanPage,
    storyboardPage: args.storyboardPage,
    pageWidth: args.pageWidth,
    pageHeight: args.pageHeight,
  });
  if (effectCount === 0) return { effectCount };

  await fs.mkdir(path.dirname(args.pageOutputPath), { recursive: true });
  const tmpPath = `${args.pageOutputPath}.effects-tmp-${process.pid}.png`;
  await sharp(args.pageOutputPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(tmpPath);
  await fs.rename(tmpPath, args.pageOutputPath);

  return { effectCount };
}
