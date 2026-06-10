import { describe, expect, it } from "vitest";
import { shouldAuditPage } from "./L11-audit";
import type { SceneGraphV1 } from "../../../src/lib/manga/scene-graph/schema";
import type { EpisodeStoryboardV2, PagePlanPage, PagePlanV2, PageRoleV2, StoryboardPageV2 } from "../../../src/lib/manga/schemas-v2";

function storyboardPage(pageNo: number, pageRole: PageRoleV2, characterIds: string[] = []): StoryboardPageV2 {
  return {
    page_no: pageNo,
    page_role: pageRole,
    panels: [
      {
        panel_id: `p${pageNo}_1`,
        panel_no: 1,
        reading_order: 1,
        shot_type: "medium",
        camera: "eye_level",
        bleed: false,
        silence: characterIds.length === 0,
        importance: 3,
        entities: {
          characters: characterIds.map((character_id) => ({
            character_id,
            role: "speaker",
            on_screen_via: "in_person",
            expression: "neutral",
          })),
          location_id: "loc_test",
          props: [],
          focus_entity_id: characterIds[0] ?? "loc_test",
        },
        action: "",
        key_visual: "",
        dialogue: [],
        monologue: [],
        narration: [],
        sfx: [],
      },
    ],
  };
}

function storyboard(pages: StoryboardPageV2[]): EpisodeStoryboardV2 {
  return {
    schema_version: 2,
    episode_id: "test-ep01",
    total_pages: pages.length,
    pages,
  };
}

function pagePlanPage(args: {
  pageNo: number;
  pageRole?: PageRoleV2;
  polygon?: [number, number][];
}): PagePlanPage {
  return {
    page_no: args.pageNo,
    layout_template_id: "test_layout",
    page_role: args.pageRole ?? "buildup",
    render_strategy: "panel_composite",
    panels: [
      {
        panel_id: `p${args.pageNo}_1`,
        slot_id: "slot_1",
        rect: { x: 0, y: 0, w: 100, h: 100 },
        reading_order: 1,
        importance: 3,
        ...(args.polygon ? { polygon: args.polygon } : {}),
      },
    ],
  };
}

function pagePlan(pages: PagePlanPage[]): PagePlanV2 {
  return {
    schema_version: 2,
    episode_id: "test-ep01",
    capability_profile_id: "test",
    pages,
  };
}

function sceneGraph(): SceneGraphV1 {
  return {
    scenes: [
      {
        page_range: { start: 1, end: 1 },
        cast: [{ character_id: "char_seen", presence: "in_person" }],
      },
      {
        page_range: { start: 2, end: 3 },
        cast: [{ character_id: "char_new_scene", presence: "in_person" }],
      },
    ],
  } as SceneGraphV1;
}

describe("L11 triage selector", () => {
  it("audits opening_hook pages", () => {
    const sb = storyboard([storyboardPage(1, "opening_hook")]);
    const pp = pagePlan([pagePlanPage({ pageNo: 1, pageRole: "opening_hook" })]);

    expect(shouldAuditPage(pp.pages[0], undefined, sb, pp)).toBe(true);
  });

  it("audits cliffhanger pages", () => {
    const sb = storyboard([storyboardPage(1, "cliffhanger")]);
    const pp = pagePlan([pagePlanPage({ pageNo: 1, pageRole: "cliffhanger" })]);

    expect(shouldAuditPage(pp.pages[0], undefined, sb, pp)).toBe(true);
  });

  it("audits a character first-appearance page from storyboard", () => {
    const sb = storyboard([
      storyboardPage(1, "buildup", ["char_seen"]),
      storyboardPage(2, "dialogue", ["char_seen", "char_new_storyboard"]),
    ]);
    const pp = pagePlan([
      pagePlanPage({ pageNo: 1 }),
      pagePlanPage({ pageNo: 2, pageRole: "dialogue" }),
    ]);

    expect(shouldAuditPage(pp.pages[1], undefined, sb, pp)).toBe(true);
  });

  it("audits a character first-appearance page from scene_graph", () => {
    const sb = storyboard([
      storyboardPage(1, "buildup"),
      storyboardPage(2, "dialogue"),
      storyboardPage(3, "dialogue"),
    ]);
    const pp = pagePlan([
      pagePlanPage({ pageNo: 1 }),
      pagePlanPage({ pageNo: 2, pageRole: "dialogue" }),
      pagePlanPage({ pageNo: 3, pageRole: "dialogue" }),
    ]);

    expect(shouldAuditPage(pp.pages[1], sceneGraph(), sb, pp)).toBe(true);
    expect(shouldAuditPage(pp.pages[2], sceneGraph(), sb, pp)).toBe(false);
  });

  it("audits pages with a non-rectangular polygon panel", () => {
    const sb = storyboard([storyboardPage(1, "buildup")]);
    const pp = pagePlan([
      pagePlanPage({
        pageNo: 1,
        polygon: [
          [0, 0],
          [100, 0],
          [90, 100],
          [0, 100],
        ],
      }),
    ]);

    expect(shouldAuditPage(pp.pages[0], undefined, sb, pp)).toBe(true);
  });

  it("skips pages that do not match triage conditions", () => {
    const sb = storyboard([
      storyboardPage(1, "buildup", ["char_seen"]),
      storyboardPage(2, "dialogue", ["char_seen"]),
    ]);
    const pp = pagePlan([
      pagePlanPage({ pageNo: 1 }),
      pagePlanPage({ pageNo: 2, pageRole: "dialogue" }),
    ]);

    expect(shouldAuditPage(pp.pages[1], undefined, sb, pp)).toBe(false);
  });
});
