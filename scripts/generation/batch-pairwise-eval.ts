// 既存 works/ の完成作品に対してペアワイズ評価を一括実行する
//
// daemon とは独立して走る。ep1(Layer5)ベースで評価。
// 使い方: npx tsx scripts/generation/batch-pairwise-eval.ts [concurrency]

import { readdirSync, existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { evaluateLayer } from "../../src/lib/screening/layer-eval";

const WORKS_DIR = "data/generation/works";
const CONCURRENCY = parseInt(process.argv[2] ?? "2", 10);
const EVAL_LAYER = 5 as const; // ep1 で評価

interface EvalResult {
  slug: string;
  genre: string;
  passed: boolean;
  rating: number;
  matchCount: number;
  finalized: boolean;
}

async function main(): Promise<void> {
  const dirs = readdirSync(WORKS_DIR).filter((d) => statSync(join(WORKS_DIR, d)).isDirectory());

  // ep1 完成済みの作品のみ
  const targets = dirs.filter((d) => {
    return existsSync(join(WORKS_DIR, d, "layer5_ep001.md")) && existsSync(join(WORKS_DIR, d, "_meta.json"));
  });

  // ジャンル抽出
  const workMetas = targets.map((slug) => {
    const meta = JSON.parse(readFileSync(join(WORKS_DIR, slug, "_meta.json"), "utf-8"));
    return { slug, genre: meta.seed.genre as string, isExploration: meta.seed.isExploration as boolean };
  });

  console.log(`=== ペアワイズ評価バッチ ===`);
  console.log(`対象: ${workMetas.length}作品, concurrency: ${CONCURRENCY}, layer: ${EVAL_LAYER}\n`);

  const results: EvalResult[] = [];
  let nextIdx = 0;

  async function worker(wid: number): Promise<void> {
    while (true) {
      const i = nextIdx++;
      if (i >= workMetas.length) return;
      const { slug, genre, isExploration } = workMetas[i];
      try {
        const r = await evaluateLayer(slug, EVAL_LAYER, genre, isExploration, WORKS_DIR);
        results.push({ slug, genre, passed: r.passed, rating: r.rating, matchCount: r.matchCount, finalized: r.finalized });
        console.log(
          `[w${wid}] ${i + 1}/${workMetas.length} ${slug} rating=${r.rating.toFixed(0)} matches=${r.matchCount} finalized=${r.finalized} ${r.reason ?? ""}`,
        );
      } catch (e) {
        console.error(`[w${wid}] ${slug} error: ${(e as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, k) => worker(k + 1)));

  // サマリ
  console.log("\n=== サマリ ===");
  console.log(`評価完了: ${results.length}/${workMetas.length}`);
  console.log(`finalized: ${results.filter((r) => r.finalized).length}`);

  // ジャンル別 top 3
  const byGenre = new Map<string, EvalResult[]>();
  for (const r of results) {
    if (!byGenre.has(r.genre)) byGenre.set(r.genre, []);
    byGenre.get(r.genre)!.push(r);
  }
  console.log("\n--- ジャンル別 Top 3 ---");
  for (const [genre, works] of [...byGenre.entries()].sort()) {
    works.sort((a, b) => b.rating - a.rating);
    console.log(`\n${genre} (${works.length}作品):`);
    for (const w of works.slice(0, 3)) {
      console.log(`  ${w.rating.toFixed(0)} ${w.slug} (matches=${w.matchCount})`);
    }
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
