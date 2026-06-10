/**
 * Debug script: 指定 page の composePagePrompt 出力 (AI に送る prompt 全文) を file 保存する。
 *
 * 使い方:
 *   node --import tsx scripts/manga/_debug-dump-prompt.mts \
 *     --slug a07-modern-dungeon --episode 1 --page 17 --out /tmp/p17-prompt.txt
 *
 * AI に送られる prompt の内容を直接見るためのデバッグ用途。
 * generateMangaImage は呼ばないので Pro 枠消費なし。
 */
import "./_env";
import { promises as fs } from "node:fs";
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
import type { SceneGraphV1, Scene } from "../../src/lib/manga/scene-graph/schema";
import { isSceneGraphV1 } from "../../src/lib/manga/scene-graph/schema";

type Args = { slug: string; episode: number; page: number; out?: string };

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(.+)$/);
    if (!m) continue;
    const key = m[1];
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "page") a.page = Number(val);
    else if (key === "out") a.out = val;
    i++;
  }
  if (!a.slug || !a.episode || !a.page) throw new Error("--slug --episode --page required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const resolved = JSON.parse(await fs.readFile(resolvedRefsPath(args.slug, args.episode), "utf-8")) as ResolvedRefs;
  const compliance = { blocklist: await loadBlocklist(), fp: await loadFalsePositives() };

  let scene: Scene | undefined;
  try {
    const sgRaw = JSON.parse(await fs.readFile(sceneGraphPath(args.slug, args.episode), "utf-8")) as unknown;
    if (isSceneGraphV1(sgRaw)) {
      const sg: SceneGraphV1 = sgRaw;
      for (const s of sg.scenes) {
        if (args.page >= s.page_range.start && args.page <= s.page_range.end) {
          scene = s;
          break;
        }
      }
    }
  } catch { /* scene_graph 任意 */ }

  const sbPage = storyboard.pages.find((p) => p.page_no === args.page);
  const planPage = pagePlan.pages.find((p) => p.page_no === args.page);
  if (!sbPage || !planPage) throw new Error(`page ${args.page} not found`);

  const packet = resolved.packets[`page_${args.page}`];
  if (!packet) throw new Error(`packet for page_${args.page} not found`);

  const pageBgMap = new Map(
    planPage.panels.map((pp) => [pp.panel_id, pp.background_treatment])
      .filter(([, v]) => v !== undefined) as [string, NonNullable<typeof planPage.panels[0]["background_treatment"]>][]
  );

  const { prompt, refImagePaths } = composePagePrompt({
    page: sbPage,
    packet,
    bible,
    pageDimensions: { width: 1748, height: 2480 },
    pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
    pagePlanPage: planPage,
    compliance,
    scene,
  });

  const out = args.out ?? `/tmp/prompt-${args.slug}-ep${args.episode}-p${args.page}.txt`;
  const header = [
    `=== composePagePrompt output ===`,
    `slug: ${args.slug}  episode: ${args.episode}  page: ${args.page}`,
    `refImagePaths: ${refImagePaths.length} 個`,
    refImagePaths.map((p, i) => `  [${i}] ${p}`).join("\n"),
    `prompt length: ${prompt.length} chars / 約 ${Math.round(prompt.length / 4)} tokens 概算`,
    `===============================`,
    "",
    prompt,
  ].join("\n");
  await fs.writeFile(out, header, "utf-8");
  console.log(`[debug-dump] wrote ${prompt.length} chars to ${out}`);
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
