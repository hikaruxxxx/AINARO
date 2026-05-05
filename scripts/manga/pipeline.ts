/**
 * 漫画パイプライン v2 オーケストレーター
 *
 * Usage:
 *   npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1
 *   npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --to L05
 *   npx tsx scripts/manga/pipeline.ts --slug a07-modern-dungeon --episode 1 --layer L09 --force
 *
 * 各 layer は別 tsx subprocess で起動 (cache + 失敗時 retry の境界が明確)。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import "./_env";

type Args = {
  slug: string;
  episode?: number;
  volume?: number;
  from?: string; // "L01"
  to?: string;
  layer?: string; // 単 layer 実行
  force?: boolean;
  /** L09 の name gate を bypass する。L09 layer 実行時のみ forward される */
  skipNameGate?: boolean;
  conceptPath?: string;
  briefFile?: string;
  episodes?: number[];
  authorPenName?: string;
  publicationDate?: string;
};

/** boolean flags: 値を取らない */
const BOOLEAN_FLAGS = new Set(["force", "skip-name-gate"]);

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    let key: string | null = null;
    let val: string | null = null;
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (!flag) continue;
      key = flag[1];
      // boolean flag は値を取らない
      if (BOOLEAN_FLAGS.has(key)) {
        if (key === "force") a.force = true;
        else if (key === "skip-name-gate") a.skipNameGate = true;
        continue;
      }
      // 次 token が `--` で始まるなら値ではなくフラグ → スキップ
      const nextToken = argv[i + 1];
      if (i + 1 >= argv.length || (nextToken && nextToken.startsWith("--"))) continue;
      val = nextToken;
      i++;
    }
    if (val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "episode") a.episode = Number(val);
    else if (key === "volume") a.volume = Number(val);
    else if (key === "from") a.from = val;
    else if (key === "to") a.to = val;
    else if (key === "layer") a.layer = val;
    else if (key === "concept") a.conceptPath = val;
    else if (key === "brief-file") a.briefFile = val;
    else if (key === "episodes") a.episodes = val.split(",").map((s) => Number(s));
    else if (key === "author") a.authorPenName = val;
    else if (key === "publication-date") a.publicationDate = val;
  }
  if (!a.slug) throw new Error("--slug required");
  return a as Args;
}

const ALL_LAYERS = [
  "L01", "L01b", "L01c", "L02", "L02b",
  "L03", "L04", "L05", "L06", "L07", "L08",
  "L08_5",
  "L09", "L09b", "L10", "L11", "L12", "L13",
] as const;
type LayerId = (typeof ALL_LAYERS)[number];

const LAYER_SCRIPT: Record<LayerId, string> = {
  L01: "scripts/manga/layers/L01-bible.ts",
  L01b: "scripts/manga/layers/L01b-bible-lint.ts",
  L01c: "scripts/manga/layers/L01c-bible-deepen.ts",
  L02: "scripts/manga/layers/L02-bible-images.ts",
  L02b: "scripts/manga/layers/L02b-volume-plot.ts",
  L03: "scripts/manga/layers/L03-shotlist.ts",
  L04: "scripts/manga/layers/L04-storyboard.ts",
  L05: "scripts/manga/layers/L05-page-director.ts",
  L06: "scripts/manga/layers/L06-continuity-resolve.ts",
  L07: "scripts/manga/layers/L07-refs-resolution.ts",
  L08: "scripts/manga/layers/L08-incremental-refs.ts",
  L08_5: "scripts/manga/layers/L08-5-name-preview.ts",
  L09: "scripts/manga/layers/L09-render.ts",
  L09b: "scripts/manga/layers/L09b-page-compose.ts",
  L10: "scripts/manga/layers/L10-bubble.ts",
  L11: "scripts/manga/layers/L11-audit.ts",
  L12: "scripts/manga/layers/L12-repair.ts",
  L13: "scripts/manga/layers/L13-kdp.ts",
};

function workScopeForLayer(l: LayerId): "work" | "episode" | "volume" {
  if (l === "L01" || l === "L01b" || l === "L01c" || l === "L02") return "work";
  if (l === "L02b" || l === "L13") return "volume";
  // L08_5 など、その他の layer は全て episode scope
  return "episode";
}

function buildLayerArgs(layer: LayerId, args: Args): string[] {
  const base: string[] = ["--slug", args.slug];
  const scope = workScopeForLayer(layer);
  if (scope === "episode") {
    if (!args.episode) throw new Error(`${layer}: --episode required`);
    base.push("--episode", String(args.episode));
  }
  if (scope === "volume") {
    if (!args.volume) throw new Error(`${layer}: --volume required`);
    base.push("--volume", String(args.volume));
    if (layer === "L13") {
      if (!args.episodes) throw new Error("L13: --episodes required");
      base.push("--episodes", args.episodes.join(","));
      if (args.authorPenName) base.push("--author", args.authorPenName);
      if (args.publicationDate) base.push("--publication-date", args.publicationDate);
    }
    if (layer === "L02b") {
      if (!args.conceptPath) throw new Error("L02b: --concept required");
      base.push("--concept", args.conceptPath);
    }
  }
  if (layer === "L01") {
    if (!args.conceptPath) throw new Error("L01: --concept required");
    base.push("--concept", args.conceptPath);
  }
  if (layer === "L01c") {
    if (!args.conceptPath) throw new Error("L01c: --concept required");
    base.push("--concept", args.conceptPath);
  }
  if (layer === "L03") {
    if (!args.briefFile) throw new Error("L03: --brief-file required");
    base.push("--brief-file", args.briefFile);
  }
  // L09 のみ name gate bypass フラグを forward
  if (layer === "L09" && args.skipNameGate) {
    base.push("--skip-name-gate");
  }
  return base;
}

function spawnLayer(layer: LayerId, layerArgs: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", LAYER_SCRIPT[layer], ...layerArgs], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function selectLayers(args: Args): LayerId[] {
  if (args.layer) return [args.layer as LayerId];
  const fromIdx = args.from ? ALL_LAYERS.indexOf(args.from as LayerId) : 0;
  const toIdx = args.to ? ALL_LAYERS.indexOf(args.to as LayerId) : ALL_LAYERS.length - 1;
  if (fromIdx < 0 || toIdx < 0) throw new Error("invalid --from or --to layer id");
  // L13 は volume scope なので明示指定がない限り含めない
  const layers = ALL_LAYERS.slice(fromIdx, toIdx + 1).filter((l) => {
    if (l === "L13" && (!args.volume || !args.episodes)) return false;
    if (l === "L02b" && (!args.volume || !args.conceptPath)) return false;
    if (l === "L01" && !args.conceptPath && !args.layer && args.from !== "L01") return false;
    if (l === "L01c" && !args.conceptPath && !args.layer && args.from !== "L01c") return false;
    if (l === "L03" && !args.briefFile && !args.layer && args.from !== "L03") return false;
    if (l === "L08") return false; // L08 は L07 で unresolved があれば手動で
    if (l === "L09b") return false; // L09b は L09 から自動連鎖、orchestrator では明示指定時のみ
    return true;
  });
  return layers;
}

async function main() {
  const args = parseArgs();
  const layers = selectLayers(args);
  console.log(`[pipeline] slug=${args.slug} layers=${layers.join(",")}`);

  for (const l of layers) {
    console.log(`\n[pipeline] === ${l} ===`);
    const code = await spawnLayer(l, buildLayerArgs(l, args));
    if (code !== 0) {
      console.error(`[pipeline] ${l} exited with code ${code}, stopping`);
      process.exit(code);
    }
  }
  console.log(`\n[pipeline] DONE`);
}

main().catch((e) => { console.error("[pipeline] FAILED:", e); process.exit(1); });
