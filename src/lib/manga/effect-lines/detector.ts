import type { PanelV2 } from "../schemas-v2";

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

const IMPACT_SFX_RE = /ドン|バン|ガン|ドカ|ズドン|ドガッ/;
const ACTION_RE = /走|突進|疾走|駆け|飛び|向か|進/;
const SURPRISE_RE = /shocked|surprised|gasping|驚|困惑|呆然/i;

type PanelWithActionBrief = PanelV2 & { action_brief?: string };

export function detectEffectLines(panel: PanelV2): EffectLineSpec | null {
  if (panel.silence && panel.shot_type === "close_up" && panel.importance >= 4) {
    return { type: "focus", intensity: "strong", centerX: 0.5, centerY: 0.5 };
  }

  if (panel.importance === 5 && (panel.bleed || panel.sfx.some((sfx) => IMPACT_SFX_RE.test(sfx)))) {
    return { type: "radial", intensity: "strong", centerX: 0.5, centerY: 0.5 };
  }

  const actionBrief = (panel as PanelWithActionBrief).action_brief ?? panel.action;
  if (ACTION_RE.test(actionBrief)) {
    return {
      type: "speed",
      intensity: panel.importance >= 4 ? "strong" : "normal",
      direction: 0,
    };
  }

  if (
    panel.shot_type === "close_up" &&
    panel.entities.characters.some((character) => SURPRISE_RE.test(character.expression))
  ) {
    return {
      type: "vibration",
      intensity: panel.importance >= 4 ? "normal" : "subtle",
    };
  }

  if (
    panel.importance >= 4 &&
    (panel.shot_type === "medium" || panel.shot_type === "wide") &&
    (panel.camera === "low_angle" || panel.camera === "high_angle" || panel.camera === "birds_eye")
  ) {
    return { type: "speed", intensity: "normal", direction: 0 };
  }

  return null;
}
