/**
 * Effect Lines 共通 type 定義。
 *
 * 2026-05-18 Sprint 22 案5 で新設。schemas-v2.ts と detector.ts の循環依存を
 * 回避するため、共通型を独立モジュールに切り出した (両者が types.ts から import)。
 */

export type EffectLineType = "speed" | "focus" | "radial" | "vibration";
export type EffectLineIntensity = "subtle" | "normal" | "strong";

export type EffectLineSpec = {
  type: EffectLineType;
  intensity: EffectLineIntensity;
  /** direction は度数 (0=右, 90=下) */
  direction?: number;
  /** panel ローカル比率 0.0-1.0 */
  centerX?: number;
  centerY?: number;
};
