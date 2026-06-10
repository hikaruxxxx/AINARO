import { promises as fs } from "node:fs";
import { composePageBubbles } from "../../src/lib/manga/bubble/page-bubble-composer";
import type { EpisodeStoryboardV2, PagePlanV2 } from "../../src/lib/manga/schemas-v2";

async function main() {
  const slug = "a07-modern-dungeon";
  const episode = 1;
  const pageNo = 9;
  const base = `data/manga/works/${slug}/episodes/ep${String(episode).padStart(2, "0")}`;
  const pagePlan = JSON.parse(await fs.readFile(`${base}/page_plan.json`, "utf-8")) as PagePlanV2;
  const storyboard = JSON.parse(await fs.readFile(`${base}/storyboard.json`, "utf-8")) as EpisodeStoryboardV2;
  const pagePlanPage = pagePlan.pages.find((p) => p.page_no === pageNo);
  const storyboardPage = storyboard.pages.find((p) => p.page_no === pageNo);

  if (!pagePlanPage || !storyboardPage) {
    throw new Error(`missing page ${pageNo}`);
  }

  const result = composePageBubbles({
    pagePlanPage,
    storyboardPage,
    pageWidth: 1748,
    pageHeight: 2480,
  });
  const outputPath = "/tmp/bubble-breakout-smoketest-p09.svg";
  await fs.writeFile(outputPath, result.svg, "utf-8");

  console.log(JSON.stringify({
    outputPath,
    bubbleCount: result.bubbleCount,
    breakoutCount: result.breakouts.length,
    breakouts: result.breakouts,
    warnings: result.warnings,
  }, null, 2));

  if (result.breakouts.length < 1) {
    throw new Error("expected at least 1 breakout");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
