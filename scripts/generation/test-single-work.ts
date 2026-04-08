// Phase B スモーク試験: 1作品をLayer1→6まで通し、各層の所要時間/文字数を記録する
//
// 使い方:
//   npx tsx scripts/generation/test-single-work.ts [genre]
//
// - data/generation/works-test/{slug}/ に隔離して保存
// - _used_seeds.json には記録しない(本番プールを汚さない)
// - 実LLM(claude -p)を呼ぶ。コスト目安 $1 以内

import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { sampleSeedV2 } from "../../src/lib/screening/seed-v2";
import { runLayer1 } from "../../src/lib/screening/layers/layer1-logline";
import { runLayer2 } from "../../src/lib/screening/layers/layer2-plot";
import { runLayer3 } from "../../src/lib/screening/layers/layer3-synopsis";
import { runLayer4 } from "../../src/lib/screening/layers/layer4-arc-plot";
import { runLayer5 } from "../../src/lib/screening/layers/layer5-ep1";
import { runLayer6 } from "../../src/lib/screening/layers/layer6-ep23";

const WORKS_DIR = "data/generation/works-test";

interface LayerReport {
  layer: number;
  ok: boolean;
  ms: number;
  files: { name: string; chars: number }[];
  reason?: string;
}

function readChars(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf-8").length;
}

function listLayerFiles(workDir: string, layer: number): { name: string; chars: number }[] {
  // layer{N} で始まるファイルを探す
  const fs = require("fs") as typeof import("fs");
  const all = fs.readdirSync(workDir);
  return all
    .filter((f: string) => f.startsWith(`layer${layer}`))
    .map((name: string) => ({ name, chars: readChars(join(workDir, name)) }));
}

async function main(): Promise<void> {
  const genreArg = process.argv[2];

  console.log("=== Phase B スモーク: 1作品をLayer1→6まで通す ===\n");

  // 1. シード抽選
  const seed = sampleSeedV2(genreArg ? { genre: genreArg } : {});
  if (!seed) {
    console.error("シード抽選に失敗(枯渇)");
    process.exit(1);
  }
  console.log("シード:");
  console.log(`  ジャンル: ${seed.genre}`);
  console.log(`  主欲求: ${seed.primaryDesire} / 副: ${seed.secondaryDesire}`);
  console.log(`  境遇=${seed.tags.境遇} 転機=${seed.tags.転機} 方向=${seed.tags.方向} フック=${seed.tags.フック}`);
  console.log(`  fingerprint: ${seed.fingerprint}\n`);

  // 2. _meta.json 保存(本番プールは汚さない)
  const slug = `smoke-${Date.now().toString(36)}`;
  const workDir = join(WORKS_DIR, slug);
  mkdirSync(workDir, { recursive: true });
  const meta = {
    slug,
    seed,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(workDir, "_meta.json"), JSON.stringify(meta, null, 2));
  console.log(`workDir: ${workDir}\n`);

  // 3. 各層を順に実行
  const reports: LayerReport[] = [];
  const layers = [
    { id: 1, fn: runLayer1 },
    { id: 2, fn: runLayer2 },
    { id: 3, fn: runLayer3 },
    { id: 4, fn: runLayer4 },
    { id: 5, fn: runLayer5 },
    { id: 6, fn: runLayer6 },
  ];

  for (const { id, fn } of layers) {
    console.log(`--- Layer ${id} 開始 ---`);
    const t0 = Date.now();
    let r: { ok: boolean; reason?: string };
    try {
      r = (await fn(slug, WORKS_DIR)) as { ok: boolean; reason?: string };
    } catch (e) {
      r = { ok: false, reason: `exception: ${(e as Error).message}` };
    }
    const ms = Date.now() - t0;
    const files = listLayerFiles(workDir, id);
    reports.push({ layer: id, ok: r.ok, ms, files, reason: r.reason });
    console.log(`  ok=${r.ok} time=${(ms / 1000).toFixed(1)}s files=${files.length}`);
    for (const f of files) console.log(`    ${f.name}: ${f.chars}字`);
    if (!r.ok) {
      console.error(`  ❌ Layer ${id} 失敗: ${r.reason}`);
      break;
    }
  }

  // 4. サマリ
  console.log("\n=== サマリ ===");
  console.table(
    reports.map((r) => ({
      layer: r.layer,
      ok: r.ok,
      time_s: (r.ms / 1000).toFixed(1),
      files: r.files.length,
      total_chars: r.files.reduce((s, f) => s + f.chars, 0),
      reason: r.reason ?? "",
    })),
  );

  const totalMs = reports.reduce((s, r) => s + r.ms, 0);
  console.log(`\n合計時間: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`成果物: ${workDir}`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
