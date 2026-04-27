// anchor reference pool の calibration.json から各層の閾値を読むローダー。
//
// calibration.json は scripts/anchors/calibrate-anchors.ts で生成・更新される。
// 校正されていないジャンル/層はフォールバック (絶対値の保守値) を返す。

import { existsSync, readFileSync } from "fs";
import type { LayerId } from "./work-queue";

const CALIBRATION_PATH = "data/generation/anchors/calibration.json";

interface LayerCalibration {
  hitMedianElo: number | null;
  middleMedianElo: number | null;
  lowMedianElo: number | null;
  passElo: number | null;
  requiredAnchorMatches: number;
  calibratedAt?: string;
  matchCount?: number;
}

interface CalibrationFile {
  version: string;
  builtAt: string;
  hitProbability: { pass: number; reject: number };
  layers: Record<string, Record<string, LayerCalibration>>;
}

let cached: CalibrationFile | null = null;
let cachedMtime = 0;

function loadCalibration(): CalibrationFile | null {
  if (!existsSync(CALIBRATION_PATH)) return null;
  // ファイルの mtime が変わったらキャッシュを破棄
  const stat = require("fs").statSync(CALIBRATION_PATH);
  const mtime = stat.mtimeMs;
  if (cached && mtime === cachedMtime) return cached;
  try {
    cached = JSON.parse(readFileSync(CALIBRATION_PATH, "utf8")) as CalibrationFile;
    cachedMtime = mtime;
    return cached;
  } catch {
    return null;
  }
}

/**
 * Anchor 校正済みの passElo を返す。校正されていなければ fallback を返す。
 */
export function getCalibratedPassElo(genre: string, layer: LayerId, fallback: number): number {
  const cal = loadCalibration();
  if (!cal) return fallback;
  const layerKey = `layer${layer}`;
  const entry = cal.layers[genre]?.[layerKey];
  if (!entry || entry.passElo == null) return fallback;
  return entry.passElo;
}

/**
 * Anchor 校正済みの middleMedianElo を返す (reject 即決判定用)。校正されていなければ null。
 */
export function getCalibratedMiddleMedianElo(genre: string, layer: LayerId): number | null {
  const cal = loadCalibration();
  if (!cal) return null;
  const layerKey = `layer${layer}`;
  return cal.layers[genre]?.[layerKey]?.middleMedianElo ?? null;
}

/**
 * Anchor 校正済みの absolute hit probability 閾値を返す。
 */
export function getCalibratedHitProbabilityThresholds(): { pass: number; reject: number } {
  const cal = loadCalibration();
  if (!cal) return { pass: 55.0, reject: 35.0 };
  return cal.hitProbability;
}

/**
 * 当該ジャンル × 層が校正済みか。
 */
export function isCalibrated(genre: string, layer: LayerId): boolean {
  const cal = loadCalibration();
  if (!cal) return false;
  const layerKey = `layer${layer}`;
  return cal.layers[genre]?.[layerKey]?.passElo != null;
}
