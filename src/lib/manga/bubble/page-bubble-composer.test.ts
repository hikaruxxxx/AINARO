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
});
