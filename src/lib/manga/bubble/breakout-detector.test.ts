import { describe, expect, it } from "vitest";
import type { EpisodeStoryboardV2, PagePlanV2 } from "../schemas-v2";
import { detectBreakouts } from "./breakout-detector";

type PagePanel = PagePlanV2["pages"][number]["panels"][number];
type StoryPanel = EpisodeStoryboardV2["pages"][number]["panels"][number];

function page(panels: PagePanel[]): PagePlanV2["pages"][number] {
  return {
    page_no: 1,
    layout_template_id: "test",
    page_role: "buildup",
    render_strategy: "panel_composite",
    panels,
  };
}

function panel(id: string, rect: PagePanel["rect"], importance: PagePanel["importance"], order = 1): PagePanel {
  return {
    panel_id: id,
    slot_id: `slot-${id}`,
    rect,
    reading_order: order,
    importance,
  };
}

function storyboard(panelIdsWithDialogue: string[]): EpisodeStoryboardV2["pages"][number] {
  return {
    page_no: 1,
    page_role: "buildup",
    panels: panelIdsWithDialogue.map((panelId, index) => storyboardPanel(panelId, index + 1, true)),
  };
}

function storyboardPanel(panelId: string, order: number, hasDialogue: boolean): StoryPanel {
  return {
    panel_id: panelId,
    panel_no: order,
    reading_order: order,
    shot_type: "medium",
    camera: "eye_level",
    bleed: false,
    silence: !hasDialogue,
    importance: hasDialogue ? 5 : 2,
    entities: {
      characters: [{ character_id: "char_1", role: "speaker", on_screen_via: "in_person", expression: "neutral" }],
      location_id: "loc_test",
      props: [],
      focus_entity_id: "char_1",
    },
    action: "test action",
    key_visual: "test visual",
    dialogue: hasDialogue ? [{ character_id: "char_1", text: "Hi" }] : [],
    monologue: [],
    narration: [],
    sfx: [],
  };
}

describe("detectBreakouts", () => {
  it("importance 5 panel + 隣接 importance 2 panel で breakout を検出する", () => {
    const result = detectBreakouts({
      pagePlanPage: page([
        panel("p1", { x: 0, y: 0, w: 100, h: 100 }, 5, 1),
        panel("p2", { x: 108, y: 0, w: 100, h: 100 }, 2, 2),
      ]),
      storyboardPage: storyboard(["p1", "p2"]),
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      panel_id: "p1",
      target_panel_id: "p2",
      direction: "right",
      reading_order: 1,
    });
  });

  it("importance が全部 4 以下で低 importance target がない場合は検出しない", () => {
    const result = detectBreakouts({
      pagePlanPage: page([
        panel("p1", { x: 0, y: 0, w: 100, h: 100 }, 4, 1),
        panel("p2", { x: 108, y: 0, w: 100, h: 100 }, 4, 2),
      ]),
      storyboardPage: storyboard(["p1", "p2"]),
    });

    expect(result).toHaveLength(0);
  });

  it("隣接していない panels は検出しない", () => {
    const result = detectBreakouts({
      pagePlanPage: page([
        panel("p1", { x: 0, y: 0, w: 100, h: 100 }, 5, 1),
        panel("p2", { x: 200, y: 200, w: 100, h: 100 }, 2, 2),
      ]),
      storyboardPage: storyboard(["p1", "p2"]),
    });

    expect(result).toHaveLength(0);
  });

  it("maxPerPage=2 で 3 候補ある場合は 2 件のみ返す", () => {
    const result = detectBreakouts({
      pagePlanPage: page([
        panel("p1", { x: 0, y: 0, w: 100, h: 80 }, 5, 1),
        panel("p2", { x: 108, y: 0, w: 100, h: 80 }, 2, 2),
        panel("p3", { x: 0, y: 100, w: 100, h: 80 }, 5, 3),
        panel("p4", { x: 108, y: 100, w: 100, h: 80 }, 2, 4),
        panel("p5", { x: 0, y: 200, w: 100, h: 80 }, 5, 5),
        panel("p6", { x: 108, y: 200, w: 100, h: 80 }, 2, 6),
      ]),
      storyboardPage: storyboard(["p1", "p2", "p3", "p4", "p5", "p6"]),
      maxPerPage: 2,
    });

    expect(result).toHaveLength(2);
    expect(result.map((b) => b.panel_id)).toEqual(["p1", "p3"]);
  });
});
