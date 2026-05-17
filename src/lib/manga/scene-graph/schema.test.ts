import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import type { Scene, SceneGraphV1 } from "./schema";
import { validateSceneGraph, validatePanelSceneInheritance } from "./schema";
import type { StoryboardLikeShape } from "./schema";

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
  return graphWithScenes([scene(scenePatch)]);
}

function graphWithScenes(scenes: Scene[]): SceneGraphV1 {
  return {
    schema_version: 1,
    episode_id: "ep01",
    scenes,
    generated_at: "2026-05-10T00:00:00.000Z",
    source: { brief_path: "brief", shotlist_path: "shotlist", bible_snapshot_path: "bible" },
  };
}

function validate(scenePatch: Partial<Scene>, biblePatch: Partial<BibleSnapshotV2> = {}) {
  return validateSceneGraph(graph(scenePatch), bible(biblePatch), { episode_id: "ep01", cast: ["char_a", "char_b"] });
}

function validateScenes(scenes: Scene[]) {
  return validateSceneGraph(graphWithScenes(scenes), bible(), { episode_id: "ep01", cast: ["char_a", "char_b"] });
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

  it("Rule 19: panel_archetype_hint 不一致は warning に留める", () => {
    const result = validate(
      { panel_archetype_hint: "arch_missing" },
      { visual_grammar: { panel_archetypes: [{ id: "arch_a" }] } } as unknown as Partial<BibleSnapshotV2>
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain('S01: panel_archetype_hint "arch_missing" not in bible.visual_grammar.panel_archetypes');
  });

  it("Rule 20: cliffhanger_pattern は cliff scene 以外では error にする", () => {
    const result = validate({ cliffhanger_pattern: "daily_intrusion", beat_type: "setup" });

    expect(result.errors).toContain('S01: cliffhanger_pattern "daily_intrusion" specified but beat_type=setup (cliff のみ可)');
  });

  it("Rule 20: cliff scene では cliffhanger_pattern を許可する", () => {
    const result = validate({ cliffhanger_pattern: "daily_intrusion", beat_type: "cliff" });

    expect(result.ok).toBe(true);
  });
});

describe("validateSceneGraph Rule 16-18 render_constraints", () => {
  it("Rule 16: bubble_density_min を満たす page stats なら warning なし", () => {
    const result = validateSceneGraph(
      graph({ render_constraints: { bubble_density_min: 8 } }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      { renderConstraintPageStats: [{ page_no: 1, bubble_count: 8 }] }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("Rule 16"))).toBe(false);
  });

  it("Rule 16: bubble_density_min 未満なら warning", () => {
    const result = validateSceneGraph(
      graph({ render_constraints: { bubble_density_min: 8 } }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      { renderConstraintPageStats: [{ page_no: 1, bubble_count: 7 }] }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("S01: Rule 16 bubble_density_min=8 unmet on page 1: bubble_count=7");
  });

  it("Rule 17: panel_size_variance_min を満たす page stats なら warning なし", () => {
    const result = validateSceneGraph(
      graph({ render_constraints: { panel_size_variance_min: 0.5 } }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      { renderConstraintPageStats: [{ page_no: 1, panel_size_variance: 0.5 }] }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("Rule 17"))).toBe(false);
  });

  it("Rule 17: panel_size_variance_min 未満なら warning", () => {
    const result = validateSceneGraph(
      graph({ render_constraints: { panel_size_variance_min: 0.5 } }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      { renderConstraintPageStats: [{ page_no: 1, panel_size_variance: 0.25 }] }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("S01: Rule 17 panel_size_variance_min=0.5 unmet on page 1: panel_size_variance=0.25");
  });

  it("Rule 18: tame_panel_count_min を満たす page stats なら warning なし", () => {
    const result = validateSceneGraph(
      graph({ render_constraints: { tame_panel_count_min: 1 } }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      { renderConstraintPageStats: [{ page_no: 1, tame_panel_count: 1 }] }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("Rule 18"))).toBe(false);
  });

  it("Rule 18: tame_panel_count_min 未満なら warning", () => {
    const result = validateSceneGraph(
      graph({ render_constraints: { tame_panel_count_min: 1 } }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      { renderConstraintPageStats: [{ page_no: 1, tame_panel_count: 0 }] }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("S01: Rule 18 tame_panel_count_min=1 unmet on page 1: tame_panel_count=0");
  });

  it("render_constraints 未指定なら Rule 16-18 は skip", () => {
    const result = validateSceneGraph(
      graph({}),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      { renderConstraintPageStats: [{ page_no: 1, bubble_count: 0, panel_size_variance: 0, tame_panel_count: 0 }] }
    );

    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => /Rule 1[678]/.test(w))).toBe(false);
  });
});

describe("validateSceneGraph Rule 4 scene_exclusive text uniqueness", () => {
  it("scene_exclusive text が他 scene の may_repeat key_line に出たら error", () => {
    const result = validateScenes([
      scene({
        scene_id: "S01",
        scene_no: 1,
        next_scene_id: "S02",
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "経験値倍化条件、開示します。", uniqueness: "scene_exclusive", intent: "reveal" }],
        },
      }),
      scene({
        scene_id: "S02",
        scene_no: 2,
        prev_scene_id: "S01",
        cast: [{ character_id: "char_a", presence: "in_person" }],
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "経験値倍化条件、開示します。", uniqueness: "may_repeat", intent: "callback" }],
        },
      }),
    ]);

    expect(result.errors).toContain(
      'scene_exclusive text "経験値倍化条件、開示します。" (owned by S01) は S02 でも出現 (uniqueness 問わず禁止)'
    );
  });

  it("scene_exclusive text が他 scene の scene_exclusive key_line に出ても error", () => {
    const result = validateScenes([
      scene({
        scene_id: "S01",
        scene_no: 1,
        next_scene_id: "S02",
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "ここで終わりだ。", uniqueness: "scene_exclusive", intent: "cliff" }],
        },
      }),
      scene({
        scene_id: "S02",
        scene_no: 2,
        prev_scene_id: "S01",
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "ここで終わりだ。", uniqueness: "scene_exclusive", intent: "cliff" }],
        },
      }),
    ]);

    expect(result.errors).toContain(
      'scene_exclusive text "ここで終わりだ。" (owned by S01) は S02 でも出現 (uniqueness 問わず禁止)'
    );
  });

  it("may_repeat 同士の同一 text は通す", () => {
    const result = validateScenes([
      scene({
        scene_id: "S01",
        scene_no: 1,
        next_scene_id: "S02",
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "了解。", uniqueness: "may_repeat", intent: "callback" }],
        },
      }),
      scene({
        scene_id: "S02",
        scene_no: 2,
        prev_scene_id: "S01",
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "了解。", uniqueness: "may_repeat", intent: "callback" }],
        },
      }),
    ]);

    expect(result.ok).toBe(true);
  });

  it("scene_exclusive text が他 scene に無ければ通す", () => {
    const result = validateScenes([
      scene({
        scene_id: "S01",
        scene_no: 1,
        next_scene_id: "S02",
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "ここだけの合図だ。", uniqueness: "scene_exclusive", intent: "hook" }],
        },
      }),
      scene({
        scene_id: "S02",
        scene_no: 2,
        prev_scene_id: "S01",
        dialogue_plan: {
          key_lines: [{ speaker: "char_a", text: "別の言い方にする。", uniqueness: "may_repeat", intent: "callback" }],
        },
      }),
    ]);

    expect(result.ok).toBe(true);
  });
});

describe("validateSceneGraph Rule 5 volume foreshadow_map 連携", () => {
  it("volumeForeshadowMap 渡しで件数不足 warning が出る", () => {
    const result = validateSceneGraph(
      graph({ foreshadow_setup: [] }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      {
        episodeNo: 1,
        volumeForeshadowMap: [
          { seed_in_episode: 1, payoff_in_episode: 5, description: "seed one" },
          { seed_in_episode: 1, payoff_in_episode: 10, description: "seed two" },
        ],
      }
    );

    expect(result.warnings).toContain("volume_plot expects 2 seeds in ep1 but scene_graph only sets up 0");
  });

  it("volumeForeshadowMap 渡しで hint 不整合 warning が出る", () => {
    const result = validateSceneGraph(
      graph({
        foreshadow_setup: [{ token: "F_future", payoff_episode_hint: "this_episode" }],
      }),
      bible(),
      { episode_id: "ep01", cast: ["char_a", "char_b"] },
      {
        episodeNo: 1,
        volumeForeshadowMap: [
          { seed_in_episode: 1, payoff_in_episode: 10, description: "future payoff" },
        ],
      }
    );

    expect(result.warnings.some((w) => w.includes("expects cross-episode payoff"))).toBe(true);
  });
});

// ============================================================================
// validatePanelSceneInheritance Gap 1-4 テスト
// ============================================================================

function makeInheritanceScene(patch: Partial<Scene> = {}): Scene {
  return {
    scene_id: "S01",
    scene_no: 1,
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 2 },
    panel_range: { start_panel_no: 1, end_panel_no: 3 },
    arc_position: { volume: 1, episode_in_volume: 1, arc_phase: "introduce", arc_position_normalized: 0 },
    beat_type: "introduce",
    cast: [{ character_id: "char_a", presence: "in_person" }],
    dialogue_plan: { key_lines: [] },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: { belief: "b", goal: "g", emotion: "calm", delta_from_prev: "none" },
    relationship_state_delta: [],
    time_axis: { label: "now", order: 1, is_flashback: false, is_flashforward: false, duration_hint: "minutes" },
    location_id: "loc_a",
    page_budget: { min: 2, max: 2, preferred: 2 },
    mode: "establishing",
    turn_anchor: { at_panel_no: null, type: "none" },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "page_one_shot",
    key_visual_intent: "intent",
    ...patch,
  };
}

function makeInheritanceGraph(scenes: Scene[]): SceneGraphV1 {
  return {
    schema_version: 1,
    episode_id: "ep01",
    scenes,
    generated_at: "2026-05-14T00:00:00.000Z",
    source: { brief_path: "b", shotlist_path: "s", bible_snapshot_path: "bi" },
  };
}

describe("validatePanelSceneInheritance Gap 1: narration_lines", () => {
  it("narration_lines が正しく転記されていれば error なし", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({
        directing_intent: {
          kind: "opening_hook",
          hook_pattern: "world_glimpse",
          key_visual: "新宿の夜景",
          narration_lines: ["三年前、ダンジョンが現れた。", "判定が人生を決める。"],
        },
      }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            { panel_no: 1, entities: { location_id: "loc_a", characters: ["char_a"] }, narration: ["三年前、ダンジョンが現れた。"] },
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] }, narration: ["判定が人生を決める。"] },
          ],
        },
        {
          page_no: 2,
          panels: [
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("narration_lines の年数が改変されたら error", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({
        directing_intent: {
          kind: "opening_hook",
          hook_pattern: "world_glimpse",
          key_visual: "新宿の夜景",
          narration_lines: ["三年前、ダンジョンが現れた。"],
        },
      }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            { panel_no: 1, entities: { location_id: "loc_a", characters: ["char_a"] }, narration: ["二十年前、ダンジョンが現れた。"] },
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
        {
          page_no: 2,
          panels: [
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("narration_line") && e.includes("三年前"))).toBe(true);
  });

  it("narration_lines が完全に脱落したら error", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({
        directing_intent: {
          kind: "opening_hook",
          hook_pattern: "world_glimpse",
          key_visual: "夜景",
          narration_lines: ["判定が人生を決める。"],
        },
      }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            { panel_no: 1, entities: { location_id: "loc_a", characters: ["char_a"] }, narration: [] },
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
        {
          page_no: 2,
          panels: [
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("narration_line") && e.includes("判定が人生を決める"))).toBe(true);
  });
});

describe("validatePanelSceneInheritance Gap 2: key_lines 全量配置", () => {
  it("key_lines が全て dialogue に配置されていれば error なし", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({
        dialogue_plan: {
          key_lines: [
            { speaker: "char_a", text: "了解。", uniqueness: "may_repeat", intent: "callback" },
          ],
        },
      }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            {
              panel_no: 1,
              entities: { location_id: "loc_a", characters: ["char_a"] },
              dialogue: [{ character_id: "char_a", text: "了解。" }],
            },
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
        {
          page_no: 2,
          panels: [
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.ok).toBe(true);
  });

  it("key_line が脱落したら error", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({
        dialogue_plan: {
          key_lines: [
            { speaker: "char_a", text: "経験値倍化条件、開示します。", uniqueness: "scene_exclusive", intent: "reveal" },
          ],
        },
      }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            {
              panel_no: 1,
              entities: { location_id: "loc_a", characters: ["char_a"] },
              dialogue: [{ character_id: "char_a", text: "別のセリフです。" }],
            },
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
        {
          page_no: 2,
          panels: [
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("key_line") && e.includes("経験値倍化条件"))).toBe(true);
  });
});

describe("validatePanelSceneInheritance Gap 3: key_visual キーワード重複", () => {
  it("key_visual のキーワードが大きく乖離していれば warn", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({
        directing_intent: {
          kind: "opening_hook",
          hook_pattern: "world_glimpse",
          key_visual: "新宿の夜景を見下ろす俯瞰。ビル群の隙間にダンジョンゲートの青白い光が灯る。",
          narration_lines: [],
        },
      }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            {
              panel_no: 1,
              entities: { location_id: "loc_a", characters: ["char_a"] },
              key_visual: "コンビニ店内の蛍光灯。棚に並ぶ弁当。",
            },
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
        {
          page_no: 2,
          panels: [
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.warnings.some((w) => w.includes("key_visual") && w.includes("キーワード重複率"))).toBe(true);
  });
});

describe("validatePanelSceneInheritance Gap 4: page_range 逸脱", () => {
  it("panel が page_range 内なら error なし", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({ page_range: { start: 1, end: 2 } }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            { panel_no: 1, entities: { location_id: "loc_a", characters: ["char_a"] } },
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
        {
          page_no: 2,
          panels: [
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.ok).toBe(true);
  });

  it("panel が page_range 外に配置されたら error", () => {
    const sg = makeInheritanceGraph([
      makeInheritanceScene({ page_range: { start: 1, end: 1 } }),
    ]);
    const sb: StoryboardLikeShape = {
      pages: [
        {
          page_no: 1,
          panels: [
            { panel_no: 1, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
        {
          page_no: 3,
          panels: [
            { panel_no: 2, entities: { location_id: "loc_a", characters: ["char_a"] } },
            { panel_no: 3, entities: { location_id: "loc_a", characters: ["char_a"] } },
          ],
        },
      ],
    };
    const result = validatePanelSceneInheritance(sb, sg);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("page_range") || e.includes("placed on page"))).toBe(true);
  });
});
