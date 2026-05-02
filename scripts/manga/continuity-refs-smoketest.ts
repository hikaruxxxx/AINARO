/**
 * Continuity Refs Registry スモークテスト
 *
 * ダミー参照画像ファイルを `data/manga/bible/<slug>/refs/...` に配置し、
 * buildGroupRefRegistry / resolveRefsForGroupIds が正しく解決するか確認する。
 *
 * テスト後は作成したダミーファイルを削除する。
 *
 * 実行: npx tsx scripts/manga/continuity-refs-smoketest.ts
 */

import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import path from "path";
import {
  buildGroupRefRegistry,
  resolveRefsForGroupIds,
} from "@/lib/manga/page-director";
import { loadBibleSnapshot } from "./load-bible-snapshot";

async function main() {
  const snapshotPath = "data/manga/bible/work-1-dungeon-explorer/snapshot.json";
  const { snapshot } = loadBibleSnapshot(snapshotPath);

  console.log(`[smoketest] snapshot: ${snapshot.meta.slug}`);
  console.log(`  continuity_seeds: ${snapshot.continuity_seeds.length} 件`);

  // ダミーファイルを配置すべき場所を計算 (生成側 build-bible-images-from-snapshot.ts と同じ規則)
  const refsRoot = path.resolve("data/manga/bible");
  const slugRefsRoot = path.join(refsRoot, snapshot.meta.slug, "refs");

  // ダミー対象:
  //   characters/shinozaki_kanade/{front,side,expr_joy,expr_anger,expr_sad}.png
  //   locations/「真銀の翼」冒険者ギルド受付ホール/{wide,front,from_door}.png
  //   locations/ダンジョン1階層 入口広間/{wide,front,from_door}.png
  // ※ 受付嬢 (TODO) と 3階層ボス間 (TODO) は生成側でスキップされる前提でダミーも作らない
  const charDir = path.join(slugRefsRoot, "characters", "shinozaki_kanade");
  const guildDir = path.join(
    slugRefsRoot,
    "locations",
    safeName("「真銀の翼」冒険者ギルド受付ホール")
  );
  const dungeonDir = path.join(
    slugRefsRoot,
    "locations",
    safeName("ダンジョン1階層 入口広間")
  );

  const created: string[] = [];
  const createdDirs: string[] = [];

  function dummy(p: string) {
    const dir = path.dirname(p);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      createdDirs.push(dir);
    }
    if (!existsSync(p)) {
      writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG マジック
      created.push(p);
    }
  }

  function safeName(name: string): string {
    return name.replace(/[^\w぀-ゟ゠-ヿ一-龯-]/g, "_");
  }

  for (const v of ["front", "side", "expr_joy", "expr_anger", "expr_sad"]) {
    dummy(path.join(charDir, `${v}.png`));
  }
  for (const v of ["wide", "front", "from_door"]) {
    dummy(path.join(guildDir, `${v}.png`));
    dummy(path.join(dungeonDir, `${v}.png`));
  }

  console.log("");
  console.log(`[smoketest] ダミー画像配置: ${created.length} ファイル`);

  try {
    const registry = buildGroupRefRegistry({
      snapshot,
      refsRoot,
      ext: "png",
      warnMissing: true,
    });

    console.log("");
    console.log(`[smoketest] GroupRefRegistry 構築結果:`);
    let totalEntries = 0;
    for (const [gid, paths] of registry.entries()) {
      totalEntries += paths.length;
      console.log(`  ${gid}: ${paths.length} 件`);
      for (const p of paths) console.log(`    - ${path.relative(process.cwd(), p)}`);
    }
    console.log(`  合計: ${registry.size} group / ${totalEntries} paths`);

    // resolveRefsForGroupIds テスト
    const exampleGroupIds = [
      "char_kanade_face_v1",
      "char_kanade_outfit_v1",
      "loc_guild_hall_v1",
      "prop_monocle_v1",
    ];
    const resolved = resolveRefsForGroupIds(exampleGroupIds, registry);
    console.log("");
    console.log(`[smoketest] resolveRefsForGroupIds(${exampleGroupIds.join(",")}):`);
    console.log(`  ${resolved.length} paths (重複排除後)`);
    for (const p of resolved) console.log(`    - ${path.relative(process.cwd(), p)}`);

    // アサーション:
    //  - char_kanade_face_v1 は characters/shinozaki_kanade/* を 5 件
    //  - char_kanade_outfit_v1 は front/side のみ 2 件 (face_v1 と重複するので追加 0)
    //  - loc_guild_hall_v1 は wide/front/from_door の 3 件
    //  - prop_monocle_v1 は所有キャラ (シノザキ・カナデ) の front/side を流用 → 重複で追加 0
    const expected = 5 + 0 + 3 + 0;
    if (resolved.length !== expected) {
      console.error(
        `  ❌ expected ${expected} resolved paths, got ${resolved.length}`
      );
      process.exit(1);
    }

    // 不在 group の解決
    const missing = resolveRefsForGroupIds(["nonexistent"], registry);
    if (missing.length !== 0) {
      console.error(`  ❌ unknown group_id should resolve to []`);
      process.exit(1);
    }

    // 空入力
    const empty = resolveRefsForGroupIds(undefined, registry);
    if (empty.length !== 0) {
      console.error(`  ❌ undefined input should resolve to []`);
      process.exit(1);
    }

    console.log("");
    console.log("[smoketest] ✅ PASS");
  } finally {
    // ダミー削除
    for (const p of created) {
      try {
        rmSync(p);
      } catch {
        // ignore
      }
    }
    // ダミー dir も削除 (空になっていれば)
    for (const d of createdDirs.reverse()) {
      try {
        rmSync(d, { recursive: false });
      } catch {
        // 他のファイルがある場合は残す
      }
    }
  }
}

main().catch((err) => {
  console.error("[smoketest] ERROR:", err);
  process.exit(1);
});
