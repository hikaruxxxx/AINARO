/**
 * Baseline hatching 検証 v9 (検証 4: 複数ページ、v46 同条件再現):
 *   p3 (集中線多発), p4 (二重描画) を各 2 枚、live composePagePrompt で生成。
 *   storyboard は事前に pre-codex-compressed-marshmallow.bak に復元済。
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateMangaImage } from "../../src/lib/manga/generate/codex-image";
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
const TARGET_PAGES = [3, 4];

async function genOne(idx: number, targetPage: number) {
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

  const sbPage = storyboard.pages.find((p) => p.page_no === targetPage)!;
  const planPage = pagePlan.pages.find((p) => p.page_no === targetPage)!;
  const packet = resolved.packets[`page_${targetPage}`];
  const pageBgMap = new Map(
    planPage.panels
      .map((pp) => [pp.panel_id, pp.background_treatment])
      .filter(([, v]) => v !== undefined) as [string, NonNullable<typeof planPage.panels[0]["background_treatment"]>][],
  );

  const { prompt, refImagePaths } = composePagePrompt({
    page: sbPage,
    packet,
    bible,
    pageDimensions: { width: 1748, height: 2480 },
    pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
    pagePlanPage: planPage,
    compliance,
    scene: sceneByPage.get(targetPage),
  });
  console.log(`[live p${targetPage} v0${idx}] prompt: ${prompt.length}, refs: ${refImagePaths.length}`);

  const OUT = path.resolve(
    `data/manga/works/${SLUG}/episodes/ep01/renders/_baseline_live_real_p${String(targetPage).padStart(2, "0")}_v0${idx}.png`,
  );
  const res = await generateMangaImage({
    prompt,
    outputPath: OUT,
    size: { width: 1024, height: 1536 },
    referenceImagePaths: refImagePaths,
    timeoutMs: 15 * 60 * 1000,
    maxRetries: 1,
    ledgerContext: { slug: SLUG, episode: EPISODE, layer: "render", page: targetPage },
  });
  console.log(`[live p${targetPage} v0${idx}] DONE size=${res.sizeBytes}`);
}

async function main() {
  for (const pageNo of TARGET_PAGES) {
    for (let i = 1; i <= 2; i++) {
      await genOne(i, pageNo);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
