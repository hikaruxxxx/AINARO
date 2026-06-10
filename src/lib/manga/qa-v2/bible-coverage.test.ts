import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../schemas-v2";
import type { Scene, SceneGraphV1 } from "../scene-graph/schema";
import { computeBibleCoverage } from "./bible-coverage";

function bible(patch: Partial<BibleSnapshotV2> = {}): BibleSnapshotV2 {
  const base = {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "coverage-test",
      title: "Coverage Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
    },
    world: { premise: "test", rules: ["rule_a"], system: "system", timeline: "timeline", factions: [] },
    characters: [
      {
        id: "char_a",
        name: "A",
        role: "protagonist",
        spec: { hair: { style: "short", color: "black" }, outfit_default: { top: "shirt" } },
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
        voice_samples: [{ line: "ここで進む" }],
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
      { id: "loc_b", name: "B room", location_type: "room", spec: {}, continuity_anchors: [], appears_in_episodes: [1] },
    ],
    props: [
      { id: "prop_a", name: "A prop", spec: {}, continuity_anchors: [] },
      { id: "prop_unused", name: "Unused prop", spec: {}, continuity_anchors: [] },
    ],
    costumes: [
      { id: "costume_a", character_id: "char_a", valid_from_episode: 1, valid_until_episode: null, spec: { top: "shirt" } },
    ],
    relations: [
      { from_character_id: "char_a", to_character_id: "char_b", relation_type: "ally", description: "allies" },
    ],
    style_directives: { global: "global", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [
      { name: "motif_a", meaning: "A", draw_directive: "draw A" },
      { name: "motif_b", meaning: "B", draw_directive: "draw B" },
      { name: "motif_c", meaning: "C", draw_directive: "draw C" },
    ],
    continuity_seeds: [],
    volume_synopsis: { theme: "theme", summary: "summary" },
    ...patch,
  };
  return base as unknown as BibleSnapshotV2;
}

function emptyBible(): BibleSnapshotV2 {
  return bible({
    characters: [],
    locations: [],
    props: [],
    costumes: [],
    visual_motifs: [],
    relations: [],
  });
}

function scene(patch: Partial<Scene> = {}): Scene {
  return {
    scene_id: "S01",
    scene_no: 1,
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 1 },
    panel_range: { start_panel_no: 1, end_panel_no: 2 },
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

function sceneGraph(scenes: Scene[] = [scene()]): SceneGraphV1 {
  return {
    schema_version: 1,
    episode_id: "ep01",
    scenes,
    generated_at: "2026-05-10T00:00:00.000Z",
    source: { brief_path: "brief", shotlist_path: "shotlist", bible_snapshot_path: "bible" },
  };
}

function storyboard(): EpisodeStoryboardV2 {
  return {
    schema_version: 2,
    episode_id: "ep01",
    total_pages: 1,
    pages: [
      {
        page_no: 1,
        page_role: "dialogue",
        panels: [
          {
            panel_id: "p1",
            panel_no: 1,
            reading_order: 1,
            shot_type: "medium",
            camera: "eye_level",
            bleed: false,
            silence: false,
            importance: 3,
            entities: {
              characters: [{ character_id: "char_a", role: "speaker", on_screen_via: "in_person", expression: "calm" }],
              location_id: "loc_a",
              props: [{ prop_id: "prop_a", held_by_character_id: "char_a" }],
              focus_entity_id: "char_a",
            },
            action: "act",
            key_visual: "visual",
            dialogue: [{ character_id: "char_a", text: "ここで進む" }],
            monologue: [],
            narration: [],
            sfx: [],
          },
          {
            panel_id: "p2",
            panel_no: 2,
            reading_order: 2,
            shot_type: "close_up",
            camera: "eye_level",
            bleed: false,
            silence: true,
            importance: 2,
            entities: { characters: [], location_id: "loc_a", props: [], focus_entity_id: "loc_a" },
            action: "look",
            key_visual: "visual",
            dialogue: [],
            monologue: [],
            narration: [],
            sfx: [],
          },
        ],
      },
    ],
  };
}

describe("computeBibleCoverage", () => {
  it("scene-graph + storyboard が空の bible に対して 0% coverage を返す", () => {
    const report = computeBibleCoverage({ bible: emptyBible(), episodeId: "ep01" });

    expect(report.total_score).toBe(0);
    expect(report.bible_fields_referenced.characters).toEqual({ total: 0, referenced: 0 });
    expect(report.unused_bible_fields).toEqual([]);
  });

  it("scene-graph の cast が全 character を含むと character coverage が total に達する", () => {
    const report = computeBibleCoverage({
      bible: bible(),
      sceneGraph: sceneGraph([scene({ cast: [{ character_id: "char_a", presence: "in_person" }, { character_id: "char_b", presence: "voice_off" }] })]),
      episodeId: "ep01",
    });

    expect(report.bible_fields_referenced.characters).toEqual({ total: 2, referenced: 2 });
  });

  it("visual_motif_anchors を 3 個指名すると motif_panel_density が 0 より大きい", () => {
    const report = computeBibleCoverage({
      bible: bible(),
      sceneGraph: sceneGraph([
        scene({
          visual_motif_anchors: [
            { motif_id: "motif_a", intensity: "subtle" },
            { motif_id: "motif_b", intensity: "clear" },
            { motif_id: "motif_c", intensity: "dominant" },
          ],
        }),
      ]),
      storyboard: storyboard(),
      episodeId: "ep01",
    });

    expect(report.motif_panel_density).toBeGreaterThan(0);
  });

  it("unused_bible_fields に未参照 prop_id の dotted path を含める", () => {
    const report = computeBibleCoverage({ bible: bible(), storyboard: storyboard(), episodeId: "ep01" });

    expect(report.unused_bible_fields).toContain("props[1].id");
  });

  it("total_score は 6 カテゴリ平均に近い値になる", () => {
    const report = computeBibleCoverage({
      bible: bible(),
      sceneGraph: sceneGraph([
        scene({
          cast: [{ character_id: "char_a", presence: "in_person" }, { character_id: "char_b", presence: "in_person" }],
          wardrobe_state: [{ character_id: "char_a", costume_id: "costume_a" }],
          visual_motif_anchors: [{ motif_id: "motif_a", intensity: "clear" }],
          props_in_play: [{ prop_id: "prop_a", held_by: "char_a" }],
          relationship_state_delta: [{ pair: ["char_a", "char_b"], direction: "closer", intensity: 1, trigger: "test" }],
        }),
      ]),
      storyboard: storyboard(),
      episodeId: "ep01",
    });

    expect(report.total_score).toBeCloseTo(72.22, 2);
  });

  it("coverage が 50% 未満のカテゴリに recommendations を生成する", () => {
    const report = computeBibleCoverage({ bible: bible(), episodeId: "ep01" });

    expect(report.recommendations).toEqual(expect.arrayContaining(["Phase 4 で wardrobe_state を充填"]));
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("voice_samples が storyboard dialogue に含まれる割合を返す", () => {
    const report = computeBibleCoverage({ bible: bible(), storyboard: storyboard(), episodeId: "ep01" });

    expect(report.voice_bible_reflection_rate).toBe(1);
  });
});
