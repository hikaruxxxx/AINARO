/**
 * Emotional Amplitude Audit CLI
 *
 * 2026-05-20 S1 Domain C (品質ガード) で新設。
 *
 * storyboard.json の panel.emotional_intensity 系列を 5 ルールで検査する。
 *   1. episode_amplitude (max-min) ≥ 0.65 (< 0.5 は hard warn)
 *   2. first 30% 内に intensity ≥ 0.55 の山があるか
 *   3. climax/cliffhanger/reveal で intensity ≥ 0.85 があるか
 *   4. 連続 5P 以上で intensity 差分 < 0.1 の平坦区間がないか
 *   5. 冒頭 25% で dialogue=0 かつ avg intensity < 0.5 (hard warn)
 *
 * panel.emotional_intensity が全 0.00 の場合 (a07 v01 ep1 のような既存資産)、
 * --auto-propagate flag で L02b beats + scenes から intensity-propagation.ts で
 * フォールバック伝播してから audit する。
 *
 * 使い方:
 *   node --import tsx scripts/manga/audit-emotional-amplitude.ts --slug a07-modern-dungeon --episode 1
 *   node --import tsx scripts/manga/audit-emotional-amplitude.ts --slug a07-modern-dungeon --episode 1 --auto-propagate
 *   node --import tsx scripts/manga/audit-emotional-amplitude.ts --slug a07-modern-dungeon --episode 1 --report data/manga/works/a07-modern-dungeon/episodes/ep01/_emotional_amplitude.md
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { storyboardPath, volumePlotPath, sceneGraphPath } from "./layers/_paths";
import {
  auditEmotionalAmplitude,
  renderAmplitudeReport,
} from "../../src/lib/manga/qa-v2/emotional-amplitude";
import { applyIntensityInPlace } from "../../src/lib/manga/storyboard-v2/intensity-propagation";
import type { EpisodeStoryboardV2 } from "../../src/lib/manga/schemas-v2";
import type { VolumePlot, VolumeEpisodePlan } from "../../src/lib/manga/storyboard-v2/volume-plot";
import type { SceneGraphV1 } from "../../src/lib/manga/scene-graph/schema";

type Args = {
  slug: string;
  episode: number;
  /** plot.json を読む対象の volume (既定 1) */
  volume: number;
  autoPropagate: boolean;
  /** markdown レポートの出力パス (任意) */
  report?: string;
};

function parseArgs(): Args {
  const a: Partial<Args> = { volume: 1, autoPropagate: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (key === "slug") {
      a.slug = next;
      i++;
    } else if (key === "episode") {
      a.episode = Number(next);
      i++;
    } else if (key === "volume") {
      a.volume = Number(next);
      i++;
    } else if (key === "auto-propagate" || key === "autoPropagate") {
      a.autoPropagate = true;
    } else if (key === "report") {
      a.report = next;
      i++;
    }
  }
  if (!a.slug) throw new Error("--slug required");
  if (a.episode === undefined) throw new Error("--episode required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const sbPath = storyboardPath(args.slug, args.episode);
  const storyboard = JSON.parse(
    await fs.readFile(sbPath, "utf-8"),
  ) as EpisodeStoryboardV2;

  // panel.emotional_intensity の充填率を確認
  let panelsTotal = 0;
  let panelsWithIntensity = 0;
  for (const page of storyboard.pages) {
    for (const panel of page.panels) {
      panelsTotal++;
      if (
        typeof panel.emotional_intensity === "number" &&
        panel.emotional_intensity > 0
      ) {
        panelsWithIntensity++;
      }
    }
  }
  console.log(
    `[amplitude-audit] slug=${args.slug} ep=${args.episode} panels=${panelsTotal} with_intensity=${panelsWithIntensity}`,
  );

  // panel intensity が 0% 充填の場合、--auto-propagate が指定されていれば伝播を試みる
  if (panelsWithIntensity === 0 && args.autoPropagate) {
    console.log(
      "[amplitude-audit] panel.emotional_intensity が 0 件、scene_graph 優先 + L02b plot.json fallback で伝播を試みます...",
    );
    try {
      const plot = JSON.parse(
        await fs.readFile(volumePlotPath(args.slug, args.volume), "utf-8"),
      ) as VolumePlot;
      const episode: VolumeEpisodePlan | undefined = plot.episodes.find(
        (e) => e.episode_no === args.episode,
      );
      if (!episode) {
        throw new Error(`plot.json に ep${args.episode} が見つかりません`);
      }
      const propagationEpisode = await episodeWithSceneGraphEmotionFallback(
        args.slug,
        args.episode,
        episode,
      );
      const result = applyIntensityInPlace({
        episode: propagationEpisode,
        storyboard: { pages: storyboard.pages },
        overwrite: false,
      });
      console.log(
        `[amplitude-audit] propagation 完了: filled=${result.filled}/${result.total} skipped=${result.skipped}`,
      );
    } catch (err) {
      console.warn(
        `[amplitude-audit] 伝播失敗 (skip): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (panelsWithIntensity === 0) {
    console.warn(
      "[amplitude-audit] WARN: panel.emotional_intensity が全て 0 / 未設定。`--auto-propagate` で L02b plot.json から伝播するか、L4 storyboard 再生成を推奨",
    );
  }

  const summary = auditEmotionalAmplitude(storyboard);
  const report = renderAmplitudeReport(summary);

  console.log("");
  console.log(report);

  if (args.report) {
    await fs.mkdir(path.dirname(args.report), { recursive: true });
    await fs.writeFile(args.report, report);
    console.log("");
    console.log(`[amplitude-audit] report saved: ${args.report}`);
  }

  if (summary.findings.length === 0) {
    console.log("");
    console.log("[amplitude-audit] OK (0 findings)");
    return;
  }

  const hardCount = summary.findings.filter((f) => f.severity === "hard_warning").length;
  if (hardCount > 0) {
    console.error("");
    console.error(`[amplitude-audit] ${hardCount} hard warning(s) 検出`);
    process.exit(1);
  }
}

async function episodeWithSceneGraphEmotionFallback(
  slug: string,
  episodeNo: number,
  episode: VolumeEpisodePlan,
): Promise<VolumeEpisodePlan> {
  let sceneGraph: SceneGraphV1;
  try {
    sceneGraph = JSON.parse(
      await fs.readFile(sceneGraphPath(slug, episodeNo), "utf-8"),
    ) as SceneGraphV1;
  } catch {
    return episode;
  }

  const sceneGraphScenesWithEmotion = sceneGraph.scenes.filter((s) => s.scene_emotion);
  if (sceneGraphScenesWithEmotion.length === 0) return episode;

  const graphBySceneNo = new Map(sceneGraph.scenes.map((s) => [s.scene_no, s]));
  let warnedMismatch = false;
  let adopted = 0;
  const scenes = (episode.scenes ?? []).map((plotScene) => {
    const graphScene = graphBySceneNo.get(plotScene.scene_no);
    if (!graphScene || graphScene.scene_no !== plotScene.scene_no) {
      if (!warnedMismatch) {
        console.warn("[amplitude-audit] scene_no mismatch between scene_graph and plot, falling back to plot");
        warnedMismatch = true;
      }
      return plotScene;
    }
    if (!graphScene.scene_emotion) return plotScene;
    adopted++;
    return {
      ...plotScene,
      scene_emotion: graphScene.scene_emotion,
    };
  });

  // 第 2 ループ: scene_graph 側に plot に対応する scene_no が無い "orphan" を検出
  // 第 1 ループで mismatch が既に warning 済みなら redundant なので skip
  if (!warnedMismatch) {
    for (const graphScene of sceneGraphScenesWithEmotion) {
      if (!episode.scenes?.some((plotScene) => plotScene.scene_no === graphScene.scene_no)) {
        console.warn(`[amplitude-audit] scene_graph に plot に対応しない scene_no=${graphScene.scene_no} が存在 (orphan)`);
        warnedMismatch = true;
        break;
      }
    }
  }

  if (adopted > 0) {
    console.log(
      `[amplitude-audit] scene_graph.scene_emotion を優先採用: ${adopted}/${episode.scenes?.length ?? 0} scene`,
    );
  }

  return {
    ...episode,
    scenes,
  };
}

main().catch((e) => {
  console.error("[amplitude-audit] FAILED:", e);
  process.exit(2);
});
