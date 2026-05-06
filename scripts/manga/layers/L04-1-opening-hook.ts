/**
 * L4.1 Opening Hook 編集パス CLI
 *
 * 二系統:
 *   従来 (Phase Y WY-1): storyboard.json の pages[0..2] を panel-level で再生成。
 *     mergeHookProposalIntoStoryboard で panel を上書き。Phase β B5-2 で deprecated 移行中。
 *   新方式 (Phase β B5-2): scene_graph.json の S01-S02 を scene swap で再生成。
 *     scene-graph 上で swap → L4 が後段で panel を再展開する設計。
 *
 * Usage:
 *   従来:
 *     npx tsx scripts/manga/layers/L04-1-opening-hook.ts --slug a07-modern-dungeon --episode 1
 *     npx tsx scripts/manga/layers/L04-1-opening-hook.ts --slug a07-modern-dungeon --episode 1 --apply-recommendation
 *
 *   新方式 (scene swap):
 *     npx tsx scripts/manga/layers/L04-1-opening-hook.ts --slug a07-modern-dungeon --episode 1 --from-scene-graph
 *     npx tsx scripts/manga/layers/L04-1-opening-hook.ts --slug X --episode 1 --from-scene-graph --pattern P1_daily_anomaly --scene-range S01-S02 --live --apply-recommendation
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  episodeBriefV2Path,
  sceneGraphPath,
  storyboardPath,
  volumeDir,
} from "./_paths";
import {
  generateOpeningHookProposals,
  loadOpeningHookPatterns,
  mergeHookProposalIntoStoryboard,
  saveOpeningHookAlts,
} from "../../../src/lib/manga/opening-hook/opening-hook-pass";
import { regenerateOpeningHookScenes } from "../../../src/lib/manga/scene-graph/scene-swap";
import { DEFAULT_SCORING_CONFIG } from "../../../src/lib/manga/scene-graph/scoring-loop";
import {
  isSceneGraphV1,
  type SceneGraphV1,
} from "../../../src/lib/manga/scene-graph/schema";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
} from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode: number;
  applyRecommendation: boolean;
  maxProposals: number;
  fromSceneGraph: boolean;
  pattern: string | null;
  sceneRange: string | null;
  live: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    applyRecommendation: false,
    maxProposals: 3,
    fromSceneGraph: false,
    pattern: null,
    sceneRange: null,
    live: false,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else if (arg === "--apply-recommendation") {
      a.applyRecommendation = true;
      continue;
    } else if (arg === "--from-scene-graph") {
      a.fromSceneGraph = true;
      continue;
    } else if (arg === "--live") {
      a.live = true;
      continue;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key) continue;
    if (key === "slug") a.slug = val ?? "";
    else if (key === "episode") a.episode = Number(val);
    else if (key === "max-proposals") a.maxProposals = Number(val);
    else if (key === "pattern") a.pattern = val ?? null;
    else if (key === "scene-range") a.sceneRange = val ?? null;
  }
  if (!a.slug) throw new Error("--slug=<slug> is required");
  if (!Number.isInteger(a.episode) || (a.episode ?? 0) <= 0)
    throw new Error("--episode=<N> is required");
  return a as Args;
}

function parseSceneRangeArg(spec: string | null, sceneGraph: SceneGraphV1): { start_scene_id: string; end_scene_id: string } {
  if (!spec) {
    // デフォルト: 最初の 2 scene
    const first = sceneGraph.scenes[0];
    const second = sceneGraph.scenes[1] ?? first;
    return { start_scene_id: first.scene_id, end_scene_id: second.scene_id };
  }
  const m = spec.match(/^(S\d+)-(S\d+)$/);
  if (!m) throw new Error(`--scene-range は "S01-S02" 形式で指定してください: 受信 "${spec}"`);
  return { start_scene_id: m[1], end_scene_id: m[2] };
}

async function readJson<T>(p: string): Promise<T> {
  const buf = await fs.readFile(p, "utf-8");
  return JSON.parse(buf) as T;
}

async function readVolumePlot(slug: string): Promise<{ cliffhanger_hook?: string }> {
  // 簡易: vol_01 の plot.json から ep1 の cliffhanger_hook を取得
  const plotPath = path.join(volumeDir(slug, 1), "plot.json");
  try {
    const plot = await readJson<{
      episodes?: Array<{ episode_no: number; cliffhanger_hook?: string }>;
    }>(plotPath);
    const ep1 = plot.episodes?.find((e) => e.episode_no === 1);
    return { cliffhanger_hook: ep1?.cliffhanger_hook };
  } catch {
    return {};
  }
}

async function main() {
  const args = parseArgs();
  console.log(
    `[L4.1] opening-hook-pass start: slug=${args.slug} episode=${args.episode} mode=${args.fromSceneGraph ? "scene-graph" : "panel-level"}`
  );

  if (args.fromSceneGraph) {
    await runSceneGraphMode(args);
    return;
  }

  const bible = await readJson<BibleSnapshotV2>(bibleSnapshotPath(args.slug));
  const sbPath = storyboardPath(args.slug, args.episode);
  const storyboard = await readJson<EpisodeStoryboardV2>(sbPath);
  const { cliffhanger_hook } = await readVolumePlot(args.slug);

  const bank = await loadOpeningHookPatterns();
  console.log(`[L4.1] patterns loaded: ${bank.patterns.length} patterns`);

  const output = await generateOpeningHookProposals({
    bible,
    storyboard,
    cliffhangerHook: cliffhanger_hook,
    patternsBank: bank,
    maxProposals: args.maxProposals,
  });

  console.log(`[L4.1] proposals generated: ${output.proposals.length}`);
  for (const p of output.proposals) {
    console.log(`  - ${p.pattern_id} (${p.pattern_name}): ${p.expected_effect}`);
  }
  console.log(`[L4.1] recommendation: ${output.recommendation.pattern_id}`);

  // _opening_alts/ に提案を保管
  const altPath = await saveOpeningHookAlts({
    slug: args.slug,
    episode: args.episode,
    output,
  });
  console.log(`[L4.1] proposals saved: ${altPath}`);

  // --apply-recommendation で直接マージ
  if (args.applyRecommendation) {
    const recommended = output.proposals.find(
      (p) => p.pattern_id === output.recommendation.pattern_id,
    );
    if (!recommended) {
      console.error(
        `[L4.1] WARN: recommendation pattern_id ${output.recommendation.pattern_id} が proposals に見つからない、適用スキップ`,
      );
    } else {
      // バックアップ作成
      const backupPath = `${sbPath}.pre-l4-1-hook.backup`;
      try {
        await fs.access(backupPath);
        console.log(`[L4.1] backup 既存、スキップ: ${backupPath}`);
      } catch {
        await fs.copyFile(sbPath, backupPath);
        console.log(`[L4.1] backup: ${backupPath}`);
      }

      const merged = mergeHookProposalIntoStoryboard(storyboard, recommended);
      await fs.writeFile(sbPath, JSON.stringify(merged, null, 2), "utf-8");
      console.log(`[L4.1] storyboard.json updated with pattern ${recommended.pattern_id}`);
    }
  } else {
    console.log(
      `[L4.1] proposals だけ生成済 (storyboard 未変更)。--apply-recommendation で推奨案を直接マージ可`,
    );
  }
}

async function runSceneGraphMode(args: Args): Promise<void> {
  const sgPath = sceneGraphPath(args.slug, args.episode);
  const sgRaw = await readJson<unknown>(sgPath);
  if (!isSceneGraphV1(sgRaw)) {
    throw new Error(`[L4.1] scene_graph.json is not a valid SceneGraphV1: ${sgPath}`);
  }
  const sceneGraph = sgRaw as SceneGraphV1;
  const range = parseSceneRangeArg(args.sceneRange, sceneGraph);
  const patternId = args.pattern ?? "P1_daily_anomaly"; // selection_guide のデフォルト

  console.log(
    `[L4.1] scene-graph swap: range=${range.start_scene_id}-${range.end_scene_id} pattern=${patternId} live=${args.live}`
  );

  const result = await regenerateOpeningHookScenes(
    sceneGraph,
    range,
    patternId,
    {
      slug: args.slug,
      episode: args.episode,
      bibleSnapshotPath: bibleSnapshotPath(args.slug),
      briefPath: episodeBriefV2Path(args.slug, args.episode),
      finalizedScenes: [],
    },
    {
      ...DEFAULT_SCORING_CONFIG,
      dry_run: !args.live,
    }
  );

  console.log(
    `[L4.1] swap done: scenes=${result.scene_graph.scenes.length} candidates_per_scene=${result.candidates_per_scene}`
  );

  if (args.applyRecommendation) {
    const backupPath = `${sgPath}.pre-l4-1-hook.backup`;
    try {
      await fs.access(backupPath);
      console.log(`[L4.1] backup 既存、スキップ: ${backupPath}`);
    } catch {
      await fs.copyFile(sgPath, backupPath);
      console.log(`[L4.1] backup: ${backupPath}`);
    }
    await fs.writeFile(sgPath, JSON.stringify(result.scene_graph, null, 2), "utf-8");
    console.log(`[L4.1] scene_graph.json updated (pattern=${patternId})`);
  } else {
    console.log(
      `[L4.1] dry-run: scene_graph.json was NOT written. --apply-recommendation で書き戻し。`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
