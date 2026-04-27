/**
 * anchor calibration の進捗を一覧する
 *
 * 各ジャンル × Layer の校正状態と、5h トークン窓の残量を表示する。
 *
 * 実行: npx tsx scripts/anchors/calibration-status.ts
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getUsageIn5h, DEFAULT_THROTTLE_CONFIG } from "../../src/lib/screening/throttle";

const ANCHORS_DIR = "data/generation/anchors";
const CALIBRATION_FILE = join(ANCHORS_DIR, "calibration.json");

interface LayerCal {
  hitMedianElo: number | null;
  middleMedianElo: number | null;
  lowMedianElo: number | null;
  passElo: number | null;
  matchCount?: number;
  calibratedAt?: string;
}

interface CalibrationFile {
  layers: Record<string, Record<string, LayerCal>>;
}

function main() {
  if (!existsSync(CALIBRATION_FILE)) {
    console.log("(calibration.json なし — まず scripts/anchors/build-anchor-pool.ts を実行)");
    return;
  }

  const cal: CalibrationFile = JSON.parse(readFileSync(CALIBRATION_FILE, "utf8"));

  console.log("=== Anchor calibration 進捗 ===\n");

  const genres = Object.keys(cal.layers).sort();
  let calibratedCount = 0;
  let totalCombos = 0;

  console.log("ジャンル".padEnd(28) + " L3      L5");
  for (const genre of genres) {
    const l3 = cal.layers[genre]?.layer3;
    const l5 = cal.layers[genre]?.layer5;
    const l3Status = l3?.passElo != null ? `✓ pass=${l3.passElo.toFixed(0)} (${l3.matchCount ?? 0})` : "—";
    const l5Status = l5?.passElo != null ? `✓ pass=${l5.passElo.toFixed(0)} (${l5.matchCount ?? 0})` : "—";
    console.log(`${genre.padEnd(28)} ${l3Status.padEnd(20)} ${l5Status}`);
    if (l3?.passElo != null) calibratedCount++;
    if (l5?.passElo != null) calibratedCount++;
    totalCombos += 2;
  }

  console.log(`\n校正済み: ${calibratedCount} / ${totalCombos}`);

  const usage = getUsageIn5h();
  const limit = DEFAULT_THROTTLE_CONFIG.tokenLimit5h;
  const ratio = usage.total / limit;
  const remaining = Math.max(0, limit - usage.total);

  console.log(`\n=== 5h token window ===`);
  console.log(`使用済み: ${(usage.total / 1e6).toFixed(2)}M tokens (${usage.recordCount} calls)`);
  console.log(`上限    : ${(limit / 1e6).toFixed(0)}M tokens`);
  console.log(`残量    : ${(remaining / 1e6).toFixed(2)}M tokens (${(ratio * 100).toFixed(0)}% 消費)`);

  // 次の安全な投入量を概算
  const PER_CALL_TOKENS = 32_000;
  const safeCalls = Math.max(0, Math.floor(remaining * 0.8 / PER_CALL_TOKENS));
  const PER_GENRE_LAYER_CALLS = 90;
  const safeBatch = Math.floor(safeCalls / PER_GENRE_LAYER_CALLS);
  console.log(`\n次バッチ目安: 約 ${safeCalls} calls = ${safeBatch} (genre, layer) 組まで`);

  if (ratio >= DEFAULT_THROTTLE_CONFIG.pauseRatio) {
    console.log(`\n⚠️  pauseRatio (${DEFAULT_THROTTLE_CONFIG.pauseRatio}) 超過。今は校正コール毎に60秒スリープが入る。`);
    console.log(`   5h 窓のロールオフを待ってから再開推奨。`);
  } else if (ratio >= DEFAULT_THROTTLE_CONFIG.warnRatio) {
    console.log(`\n⚠️  warnRatio (${DEFAULT_THROTTLE_CONFIG.warnRatio}) 超過。校正コール毎に2秒スリープが入る。`);
  }
}

main();
