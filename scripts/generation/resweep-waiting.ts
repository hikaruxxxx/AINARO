/**
 * waiting_evidence 状態の作品を再評価する。
 *
 * 設計: docs/architecture/phase1_pipeline_design_v2.md §11
 *
 * waiting_evidence は anchor pool が育っていなかった、評価リソースが枯渇した、
 * v12 推論が一時的に失敗した、などの理由で「証拠不足」となった保留作品。
 * 校正済みジャンル/層が増えたタイミングで再評価して、pass / reject を確定させる。
 *
 * 動作:
 *   1. 各層のキューから waiting_evidence の作品を集める
 *   2. evaluateLayer を再実行
 *   3. 結果に応じて状態遷移:
 *      - passed → 次層に enqueue (Layer 1-5) / done に更新 (Layer 6)
 *      - 証拠不足のまま → waiting_evidence のまま (再試行)
 *      - reject → rejected に更新 + training サンプル保存
 *
 * 実行: npx tsx scripts/generation/resweep-waiting.ts
 *   --layers 2,3,4,5 --max 100 --dry-run
 */

import { getLatestEntries, updateState, enqueue, type LayerId } from "../../src/lib/screening/work-queue";
import { evaluateLayer } from "../../src/lib/screening/layer-eval";
import { saveRejectedTrainingSample } from "../../src/lib/screening/training-data";

interface Args {
  layers: LayerId[];
  max: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { layers: [2, 3, 4, 5, 6], max: 1000, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--layers") args.layers = argv[++i].split(",").map((s) => parseInt(s, 10) as LayerId);
    else if (a.startsWith("--layers=")) args.layers = a.split("=")[1].split(",").map((s) => parseInt(s, 10) as LayerId);
    else if (a === "--max") args.max = parseInt(argv[++i], 10);
    else if (a.startsWith("--max=")) args.max = parseInt(a.split("=")[1], 10);
  }
  return args;
}

function isEvidenceHoldReason(reason: string | undefined): boolean {
  return (
    reason === "insufficient_evidence" ||
    reason === "insufficient_anchor_evidence" ||
    reason?.startsWith("hit_probability_unavailable") === true ||
    reason?.startsWith("evaluation_unavailable") === true
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log("[resweep] args:", args);

  let totalProcessed = 0;
  let totalPassed = 0;
  let totalStillWaiting = 0;
  let totalRejected = 0;
  let totalFailed = 0;

  for (const layer of args.layers) {
    if (totalProcessed >= args.max) break;
    const latest = getLatestEntries(layer);
    const waiting = Array.from(latest.values()).filter((e) => e.state === "waiting_evidence");
    console.log(`[resweep] layer${layer}: ${waiting.length} waiting_evidence entries`);

    for (const entry of waiting) {
      if (totalProcessed >= args.max) break;
      totalProcessed++;

      if (args.dryRun) {
        console.log(`[resweep] DRY layer${layer} slug=${entry.slug} genre=${entry.genre}`);
        continue;
      }

      try {
        const result = await evaluateLayer(entry.slug, layer, entry.genre, entry.isExploration);
        const v12Part = result.hitProbability != null ? ` v12=${result.hitProbability.toFixed(1)}%` : "";
        console.log(
          `[resweep] layer${layer} slug=${entry.slug} passed=${result.passed} rating=${result.rating.toFixed(0)} matches=${result.matchCount}${v12Part}${result.reason ? ` (${result.reason})` : ""}`,
        );

        if (result.passed) {
          if (layer < 6) {
            enqueue({ slug: entry.slug, layer: (layer + 1) as LayerId, genre: entry.genre, isExploration: entry.isExploration });
          }
          updateState(entry.slug, layer, "done");
          totalPassed++;
        } else if (isEvidenceHoldReason(result.reason)) {
          // 証拠不足のままなら waiting_evidence を更新だけ (タイムスタンプ更新)
          updateState(entry.slug, layer, "waiting_evidence", { meta: { reason: result.reason, lastResweepAt: Date.now() } });
          totalStillWaiting++;
        } else {
          // 確定 reject: training データに保存して rejected へ
          const saved = saveRejectedTrainingSample(entry.slug, layer, entry.genre, result.reason ?? "absolute_quality_threshold_failed");
          if (saved) console.log(`[resweep] training sample saved slug=${entry.slug} layer=${layer}`);
          updateState(entry.slug, layer, "rejected", { meta: { reason: result.reason } });
          totalRejected++;
        }
      } catch (e) {
        console.error(`[resweep] layer${layer} slug=${entry.slug} eval failed:`, (e as Error).message?.slice(0, 200));
        totalFailed++;
      }
    }
  }

  console.log(
    `[resweep] done: processed=${totalProcessed} passed=${totalPassed} stillWaiting=${totalStillWaiting} rejected=${totalRejected} failed=${totalFailed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
