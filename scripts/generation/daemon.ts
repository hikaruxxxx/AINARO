// Phase 1 常時稼働デーモン
//
// 設計: docs/architecture/phase1_pipeline_design_v2.md 参照
//
// 役割:
// - 各層(Layer 1〜6)のキューを監視
// - 流量制御(throttle)に従って次の作品を処理
// - claude -p を subprocess 起動して LLM 呼び出し
// - 結果を data/generation/works/{slug}/ に保存
// - 日次バッチ batch_YYYYMMDD に自動振り分け
//
// 起動: launchd (~/Library/LaunchAgents/com.novelis.generator.plist)
// または手動: npx tsx scripts/generation/daemon.ts
//
// 停止: SIGTERM で graceful shutdown(処理中作品の状態を保存)

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { dequeueNextPending, enqueue, updateState, queueStats, type LayerId } from "../../src/lib/screening/work-queue";
import { throttleBeforeCall } from "../../src/lib/screening/throttle";
import { sampleSeedV2, commitSeed } from "../../src/lib/screening/seed-v2";
import { runLayer1 } from "../../src/lib/screening/layers/layer1-logline";
import { runLayer2 } from "../../src/lib/screening/layers/layer2-plot";
import { runLayer3 } from "../../src/lib/screening/layers/layer3-synopsis";
import { runLayer4 } from "../../src/lib/screening/layers/layer4-arc-plot";
import { runLayer5 } from "../../src/lib/screening/layers/layer5-ep1";
import { runLayer6 } from "../../src/lib/screening/layers/layer6-ep23";
import { evaluateLayer } from "../../src/lib/screening/layer-eval";
import { recordAppliedPatterns } from "../../src/lib/screening/patterns";

// ε値(階層的バランス)
const LAYER_EPSILON: Record<LayerId, number> = {
  1: 0.4, // ログライン: 探索寄り
  2: 0.2,
  3: 0.2,
  4: 0.1,
  5: 0.1,
  6: 0.0,
};

// 探索枠の比率
const EXPLORATION_RATIO = 0.2;

// ループ間隔(ms)
const TICK_INTERVAL_MS = 5_000;

// 1ティックで処理する最大作品数
const MAX_WORKS_PER_TICK = 1;

// シード生成: pending が一定数以下なら新規シード投入
const MIN_LAYER1_PENDING = 5;

let shuttingDown = false;
process.on("SIGTERM", () => {
  console.log("[daemon] SIGTERM受信、graceful shutdown");
  shuttingDown = true;
});
process.on("SIGINT", () => {
  console.log("[daemon] SIGINT受信、graceful shutdown");
  shuttingDown = true;
});

async function main(): Promise<void> {
  console.log("[daemon] Phase1 generator daemon 起動");
  console.log(`[daemon] tick=${TICK_INTERVAL_MS}ms, exploration=${EXPLORATION_RATIO * 100}%`);

  while (!shuttingDown) {
    try {
      await tick();
    } catch (e) {
      console.error("[daemon] tick エラー:", e);
    }
    await sleep(TICK_INTERVAL_MS);
  }

  console.log("[daemon] 停止完了");
}

async function tick(): Promise<void> {
  // 流量制御チェック
  const throttleResult = await throttleBeforeCall();
  if (throttleResult.slept > 0) {
    console.log(`[daemon] throttle: ${throttleResult.reason}`);
  }

  // Layer1 pending が少なければシード投入
  await maybeInjectSeeds();

  // 各層を上から処理(Layer1から)
  for (const layer of [1, 2, 3, 4, 5, 6] as LayerId[]) {
    if (shuttingDown) break;
    const next = dequeueNextPending(layer);
    if (!next) continue;
    console.log(`[daemon] processing slug=${next.slug} layer=${layer}`);
    try {
      await processLayer(next.slug, layer, next.genre, next.isExploration);
    } catch (e) {
      console.error(`[daemon] layer${layer} 処理失敗 slug=${next.slug}:`, e);
      updateState(next.slug, layer, "failed", { meta: { error: String(e) } });
    }
    break; // 1ティック1作品(MAX_WORKS_PER_TICK)
  }
}

async function maybeInjectSeeds(): Promise<void> {
  const stats = queueStats();
  const layer1Pending = stats.layer1?.pending ?? 0;
  if (layer1Pending >= MIN_LAYER1_PENDING) return;

  const need = MIN_LAYER1_PENDING - layer1Pending;
  for (let i = 0; i < need; i++) {
    const isExploration = Math.random() < EXPLORATION_RATIO;
    const seed = sampleSeedV2({
      epsilon: LAYER_EPSILON[1],
      isExploration,
    });
    if (!seed) {
      console.warn("[daemon] シード抽選失敗(枯渇または探索範囲満杯)");
      return;
    }
    commitSeed(seed);
    const slug = generateSlug(seed.genre);
    saveWorkMeta(slug, seed);
    enqueue({
      slug,
      layer: 1,
      genre: seed.genre,
      isExploration: seed.isExploration,
    });
    console.log(`[daemon] injected seed slug=${slug} genre=${seed.genre} desire=${seed.primaryDesire}`);
  }
}

async function processLayer(
  slug: string,
  layer: LayerId,
  genre: string,
  isExploration: boolean,
): Promise<void> {
  updateState(slug, layer, "processing");

  let ok = false;
  let reason: string | undefined;

  if (layer === 1) {
    const r = await runLayer1(slug);
    ok = r.ok;
    reason = r.reason;
    if (ok) console.log(`[daemon] layer1 ok slug=${slug} logline="${r.logline}"`);
  } else if (layer === 2) {
    const r = await runLayer2(slug);
    ok = r.ok;
    reason = r.reason;
    if (ok) console.log(`[daemon] layer2 ok slug=${slug}`);
  } else if (layer === 3) {
    const r = await runLayer3(slug);
    ok = r.ok;
    reason = r.reason;
    if (ok) console.log(`[daemon] layer3 ok slug=${slug}`);
  } else if (layer === 4) {
    const r = await runLayer4(slug);
    ok = r.ok;
    reason = r.reason;
    if (ok) console.log(`[daemon] layer4 ok slug=${slug}`);
  } else if (layer === 5) {
    const r = await runLayer5(slug, undefined, isExploration);
    ok = r.ok;
    reason = r.reason;
    if (ok) {
      console.log(`[daemon] layer5 ok slug=${slug} chars=${r.charCount} appends=${r.appendCount} exploration=${isExploration}`);
      // 適用したパターンを _meta.json に記録(公開時に episode_generation_meta へ転記)
      recordAppliedPatterns("data/generation/works", slug, isExploration);
    }
  } else if (layer === 6) {
    const r = await runLayer6(slug, undefined, isExploration);
    ok = r.ok;
    reason = r.reason;
    if (ok) console.log(`[daemon] layer6 ok slug=${slug} ep2=${r.ep2CharCount} ep3=${r.ep3CharCount} exploration=${isExploration}`);
  } else {
    console.log(`[daemon] 未知のlayer ${layer} slug=${slug}`);
    ok = false;
  }

  if (!ok) {
    console.warn(`[daemon] layer${layer} failed slug=${slug} reason=${reason}`);
    updateState(slug, layer, "failed", { meta: { reason } });
    return;
  }

  updateState(slug, layer, "done");

  // ペアワイズ評価(Layer 2-6)。Layer 1 は内部で素通し
  let passed = true;
  try {
    const evalResult = await evaluateLayer(slug, layer, genre, isExploration);
    passed = evalResult.passed;
    console.log(
      `[daemon] layer${layer} eval slug=${slug} passed=${passed} rating=${evalResult.rating.toFixed(0)} matches=${evalResult.matchCount} rank=${evalResult.rank}/${evalResult.totalInLayer}${evalResult.reason ? ` (${evalResult.reason})` : ""}`,
    );
  } catch (e) {
    console.error(`[daemon] layer${layer} eval失敗 slug=${slug}:`, e);
    // 評価失敗は通過扱い(下流で再判定の機会あり)
    passed = true;
  }

  if (layer < 6 && passed) {
    enqueue({
      slug,
      layer: (layer + 1) as LayerId,
      genre,
      isExploration,
    });
  } else if (layer < 6) {
    updateState(slug, layer, "rejected");
  }
}

function generateSlug(genre: string): string {
  const prefix = genre.split("_")[0].slice(0, 4);
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`;
}

function saveWorkMeta(slug: string, seed: { genre: string; primaryDesire: string; secondaryDesire: string; tags: unknown; isExploration: boolean }): void {
  const dir = join("data/generation/works", slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const meta = {
    slug,
    seed,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, "_meta.json"), JSON.stringify(meta, null, 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
  console.error("[daemon] fatal:", e);
  process.exit(1);
});
