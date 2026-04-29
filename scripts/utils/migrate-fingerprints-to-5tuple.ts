/**
 * used_seeds.json の fingerprint を 4-tuple → 5-tuple にマイグレーションする。
 *
 * 旧: (primaryDesire|genre|境遇|転機)
 * 新: (primaryDesire|genre|境遇|転機|方向)
 *
 * 各 seed の tags.方向 を使って fingerprint を再計算する。
 * 旧 fingerprint との重複は seed側で deduplicate される (5-tuple化で keyspace 拡大、
 * 同じ 4-tuple でも方向が違えば別の作品扱い)。
 *
 * 副作用:
 *   - data/generation/_used_seeds.json を上書き
 *   - 元のファイルは _used_seeds.json.bak.YYYYMMDDHHMMSS にバックアップ
 *
 * 実行: npx tsx scripts/utils/migrate-fingerprints-to-5tuple.ts
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { makeFingerprint, type SeedV2, type UsedSeedsFile } from "../../src/lib/screening/seed-v2";

const PATH = "data/generation/_used_seeds.json";

function timestamp(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("");
}

function main() {
  if (!existsSync(PATH)) {
    console.error(`${PATH} not found`);
    process.exit(1);
  }

  const file = JSON.parse(readFileSync(PATH, "utf8")) as UsedSeedsFile;
  console.log(`[migrate] loaded ${file.seeds.length} seeds, ${file.fingerprints.length} fingerprints`);

  // バックアップ
  const backup = `${PATH}.bak.${timestamp()}`;
  copyFileSync(PATH, backup);
  console.log(`[migrate] backup saved to ${backup}`);

  // 各 seed の fingerprint を再計算
  const newSeeds: SeedV2[] = [];
  const newFingerprints = new Set<string>();
  let migrated = 0;
  let kept = 0;
  let skipped = 0;

  for (const seed of file.seeds) {
    if (!seed.tags || !seed.tags.方向) {
      // 方向 が無い古いシードはマイグレーション不能 — 旧 fingerprint をそのまま使い続ける
      skipped++;
      newSeeds.push(seed);
      newFingerprints.add(seed.fingerprint);
      continue;
    }
    const oldFp = seed.fingerprint;
    const newFp = makeFingerprint(seed.primaryDesire, seed.genre, seed.tags);
    if (oldFp === newFp) {
      kept++;
    } else {
      migrated++;
    }
    newSeeds.push({ ...seed, fingerprint: newFp });
    newFingerprints.add(newFp);
  }

  const newFile: UsedSeedsFile = {
    version: file.version,
    fingerprints: Array.from(newFingerprints),
    seeds: newSeeds,
  };

  writeFileSync(PATH, JSON.stringify(newFile, null, 2));
  console.log(
    `[migrate] done: migrated=${migrated} kept=${kept} skipped=${skipped} ` +
      `unique fingerprints=${newFingerprints.size} (was ${file.fingerprints.length})`,
  );
}

main();
