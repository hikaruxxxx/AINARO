import { describe, expect, it } from "vitest";
import type { PanelV2 } from "../schemas-v2";
import { detectEffectLines } from "./detector";

function panel(overrides: Partial<PanelV2> = {}): PanelV2 {
  return {
    panel_id: "p1",
    panel_no: 1,
    reading_order: 1,
    shot_type: "medium",
    camera: "eye_level",
    bleed: false,
    silence: false,
    importance: 3,
    entities: {
      characters: [{
        character_id: "char_1",
        role: "speaker",
        on_screen_via: "in_person",
        expression: "neutral",
      }],
      location_id: "loc_1",
      props: [],
      focus_entity_id: "char_1",
    },
    action: "立っている",
    key_visual: "test visual",
    dialogue: [],
    monologue: [],
    narration: [],
    sfx: [],
    ...overrides,
  };
}

describe("detectEffectLines", () => {
  it("rule 1: silence close_up importance>=4 は focus strong", () => {
    expect(detectEffectLines(panel({ silence: true, shot_type: "close_up", importance: 4 }))).toEqual({
      type: "focus",
      intensity: "strong",
      centerX: 0.5,
      centerY: 0.5,
    });
  });

  it("rule 1 miss: importance が低い silence close_up は null", () => {
    expect(detectEffectLines(panel({ silence: true, shot_type: "close_up", importance: 3 }))).toBeNull();
  });

  it("rule 2: importance=5 bleed は radial strong", () => {
    expect(detectEffectLines(panel({ importance: 5, bleed: true }))).toMatchObject({
      type: "radial",
      intensity: "strong",
    });
  });

  it("rule 2: impact sfx でも radial strong", () => {
    expect(detectEffectLines(panel({ importance: 5, sfx: ["ズドン"] }))).toMatchObject({
      type: "radial",
      intensity: "strong",
    });
  });

  it("rule 2 miss: importance=4 の impact sfx は radial にならない", () => {
    expect(detectEffectLines(panel({ importance: 4, sfx: ["ドン"] }))).toBeNull();
  });

  it("rule 3: action 系語彙は speed になり importance>=4 で strong", () => {
    expect(detectEffectLines(panel({ importance: 4, action: "敵へ向かって走る" }))).toEqual({
      type: "speed",
      intensity: "strong",
      direction: 0,
    });
  });

  it("rule 3 miss: action 系語彙がない場合は speed にならない", () => {
    expect(detectEffectLines(panel({ action: "静かに見つめる" }))).toBeNull();
  });

  it("rule 4: close_up の驚き expression は vibration", () => {
    expect(detectEffectLines(panel({
      shot_type: "close_up",
      entities: {
        characters: [{ character_id: "char_1", role: "speaker", on_screen_via: "in_person", expression: "surprised" }],
        location_id: "loc_1",
        props: [],
        focus_entity_id: "char_1",
      },
    }))).toEqual({ type: "vibration", intensity: "subtle" });
  });

  it("rule 4 miss: medium の驚き expression は vibration にならない", () => {
    expect(detectEffectLines(panel({
      shot_type: "medium",
      entities: {
        characters: [{ character_id: "char_1", role: "speaker", on_screen_via: "in_person", expression: "shocked" }],
        location_id: "loc_1",
        props: [],
        focus_entity_id: "char_1",
      },
    }))).toBeNull();
  });

  it("どの条件にも当たらない panel は null", () => {
    expect(detectEffectLines(panel())).toBeNull();
  });

  describe("Sprint 8 案2: storyboard 明示 + 静的 shot_type の保護", () => {
    it("effect_lines: null が明示されたら他の rule を全部無視して null", () => {
      // 旧実装では radial 発火する条件 (importance=5 + bleed) でも null になる
      const p = panel({ importance: 5, bleed: true }) as PanelV2 & { effect_lines: null };
      p.effect_lines = null;
      expect(detectEffectLines(p)).toBeNull();
    });

    it("effect_lines に EffectLineSpec が明示されたらそれを優先返却", () => {
      const p = panel() as PanelV2 & { effect_lines?: unknown };
      p.effect_lines = { type: "focus", intensity: "subtle", centerX: 0.3, centerY: 0.7 };
      expect(detectEffectLines(p)).toEqual({
        type: "focus",
        intensity: "subtle",
        centerX: 0.3,
        centerY: 0.7,
      });
    });

    it("importance=5 + bleed でも shot_type=establishing なら radial を抑制", () => {
      // a07 ep01 p001 (新宿夜景俯瞰 establishing) で誤発火した radial を防ぐ
      expect(
        detectEffectLines(panel({ importance: 5, bleed: true, shot_type: "establishing" })),
      ).toBeNull();
    });

    it("importance=5 + bleed でも shot_type=wide なら radial を抑制", () => {
      expect(
        detectEffectLines(panel({ importance: 5, bleed: true, shot_type: "wide" })),
      ).toBeNull();
    });

    it("importance=5 + impact SFX なら shot_type=establishing でも radial 発火 (爆発音は静的 shot でも有効)", () => {
      expect(
        detectEffectLines(
          panel({ importance: 5, bleed: false, shot_type: "establishing", sfx: ["ドカ"] }),
        ),
      ).toMatchObject({
        type: "radial",
        intensity: "strong",
      });
    });
  });
});
