import { describe, expect, it } from "vitest";
import type { EpisodeStoryboardV2, PagePlanV2 } from "../schemas-v2";
import { composePageBubbles } from "./page-bubble-composer";

function pagePlan(panel: PagePlanV2["pages"][number]["panels"][number]): PagePlanV2["pages"][number] {
  return {
    page_no: 1,
    layout_template_id: "test",
    page_role: "buildup",
    render_strategy: "panel_composite",
    panels: [panel],
  };
}

function storyboardPanel(
  dialogue: EpisodeStoryboardV2["pages"][number]["panels"][number]["dialogue"]
): EpisodeStoryboardV2["pages"][number] {
  return {
    page_no: 1,
    page_role: "buildup",
    panels: [{
      panel_id: "p1",
      panel_no: 1,
      reading_order: 1,
      shot_type: "medium",
      camera: "eye_level",
      bleed: false,
      silence: dialogue.length === 0,
      importance: 3,
      entities: {
        characters: [{ character_id: "char_1", role: "speaker", on_screen_via: "in_person", expression: "neutral" }],
        location_id: "loc_test",
        props: [],
        focus_entity_id: "char_1",
      },
      action: "test action",
      key_visual: "test visual",
      dialogue,
      monologue: [],
      narration: [],
      sfx: [],
    }],
  };
}

function storyboardPanels(
  panels: Array<{ panel_id: string; importance: 1 | 2 | 3 | 4 | 5; dialogue: EpisodeStoryboardV2["pages"][number]["panels"][number]["dialogue"] }>
): EpisodeStoryboardV2["pages"][number] {
  return {
    page_no: 1,
    page_role: "buildup",
    panels: panels.map((panel, index) => ({
      panel_id: panel.panel_id,
      panel_no: index + 1,
      reading_order: index + 1,
      shot_type: "medium",
      camera: "eye_level",
      bleed: false,
      silence: panel.dialogue.length === 0,
      importance: panel.importance,
      entities: {
        characters: [{ character_id: "char_1", role: "speaker", on_screen_via: "in_person", expression: "neutral" }],
        location_id: "loc_test",
        props: [],
        focus_entity_id: "char_1",
      },
      action: "test action",
      key_visual: "test visual",
      dialogue: panel.dialogue,
      monologue: [],
      narration: [],
      sfx: [],
    })),
  };
}

describe("composePageBubbles", () => {
  it("空 dialogue の page は bubbleCount=0 で warning に記録する", () => {
    const result = composePageBubbles({
      pagePlanPage: pagePlan({ panel_id: "p1", slot_id: "s1", rect: { x: 100, y: 50, w: 500, h: 500 }, reading_order: 1, importance: 3 }),
      storyboardPage: storyboardPanel([]),
      pageWidth: 1000,
      pageHeight: 1200,
    });

    expect(result.bubbleCount).toBe(0);
    expect(result.warnings).toContain("panel p1: dialogue empty");
  });

  it("dialogue 有 + polygon 無では bubble を page 座標に配置する", () => {
    const result = composePageBubbles({
      pagePlanPage: pagePlan({ panel_id: "p1", slot_id: "s1", rect: { x: 100, y: 50, w: 500, h: 500 }, reading_order: 1, importance: 3 }),
      storyboardPage: storyboardPanel([{ character_id: "char_1", text: "Hi" }]),
      pageWidth: 1000,
      pageHeight: 1200,
    });

    expect(result.bubbleCount).toBe(1);
    expect(result.svg).toContain('x="130"');
    expect(result.svg).toContain('y="70"');
    expect(result.svg).not.toContain("<clipPath");
  });

  it("dialogue 有 + polygon 有では clipPath SVG を含める", () => {
    const result = composePageBubbles({
      pagePlanPage: pagePlan({
        panel_id: "p1",
        slot_id: "s1",
        rect: { x: 100, y: 50, w: 500, h: 500 },
        reading_order: 1,
        importance: 3,
        polygon: [[100, 50], [600, 50], [600, 550], [100, 550]],
      }),
      storyboardPage: storyboardPanel([{ character_id: "char_1", text: "Hi" }]),
      pageWidth: 1000,
      pageHeight: 1200,
    });

    expect(result.bubbleCount).toBe(1);
    expect(result.svg).toContain("<clipPath");
    expect(result.svg).toContain('clip-path="url(#bubble-clip-p1-p1)"');
    expect(result.svg).toContain('<polygon points="100,50 600,50 600,550 100,550"');
  });

  it("breakout 候補がある場合は breakouts を返し target 側へ bubble を越境配置する", () => {
    const result = composePageBubbles({
      pagePlanPage: {
        page_no: 1,
        layout_template_id: "test",
        page_role: "buildup",
        render_strategy: "panel_composite",
        panels: [
          { panel_id: "p1", slot_id: "s1", rect: { x: 0, y: 0, w: 200, h: 200 }, reading_order: 1, importance: 5, polygon: [[0, 0], [200, 0], [200, 200], [0, 200]] },
          { panel_id: "p2", slot_id: "s2", rect: { x: 208, y: 0, w: 200, h: 200 }, reading_order: 2, importance: 2, polygon: [[208, 0], [408, 0], [408, 200], [208, 200]] },
        ],
      },
      storyboardPage: storyboardPanels([
        { panel_id: "p1", importance: 5, dialogue: [{ character_id: "char_1", text: "Hi" }] },
        { panel_id: "p2", importance: 2, dialogue: [] },
      ]),
      pageWidth: 500,
      pageHeight: 300,
    });

    expect(result.breakouts).toHaveLength(1);
    expect(result.breakouts[0]).toMatchObject({ panel_id: "p1", target_panel_id: "p2", direction: "right" });
    expect(result.breakoutMasks).toHaveLength(1);
    expect(result.svg).toContain('data-breakout-target="p2"');
    expect(result.svg).toContain('<polygon points="0,0 408,0 408,200 0,200"');
    expect(result.svg).toContain('x="46"');
  });
});
