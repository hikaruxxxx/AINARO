/**
 * L2b Story Plot Generator (Series + Volume)
 *
 * bible.snapshot + V2企画書 → series_plan.json (--phase=series)
 *                          → volumes/v{NN}/plot.json (--phase=volume)
 *
 * 旧名 L2.5 Volume Plot。L2b 物語OS再設計 (2026-05-13) で series-plan 生成も
 * 担うようになったため、--phase で出力対象を切替える。
 *
 * Usage:
 *   # 既定 (--phase=all): series_plan が無ければ生成し、続けて vol 1 plot を生成
 *   npx tsx scripts/manga/layers/L02b-volume-plot.ts \
 *     --slug a07-modern-dungeon --volume 1 \
 *     --concept data/manga/_archive/.../A07_v2.json
 *
 *   # series_plan のみ生成 (1 シリーズに 1 回)
 *   npx tsx scripts/manga/layers/L02b-volume-plot.ts --slug a07-modern-dungeon \
 *     --phase=series --concept data/manga/_archive/.../A07_v2.json
 *
 *   # volume plot のみ生成 (series_plan は既存ファイルを読む)
 *   npx tsx scripts/manga/layers/L02b-volume-plot.ts --slug a07-modern-dungeon \
 *     --phase=volume --volume 2 --concept data/manga/_archive/.../A07_v2.json
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  volumeDir,
  volumePlotPath,
  workMetaPath,
  seriesPlanPath,
} from "./_paths";
import { loadV2Concept } from "../../../src/lib/manga/bible/v2-adapter";
import { generateVolumePlot } from "../../../src/lib/manga/storyboard-v2/volume-plot";
import { generateSeriesPlan } from "../../../src/lib/manga/storyboard-v2/series-plan";
import type { BibleSnapshotV2, SeriesPlan } from "../../../src/lib/manga/schemas-v2";

type Phase = "series" | "volume" | "all";
type ArchetypeStyleArg = "classic" | "webtoon";
type Args = {
  slug: string;
  volume?: number;
  concept: string;
  phase: Phase;
  /** 2026-05-20 S1 で追加。"webtoon" で Domain B (episode_spine) を ep1 5 段階強制 */
  archetypeStyle: ArchetypeStyleArg;
  /** 2026-05-20 S1 Domain C で追加。0=skip、N>=2 で cliffhanger 候補×N pairwise (推奨 5) */
  cliffhangerCandidates: number;
};

function parseArgs(): Args {
  const a: Partial<Args> = { phase: "all", archetypeStyle: "classic", cliffhangerCandidates: 0 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "volume") a.volume = Number(val);
    else if (key === "concept") a.concept = val;
    else if (key === "phase") {
      if (val !== "series" && val !== "volume" && val !== "all") {
        throw new Error(`--phase は series|volume|all のいずれか (received: ${val})`);
      }
      a.phase = val;
    } else if (key === "archetype-style" || key === "archetypeStyle") {
      if (val !== "classic" && val !== "webtoon") {
        throw new Error(`--archetype-style は classic|webtoon のいずれか (received: ${val})`);
      }
      a.archetypeStyle = val;
    } else if (key === "cliffhanger-candidates" || key === "cliffhangerCandidates") {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`--cliffhanger-candidates は非負整数 (received: ${val})`);
      }
      if (n === 1) {
        throw new Error(`--cliffhanger-candidates は 0 (skip) または 2 以上 (received: 1)`);
      }
      a.cliffhangerCandidates = n;
    }
  }
  if (!a.slug) throw new Error("--slug required");
  if (!a.concept) throw new Error("--concept required");
  if ((a.phase === "volume" || a.phase === "all") && !a.volume) {
    throw new Error("--volume required when phase != series");
  }
  return a as Args;
}

async function loadOrGenerateSeriesPlan(args: {
  slug: string;
  bible: BibleSnapshotV2;
  conceptPath: string;
  forceRegenerate: boolean;
}): Promise<SeriesPlan> {
  const planPath = seriesPlanPath(args.slug);
  if (!args.forceRegenerate) {
    try {
      const existing = JSON.parse(await fs.readFile(planPath, "utf-8")) as SeriesPlan;
      if (existing.schema_version === 1 && existing.arcs?.length > 0) {
        console.log(
          `[L02b] series_plan already exists (arcs=${existing.arcs.length}), reusing: ${planPath}`,
        );
        return existing;
      }
      console.log(`[L02b] series_plan invalid (regenerating): ${planPath}`);
    } catch {
      // ENOENT: 生成へ進む
    }
  }
  const concept = await loadV2Concept(path.resolve(args.conceptPath));
  const totalVolumes = args.bible.meta.estimated_volumes ?? 1;
  console.log(`[L02b] generating series_plan (totalVolumes=${totalVolumes}, ~8-15min)...`);
  const plan = await generateSeriesPlan({
    bible: args.bible,
    v2Concept: concept,
    totalVolumes,
  });
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
  console.log(`[L02b] series_plan DONE: ${planPath} (arcs=${plan.arcs.length})`);
  return plan;
}

async function runVolumePhase(args: {
  slug: string;
  bible: BibleSnapshotV2;
  conceptPath: string;
  volume: number;
  seriesPlan?: SeriesPlan;
  archetypeStyle: ArchetypeStyleArg;
  cliffhangerCandidates: number;
}) {
  const concept = await loadV2Concept(path.resolve(args.conceptPath));
  const meta = JSON.parse(await fs.readFile(workMetaPath(args.slug), "utf-8"));
  const epsPerVol =
    meta.volume_plan?.target_episodes_per_volume ??
    args.bible.meta.target_episodes_per_volume ??
    10;
  const pgsPerEp =
    meta.volume_plan?.target_pages_per_episode ??
    args.bible.meta.target_pages_per_episode ??
    22;

  console.log(
    `[L02b] slug=${args.slug} vol=${args.volume} eps=${epsPerVol} pages/ep=${pgsPerEp} seriesPlan=${args.seriesPlan ? "yes" : "no"} archetype_style=${args.archetypeStyle} cliffhanger_candidates=${args.cliffhangerCandidates}`,
  );
  console.log(`[L02b] running volume-plot (Codex CLI text, ~8-15min)...`);

  const plot = await generateVolumePlot({
    bible: args.bible,
    v2Concept: concept,
    volumeNo: args.volume,
    episodesPerVolume: epsPerVol,
    pagesPerEpisode: pgsPerEp,
    seriesPlan: args.seriesPlan,
    archetypeStyle: args.archetypeStyle,
    cliffhangerCandidates: args.cliffhangerCandidates,
  });

  await fs.mkdir(volumeDir(args.slug, args.volume), { recursive: true });
  await fs.writeFile(volumePlotPath(args.slug, args.volume), JSON.stringify(plot, null, 2));
  console.log(`[L02b] volume_plot DONE: ${volumePlotPath(args.slug, args.volume)}`);
  console.log(
    `[L02b] episodes=${plot.episodes.length} foreshadows=${plot.foreshadow_map.length} arcs=${plot.belongs_to_arcs?.length ?? 0}`,
  );

  // 各 episode の brief を ep ディレクトリに自動展開
  for (const ep of plot.episodes) {
    const epDir = path.join(
      volumeDir(args.slug, args.volume),
      "..",
      "..",
      "episodes",
      `ep${String(ep.episode_no).padStart(2, "0")}`,
    );
    await fs.mkdir(epDir, { recursive: true });
    const briefPath = path.join(epDir, "_brief.md");
    const sceneSummary = ep.scenes
      ? ep.scenes
          .map(
            (s) =>
              `- s${String(s.scene_no).padStart(2, "0")} (p${s.page_range[0]}-p${s.page_range[1]}, ${s.time_of_day}, @${s.location_id}): ${s.purpose}`,
          )
          .join("\n")
      : "(scenes 未生成)";
    const briefContent = `# ${args.slug} 第${ep.episode_no}話 ブリーフ (L2b 自動生成)\n\n## title (仮)\n${ep.title_working}\n\n## theme\n${ep.theme}\n\n## arc / volume position\n- arc_id: ${ep.arc_position?.arc_id ?? "(未設定)"}\n- role_in_arc: ${ep.arc_position?.role_in_arc ?? "(未設定)"}\n- volume_position: ${ep.volume_position ?? "(未設定)"}\n\n## protagonist arc\n- start: ${ep.protagonist_arc.start}\n- turn:  ${ep.protagonist_arc.turn}\n- end:   ${ep.protagonist_arc.end}\n\n## must_include_events\n${ep.must_include_events.map((e) => `- ${e}`).join("\n")}\n\n## scenes (skeleton)\n${sceneSummary}\n\n## cliffhanger\n${ep.cliffhanger_hook}\n\n## brief (L3 入力本文)\n${ep.brief_for_L3}\n\n## page_target\n${ep.page_target}\n`;
    try {
      await fs.access(briefPath);
      const altPath = briefPath.replace(/\.md$/, ".v2.md");
      await fs.writeFile(altPath, briefContent);
      console.log(
        `[L02b] ep${ep.episode_no}: existing _brief.md preserved, wrote ${path.basename(altPath)}`,
      );
    } catch {
      await fs.writeFile(briefPath, briefContent);
      console.log(`[L02b] ep${ep.episode_no}: wrote _brief.md`);
    }
  }
}

async function main() {
  const args = parseArgs();
  const bible = JSON.parse(
    await fs.readFile(bibleSnapshotPath(args.slug), "utf-8"),
  ) as BibleSnapshotV2;

  if (args.phase === "series") {
    await loadOrGenerateSeriesPlan({
      slug: args.slug,
      bible,
      conceptPath: args.concept,
      forceRegenerate: true,
    });
    return;
  }

  // phase = volume or all
  let seriesPlan: SeriesPlan | undefined;
  if (args.phase === "all") {
    seriesPlan = await loadOrGenerateSeriesPlan({
      slug: args.slug,
      bible,
      conceptPath: args.concept,
      forceRegenerate: false,
    });
  } else {
    // phase = volume: 既存 series_plan を読む (なければ undefined で続行)
    try {
      seriesPlan = JSON.parse(await fs.readFile(seriesPlanPath(args.slug), "utf-8")) as SeriesPlan;
      console.log(`[L02b] using existing series_plan (arcs=${seriesPlan.arcs.length})`);
    } catch {
      console.log(
        `[L02b] WARN: series_plan が存在しません (--phase=series で生成推奨)。arc_position 未設定で続行...`,
      );
    }
  }

  await runVolumePhase({
    slug: args.slug,
    bible,
    conceptPath: args.concept,
    volume: args.volume!,
    seriesPlan,
    archetypeStyle: args.archetypeStyle,
    cliffhangerCandidates: args.cliffhangerCandidates,
  });
}

main().catch((e) => {
  console.error("[L02b] FAILED:", e);
  process.exit(1);
});
