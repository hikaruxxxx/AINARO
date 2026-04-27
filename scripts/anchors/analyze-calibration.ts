/**
 * 全ジャンル × 層の calibration.json を読んで、band 順序の安定性とギャップを分析する。
 *
 * v2 banding (gp gap 50-200, 2000-5000) の効果が全ジャンルで現れているかを確認する。
 *
 * 出力:
 *   - 各ジャンル × 層の hit/middle/low 中央値
 *   - 順序が乱れたジャンル × 層 (hit < middle や middle < low)
 *   - hit-low gap (狭いほど LLM 評価の解像度が低い)
 *   - 校正済み / 未校正の集計
 *
 * 実行: npx tsx scripts/anchors/analyze-calibration.ts
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CALIBRATION_FILE = "data/generation/anchors/calibration.json";

interface LayerCal {
  hitMedianElo: number | null;
  middleMedianElo: number | null;
  lowMedianElo: number | null;
  passElo: number | null;
  matchCount?: number;
  calibratedAt?: string;
}

interface CalibrationFile {
  version: string;
  layers: Record<string, Record<string, LayerCal>>;
}

function classifyOrder(hit: number, middle: number, low: number): { ok: boolean; pattern: string } {
  // 期待: hit > middle > low
  if (hit > middle && middle > low) return { ok: true, pattern: "h>m>l" };
  if (hit > low && middle > low) {
    if (hit > middle) return { ok: true, pattern: "h>m>l" };
    return { ok: false, pattern: "m>h>l (hit < middle)" };
  }
  if (hit > low) return { ok: false, pattern: `mixed: h=${hit.toFixed(0)}, m=${middle.toFixed(0)}, l=${low.toFixed(0)}` };
  return { ok: false, pattern: `inverted: h=${hit.toFixed(0)}, m=${middle.toFixed(0)}, l=${low.toFixed(0)}` };
}

function main() {
  if (!existsSync(CALIBRATION_FILE)) {
    console.error("calibration.json not found");
    process.exit(1);
  }

  const cal: CalibrationFile = JSON.parse(readFileSync(CALIBRATION_FILE, "utf8"));

  type Row = {
    genre: string;
    layer: string;
    calibrated: boolean;
    hit?: number;
    middle?: number;
    low?: number;
    passElo?: number;
    matchCount?: number;
    orderOk?: boolean;
    orderPattern?: string;
    hitLowGap?: number;
  };

  const rows: Row[] = [];

  for (const [genre, layers] of Object.entries(cal.layers)) {
    for (const [layer, lc] of Object.entries(layers)) {
      const calibrated = lc.passElo != null && lc.hitMedianElo != null && lc.middleMedianElo != null && lc.lowMedianElo != null;
      const row: Row = { genre, layer, calibrated };
      if (calibrated) {
        const h = lc.hitMedianElo!;
        const m = lc.middleMedianElo!;
        const l = lc.lowMedianElo!;
        const order = classifyOrder(h, m, l);
        row.hit = h;
        row.middle = m;
        row.low = l;
        row.passElo = lc.passElo!;
        row.matchCount = lc.matchCount;
        row.orderOk = order.ok;
        row.orderPattern = order.pattern;
        row.hitLowGap = h - l;
      }
      rows.push(row);
    }
  }

  // サマリ
  const calibrated = rows.filter((r) => r.calibrated);
  const orderOk = calibrated.filter((r) => r.orderOk);
  const orderBad = calibrated.filter((r) => !r.orderOk);
  console.log(`\n=== calibration analysis ===`);
  console.log(`total entries: ${rows.length} (${rows.filter((r) => r.layer === "layer3" || r.layer === "layer5").length} L3/L5)`);
  console.log(`calibrated: ${calibrated.length}`);
  console.log(`order correct (h>m>l): ${orderOk.length} / ${calibrated.length}`);
  console.log(`order issues: ${orderBad.length}`);

  // L3 と L5 を分けて表示
  for (const layer of ["layer3", "layer5"]) {
    const subset = calibrated.filter((r) => r.layer === layer).sort((a, b) => a.genre.localeCompare(b.genre));
    if (subset.length === 0) continue;
    console.log(`\n--- ${layer} ---`);
    console.log("genre".padEnd(28), "hit".padStart(7), "middle".padStart(7), "low".padStart(7), "passElo".padStart(8), "gap".padStart(6), "order".padStart(7), "matches".padStart(8));
    for (const r of subset) {
      const okMark = r.orderOk ? "OK" : "!!";
      console.log(
        r.genre.padEnd(28),
        r.hit!.toFixed(0).padStart(7),
        r.middle!.toFixed(0).padStart(7),
        r.low!.toFixed(0).padStart(7),
        r.passElo!.toFixed(0).padStart(8),
        r.hitLowGap!.toFixed(0).padStart(6),
        okMark.padStart(7),
        String(r.matchCount ?? 0).padStart(8),
      );
    }

    const okCount = subset.filter((r) => r.orderOk).length;
    const avgGap = subset.reduce((s, r) => s + r.hitLowGap!, 0) / subset.length;
    console.log(`${layer} summary: ${okCount}/${subset.length} order OK, avg hit-low gap=${avgGap.toFixed(0)}`);
  }

  // 順序問題のあるジャンル詳細
  if (orderBad.length > 0) {
    console.log(`\n--- ORDER ISSUES ---`);
    for (const r of orderBad) {
      console.log(`  ${r.genre} ${r.layer}: ${r.orderPattern} (hit=${r.hit!.toFixed(0)} middle=${r.middle!.toFixed(0)} low=${r.low!.toFixed(0)})`);
    }
  }

  // 未校正
  const uncalibrated = rows.filter((r) => !r.calibrated && (r.layer === "layer3" || r.layer === "layer5"));
  if (uncalibrated.length > 0) {
    console.log(`\n--- UNCALIBRATED (L3/L5) ---`);
    const byGenre: Record<string, string[]> = {};
    for (const r of uncalibrated) {
      if (!byGenre[r.genre]) byGenre[r.genre] = [];
      byGenre[r.genre].push(r.layer);
    }
    for (const [genre, layers] of Object.entries(byGenre)) {
      console.log(`  ${genre}: ${layers.join(", ")}`);
    }
  }
}

main();
