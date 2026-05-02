/**
 * BibleSnapshot 起点のローカルキャラ参照画像生成 CLI
 *
 * DB 不要。手書き snapshot.json から各キャラの 5 種参照画像を直接ローカル PNG に出す。
 *
 * 用途:
 *   - 手書き snapshot の試走
 *   - DB レコード作成前のドライラン
 *   - Pilot/評価ベンチでのキャラ素材生成
 *
 * 使い方:
 *   npx tsx scripts/manga/build-bible-images-from-snapshot.ts \
 *     --snapshot=data/manga/bible/work-1-dungeon-explorer/snapshot.json
 *
 *   # variant 限定
 *   npx tsx scripts/manga/build-bible-images-from-snapshot.ts \
 *     --snapshot=... --variants=front,side
 *
 *   # 特定キャラのみ
 *   npx tsx scripts/manga/build-bible-images-from-snapshot.ts \
 *     --snapshot=... --characters=シノザキ・カナデ
 *
 * 出力:
 *   data/manga/bible/<slug>/refs/<character_name_safe>/<variant>.png
 */

import "./_env";
import { mkdir } from "fs/promises";
import path from "path";
import { loadBibleSnapshot } from "./load-bible-snapshot";
import { generateCharacterReferencesLocal } from "../../src/lib/manga/bible/character-images";
import type { CharacterRefVariant } from "../../src/lib/manga/bible/character-images";
import { generateLocationReferencesLocal } from "../../src/lib/manga/bible/location-images";
import type { LocationRefVariant } from "../../src/lib/manga/bible/location-images";

/** 何を生成するか */
type Target = "characters" | "locations" | "all";

type CliArgs = {
  snapshotPath: string;
  target: Target;
  charVariants?: CharacterRefVariant[];
  locVariants?: LocationRefVariant[];
  characters?: string[];
  locations?: string[];
  outputRoot: string;
  styleSheetLocalPath?: string;
  imageTimeoutMs: number;
  maxRetries: number;
};

const VALID_CHAR_VARIANTS: ReadonlyArray<CharacterRefVariant> = [
  "front",
  "side",
  "expr_joy",
  "expr_anger",
  "expr_sad",
];

const VALID_LOC_VARIANTS: ReadonlyArray<LocationRefVariant> = [
  "wide",
  "front",
  "from_door",
  "from_window",
  "time_morning",
  "time_evening",
  "time_night",
];

function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "snapshot":
        args.snapshotPath = value;
        break;
      case "target":
        if (value !== "characters" && value !== "locations" && value !== "all") {
          throw new Error(
            `--target は characters | locations | all のいずれか (got: ${value})`
          );
        }
        args.target = value;
        break;
      case "char-variants":
        args.charVariants = value
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is CharacterRefVariant =>
            (VALID_CHAR_VARIANTS as ReadonlyArray<string>).includes(s)
          );
        break;
      case "loc-variants":
        args.locVariants = value
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is LocationRefVariant =>
            (VALID_LOC_VARIANTS as ReadonlyArray<string>).includes(s)
          );
        break;
      case "characters":
        args.characters = value.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "locations":
        args.locations = value.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "output-root":
        args.outputRoot = value;
        break;
      case "style-sheet":
        args.styleSheetLocalPath = value;
        break;
      case "timeout-ms":
        args.imageTimeoutMs = Number.parseInt(value, 10);
        break;
      case "max-retries":
        args.maxRetries = Number.parseInt(value, 10);
        break;
    }
  }
  if (!args.snapshotPath) {
    throw new Error("--snapshot=<path-to-snapshot.json> が必要です");
  }
  return {
    snapshotPath: args.snapshotPath,
    target: args.target ?? "all",
    charVariants: args.charVariants,
    locVariants: args.locVariants,
    characters: args.characters,
    locations: args.locations,
    outputRoot: args.outputRoot ?? "data/manga/bible",
    styleSheetLocalPath: args.styleSheetLocalPath,
    imageTimeoutMs: args.imageTimeoutMs ?? 5 * 60 * 1000,
    maxRetries: args.maxRetries ?? 1,
  };
}

/**
 * キャラ名をファイルシステム安全な ASCII slug に変換
 * (日本語名はそのまま使うとパスで扱いづらいので character_name_romaji 優先)
 */
function safeName(name: string, romaji?: string): string {
  if (romaji && romaji !== "TODO" && !romaji.startsWith("TODO")) {
    return romaji.toLowerCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
  }
  return name.replace(/[^\w぀-ゟ゠-ヿ一-龯-]/g, "_");
}

type SummaryRow = {
  kind: "character" | "location";
  name: string;
  generated: number;
  requested: number;
  paths: string[];
  skipped?: boolean;
};

async function runCharacters(
  args: CliArgs,
  snapshot: ReturnType<typeof loadBibleSnapshot>["snapshot"]
): Promise<SummaryRow[]> {
  const targets = args.characters
    ? snapshot.characters.filter((c) =>
        args.characters!.includes(c.character_name)
      )
    : snapshot.characters;

  const variants = args.charVariants ?? VALID_CHAR_VARIANTS;
  console.log(
    `[characters] 対象 ${targets.length} 名 / variants: ${variants.join(",")}`
  );

  const summary: SummaryRow[] = [];

  for (const c of targets) {
    if (c.character_name.startsWith("TODO")) {
      console.log(`  [skip] ${c.character_name} は TODO のため未生成`);
      summary.push({
        kind: "character",
        name: c.character_name,
        generated: 0,
        requested: variants.length,
        paths: [],
        skipped: true,
      });
      continue;
    }

    const dirName = safeName(c.character_name, c.character_name_romaji);
    const outputDir = path.resolve(
      args.outputRoot,
      snapshot.meta.slug,
      "refs",
      "characters",
      dirName
    );
    await mkdir(outputDir, { recursive: true });

    console.log(`  [gen] ${c.character_name} (${c.character_role}) -> ${outputDir}`);
    const startedAt = Date.now();

    const results = await generateCharacterReferencesLocal({
      characterName: c.character_name,
      spec: c.spec,
      artStyle: snapshot.meta.art_style,
      outputDir,
      variants: [...variants],
      styleSheetLocalPath: args.styleSheetLocalPath,
      imageTimeoutMs: args.imageTimeoutMs,
      maxRetries: args.maxRetries,
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `    -> ${results.length}/${variants.length} 枚生成 (${elapsed}s)`
    );
    summary.push({
      kind: "character",
      name: c.character_name,
      generated: results.length,
      requested: variants.length,
      paths: results.map((r) => r.localPath),
    });
  }

  return summary;
}

async function runLocations(
  args: CliArgs,
  snapshot: ReturnType<typeof loadBibleSnapshot>["snapshot"]
): Promise<SummaryRow[]> {
  const targets = args.locations
    ? snapshot.locations.filter((l) =>
        args.locations!.includes(l.location_name)
      )
    : snapshot.locations;

  const variants = args.locVariants ?? ["wide", "front", "from_door"];
  console.log(
    `[locations] 対象 ${targets.length} 箇所 / variants: ${variants.join(",")}`
  );

  const summary: SummaryRow[] = [];

  for (const l of targets) {
    if (l.location_name.startsWith("TODO")) {
      console.log(`  [skip] ${l.location_name} は TODO のため未生成`);
      summary.push({
        kind: "location",
        name: l.location_name,
        generated: 0,
        requested: variants.length,
        paths: [],
        skipped: true,
      });
      continue;
    }

    const dirName = safeName(l.location_name);
    const outputDir = path.resolve(
      args.outputRoot,
      snapshot.meta.slug,
      "refs",
      "locations",
      dirName
    );
    await mkdir(outputDir, { recursive: true });

    console.log(`  [gen] ${l.location_name} (${l.location_type}) -> ${outputDir}`);
    const startedAt = Date.now();

    const results = await generateLocationReferencesLocal({
      locationName: l.location_name,
      spec: l.spec,
      artStyle: snapshot.meta.art_style,
      outputDir,
      variants: [...variants],
      styleSheetLocalPath: args.styleSheetLocalPath,
      imageTimeoutMs: args.imageTimeoutMs,
      maxRetries: args.maxRetries,
    });

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `    -> ${results.length}/${variants.length} 枚生成 (${elapsed}s)`
    );
    summary.push({
      kind: "location",
      name: l.location_name,
      generated: results.length,
      requested: variants.length,
      paths: results.map((r) => r.localPath),
    });
  }

  return summary;
}

async function main() {
  const args = parseArgs();
  const { snapshot, todos } = loadBibleSnapshot(args.snapshotPath);

  console.log(
    `[build-bible-images-from-snapshot] slug=${snapshot.meta.slug} title=${snapshot.meta.title}`
  );
  console.log(
    `  art_style: ${snapshot.meta.art_style} / target: ${args.target}`
  );
  console.log(
    `  characters: ${snapshot.characters.length} 名 / locations: ${snapshot.locations.length} 箇所`
  );
  if (todos.length > 0) {
    console.log(`  ⚠️ TODO 残: ${todos.length} 件 (snapshot に未確定箇所あり)`);
  }
  console.log("");

  const summary: SummaryRow[] = [];

  if (args.target === "characters" || args.target === "all") {
    summary.push(...(await runCharacters(args, snapshot)));
  }
  if (args.target === "locations" || args.target === "all") {
    summary.push(...(await runLocations(args, snapshot)));
  }

  if (summary.length === 0) {
    console.error("対象 0 件。--characters / --locations の指定を確認してください。");
    process.exit(1);
  }

  console.log("");
  console.log("=========================================");
  console.log(`[build-bible-images-from-snapshot] DONE`);
  for (const s of summary) {
    const tag = s.skipped ? "(skip)" : `${s.generated}/${s.requested}`;
    console.log(`  [${s.kind}] ${tag} ${s.name}`);
  }
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[build-bible-images-from-snapshot] FAILED:", err);
  process.exit(1);
});
