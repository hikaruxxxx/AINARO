/**
 * prompt-composer-v2 が生成する実プロンプトを a07 ep01 全ページで dump し、
 * セクション別文字数を集計するアドホック分析ツール。
 *
 * 使い方:
 *   npx tsx scripts/manga/analysis/dump-prompts.ts --slug a07-modern-dungeon --episode 1
 *
 * 出力:
 *   data/manga/works/<slug>/episodes/ep<NN>/_analysis/prompts/
 *     - page_NN.prompt.txt   各ページの生 prompt
 *     - summary.json         page 別の total + section 別文字数 + 全体統計
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  bibleSnapshotPath,
  storyboardPath,
  pagePlanPath,
  sceneGraphPath,
  resolvedRefsPath,
} from "../layers/_paths";

import { composePagePrompt } from "../../../src/lib/manga/render-v2/prompt-composer-v2";
import { loadBlocklist, loadFalsePositives } from "../../../src/lib/manga/compliance/scanner";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
  PagePlanV2,
  ResolvedRefs,
} from "../../../src/lib/manga/schemas-v2";
import type { SceneGraphV1, Scene } from "../../../src/lib/manga/scene-graph/schema";
import { isSceneGraphV1 } from "../../../src/lib/manga/scene-graph/schema";

type Args = { slug: string; episode: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const slug = get("--slug");
  const episodeStr = get("--episode");
  if (!slug || !episodeStr) {
    console.error("Usage: dump-prompts.ts --slug <slug> --episode <N>");
    process.exit(1);
  }
  return { slug, episode: Number(episodeStr) };
}

const SECTION_HEADERS = [
  "# PAGE",
  "## STYLE",
  "## REFERENCES",
  "## LAYOUT",
  "## SCENE",
  "## CONTINUITY",
  "## PANELS",
  // 2026-06-10 v57 semifree 形式の新セクション
  "## LINES",
  "## DIRECTION",
  "## BIBLE FACTS",
  "## EDITOR",
  "## CONSTRAINTS",
] as const;
type SectionHeader = typeof SECTION_HEADERS[number];

/** prompt を section header で分割し、各 section の文字数を返す */
function splitSections(prompt: string): Record<SectionHeader, number> {
  const lines = prompt.split("\n");
  const result: Record<string, number> = {};
  for (const h of SECTION_HEADERS) result[h] = 0;
  let current: SectionHeader | null = null;
  for (const line of lines) {
    // semifree は "## SCENE (what happens on this page)" のように括弧付き注記が
    // 付くため、完全一致に加えて "<header> (" の前方一致も許容する
    const matched = SECTION_HEADERS.find((h) => line === h || line.startsWith(`${h} (`));
    if (matched) {
      current = matched;
      result[current] += line.length + 1; // 行末改行込み
      continue;
    }
    if (current) {
      result[current] += line.length + 1;
    }
  }
  return result as Record<SectionHeader, number>;
}

function stats(nums: number[]): {
  min: number; max: number; mean: number; median: number; p90: number;
} {
  if (nums.length === 0) return { min: 0, max: 0, mean: 0, median: 0, p90: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  return { min: sorted[0], max: sorted[sorted.length - 1], mean: Math.round(mean), median, p90 };
}

async function main() {
  const args = parseArgs();
  const epPad = String(args.episode).padStart(2, "0");
  const outDir = path.join(
    "data", "manga", "works", args.slug, "episodes", `ep${epPad}`, "_analysis", "prompts",
  );
  await fs.mkdir(outDir, { recursive: true });

  console.log(`[dump-prompts] slug=${args.slug} ep=${args.episode}`);
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const storyboard = JSON.parse(await fs.readFile(storyboardPath(args.slug, args.episode), "utf-8")) as EpisodeStoryboardV2;
  const pagePlan = JSON.parse(await fs.readFile(pagePlanPath(args.slug, args.episode), "utf-8")) as PagePlanV2;
  const resolved = JSON.parse(await fs.readFile(resolvedRefsPath(args.slug, args.episode), "utf-8")) as ResolvedRefs;
  const compliance = { blocklist: await loadBlocklist(), fp: await loadFalsePositives() };

  const sceneByPage = new Map<number, Scene>();
  try {
    const sgRaw = JSON.parse(await fs.readFile(sceneGraphPath(args.slug, args.episode), "utf-8")) as unknown;
    if (isSceneGraphV1(sgRaw)) {
      const sg: SceneGraphV1 = sgRaw;
      for (const scene of sg.scenes) {
        for (let p = scene.page_range.start; p <= scene.page_range.end; p++) {
          if (!sceneByPage.has(p)) sceneByPage.set(p, scene);
        }
      }
    }
  } catch {
    console.warn("[dump-prompts] scene_graph 不在");
  }

  const sbPagesByNo = new Map(storyboard.pages.map((p) => [p.page_no, p]));

  const pageEntries: Array<{
    page_no: number;
    total_chars: number;
    over_8000: boolean;
    sections: Record<SectionHeader, number>;
    tierUsed?: string;
    panel_count: number;
    render_strategy: string;
  }> = [];

  for (const planPage of pagePlan.pages) {
    if (planPage.render_strategy !== "page_one_shot") continue;
    const sbPage = sbPagesByNo.get(planPage.page_no);
    if (!sbPage) continue;
    const packet = resolved.packets[`page_${planPage.page_no}`];
    if (!packet) {
      console.warn(`[dump-prompts] packet missing for page ${planPage.page_no}, skip`);
      continue;
    }
    const pageBgMap = new Map(
      planPage.panels
        .map((pp) => [pp.panel_id, pp.background_treatment])
        .filter(([, v]) => v !== undefined) as [string, NonNullable<typeof planPage.panels[0]["background_treatment"]>][],
    );

    const { prompt, tierUsed } = composePagePrompt({
      page: sbPage,
      packet,
      bible,
      pageDimensions: { width: 1748, height: 2480 },
      pageBackgroundTreatments: pageBgMap.size > 0 ? pageBgMap : undefined,
      pagePlanPage: planPage,
      compliance,
      scene: sceneByPage.get(planPage.page_no),
      episodeNo: args.episode,
      bibleTier: "minimal",
    });

    const outPath = path.join(outDir, `page_${String(planPage.page_no).padStart(2, "0")}.prompt.txt`);
    await fs.writeFile(outPath, prompt, "utf-8");

    const sections = splitSections(prompt);
    pageEntries.push({
      page_no: planPage.page_no,
      total_chars: prompt.length,
      over_8000: prompt.length > 8000,
      sections,
      tierUsed,
      panel_count: sbPage.panels.length,
      render_strategy: planPage.render_strategy,
    });
    console.log(`[dump-prompts] p${planPage.page_no}: ${prompt.length} chars (${sbPage.panels.length} panels, tier=${tierUsed})`);
  }

  const totals = pageEntries.map((e) => e.total_chars);
  const overCount = pageEntries.filter((e) => e.over_8000).length;
  const sectionStatsAcrossPages: Record<SectionHeader, ReturnType<typeof stats>> =
    Object.fromEntries(
      SECTION_HEADERS.map((h) => [
        h,
        stats(pageEntries.map((e) => e.sections[h])),
      ]),
    ) as Record<SectionHeader, ReturnType<typeof stats>>;

  const summary = {
    schema_version: 1,
    slug: args.slug,
    episode: args.episode,
    generated_at: new Date().toISOString(),
    page_count: pageEntries.length,
    over_8000_count: overCount,
    total_chars_stats: stats(totals),
    section_chars_stats: sectionStatsAcrossPages,
    pages: pageEntries,
  };
  const summaryPath = path.join(outDir, "summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`\n[dump-prompts] wrote ${pageEntries.length} prompts + summary.json`);
  console.log(`[dump-prompts] total_chars stats: ${JSON.stringify(summary.total_chars_stats)}`);
  console.log(`[dump-prompts] over_8000: ${overCount}/${pageEntries.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
