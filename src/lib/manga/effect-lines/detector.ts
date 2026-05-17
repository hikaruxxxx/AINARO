import type { PanelV2 } from "../schemas-v2";
// 2026-05-18 Sprint 22 案5: 共通型を types.ts に切り出し (schemas-v2 との循環依存回避)。
// 後方互換のため re-export する。
export type {
  EffectLineType,
  EffectLineIntensity,
  EffectLineSpec,
} from "./types";
import type { EffectLineSpec } from "./types";

const IMPACT_SFX_RE = /ドン|バン|ガン|ドカ|ズドン|ドガッ/;
const ACTION_RE = /走|突進|疾走|駆け|飛び|向か|進/;
const SURPRISE_RE = /shocked|surprised|gasping|驚|困惑|呆然/i;

type PanelWithActionBrief = PanelV2 & { action_brief?: string };

// 2026-05-17 追加。establishing / wide の大コマで radial を自動発火すると
// 静かな情景描写に放射線が走り「衝撃シーン誤認」を招く (a07 ep01 p001 で実害)。
// 静的な shot_type は impact SFX 起因の radial のみ許可する。
const STATIC_SHOT_TYPES = new Set<string>(["establishing", "wide"]);

export function detectEffectLines(panel: PanelV2): EffectLineSpec | null {
  // 2026-05-18 Sprint 22 案5: schemas-v2 PanelV2 に effect_lines を正式追加した
  // ため、unsafe cast を削除。null は opt-out、object は明示指定として優先する。
  const explicit = panel.effect_lines;
  if (explicit === null) return null;
  if (explicit && typeof explicit === "object") return explicit;

  if (panel.silence && panel.shot_type === "close_up" && panel.importance >= 4) {
    return { type: "focus", intensity: "strong", centerX: 0.5, centerY: 0.5 };
  }

  if (panel.importance === 5) {
    const hasImpactSfx = panel.sfx.some((sfx) => IMPACT_SFX_RE.test(sfx));
    if (hasImpactSfx) {
      return { type: "radial", intensity: "strong", centerX: 0.5, centerY: 0.5 };
    }
    if (panel.bleed && !STATIC_SHOT_TYPES.has(panel.shot_type)) {
      return { type: "radial", intensity: "strong", centerX: 0.5, centerY: 0.5 };
    }
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

  return null;
}
