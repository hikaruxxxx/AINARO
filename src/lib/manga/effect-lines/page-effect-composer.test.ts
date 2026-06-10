import { describe, expect, it } from "vitest";
import type { EpisodeStoryboardV2, PagePlanV2, PanelV2 } from "../schemas-v2";
import { composePageEffects } from "./page-effect-composer";

function sbPanel(overrides: Partial<PanelV2>): PanelV2 {
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

describe("composePageEffects", () => {
  it("4 panel の page で 4 種の effect overlay を構築する", () => {
    const pagePlanPage: PagePlanV2["pages"][number] = {
      page_no: 1,
      layout_template_id: "test",
      page_role: "action",
      render_strategy: "panel_composite",
      panels: [
        { panel_id: "p1", slot_id: "s1", rect: { x: 0, y: 0, w: 200, h: 200 }, reading_order: 1, importance: 4 },
        { panel_id: "p2", slot_id: "s2", rect: { x: 210, y: 0, w: 200, h: 200 }, reading_order: 2, importance: 5, polygon: [[210, 0], [410, 0], [410, 200], [210, 200]] },
        { panel_id: "p3", slot_id: "s3", rect: { x: 0, y: 210, w: 200, h: 200 }, reading_order: 3, importance: 3 },
        { panel_id: "p4", slot_id: "s4", rect: { x: 210, y: 210, w: 200, h: 200 }, reading_order: 4, importance: 3 },
      ],
    };
    const storyboardPage: EpisodeStoryboardV2["pages"][number] = {
      page_no: 1,
      page_role: "action",
      panels: [
        sbPanel({ panel_id: "p1", panel_no: 1, reading_order: 1, silence: true, shot_type: "close_up", importance: 4 }),
        sbPanel({ panel_id: "p2", panel_no: 2, reading_order: 2, importance: 5, bleed: true }),
        sbPanel({ panel_id: "p3", panel_no: 3, reading_order: 3, action: "右へ走る" }),
        sbPanel({
          panel_id: "p4",
          panel_no: 4,
          reading_order: 4,
          shot_type: "close_up",
          entities: {
            characters: [{ character_id: "char_1", role: "speaker", on_screen_via: "in_person", expression: "呆然" }],
            location_id: "loc_1",
            props: [],
            focus_entity_id: "char_1",
          },
        }),
      ],
    };

    const result = composePageEffects({
      pagePlanPage,
      storyboardPage,
      pageWidth: 420,
      pageHeight: 420,
    });

    expect(result.effectCount).toBe(4);
    expect(result.warnings).toEqual([]);
    expect(result.svg).toContain('data-effect-line-type="focus"');
    expect(result.svg).toContain('data-effect-line-type="radial"');
    expect(result.svg).toContain('data-effect-line-type="speed"');
    expect(result.svg).toContain('data-effect-line-type="vibration"');
    expect(result.svg).toContain('transform="translate(210, 0)"');
    expect(result.svg).toContain('<polygon points="0,0 200,0 200,200 0,200"/>');
  });
});
