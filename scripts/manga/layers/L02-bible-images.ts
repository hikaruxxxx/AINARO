/**
 * L2 Bible Images
 *
 * snapshot.json から characters / locations / props の参照画像を生成。
 * Codex CLI 経由で gpt-image-2 を呼び (ChatGPT Pro $200/月 枠内)。
 *
 * Usage:
 *   npx tsx scripts/manga/layers/L02-bible-images.ts --slug a07-modern-dungeon
 *   npx tsx scripts/manga/layers/L02-bible-images.ts --slug a07-modern-dungeon --only=protagonist
 *   npx tsx scripts/manga/layers/L02-bible-images.ts --slug a07-modern-dungeon --kinds=characters,locations
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  bibleSnapshotPath,
  bibleRefsDir,
  STYLE_PLATES_DIR,
} from "./_paths";
import {
  generateCharacterRefsForBible,
  generateLocationRefsForBible,
  generatePropRefsForBible,
  type CharacterVariantV2,
} from "../../../src/lib/manga/bible/v2-images";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";

/**
 * style plate を解決する。
 *   1) `{artStyle}/` ディレクトリがあれば中の全 PNG 配列を返す (L02 は全枚数を refs として使う)
 *   2) ディレクトリ無しなら `{artStyle}.png` 単一ファイルを 1 要素配列で返す
 *   3) どちらも無ければ空配列
 */
async function findStylePlates(artStyle: string): Promise<string[]> {
  const dirCandidate = path.join(STYLE_PLATES_DIR, artStyle);
  try {
    const st = await fs.stat(dirCandidate);
    if (st.isDirectory()) {
      const entries = await fs.readdir(dirCandidate);
      const pngs = entries
        .filter((e) => e.toLowerCase().endsWith(".png"))
        .sort()
        .map((e) => path.join(dirCandidate, e));
      if (pngs.length > 0) return pngs;
    }
  } catch {}
  const fileCandidate = path.join(STYLE_PLATES_DIR, `${artStyle}.png`);
  try {
    await fs.access(fileCandidate);
    return [fileCandidate];
  } catch {
    return [];
  }
}

type Args = {
  slug: string;
  kinds: Set<"characters" | "locations" | "props">;
  only?: "protagonist" | "all";
  concurrency: number;
  skipExisting: boolean;
  // 指定があれば、その variant のみ生成 (キャラ用)
  characterVariants?: CharacterVariantV2[];
  // 指定があれば、そのキャラ ID のみ生成
  characterIds?: string[];
  // location 用の絞り込み (Console regen ボタン経由で使う)
  locationIds?: string[];
  locationVariants?: string[]; // LocationVariantV2 だが loose に受ける
  // prop 用の絞り込み
  propIds?: string[];
  propVariants?: string[];
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    kinds: new Set(["characters", "locations", "props"]),
    only: "all",
    concurrency: 2,
    skipExisting: true,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) {
      [, key, val] = eq;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "kinds")
      a.kinds = new Set(val.split(",").map((s) => s.trim() as "characters" | "locations" | "props"));
    else if (key === "only") a.only = val as "protagonist" | "all";
    else if (key === "concurrency") a.concurrency = Number(val);
    else if (key === "skip-existing") a.skipExisting = val !== "false";
    else if (key === "variants")
      a.characterVariants = val.split(",").map((s) => s.trim() as CharacterVariantV2);
    else if (key === "character-id" || key === "character-ids")
      a.characterIds = val.split(",").map((s) => s.trim());
    else if (key === "location-id" || key === "location-ids")
      a.locationIds = val.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "location-variants")
      a.locationVariants = val.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "prop-id" || key === "prop-ids")
      a.propIds = val.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "prop-variants")
      a.propVariants = val.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (!a.slug) throw new Error("--slug=<slug> required");
  return a as Args;
}

async function loadSnapshot(slug: string): Promise<BibleSnapshotV2> {
  const txt = await fs.readFile(bibleSnapshotPath(slug), "utf-8");
  return JSON.parse(txt) as BibleSnapshotV2;
}

async function main() {
  const args = parseArgs();
  console.log(`[L02] slug=${args.slug} kinds=${[...args.kinds].join(",")} only=${args.only} concurrency=${args.concurrency}`);

  const snapshot = await loadSnapshot(args.slug);
  const refsDir = bibleRefsDir(args.slug);
  await fs.mkdir(refsDir, { recursive: true });

  const stylePlatePaths = await findStylePlates(snapshot.meta.art_style);
  if (stylePlatePaths.length > 0) {
    console.log(`[L02] style plates (${stylePlatePaths.length}): ${stylePlatePaths.map((p) => path.basename(p)).join(", ")}`);
  } else {
    console.warn(`[L02] WARN: style plate not found for art_style=${snapshot.meta.art_style}`);
  }

  const totals = { generated: 0, skipped: 0, failed: 0 };

  if (args.kinds.has("characters")) {
    let chars =
      args.only === "protagonist"
        ? snapshot.characters.filter((c) => c.role === "protagonist")
        : snapshot.characters;
    if (args.characterIds && args.characterIds.length > 0) {
      const idSet = new Set(args.characterIds);
      chars = chars.filter((c) => idSet.has(c.id));
    }
    console.log(`[L02] characters: ${chars.length} entries${args.characterVariants ? ` variants=${args.characterVariants.join(",")}` : ""}`);
    const r = await generateCharacterRefsForBible({
      snapshot,
      refsDir,
      characters: chars,
      variants: args.characterVariants,
      concurrency: args.concurrency,
      skipExisting: args.skipExisting,
      stylePlatePaths,
      imageTimeoutMs: 15 * 60 * 1000,
    });
    console.log(`[L02] characters: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
    totals.generated += r.generated;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  if (args.kinds.has("locations")) {
    let locs = snapshot.locations;
    if (args.locationIds && args.locationIds.length > 0) {
      const idSet = new Set(args.locationIds);
      locs = locs.filter((l) => idSet.has(l.id));
    }
    const locVariants = args.locationVariants && args.locationVariants.length > 0
      ? (args.locationVariants as Parameters<typeof generateLocationRefsForBible>[0]["variants"])
      : undefined;
    console.log(
      `[L02] locations: ${locs.length} entries${locVariants ? ` variants=${locVariants.join(",")}` : ""}`
    );
    const r = await generateLocationRefsForBible({
      snapshot,
      refsDir,
      locations: locs,
      variants: locVariants,
      concurrency: args.concurrency,
      skipExisting: args.skipExisting,
      stylePlatePaths,
      imageTimeoutMs: 15 * 60 * 1000,
    });
    console.log(`[L02] locations: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
    totals.generated += r.generated;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  if (args.kinds.has("props")) {
    let props = snapshot.props;
    if (args.propIds && args.propIds.length > 0) {
      const idSet = new Set(args.propIds);
      props = props.filter((p) => idSet.has(p.id));
    }
    const propVariants = args.propVariants && args.propVariants.length > 0
      ? (args.propVariants as Parameters<typeof generatePropRefsForBible>[0]["variants"])
      : undefined;
    console.log(
      `[L02] props: ${props.length} entries${propVariants ? ` variants=${propVariants.join(",")}` : ""}`
    );
    const r = await generatePropRefsForBible({
      snapshot,
      refsDir,
      props,
      variants: propVariants,
      concurrency: args.concurrency,
      skipExisting: args.skipExisting,
      stylePlatePaths,
      imageTimeoutMs: 15 * 60 * 1000,
    });
    console.log(`[L02] props: gen=${r.generated} skip=${r.skipped} fail=${r.failed}`);
    totals.generated += r.generated;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  console.log("");
  console.log(`[L02] DONE: generated=${totals.generated} skipped=${totals.skipped} failed=${totals.failed}`);
  if (totals.failed > 0) process.exit(2);
}

main().catch((e) => {
  console.error("[L02] FAILED:", e);
  process.exit(1);
});
