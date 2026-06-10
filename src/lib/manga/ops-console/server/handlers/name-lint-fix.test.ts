import { describe, expect, it } from "vitest";
import type { SceneGraphV1 } from "../../../scene-graph/schema";
import { panelNosFromSceneIds } from "./name-lint-fix";

function sceneGraph(): SceneGraphV1 {
  const sceneBase = {
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 1 },
    beat_type: "introduce" as const,
    arc_position: { volume: 1, episode_in_volume: 1, arc_phase: "introduce" as const, arc_position_normalized: 0.1 },
    cast: [],
    dialogue_plan: { key_lines: [] },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: { belief: "b", goal: "g", emotion: "resignation" as const, delta_from_prev: "d" },
    relationship_state_delta: [],
    time_axis: { label: "t", order: 1, is_flashback: false, is_flashforward: false, duration_hint: "minutes" as const },
    location_id: "loc",
    page_budget: { min: 1, max: 1, preferred: 1 },
    mode: "dialogue" as const,
    turn_anchor: { at_panel_no: null, type: "none" as const },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "page_one_shot" as const,
    key_visual_intent: "intent",
  };
  return {
    schema_version: 1,
    episode_id: "ep",
    generated_at: "2026-05-10T00:00:00.000Z",
    source: { brief_path: "", shotlist_path: "", bible_snapshot_path: "" },
    scenes: [
      { ...sceneBase, scene_id: "S01", scene_no: 1, next_scene_id: "S02", panel_range: { start_panel_no: 1, end_panel_no: 3 } },
      { ...sceneBase, scene_id: "S02", scene_no: 2, prev_scene_id: "S01", panel_range: { start_panel_no: 4, end_panel_no: 6 } },
    ],
  };
}

describe("panelNosFromSceneIds", () => {
  it("expands scene ids to sorted panel numbers", () => {
    expect(panelNosFromSceneIds(sceneGraph(), ["S02"])).toEqual([4, 5, 6]);
  });

  it("unions multiple scene ids", () => {
    expect(panelNosFromSceneIds(sceneGraph(), ["S02", "S01"])).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
