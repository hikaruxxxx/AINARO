/**
 * BibleSnapshot ローダー兼バリデーター
 *
 * 用途:
 *   1. 手書き snapshot.json を読み込み、型整合をチェックする
 *   2. build-bible-images.ts / generate-storyboard.ts から import して使う共通入口
 *
 * 使い方:
 *   npx tsx scripts/manga/load-bible-snapshot.ts data/manga/bible/work-1-dungeon-explorer/snapshot.json
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import {
  isBibleSnapshot,
  type BibleSnapshot,
} from "../../src/lib/manga/bible/bible-snapshot";

export type LoadResult = {
  snapshot: BibleSnapshot;
  todos: string[];
};

/**
 * snapshot.json を読み込み、型ガード+TODO収集を行う
 */
export function loadBibleSnapshot(jsonPath: string): LoadResult {
  const absPath = resolve(jsonPath);
  const raw = readFileSync(absPath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!isBibleSnapshot(parsed)) {
    throw new Error(
      `BibleSnapshot として不正な形式です: ${absPath}\n` +
        `schema_version=1 / meta / characters / locations / style_directives / visual_motifs / continuity_seeds / volume_synopsis が必須`
    );
  }

  const todos = collectTodos(parsed);
  return { snapshot: parsed, todos };
}

/**
 * snapshot 全体を再帰的に走査して "TODO" を含む文字列を列挙
 */
function collectTodos(snapshot: BibleSnapshot): string[] {
  const todos: string[] = [];
  walk(snapshot, "$", todos);
  return todos;
}

function walk(value: unknown, path: string, acc: string[]): void {
  if (typeof value === "string") {
    if (value.includes("TODO")) acc.push(`${path}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, acc));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      walk(v, `${path}.${k}`, acc);
    }
  }
}

// CLI エントリ
if (require.main === module) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: npx tsx scripts/manga/load-bible-snapshot.ts <path-to-snapshot.json>");
    process.exit(1);
  }
  try {
    const { snapshot, todos } = loadBibleSnapshot(arg);
    console.log(`✅ BibleSnapshot 読み込み成功`);
    console.log(`  slug: ${snapshot.meta.slug}`);
    console.log(`  title: ${snapshot.meta.title}`);
    console.log(`  art_style: ${snapshot.meta.art_style}`);
    console.log(`  characters: ${snapshot.characters.length} 名`);
    console.log(`  locations: ${snapshot.locations.length} 箇所`);
    console.log(`  visual_motifs: ${snapshot.visual_motifs.length} 件`);
    console.log(`  continuity_seeds: ${snapshot.continuity_seeds.length} 件`);
    console.log(``);
    console.log(`📋 TODO 残: ${todos.length} 件`);
    todos.forEach((t) => console.log(`  - ${t}`));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
