// ep3 が無い作品の Layer6 を再実行する補完スクリプト
// 使い方: npx tsx scripts/generation/fix-missing-ep3.ts [concurrency]

import { readdirSync, existsSync, statSync } from "fs";
import { join, basename } from "path";
import { runLayer6 } from "../../src/lib/screening/layers/layer6-ep23";

const WORKS_DIR = "data/generation/works-test";
const CONCURRENCY = parseInt(process.argv[2] ?? "2", 10);

async function main(): Promise<void> {
  const dirs = readdirSync(WORKS_DIR).filter((d) => statSync(join(WORKS_DIR, d)).isDirectory());
  const missing = dirs.filter((d) => {
    const has5 = existsSync(join(WORKS_DIR, d, "layer5_ep001.md"));
    const has6 = existsSync(join(WORKS_DIR, d, "layer6_ep003.md"));
    return has5 && !has6;
  });

  console.log(`ep3欠け: ${missing.length}件 / concurrency: ${CONCURRENCY}`);
  let nextIdx = 0;
  let ok = 0;
  let fail = 0;

  async function worker(wid: number): Promise<void> {
    while (true) {
      const i = nextIdx++;
      if (i >= missing.length) return;
      const slug = missing[i];
      console.log(`[w${wid}] ${slug} Layer6 再実行...`);
      const t0 = Date.now();
      const r = await runLayer6(slug, WORKS_DIR);
      const ms = Date.now() - t0;
      if (r.ok) {
        ok++;
        console.log(`[w${wid}] ✅ ${slug} ${(ms/1000).toFixed(0)}s ep2=${r.ep2CharCount} ep3=${r.ep3CharCount}`);
      } else {
        fail++;
        console.log(`[w${wid}] ❌ ${slug} ${(ms/1000).toFixed(0)}s ${r.reason}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, k) => worker(k + 1)));
  console.log(`\n完了: ok=${ok} fail=${fail}`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
