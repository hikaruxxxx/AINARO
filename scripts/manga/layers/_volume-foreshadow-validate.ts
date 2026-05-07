/**
 * 巻全体 (volume) の cross-episode foreshadow DAG を検査する CLI。
 * Phase γ 着手 (2026-05-07): episode 単独 validator では検出できない
 * 「ep N で setup → ep M で payoff」の整合を巻全体で検査する。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/_volume-foreshadow-validate.ts \
 *     --slug a07-modern-dungeon --volume 1 --episodes 1-10
 *
 *   --episodes は範囲指定 (例: 1-10) または個別指定 (例: 1,2,3)
 */
import "../_env";
import { promises as fs } from "node:fs";
import { sceneGraphPath } from "./_paths";
import {
  isSceneGraphV1,
  type SceneGraphV1,
} from "../../../src/lib/manga/scene-graph/schema";
import {
  computeVolumeForeshadowDag,
  formatVolumeDagReport,
} from "../../../src/lib/manga/scene-graph/episode-metrics";

type Args = { slug: string; volume: number; episodes: number[] };

function parseEpisodesArg(spec: string): number[] {
  if (spec.includes("-")) {
    const m = spec.match(/^(\d+)-(\d+)$/);
    if (!m) throw new Error(`--episodes range は "1-10" 形式で: 受信 "${spec}"`);
    const a = Number(m[1]);
    const b = Number(m[2]);
    const out: number[] = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }
  return spec.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

function parseArgs(): Args {
  const a: Partial<Args> = { volume: 1 };
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
    else if (key === "episodes") a.episodes = parseEpisodesArg(val);
  }
  if (!a.slug || !a.episodes || a.episodes.length === 0) {
    throw new Error("--slug and --episodes required (e.g. --episodes 1-10)");
  }
  return a as Args;
}

async function main() {
  const args = parseArgs();
  console.log(`[volume-foreshadow] slug=${args.slug} vol=${args.volume} episodes=${args.episodes.join(",")}`);

  const sceneGraphs: SceneGraphV1[] = [];
  for (const ep of args.episodes) {
    const path = sceneGraphPath(args.slug, ep);
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path, "utf-8"));
    } catch (e) {
      console.error(`[volume-foreshadow] FAIL: ${path} を読めません: ${(e as Error).message}`);
      process.exit(2);
    }
    if (!isSceneGraphV1(raw)) {
      console.error(`[volume-foreshadow] FAIL: ${path} is not a valid SceneGraphV1`);
      process.exit(2);
    }
    sceneGraphs.push(raw as SceneGraphV1);
  }

  const result = computeVolumeForeshadowDag(sceneGraphs);

  console.log("");
  console.log("=== Volume Foreshadow Validation ===");
  console.log(`ok: ${result.ok}`);
  console.log(`errors: ${result.errors.length}`);
  for (const e of result.errors) console.log(`  ✗ ${e}`);
  console.log(`warnings: ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);

  console.log("");
  console.log("=== Volume DAG Summary ===");
  console.log(formatVolumeDagReport(result.dag));

  if (!result.ok) process.exit(2);
}

main().catch((e) => {
  console.error("[volume-foreshadow] FAILED:", e);
  process.exit(1);
});
