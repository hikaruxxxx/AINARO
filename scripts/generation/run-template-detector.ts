// works-test 配下の Layer5 ep1 本文を集めて template-detector を走らせる
//
// 使い方: npx tsx scripts/generation/run-template-detector.ts [worksDir]

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { detectTemplateClusters } from "../../src/lib/screening/template-detector";

const WORKS_DIR = process.argv[2] ?? "data/generation/works-test";

function main(): void {
  const dirs = readdirSync(WORKS_DIR).filter((d) => statSync(join(WORKS_DIR, d)).isDirectory());
  const works: { slug: string; text: string }[] = [];
  for (const d of dirs) {
    const ep1 = join(WORKS_DIR, d, "layer5_ep001.md");
    if (existsSync(ep1)) {
      works.push({ slug: d, text: readFileSync(ep1, "utf-8") });
    }
  }
  console.log(`対象: ${works.length}作品 (worksDir=${WORKS_DIR})\n`);

  const report = detectTemplateClusters(works);
  console.log("=== template-detector レポート ===");
  console.log(`総作品数: ${report.totalWorks}`);
  console.log(`クラスタ数: ${report.clusters.length}`);
  console.log(`flagged: ${report.flaggedSlugs.length}件`);

  if (report.clusters.length > 0) {
    console.log("\n--- クラスタ詳細 ---");
    for (const c of report.clusters) {
      console.log(`cluster size=${c.members.length}:`);
      for (const m of c.members) console.log(`  - ${m}`);
    }
  } else {
    console.log("\n✅ テンプレ化クラスタは検出されませんでした");
  }
}

main();
