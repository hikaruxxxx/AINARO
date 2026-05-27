/**
 * Baseline hatching 検証 v8 (検証 3B: composePagePrompt をライブで呼ぶ):
 *   v01-v04 は dump 済 prompt + 手書き refs で hatching が出なかった。
 *   L9-render は composePagePrompt の戻り値 (prompt + refImagePaths) を**そのまま**渡す。
 *   このスクリプトはその経路を完全再現する。
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
const TARGET_PAGE = 10;

async function genOne(idx: number) {
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

  // L9-render と完全同じ引数
  const { prompt, refImagePaths } = composePagePrompt({
    page: sbPage,
    packet,
    bible,
    pageDimensions: { width: 1748, height: 2480 },
    pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
    pagePlanPage: planPage,
    compliance,
    scene: sceneByPage.get(TARGET_PAGE),
  });
  console.log(`[live v0${idx}] prompt length: ${prompt.length}, refs: ${refImagePaths.length}`);
  console.log(`[live v0${idx}] refImagePaths order:`, refImagePaths.map((p) => path.basename(p)));

  const OUT = path.resolve(
    `data/manga/works/${SLUG}/episodes/ep01/renders/_baseline_live_real_v0${idx}.png`,
  );
  const res = await generateMangaImage({
    prompt,
    outputPath: OUT,
    size: { width: 1024, height: 1536 },
    referenceImagePaths: refImagePaths,
    timeoutMs: 15 * 60 * 1000,
    maxRetries: 1,
    ledgerContext: { slug: SLUG, episode: EPISODE, layer: "render", page: TARGET_PAGE },
  });
  console.log(`[live v0${idx}] DONE`, res);
}

async function main() {
  for (let i = 1; i <= 2; i++) {
    await genOne(i);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
