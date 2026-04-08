// Phase C バッチ試験: N作品を順に test-single-work と同じ流れで生成
//
// 使い方: npx tsx scripts/generation/batch-smoke.ts [N] [worksDir]
// デフォルト: N=10, worksDir=data/generation/works-test
//
// - 並列実行はしない(claude-cliの同時呼び出し上限のため)
// - 各作品の結果(ok/時間/字数/reason)をJSONLで data/generation/batch-smoke-result.jsonl に追記
// - 1作品が失敗しても次へ進む

import { existsSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { sampleSeedV2 } from "../../src/lib/screening/seed-v2";
import { runLayer1 } from "../../src/lib/screening/layers/layer1-logline";
import { runLayer2 } from "../../src/lib/screening/layers/layer2-plot";
import { runLayer3 } from "../../src/lib/screening/layers/layer3-synopsis";
import { runLayer4 } from "../../src/lib/screening/layers/layer4-arc-plot";
import { runLayer5 } from "../../src/lib/screening/layers/layer5-ep1";
import { runLayer6 } from "../../src/lib/screening/layers/layer6-ep23";

const N = parseInt(process.argv[2] ?? "10", 10);
const WORKS_DIR = process.argv[3] ?? "data/generation/works-test";
const RESULT_LOG = "data/generation/batch-smoke-result.jsonl";

interface WorkResult {
  slug: string;
  genre: string;
  primaryDesire: string;
  startedAt: string;
  totalMs: number;
  layers: { layer: number; ok: boolean; ms: number; chars: number; reason?: string }[];
  finalOk: boolean;
}

function listLayerChars(workDir: string, layer: number): number {
  const fs = require("fs") as typeof import("fs");
  if (!existsSync(workDir)) return 0;
  return fs
    .readdirSync(workDir)
    .filter((f: string) => f.startsWith(`layer${layer}`))
    .map((name: string) => readFileSync(join(workDir, name), "utf-8").length)
    .reduce((s: number, n: number) => s + n, 0);
}

async function runOneWork(idx: number): Promise<WorkResult> {
  const seed = sampleSeedV2();
  if (!seed) throw new Error("seed exhausted");
  const slug = `batch-${Date.now().toString(36)}-${idx}`;
  const workDir = join(WORKS_DIR, slug);
  mkdirSync(workDir, { recursive: true });
  writeFileSync(
    join(workDir, "_meta.json"),
    JSON.stringify({ slug, seed, createdAt: new Date().toISOString() }, null, 2),
  );

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const layerFns = [
    { id: 1, fn: runLayer1 },
    { id: 2, fn: runLayer2 },
    { id: 3, fn: runLayer3 },
    { id: 4, fn: runLayer4 },
    { id: 5, fn: runLayer5 },
    { id: 6, fn: runLayer6 },
  ];

  const layers: WorkResult["layers"] = [];
  let finalOk = true;
  for (const { id, fn } of layerFns) {
    const lt0 = Date.now();
    let r: { ok: boolean; reason?: string };
    try {
      r = (await fn(slug, WORKS_DIR)) as { ok: boolean; reason?: string };
    } catch (e) {
      r = { ok: false, reason: `exception: ${(e as Error).message}` };
    }
    const ms = Date.now() - lt0;
    const chars = listLayerChars(workDir, id);
    layers.push({ layer: id, ok: r.ok, ms, chars, reason: r.reason });
    console.log(
      `  [${idx}/L${id}] ok=${r.ok} ${(ms / 1000).toFixed(0)}s ${chars}字 ${r.reason ?? ""}`,
    );
    if (!r.ok) {
      finalOk = false;
      break;
    }
  }
  const totalMs = Date.now() - t0;
  return {
    slug,
    genre: seed.genre,
    primaryDesire: seed.primaryDesire,
    startedAt,
    totalMs,
    layers,
    finalOk,
  };
}

async function main(): Promise<void> {
  console.log(`=== Phase C バッチ試験: ${N}作品 ===`);
  console.log(`worksDir: ${WORKS_DIR}`);
  console.log(`result log: ${RESULT_LOG}\n`);

  const results: WorkResult[] = [];
  for (let i = 1; i <= N; i++) {
    console.log(`\n--- 作品 ${i}/${N} 開始 ---`);
    try {
      const r = await runOneWork(i);
      results.push(r);
      appendFileSync(RESULT_LOG, JSON.stringify(r) + "\n");
      console.log(
        `--- 作品 ${i} 完了: finalOk=${r.finalOk} ${(r.totalMs / 1000).toFixed(0)}s ${r.genre} ---`,
      );
    } catch (e) {
      console.error(`--- 作品 ${i} 例外: ${(e as Error).message} ---`);
    }
  }

  // サマリ
  console.log("\n=== Phase C サマリ ===");
  const okCount = results.filter((r) => r.finalOk).length;
  console.log(`完走: ${okCount}/${results.length}`);
  const avgMs = results.reduce((s, r) => s + r.totalMs, 0) / Math.max(results.length, 1);
  console.log(`平均時間: ${(avgMs / 1000 / 60).toFixed(1)}分`);
  const byGenre: Record<string, number> = {};
  for (const r of results) byGenre[r.genre] = (byGenre[r.genre] ?? 0) + 1;
  console.log("ジャンル分布:");
  for (const [g, c] of Object.entries(byGenre).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g}: ${c}`);
  }
  // 失敗箇所
  const failsByLayer: Record<number, number> = {};
  for (const r of results.filter((r) => !r.finalOk)) {
    const failed = r.layers.find((l) => !l.ok);
    if (failed) failsByLayer[failed.layer] = (failsByLayer[failed.layer] ?? 0) + 1;
  }
  if (Object.keys(failsByLayer).length > 0) {
    console.log("失敗層:");
    for (const [l, c] of Object.entries(failsByLayer)) console.log(`  Layer${l}: ${c}件`);
  }
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
