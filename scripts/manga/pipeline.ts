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
import { promises as fs } from "node:fs";
import path from "node:path";
import "./_env";

type QualityTier = "standard" | "premium";

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
  /** L12 の revision-queue モード。L12 起動時のみ forward */
  revisionQueue?: boolean;
  conceptPath?: string;
  briefFile?: string;
  episodes?: number[];
  authorPenName?: string;
  publicationDate?: string;
  qualityTier: QualityTier;
  dryRun?: boolean;
};

/** boolean flags: 値を取らない */
const BOOLEAN_FLAGS = new Set(["force", "skip-name-gate", "revision-queue", "dry-run"]);

function parseArgs(): Args {
  const a: Partial<Args> = { qualityTier: "standard" };
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
        else if (key === "revision-queue") a.revisionQueue = true;
        else if (key === "dry-run") a.dryRun = true;
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
    else if (key === "quality-tier") {
      if (val !== "premium" && val !== "standard") {
        throw new Error(`invalid --quality-tier: ${val} (expected premium|standard)`);
      }
      a.qualityTier = val;
    }
  }
  if (!a.slug) throw new Error("--slug required");
  return a as Args;
}

const ALL_LAYERS = [
  "L01", "L01b", "L01c", "L02", "L02_IMAGES_AUDIT", "L02b",
  "L03", "L04", "L05", "L05_5", "L05b", "L05c", "L06", "L07", "L08",
  "L08_5",
  "L09", "L09b", "L11", "L12", "L13",
] as const;
type LayerId = (typeof ALL_LAYERS)[number];

// SSoT: scripts/manga/pipeline.ts:LAYER_SCRIPT と
// src/lib/manga/ops-console/server/jobs/registry.ts:LAYER_REGISTRY は
// 同じ script path を持つ。一方を更新したらもう一方も同期すること。
const LAYER_SCRIPT: Record<LayerId, string> = {
  L01: "scripts/manga/layers/L01-bible.ts",
  L01b: "scripts/manga/layers/L01b-bible-lint.ts",
  L01c: "scripts/manga/layers/L01c-bible-deepen.ts",
  L02: "scripts/manga/layers/L02-bible-images.ts",
  L02_IMAGES_AUDIT: "scripts/manga/layers/L02b-bible-images-audit.ts",
  L02b: "scripts/manga/layers/L02b-volume-plot.ts",
  L03: "scripts/manga/layers/L03-shotlist.ts",
  L04: "scripts/manga/layers/L04-storyboard.ts",
  L05: "scripts/manga/layers/L05-page-director.ts",
  L05_5: "scripts/manga/layers/L05-5-engagement-audit.ts",
  L05b: "scripts/manga/layers/L05b-bootstrap-bg-treatment.ts",
  L05c: "scripts/manga/layers/L05c-pattern-bg-learner.ts",
  L06: "scripts/manga/layers/L06-continuity-resolve.ts",
  L07: "scripts/manga/layers/L07-refs-resolution.ts",
  L08: "scripts/manga/layers/L08-incremental-refs.ts",
  L08_5: "scripts/manga/layers/L08-5-name-preview.ts",
  L09: "scripts/manga/layers/L09-render.ts",
  L09b: "scripts/manga/layers/L09b-page-compose.ts",
  L11: "scripts/manga/layers/L11-audit.ts",
  L12: "scripts/manga/layers/L12-repair.ts",
  L13: "scripts/manga/layers/L13-kdp.ts",
};

function displayLayerName(l: LayerId): string {
  if (l === "L02_IMAGES_AUDIT") return "L02b-images-audit";
  if (l === "L05_5") return "L05.5";
  if (l === "L08") return "L08-incr";
  return l;
}

function normalizeLayerId(layer: string): LayerId {
  if (layer === "L02b-images-audit" || layer === "L02_audit") return "L02_IMAGES_AUDIT";
  if (layer === "L05.5" || layer === "L05_5") return "L05_5";
  if (layer === "L08-incr") return "L08";
  if ((ALL_LAYERS as readonly string[]).includes(layer)) return layer as LayerId;
  throw new Error(`invalid layer id: ${layer}`);
}

function workScopeForLayer(l: LayerId): "none" | "work" | "episode" | "volume" {
  if (l === "L05b" || l === "L05c") return "none";
  if (l === "L01" || l === "L01b" || l === "L01c" || l === "L02" || l === "L02_IMAGES_AUDIT") return "work";
  if (l === "L02b" || l === "L13") return "volume";
  // L08_5 など、その他の layer は全て episode scope
  return "episode";
}

function buildLayerArgs(layer: LayerId, args: Args): string[] {
  if (layer === "L05b") return [];
  if (layer === "L05c") return ["--print-prompt"];

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
  // L12 のみ revision-queue モードを forward
  if (layer === "L12" && args.revisionQueue) {
    base.push("--revision-queue");
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
  if (args.layer) return [normalizeLayerId(args.layer)];
  const fromIdx = args.from ? ALL_LAYERS.indexOf(normalizeLayerId(args.from)) : 0;
  const toIdx = args.to ? ALL_LAYERS.indexOf(normalizeLayerId(args.to)) : ALL_LAYERS.length - 1;
  if (fromIdx < 0 || toIdx < 0) throw new Error("invalid --from or --to layer id");
  // L13 は volume scope なので明示指定がない限り含めない
  const layers = ALL_LAYERS.slice(fromIdx, toIdx + 1).filter((l) => {
    if (l === "L13" && (!args.volume || !args.episodes)) return false;
    if (l === "L02b" && (!args.volume || !args.conceptPath)) return false;
    if (l === "L01" && !args.conceptPath && !args.layer && args.from !== "L01") return false;
    if (l === "L01c" && !args.conceptPath && !args.layer && args.from !== "L01c") return false;
    if (l === "L03" && !args.briefFile && !args.layer && args.from !== "L03") return false;
    if ((l === "L05b" || l === "L05c") && args.qualityTier !== "premium") return false;
    if (l === "L08" && args.qualityTier !== "premium") return false; // L08 は L07 で unresolved があれば手動で
    if (l === "L09b" && args.qualityTier !== "premium") return false; // L09b は L09 から自動連鎖、orchestrator では明示指定時のみ
    return true;
  });
  return layers;
}

async function hasCharacterFirstAppearanceEpisode(args: Args): Promise<boolean> {
  if (!args.episode) return false;
  if (args.episode === 1) return true;

  const currentEpisodeCharacters = await readShotlistCharacterIds(args.slug, args.episode);
  if (currentEpisodeCharacters.size > 0) {
    const previousEpisodeCharacters = new Set<string>();
    for (let ep = 1; ep < args.episode; ep++) {
      const ids = await readShotlistCharacterIds(args.slug, ep);
      for (const id of ids) previousEpisodeCharacters.add(id);
    }
    for (const id of currentEpisodeCharacters) {
      if (!previousEpisodeCharacters.has(id)) return true;
    }
    if (previousEpisodeCharacters.size > 0) return false;
  }

  const candidates = [
    path.join("data", "manga", "works", args.slug, "bible", "snapshot.v2.json"),
    path.join("data", "manga", "works", args.slug, "bible", "snapshot.json"),
    path.join("data", "manga", "works", args.slug, "bible", "snapshot.v2-final.json"),
  ];
  for (const p of candidates) {
    try {
      const snapshot = JSON.parse(await fs.readFile(p, "utf-8")) as {
        characters?: Array<{ appears_in_episodes?: unknown }>;
      };
      let sawEpisodeMetadata = false;
      for (const c of snapshot.characters ?? []) {
        if (!Array.isArray(c.appears_in_episodes)) continue;
        sawEpisodeMetadata = true;
        const episodes = c.appears_in_episodes
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0);
        if (episodes.length > 0 && Math.min(...episodes) === args.episode) return true;
      }
      if (sawEpisodeMetadata) return false;
    } catch {
      // Try the next known snapshot path.
    }
  }
  return false;
}

async function readShotlistCharacterIds(slug: string, episode: number): Promise<Set<string>> {
  const shotlistPath = path.join(
    "data",
    "manga",
    "works",
    slug,
    "episodes",
    `ep${String(episode).padStart(2, "0")}`,
    "shotlist.json",
  );
  try {
    const shotlist = JSON.parse(await fs.readFile(shotlistPath, "utf-8")) as unknown;
    const ids = new Set<string>();
    collectShotlistCharacterIds(shotlist, ids);
    return ids;
  } catch {
    return new Set();
  }
}

function collectShotlistCharacterIds(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectShotlistCharacterIds(item, ids);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const record = value as Record<string, unknown>;
  for (const key of ["involved_character_ids", "characters"]) {
    const maybeIds = record[key];
    if (!Array.isArray(maybeIds)) continue;
    for (const id of maybeIds) {
      if (typeof id === "string" && id.startsWith("char_")) ids.add(id);
    }
  }
  for (const item of Object.values(record)) collectShotlistCharacterIds(item, ids);
}

async function shouldSkipForQualityTier(layer: LayerId, args: Args): Promise<boolean> {
  if (args.qualityTier !== "premium") return false;
  if (
    layer === "L02_IMAGES_AUDIT" ||
    layer === "L05_5" ||
    layer === "L05b" ||
    layer === "L05c" ||
    layer === "L09b"
  ) {
    return true;
  }
  if (layer === "L08") {
    return !(await hasCharacterFirstAppearanceEpisode(args));
  }
  return false;
}

async function main() {
  const args = parseArgs();
  const layers = selectLayers(args);
  const skippedLayers: string[] = [];
  console.log(
    `[pipeline] slug=${args.slug} quality-tier=${args.qualityTier}${args.dryRun ? " dry-run=true" : ""} layers=${layers.map(displayLayerName).join(",")}`,
  );

  for (const l of layers) {
    const layerName = displayLayerName(l);
    console.log(`\n[pipeline] === ${layerName} ===`);
    if (await shouldSkipForQualityTier(l, args)) {
      console.log(`[pipeline] SKIP ${layerName} (quality-tier=premium)`);
      skippedLayers.push(layerName);
      continue;
    }
    const layerArgs = buildLayerArgs(l, args);
    if (args.dryRun) {
      console.log(`[pipeline] DRY-RUN ${layerName}: npx tsx ${LAYER_SCRIPT[l]} ${layerArgs.join(" ")}`);
      continue;
    }
    const code = await spawnLayer(l, layerArgs);
    if (code !== 0) {
      console.error(`[pipeline] ${layerName} exited with code ${code}, stopping`);
      process.exit(code);
    }
  }
  console.log(`\n[pipeline] DONE skipped=${skippedLayers.length > 0 ? skippedLayers.join(",") : "(none)"}`);
}

main().catch((e) => { console.error("[pipeline] FAILED:", e); process.exit(1); });
