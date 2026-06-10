/**
 * Prompt diff 検証: live composePagePrompt の出力を file に保存し、
 * dump-prompts.ts が出力した page_10.prompt.txt と diff する。
 * 完全一致なら「prompt 差はゼロ確定」(揺らぎ範囲確定)。
 * 不一致なら真因の特定。
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  sceneGraphPath,
  resolvedRefsPath,
} from "./layers/_paths";
import { composePagePrompt } from "../../src/lib/manga/render-v2/prompt-composer-v2";
import { loadBlocklist, loadFalsePositives } from "../../src/lib/manga/compliance/scanner";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
  ResolvedRefs,
} from "../../src/lib/manga/schemas-v2";
import { isSceneGraphV1 } from "../../src/lib/manga/scene-graph/schema";
import type { SceneGraphV1, Scene } from "../../src/lib/manga/scene-graph/schema";

const SLUG = "a07-modern-dungeon";
const EPISODE = 1;
const TARGET_PAGE = 10;

async function main() {
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(SLUG), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(SLUG, EPISODE), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(SLUG, EPISODE), "utf-8")) as PagePlanV2;
  const resolved = JSON.parse(await fs.readFile(resolvedRefsPath(SLUG, EPISODE), "utf-8")) as ResolvedRefs;
  const compliance = { blocklist: await loadBlocklist(), fp: await loadFalsePositives() };

  const sceneByPage = new Map<number, Scene>();
  const sgRaw = JSON.parse(await fs.readFile(sceneGraphPath(SLUG, EPISODE), "utf-8")) as unknown;
  if (isSceneGraphV1(sgRaw)) {
    const sg: SceneGraphV1 = sgRaw;
    for (const scene of sg.scenes) {
      for (let p = scene.page_range.start; p <= scene.page_range.end; p++) {
        if (!sceneByPage.has(p)) sceneByPage.set(p, scene);
      }
    }
  }

  const sbPage = storyboard.pages.find((p) => p.page_no === TARGET_PAGE)!;
  const planPage = pagePlan.pages.find((p) => p.page_no === TARGET_PAGE)!;
  const packet = resolved.packets[`page_${TARGET_PAGE}`];
  const pageBgMap = new Map(
    planPage.panels
      .map((pp) => [pp.panel_id, pp.background_treatment])
      .filter(([, v]) => v !== undefined) as [string, NonNullable<typeof planPage.panels[0]["background_treatment"]>][],
  );

  // L9-render と完全同じ引数 (userInstructions, bibleTier, episodeNo 一切渡さず)
  const { prompt: l9like } = composePagePrompt({
    page: sbPage,
    packet,
    bible,
    pageDimensions: { width: 1748, height: 2480 },
    pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
    pagePlanPage: planPage,
    compliance,
    scene: sceneByPage.get(TARGET_PAGE),
  });

  // dump-prompts.ts と同じ引数 (bibleTier=minimal, episodeNo=1)
  const { prompt: dumplike } = composePagePrompt({
    page: sbPage,
    packet,
    bible,
    pageDimensions: { width: 1748, height: 2480 },
    pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
    pagePlanPage: planPage,
    compliance,
    scene: sceneByPage.get(TARGET_PAGE),
    episodeNo: EPISODE,
    bibleTier: "minimal",
  });

  const outDir = path.resolve("data/manga/works/a07-modern-dungeon/episodes/ep01/_analysis/prompts");
  await fs.writeFile(path.join(outDir, "_l9like.txt"), l9like, "utf-8");
  await fs.writeFile(path.join(outDir, "_dumplike.txt"), dumplike, "utf-8");

  console.log("l9like length:", l9like.length);
  console.log("dumplike length:", dumplike.length);
  console.log("identical:", l9like === dumplike);

  if (l9like !== dumplike) {
    // 行単位で最初の差分箇所を出す
    const aLines = l9like.split("\n");
    const bLines = dumplike.split("\n");
    for (let i = 0; i < Math.max(aLines.length, bLines.length); i++) {
      if (aLines[i] !== bLines[i]) {
        console.log(`first diff at line ${i + 1}:`);
        console.log(`  l9like:   ${aLines[i]?.slice(0, 160)}`);
        console.log(`  dumplike: ${bLines[i]?.slice(0, 160)}`);
        break;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
