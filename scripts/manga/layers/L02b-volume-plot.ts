/**
 * L2.5 Volume Plot
 *
 * bible.snapshot + V2企画書 → volumes/v{NN}/plot.json
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L02b-volume-plot.ts \
 *     --slug a07-modern-dungeon --volume 1 \
 *     --concept data/manga/_archive/.../A07_v2.json
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bibleSnapshotPath, volumeDir, volumePlotPath, workMetaPath } from "./_paths";
import { loadV2Concept } from "../../../src/lib/manga/bible/v2-adapter";
import { generateVolumePlot } from "../../../src/lib/manga/storyboard-v2/volume-plot";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";

type Args = { slug: string; volume: number; concept: string };

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "volume") a.volume = Number(val);
    else if (key === "concept") a.concept = val;
  }
  if (!a.slug || !a.volume || !a.concept) throw new Error("--slug, --volume, --concept required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const bible = JSON.parse(await fs.readFile(bibleSnapshotPath(args.slug), "utf-8")) as BibleSnapshotV2;
  const concept = await loadV2Concept(path.resolve(args.concept));
  const meta = JSON.parse(await fs.readFile(workMetaPath(args.slug), "utf-8"));
  const epsPerVol = meta.volume_plan?.target_episodes_per_volume ?? bible.meta.target_episodes_per_volume ?? 10;
  const pgsPerEp = meta.volume_plan?.target_pages_per_episode ?? bible.meta.target_pages_per_episode ?? 22;

  console.log(`[L02b] slug=${args.slug} vol=${args.volume} eps=${epsPerVol} pages/ep=${pgsPerEp}`);
  console.log(`[L02b] running volume-plot (Codex CLI text, ~6-10min)...`);

  const plot = await generateVolumePlot({
    bible, v2Concept: concept, volumeNo: args.volume,
    episodesPerVolume: epsPerVol, pagesPerEpisode: pgsPerEp,
  });

  await fs.mkdir(volumeDir(args.slug, args.volume), { recursive: true });
  await fs.writeFile(volumePlotPath(args.slug, args.volume), JSON.stringify(plot, null, 2));
  console.log(`[L02b] DONE: ${volumePlotPath(args.slug, args.volume)}`);
  console.log(`[L02b] episodes=${plot.episodes.length} foreshadows=${plot.foreshadow_map.length}`);

  // 各 episode の brief を ep ディレクトリに自動展開 (既存 _brief.md があれば衝突回避で .v2.md として書く)
  for (const ep of plot.episodes) {
    const epDir = path.join(volumeDir(args.slug, args.volume), "..", "..", "episodes", `ep${String(ep.episode_no).padStart(2, "0")}`);
    await fs.mkdir(epDir, { recursive: true });
    const briefPath = path.join(epDir, "_brief.md");
    const briefContent = `# ${args.slug} 第${ep.episode_no}話 ブリーフ (L2b 自動生成)\n\n## title (仮)\n${ep.title_working}\n\n## theme\n${ep.theme}\n\n## protagonist arc\n- start: ${ep.protagonist_arc.start}\n- turn:  ${ep.protagonist_arc.turn}\n- end:   ${ep.protagonist_arc.end}\n\n## must_include_events\n${ep.must_include_events.map((e) => `- ${e}`).join("\n")}\n\n## cliffhanger\n${ep.cliffhanger_hook}\n\n## brief (L3 入力本文)\n${ep.brief_for_L3}\n\n## page_target\n${ep.page_target}\n`;
    try {
      await fs.access(briefPath);
      const altPath = briefPath.replace(/\.md$/, ".v2.md");
      await fs.writeFile(altPath, briefContent);
      console.log(`[L02b] ep${ep.episode_no}: existing _brief.md preserved, wrote ${path.basename(altPath)}`);
    } catch {
      await fs.writeFile(briefPath, briefContent);
      console.log(`[L02b] ep${ep.episode_no}: wrote _brief.md`);
    }
  }
}

main().catch((e) => { console.error("[L02b] FAILED:", e); process.exit(1); });
