/**
 * L4.1 Opening Hook 編集パス CLI (Phase Y WY-1)
 *
 * storyboard.json (L4 出力) を入力に、pages[0..2] のみを掴みパターン辞書に従って再生成する。
 * 提案 (HookProposal) は data/manga/works/{slug}/episodes/ep{NN}/_opening_alts/ に保管。
 * 採用判定は別途 Console UI (Phase Y WY-7 商品ページOS) または手動で。
 *
 * Usage:
 *   # 提案生成のみ (storyboard.json は変更しない)
 *   npx tsx scripts/manga/layers/L04-1-opening-hook.ts --slug a07-modern-dungeon --episode 1
 *
 *   # 推奨案で storyboard.json を直接マージ (--apply-recommendation)
 *   npx tsx scripts/manga/layers/L04-1-opening-hook.ts --slug a07-modern-dungeon --episode 1 --apply-recommendation
 *
 *   # 提案数を制御 (default 3)
 *   npx tsx scripts/manga/layers/L04-1-opening-hook.ts --slug a07-modern-dungeon --episode 1 --max-proposals 2
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  storyboardPath,
  volumeDir,
} from "./_paths";
import {
  generateOpeningHookProposals,
  loadOpeningHookPatterns,
  mergeHookProposalIntoStoryboard,
  saveOpeningHookAlts,
} from "../../../src/lib/manga/opening-hook/opening-hook-pass";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
} from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  episode: number;
  applyRecommendation: boolean;
  maxProposals: number;
};

function parseArgs(): Args {
  const a: Partial<Args> = { applyRecommendation: false, maxProposals: 3 };
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
  }
  if (!a.slug) throw new Error("--slug=<slug> is required");
  if (!Number.isInteger(a.episode) || (a.episode ?? 0) <= 0)
    throw new Error("--episode=<N> is required");
  return a as Args;
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
  console.log(`[L4.1] opening-hook-pass start: slug=${args.slug} episode=${args.episode}`);

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
