/**
 * リズム曲線生成
 *
 * シーン分割結果からエピソード全体のリズム曲線（強度配列）を計算する。
 * 縦読み漫画の鉄則:
 *   - 導入は低め（読者がスクロールに乗れる速度）
 *   - 中盤は起伏（飽きさせない）
 *   - クライマックスは最高潮
 *   - エピソード末尾は引きで急上昇（次話遷移率の主要因）
 *
 * LLM のヒント (intensity_hint) を基準にしつつ、最後の値を 0.85 以上に
 * 持ち上げ、最初の値を 0.4 以下に抑え、中盤の単調を解消する。
 *
 * 純関数。決定的（同じ入力には同じ出力）。
 */

import type { SceneEntry } from "./scene-splitter";

export type RhythmCurveOptions = {
  /** 1番目シーンの上限（導入を抑える） */
  introCap?: number;
  /** 最後のシーンの下限（cliffhanger） */
  finalFloor?: number;
  /** climax 強度の最低保証 */
  climaxFloor?: number;
  /** 連続して同じ強度が並ぶことを防ぐ単調抑制振幅 */
  monotonyJitter?: number;
};

/**
 * scenes から rhythm_curve を計算する。
 * 出力は scenes と同じ長さの 0-1 配列。
 */
export function computeRhythmCurve(
  scenes: SceneEntry[],
  options: RhythmCurveOptions = {}
): number[] {
  const introCap = options.introCap ?? 0.4;
  const finalFloor = options.finalFloor ?? 0.85;
  const climaxFloor = options.climaxFloor ?? 0.85;
  const monotonyJitter = options.monotonyJitter ?? 0.07;

  if (scenes.length === 0) return [];
  if (scenes.length === 1) return [clamp01(scenes[0].intensity_hint)];

  // 1) 出発点は LLM ヒント
  const curve = scenes.map((s) => clamp01(s.intensity_hint));

  // 2) 最初のシーン: introCap 以下に抑える
  if (curve[0] > introCap) {
    curve[0] = introCap;
  }

  // 3) climax と注釈されたシーンを climaxFloor 以上に持ち上げ
  scenes.forEach((s, i) => {
    if (s.dramatic_intent === "climax" && curve[i] < climaxFloor) {
      curve[i] = climaxFloor;
    }
  });

  // 4) 最後のシーン: finalFloor 以上に引き上げ（cliffhanger 強制）
  const lastIdx = curve.length - 1;
  if (curve[lastIdx] < finalFloor) {
    curve[lastIdx] = finalFloor;
  }

  // 5) 単調抑制: 隣接シーンが完全に同じ値だと退屈なので、決定的な微小揺らぎを与える
  for (let i = 1; i < curve.length - 1; i++) {
    const prev = curve[i - 1];
    const curr = curve[i];
    if (Math.abs(prev - curr) < 0.01) {
      // 決定的なジッタ（インデックスベース）
      const jitterDir = i % 2 === 0 ? -1 : 1;
      curve[i] = clamp01(curr + jitterDir * monotonyJitter);
    }
  }

  // 6) 全体クランプ
  return curve.map((v) => clamp01(v));
}

/**
 * パネル単位で rhythm_curve を展開する（panel_count_per_scene 比率で内挿）。
 * shotlist.rhythm_curve はシーン単位だが、パネル生成時にパネルごとの強度が必要なら
 * これを使って展開できる。
 */
export function expandCurveToPanels(
  curve: number[],
  panelsPerScene: number[]
): number[] {
  if (curve.length !== panelsPerScene.length) {
    throw new Error(
      `expandCurveToPanels: curve.length=${curve.length} != panelsPerScene.length=${panelsPerScene.length}`
    );
  }
  const out: number[] = [];
  for (let s = 0; s < curve.length; s++) {
    const intensity = curve[s];
    const next = curve[s + 1] ?? intensity;
    const n = panelsPerScene[s];
    for (let p = 0; p < n; p++) {
      // シーン内で次シーンへ向けて線形補間
      const t = n > 1 ? p / (n - 1) : 0;
      out.push(clamp01(intensity * (1 - t * 0.3) + next * (t * 0.3)));
    }
  }
  return out;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}
