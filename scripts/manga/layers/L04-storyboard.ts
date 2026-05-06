/**
 * L4 Storyboard
 *
 * 二系統:
 *   従来: shotlist.json + bible/snapshot.json → storyboard.json (LLM 生成)
 *   新方式 (Phase β B5-5): scene_graph.json + bible/snapshot.json → storyboard.json (決定論)
 *
 * Usage:
 *   従来:    npx tsx scripts/manga/layers/L04-storyboard.ts --slug a07-modern-dungeon --episode 1
 *   新方式:  npx tsx scripts/manga/layers/L04-storyboard.ts --slug a07-modern-dungeon --episode 1 --from-scene-graph
 *   dry-run: 上記に --dry-run を加えると、storyboard.json を上書きせず stdout サマリーのみ出力
 */
import "../_env";
import { promises as fs } from "node:fs";
import {
  bibleSnapshotPath,
  shotlistPath,
  sceneGraphPath,
  storyboardPath,
  episodeDir,
} from "./_paths";
import {
  extractStoryboardFromShotlist,
  validateStoryboardEntityBinding,
} from "../../../src/lib/manga/storyboard-v2/storyboard-extractor";
import { buildStoryboardFromSceneGraph, enrichStoryboardWithLLM } from "../../../src/lib/manga/scene-graph/storyboard-from-scenes";
import {
  validatePanelSceneInheritance,
  isSceneGraphV1,
  type SceneGraphV1,
  type StoryboardLikeShape,
} from "../../../src/lib/manga/scene-graph/schema";
import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../../../src/lib/manga/schemas-v2";
import type { ShotlistV2 } from "../../../src/lib/manga/shotlist-v2/scene-extractor";

type Args = {
  slug: string;
  episode: number;
  fromSceneGraph: boolean;
  dryRun: boolean;
  enrich: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = { fromSceneGraph: false, dryRun: false, enrich: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from-scene-graph") { a.fromSceneGraph = true; continue; }
    if (arg === "--dry-run") { a.dryRun = true; continue; }
    if (arg === "--enrich") { a.enrich = true; continue; }
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
  }
  if (!a.slug || !a.episode) throw new Error("--slug and --episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  console.log(`[L04] slug=${args.slug} ep=${args.episode} mode=${args.fromSceneGraph ? "scene-graph" : "shotlist"} dry-run=${args.dryRun}`);

  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;

  let storyboard: EpisodeStoryboardV2;
  if (args.fromSceneGraph) {
    // Phase β B5-5 新方式: scene-graph から決定論的に storyboard を組む
    const sgRaw = JSON.parse(await fs.readFile(sceneGraphPath(args.slug, args.episode), "utf-8"));
    if (!isSceneGraphV1(sgRaw)) {
      console.error(`[L04] scene_graph.json is not a valid SceneGraphV1`);
      process.exit(2);
    }
    const sceneGraph = sgRaw as SceneGraphV1;
    storyboard = buildStoryboardFromSceneGraph(sceneGraph, bible);

    // panel-scene 継承検査 (B5-1) を兼ねる
    const inheritance = validatePanelSceneInheritance(
      storyboard as unknown as StoryboardLikeShape,
      sceneGraph
    );
    if (!inheritance.ok) {
      console.error(`[L04] panel-scene inheritance FAILED:\n${inheritance.errors.join("\n")}`);
      process.exit(2);
    }

    // B5-5b: --enrich で Codex CLI 経由で panel 詳細を本番文化
    if (args.enrich) {
      console.log(`[L04] enriching panel details via Codex CLI (${sceneGraph.scenes.length} scenes)...`);
      const enrichStart = Date.now();
      storyboard = await enrichStoryboardWithLLM(storyboard, sceneGraph);
      console.log(`[L04] enrich done in ${((Date.now() - enrichStart) / 1000).toFixed(1)}s`);
    }
  } else {
    // 従来: shotlist + LLM 抽出
    const shotlist = JSON.parse(await fs.readFile(shotlistPath(args.slug, args.episode), "utf-8")) as ShotlistV2;
    storyboard = await extractStoryboardFromShotlist({
      bible,
      shotlist,
      panelsPerPageRange: { min: 4, max: 7 },
      avgPanelsPerPage: 5,
    });
  }

  // entity binding (location_id / character_id / prop_id) を共通検査
  const v = validateStoryboardEntityBinding(storyboard, bible);
  if (!v.ok) {
    console.error(`[L04] VALIDATION FAILED:\n${v.errors.join("\n")}`);
    process.exit(2);
  }

  const totalPanels = storyboard.pages.reduce((n, p) => n + p.panels.length, 0);
  if (args.dryRun) {
    console.log(`[L04] DRY-RUN: pages=${storyboard.total_pages} total_panels=${totalPanels}`);
    console.log(`[L04] DRY-RUN: storyboard.json was NOT written.`);
  } else {
    await fs.mkdir(episodeDir(args.slug, args.episode), { recursive: true });
    await fs.writeFile(storyboardPath(args.slug, args.episode), JSON.stringify(storyboard, null, 2));
    console.log(`[L04] DONE: ${storyboardPath(args.slug, args.episode)}`);
    console.log(`[L04] pages=${storyboard.total_pages} total_panels=${totalPanels}`);
  }
}

main().catch((e) => { console.error("[L04] FAILED:", e); process.exit(1); });
