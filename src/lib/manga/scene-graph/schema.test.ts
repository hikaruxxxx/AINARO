import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import type { Scene, SceneGraphV1 } from "./schema";
import { validateSceneGraph } from "./schema";

function bible(patch: Partial<BibleSnapshotV2> = {}): BibleSnapshotV2 {
  const base = {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "schema-test",
      title: "Schema Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
    },
    world: { premise: "test", rules: ["登録制"], system: "system", timeline: "timeline", factions: [] },
    characters: [
      {
        id: "char_a",
        name: "A",
        role: "protagonist",
        spec: { hair: { style: "short", color: "black" }, outfit_default: { top: "shirt" } },
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
      },
      {
        id: "char_b",
        name: "B",
        role: "support",
        spec: { hair: { style: "long", color: "white" }, outfit_default: { top: "coat" } },
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
      },
    ],
    locations: [
      { id: "loc_a", name: "A room", location_type: "room", spec: {}, continuity_anchors: [], appears_in_episodes: [1] },
    ],
    props: [{ id: "prop_a", name: "A prop", spec: {}, continuity_anchors: [] }],
    costumes: [
      { id: "costume_a", character_id: "char_a", valid_from_episode: 1, valid_until_episode: null, spec: { top: "shirt" } },
    ],
    relations: [],
    style_directives: { global: "global", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [{ name: "motif_a", meaning: "A", draw_directive: "draw A" }],
    continuity_seeds: [],
    volume_synopsis: { theme: "theme", summary: "summary" },
    ...patch,
  };
  return base as unknown as BibleSnapshotV2;
}

function scene(patch: Partial<Scene> = {}): Scene {
  return {
    scene_id: "S01",
    scene_no: 1,
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 1 },
    panel_range: { start_panel_no: 1, end_panel_no: 1 },
    arc_position: { volume: 1, episode_in_volume: 1, arc_phase: "introduce", arc_position_normalized: 0.1 },
    beat_type: "setup",
    cast: [{ character_id: "char_a", presence: "in_person" }],
    dialogue_plan: { key_lines: [] },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: { belief: "b", goal: "g", emotion: "calm", delta_from_prev: "none" },
    relationship_state_delta: [],
    time_axis: { label: "now", order: 1, is_flashback: false, is_flashforward: false, duration_hint: "minutes" },
    location_id: "loc_a",
    page_budget: { min: 1, max: 1, preferred: 1 },
    mode: "dialogue",
    turn_anchor: { at_panel_no: null, type: "none" },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "panel_composite",
    key_visual_intent: "intent",
    ...patch,
  };
}

function graph(scenePatch: Partial<Scene> = {}): SceneGraphV1 {
  return {
    schema_version: 1,
    episode_id: "ep01",
    scenes: [scene(scenePatch)],
    generated_at: "2026-05-10T00:00:00.000Z",
    source: { brief_path: "brief", shotlist_path: "shotlist", bible_snapshot_path: "bible" },
  };
}

function validate(scenePatch: Partial<Scene>, biblePatch: Partial<BibleSnapshotV2> = {}) {
  return validateSceneGraph(graph(scenePatch), bible(biblePatch), { episode_id: "ep01", cast: ["char_a", "char_b"] });
}

describe("validateSceneGraph D 系 bible 伝搬軸", () => {
  it("D 系 optional 軸が未指定でも既存 scene-graph を通す", () => {
    const result = validate({});

    expect(result.ok).toBe(true);
  });

  it("Rule 12: wardrobe_state の character_id と costume_id を検証する", () => {
    const result = validate({
      wardrobe_state: [{ character_id: "char_b", costume_id: "missing_costume" }],
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'S01: wardrobe_state.character_id "char_b" not in scene.cast',
        'S01: wardrobe_state.costume_id "missing_costume" not in bible.costumes',
      ])
    );
  });

  it("Rule 13: visual_motif_anchors の motif_id を name または id と照合する", () => {
    const result = validate({ visual_motif_anchors: [{ motif_id: "missing_motif", intensity: "clear" }] });

    expect(result.errors).toContain('S01: visual_motif_anchors.motif_id "missing_motif" not in bible.visual_motifs');
  });

  it("Rule 14: theme_subtext.theme_id 不一致は warning に留める", () => {
    const result = validate(
      { theme_subtext: { theme_id: "theme_missing", how_it_surfaces: "表情に出る" } },
      { themes_and_subtexts: [{ id: "theme_a" }] } as unknown as Partial<BibleSnapshotV2>
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('S01: theme_subtext.theme_id "theme_missing" not in bible.themes_and_subtexts');
  });

  it("Rule 15: props_in_play の prop_id と held_by を検証する", () => {
    const result = validate({ props_in_play: [{ prop_id: "missing_prop", held_by: "char_b" }] });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'S01: props_in_play.prop_id "missing_prop" not in bible.props',
        'S01: props_in_play.held_by "char_b" not in scene.cast',
      ])
    );
  });

  it("Rule 16: panel_archetype_hint 不一致は warning に留める", () => {
    const result = validate(
      { panel_archetype_hint: "arch_missing" },
      { visual_grammar: { panel_archetypes: [{ id: "arch_a" }] } } as unknown as Partial<BibleSnapshotV2>
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('S01: panel_archetype_hint "arch_missing" not in bible.visual_grammar.panel_archetypes');
  });

  it("Rule 17: cliffhanger_pattern は cliff scene 以外では error にする", () => {
    const result = validate({ cliffhanger_pattern: "daily_intrusion", beat_type: "setup" });

    expect(result.errors).toContain('S01: cliffhanger_pattern "daily_intrusion" specified but beat_type=setup (cliff のみ可)');
  });

  it("Rule 17: cliff scene では cliffhanger_pattern を許可する", () => {
    const result = validate({ cliffhanger_pattern: "daily_intrusion", beat_type: "cliff" });

    expect(result.ok).toBe(true);
  });
});
