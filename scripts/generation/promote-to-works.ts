// works-test/ の完成作品を data/generation/works/ に昇格する
//
// - ep3 まで揃っている作品のみコピー
// - _meta.json を読んでジャンル/シード情報を引き継ぐ
// - 既に works/ に同 slug があればスキップ
//
// 使い方: npx tsx scripts/generation/promote-to-works.ts [srcDir]

import { readdirSync, existsSync, statSync, cpSync, mkdirSync } from "fs";
import { join } from "path";

const SRC_DIR = process.argv[2] ?? "data/generation/works-test";
const DST_DIR = "data/generation/works";

function main(): void {
  if (!existsSync(DST_DIR)) mkdirSync(DST_DIR, { recursive: true });

  const dirs = readdirSync(SRC_DIR).filter((d) => statSync(join(SRC_DIR, d)).isDirectory());
  let promoted = 0;
  let skipped = 0;
  let incomplete = 0;

  for (const slug of dirs) {
    const src = join(SRC_DIR, slug);
    const dst = join(DST_DIR, slug);

    // ep3 まで揃っているか確認
    const hasEp1 = existsSync(join(src, "layer5_ep001.md"));
    const hasEp3 = existsSync(join(src, "layer6_ep003.md"));
    if (!hasEp1 || !hasEp3) {
      incomplete++;
      continue;
    }

    // 既に存在すればスキップ
    if (existsSync(dst)) {
      skipped++;
      continue;
    }

    cpSync(src, dst, { recursive: true });
    promoted++;
  }

  console.log(`=== promote-to-works 完了 ===`);
  console.log(`昇格: ${promoted}件`);
  console.log(`スキップ(既存): ${skipped}件`);
  console.log(`未完成: ${incomplete}件`);
  console.log(`合計 works/: ${readdirSync(DST_DIR).filter(d => statSync(join(DST_DIR, d)).isDirectory()).length}件`);
}

main();
