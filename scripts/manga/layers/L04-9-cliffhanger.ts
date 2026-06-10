/**
 * L4.9 Cliffhanger Architect CLI (Phase Y WY-3)
 *
 * storyboard.json (L4 出力 or L4.1 適用後) を入力に、last_page を引きパターンに従って再設計する。
 * pull_link を EpisodeStoryboardV2 に注入し、次話 opening_hook (L4.1) との連携を可能にする。
 *
 * Usage:
 *   # 提案生成のみ
 *   npx tsx scripts/manga/layers/L04-9-cliffhanger.ts --slug a07-modern-dungeon --episode 1 --volume-position early
 *
 *   # 推奨案で storyboard.json を直接マージ
 *   npx tsx scripts/manga/layers/L04-9-cliffhanger.ts --slug a07-modern-dungeon --episode 10 --volume-position volume_end --apply-recommendation
 *
 *   # 提案数を制御 (default 3)
 *   npx tsx scripts/manga/layers/L04-9-cliffhanger.ts --slug a07-modern-dungeon --episode 1 --max-proposals 2
 *
 * volume-position の決定:
 *   - early: ep1-3 (1巻前半)
 *   - mid: ep4-7 (1巻中盤)
 *   - late: ep8-9 (1巻後半)
 *   - volume_end: ep10 (1巻末) — last_episode は別扱い
 */
import "../_env";
import { promises as fs } from "node:fs";
import {
  bibleSnapshotPath,
  episodeBriefV2Path,
  sceneGraphPath,
  storyboardPath,
} from "./_paths";
import {
  generateCliffhangerProposals,
  loadCliffhangerPatterns,
  mergeCliffhangerProposalIntoStoryboard,
  saveCliffhangerAlts,
} from "../../../src/lib/manga/cliffhanger/cliffhanger-architect";
import { regenerateCliffhangerScene } from "../../../src/lib/manga/scene-graph/scene-swap";
import { DEFAULT_SCORING_CONFIG } from "../../../src/lib/manga/scene-graph/scoring-loop";
import {
  isSceneGraphV1,
  type SceneGraphV1,
} from "../../../src/lib/manga/scene-graph/schema";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
} from "../../../src/lib/manga/schemas-v2";

type VolumePosition = "early" | "mid" | "late" | "volume_end";

type Args = {
  slug: string;
  episode: number;
  volumePosition: VolumePosition;
  applyRecommendation: boolean;
  maxProposals: number;
  fromSceneGraph: boolean;
  pattern: string | null;
  live: boolean;
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    applyRecommendation: false,
    maxProposals: 3,
    fromSceneGraph: false,
    pattern: null,
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
    else if (key === "volume-position") a.volumePosition = val as VolumePosition;
    else if (key === "max-proposals") a.maxProposals = Number(val);
    else if (key === "pattern") a.pattern = val ?? null;
  }
  if (!a.slug) throw new Error("--slug=<slug> is required");
  if (!Number.isInteger(a.episode) || (a.episode ?? 0) <= 0)
    throw new Error("--episode=<N> is required");
  if (!a.volumePosition) {
    // 自動推定: 1-3=early, 4-7=mid, 8-9=late, 10=volume_end (1巻10話前提)
    if (a.episode! <= 3) a.volumePosition = "early";
    else if (a.episode! <= 7) a.volumePosition = "mid";
    else if (a.episode! <= 9) a.volumePosition = "late";
    else a.volumePosition = "volume_end";
    console.log(`[L4.9] volume-position 自動推定: ep${a.episode} → ${a.volumePosition}`);
  }
  if (
    a.volumePosition !== "early" &&
    a.volumePosition !== "mid" &&
    a.volumePosition !== "late" &&
    a.volumePosition !== "volume_end"
  ) {
    throw new Error("--volume-position must be early|mid|late|volume_end");
  }
  return a as Args;
}

async function readJson<T>(p: string): Promise<T> {
  const buf = await fs.readFile(p, "utf-8");
  return JSON.parse(buf) as T;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[L4.9] cliffhanger-architect start: slug=${args.slug} episode=${args.episode} volume_position=${args.volumePosition} mode=${args.fromSceneGraph ? "scene-graph" : "panel-level"}`,
  );

  if (args.fromSceneGraph) {
    await runSceneGraphMode(args);
    return;
  }

  const bible = await readJson<BibleSnapshotV2>(bibleSnapshotPath(args.slug));
  const sbPath = storyboardPath(args.slug, args.episode);
  const storyboard = await readJson<EpisodeStoryboardV2>(sbPath);

  const bank = await loadCliffhangerPatterns();
  console.log(`[L4.9] patterns loaded: ${bank.patterns.length} patterns`);

  const output = await generateCliffhangerProposals({
    bible,
    storyboard,
    volumePosition: args.volumePosition,
    patternsBank: bank,
    maxProposals: args.maxProposals,
  });

  console.log(`[L4.9] proposals generated: ${output.proposals.length}`);
  for (const p of output.proposals) {
    console.log(`  - ${p.pattern_id} (${p.pattern_name}): ${p.expected_effect}`);
    console.log(`    next_opening_hook_hint: ${p.pull_link.next_opening_hook_hint}`);
  }
  console.log(`[L4.9] recommendation: ${output.recommendation.pattern_id}`);

  // _cliffhanger_alts/ に提案を保管
  const altPath = await saveCliffhangerAlts({
    slug: args.slug,
    episode: args.episode,
    output,
  });
  console.log(`[L4.9] proposals saved: ${altPath}`);

  // --apply-recommendation で直接マージ
  if (args.applyRecommendation) {
    const recommended = output.proposals.find(
      (p) => p.pattern_id === output.recommendation.pattern_id,
    );
    if (!recommended) {
      console.error(
        `[L4.9] WARN: recommendation pattern_id ${output.recommendation.pattern_id} が proposals に見つからない、適用スキップ`,
      );
    } else {
      const backupPath = `${sbPath}.pre-l4-9-cliffhanger.backup`;
      try {
        await fs.access(backupPath);
        console.log(`[L4.9] backup 既存、スキップ: ${backupPath}`);
      } catch {
        await fs.copyFile(sbPath, backupPath);
        console.log(`[L4.9] backup: ${backupPath}`);
      }

      const merged = mergeCliffhangerProposalIntoStoryboard(storyboard, recommended);
      await fs.writeFile(sbPath, JSON.stringify(merged, null, 2), "utf-8");
      console.log(
        `[L4.9] storyboard.json updated with pattern ${recommended.pattern_id} + pull_link 注入`,
      );
    }
  } else {
    console.log(
      `[L4.9] proposals だけ生成済 (storyboard 未変更)。--apply-recommendation で推奨案を直接マージ可`,
    );
  }
}

async function runSceneGraphMode(args: Args): Promise<void> {
  const sgPath = sceneGraphPath(args.slug, args.episode);
  const sgRaw = await readJson<unknown>(sgPath);
  if (!isSceneGraphV1(sgRaw)) {
    throw new Error(`[L4.9] scene_graph.json is not a valid SceneGraphV1: ${sgPath}`);
  }
  const sceneGraph = sgRaw as SceneGraphV1;
  const patternId = args.pattern ?? "ability_or_identity_glimpse"; // a07-ep01 デフォルト

  console.log(
    `[L4.9] scene-graph cliff swap: pattern=${patternId} live=${args.live}`
  );

  const result = await regenerateCliffhangerScene(
    sceneGraph,
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
    `[L4.9] swap done: scenes=${result.scene_graph.scenes.length} candidates_per_scene=${result.candidates_per_scene}`
  );

  if (args.applyRecommendation) {
    const backupPath = `${sgPath}.pre-l4-9-cliffhanger.backup`;
    try {
      await fs.access(backupPath);
      console.log(`[L4.9] backup 既存、スキップ: ${backupPath}`);
    } catch {
      await fs.copyFile(sgPath, backupPath);
      console.log(`[L4.9] backup: ${backupPath}`);
    }
    await fs.writeFile(sgPath, JSON.stringify(result.scene_graph, null, 2), "utf-8");
    console.log(`[L4.9] scene_graph.json updated (cliff pattern=${patternId})`);
  } else {
    console.log(
      `[L4.9] dry-run: scene_graph.json was NOT written. --apply-recommendation で書き戻し。`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
