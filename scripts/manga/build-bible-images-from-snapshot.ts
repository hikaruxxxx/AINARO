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

type CliArgs = {
  snapshotPath: string;
  variants?: CharacterRefVariant[];
  characters?: string[];
  outputRoot: string;
  styleSheetLocalPath?: string;
  imageTimeoutMs: number;
  maxRetries: number;
};

const VALID_VARIANTS: ReadonlyArray<CharacterRefVariant> = [
  "front",
  "side",
  "expr_joy",
  "expr_anger",
  "expr_sad",
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
      case "variants":
        args.variants = value
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is CharacterRefVariant =>
            (VALID_VARIANTS as ReadonlyArray<string>).includes(s)
          );
        break;
      case "characters":
        args.characters = value.split(",").map((s) => s.trim()).filter(Boolean);
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
    variants: args.variants,
    characters: args.characters,
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

async function main() {
  const args = parseArgs();
  const { snapshot, todos } = loadBibleSnapshot(args.snapshotPath);

  console.log(
    `[build-bible-images-from-snapshot] slug=${snapshot.meta.slug} title=${snapshot.meta.title}`
  );
  console.log(`  art_style: ${snapshot.meta.art_style}`);
  console.log(`  characters: ${snapshot.characters.length} 名`);
  if (todos.length > 0) {
    console.log(`  ⚠️ TODO 残: ${todos.length} 件 (snapshot に未確定箇所あり)`);
  }

  // フィルタ
  const targets = args.characters
    ? snapshot.characters.filter((c) =>
        args.characters!.includes(c.character_name)
      )
    : snapshot.characters;

  if (targets.length === 0) {
    console.error("対象キャラ 0 件。--characters の指定を確認してください。");
    process.exit(1);
  }

  const variants = args.variants ?? VALID_VARIANTS;
  console.log(`  対象キャラ: ${targets.length} 名 / variants: ${variants.join(",")}`);
  console.log("");

  const summary: Array<{
    name: string;
    generated: number;
    requested: number;
    paths: string[];
    skipped?: boolean;
  }> = [];

  for (const c of targets) {
    // TODO 名のキャラはスキップ (画像生成しても無意味)
    if (c.character_name.startsWith("TODO")) {
      console.log(`[skip] ${c.character_name} は TODO のため未生成`);
      summary.push({
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
      dirName
    );
    await mkdir(outputDir, { recursive: true });

    console.log(`[gen] ${c.character_name} (${c.character_role}) -> ${outputDir}`);
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
      `  -> ${results.length}/${variants.length} 枚生成 (${elapsed}s)`
    );
    summary.push({
      name: c.character_name,
      generated: results.length,
      requested: variants.length,
      paths: results.map((r) => r.localPath),
    });
  }

  console.log("");
  console.log("=========================================");
  console.log(`[build-bible-images-from-snapshot] DONE`);
  for (const s of summary) {
    const tag = s.skipped ? "(skip)" : `${s.generated}/${s.requested}`;
    console.log(`  ${tag} ${s.name}`);
  }
  console.log("=========================================");
}

main().catch((err) => {
  console.error("[build-bible-images-from-snapshot] FAILED:", err);
  process.exit(1);
});
