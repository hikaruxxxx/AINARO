/**
 * 統計ユーティリティ
 * パターン抽出エンジンとA/Bテスト判定で使用
 */

/**
 * スピアマン順位相関係数
 * 2つの数値配列間の単調関係の強さを測定
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3 || n !== y.length) return 0;

  function rank(arr: number[]): number[] {
    const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    for (let i = 0; i < n; i++) ranks[sorted[i].i] = i + 1;
    return ranks;
  }

  const rx = rank(x);
  const ry = rank(y);
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/**
 * カイ二乗検定（2x2分割表）
 * A/Bテストの有意差判定に使用
 *
 * @param successA バリアントAの成功数
 * @param totalA バリアントAの合計数
 * @param successB バリアントBの成功数
 * @param totalB バリアントBの合計数
 * @returns p値と検定結果
 */
export function chiSquareTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number,
): { chiSquare: number; pValue: number; significant: boolean } {
  const failA = totalA - successA;
  const failB = totalB - successB;
  const total = totalA + totalB;
  const totalSuccess = successA + successB;
  const totalFail = failA + failB;

  if (total === 0 || totalSuccess === 0 || totalFail === 0) {
    return { chiSquare: 0, pValue: 1, significant: false };
  }

  // 期待値
  const eSuccessA = (totalA * totalSuccess) / total;
  const eFailA = (totalA * totalFail) / total;
  const eSuccessB = (totalB * totalSuccess) / total;
  const eFailB = (totalB * totalFail) / total;

  // カイ二乗値（イェーツの連続性補正付き）
  const chiSq =
    ((Math.abs(successA - eSuccessA) - 0.5) ** 2) / eSuccessA +
    ((Math.abs(failA - eFailA) - 0.5) ** 2) / eFailA +
    ((Math.abs(successB - eSuccessB) - 0.5) ** 2) / eSuccessB +
    ((Math.abs(failB - eFailB) - 0.5) ** 2) / eFailB;

  // p値の近似計算（自由度1のカイ二乗分布）
  const pValue = chiSquarePValue(chiSq, 1);

  return {
    chiSquare: Math.round(chiSq * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    significant: pValue < 0.05,
  };
}

/**
 * カイ二乗分布のp値近似（自由度1の場合の正規近似）
 */
function chiSquarePValue(chiSq: number, _df: number): number {
  if (chiSq <= 0) return 1;
  // 自由度1: P(X > x) ≈ 2 * (1 - Φ(√x))
  const z = Math.sqrt(chiSq);
  return 2 * (1 - normalCDF(z));
}

/**
 * 標準正規分布の累積分布関数の近似
 * Abramowitz and Stegun 近似式
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * ウェルチのt検定（2群の平均値差の検定）
 * 特徴量の群間差の有意性判定に使用
 */
export function welchTTest(
  groupA: number[],
  groupB: number[],
): { tStatistic: number; pValue: number; significant: boolean } {
  const nA = groupA.length;
  const nB = groupB.length;
  if (nA < 2 || nB < 2) return { tStatistic: 0, pValue: 1, significant: false };

  const meanA = groupA.reduce((a, b) => a + b, 0) / nA;
  const meanB = groupB.reduce((a, b) => a + b, 0) / nB;
  const varA = groupA.reduce((acc, v) => acc + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = groupB.reduce((acc, v) => acc + (v - meanB) ** 2, 0) / (nB - 1);

  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return { tStatistic: 0, pValue: 1, significant: false };

  const t = (meanA - meanB) / se;

  // 自由度（ウェルチ-サタスウェイト近似）
  const dfNum = (varA / nA + varB / nB) ** 2;
  const dfDen = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const _df = dfNum / dfDen;

  // p値の近似（t分布を正規近似、df > 30 で十分な精度）
  const pValue = 2 * (1 - normalCDF(Math.abs(t)));

  return {
    tStatistic: Math.round(t * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    significant: pValue < 0.05,
  };
}

/**
 * 2群の基本統計量を比較
 */
export function compareGroups(groupA: number[], groupB: number[]): {
  meanA: number;
  meanB: number;
  diff: number;
  effectSize: number; // コーエンのd
} {
  const meanA = groupA.length > 0 ? groupA.reduce((a, b) => a + b, 0) / groupA.length : 0;
  const meanB = groupB.length > 0 ? groupB.reduce((a, b) => a + b, 0) / groupB.length : 0;

  // プール標準偏差
  const nA = groupA.length;
  const nB = groupB.length;
  const varA = nA > 1 ? groupA.reduce((acc, v) => acc + (v - meanA) ** 2, 0) / (nA - 1) : 0;
  const varB = nB > 1 ? groupB.reduce((acc, v) => acc + (v - meanB) ** 2, 0) / (nB - 1) : 0;
  const pooledSD = Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2));

  return {
    meanA: Math.round(meanA * 10000) / 10000,
    meanB: Math.round(meanB * 10000) / 10000,
    diff: Math.round((meanA - meanB) * 10000) / 10000,
    effectSize: pooledSD > 0 ? Math.round(((meanA - meanB) / pooledSD) * 1000) / 1000 : 0,
  };
}
