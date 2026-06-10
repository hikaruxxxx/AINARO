import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2, FactNode, Layer } from "../schemas-v2";
import { contextForSceneV2 } from "../bible/broker-v3";
import type { Scene } from "./schema";
import { buildPanelDetailPrompt, type PromptBibleContext } from "./storyboard-from-scenes";

describe("buildPanelDetailPrompt visibility context", () => {
  it("bibleContext なしでは visibility / bible context section を出さない", () => {
    const prompt = buildPanelDetailPrompt(sceneStub(), 2);

    expect(prompt).not.toContain("## visibility 制約");
    expect(prompt).not.toContain("## bible context");
    expect(prompt).toContain("## 制約");
  });

  it("bibleContext ありでは visibility 制約と in-world fact を制約前に出す", () => {
    const prompt = buildPanelDetailPrompt(
      sceneStub(),
      2,
      undefined,
      [],
      {
        characters: [fact("fact_char", "char_a", "identity", "in_world_belief", "アオは青いゲート前で登録証を握る新人配送員。")],
        location: [fact("fact_loc", "loc_gate", "location_layout", "in_world_belief", "青いゲートは狭い入口で、床に登録証の光が反射する。")],
        world_rules: [fact("fact_rule", null, "world_rule", "in_world_belief", "登録証がない者は青いゲートを通れない。")],
        motifs: [fact("fact_motif", "motif_gate", "motif_directive", "in_world_belief", "青い矩形光を背景に控えめに反復する。")],
      },
      { atVolume: 1 }
    );

    expect(prompt).toContain("## visibility 制約");
    expect(prompt).toContain("第 1 巻まで");
    expect(prompt).toContain("アオは青いゲート前で登録証を握る新人配送員。");
    expect(prompt).not.toContain("不可逆刻印");
    expect(prompt.indexOf("## visibility 制約")).toBeLessThan(prompt.indexOf("## 制約"));
    expect(prompt.indexOf("## bible context")).toBeLessThan(prompt.indexOf("## 制約"));
  });

  it("bibleContext が空なら各 bible context subsection を省略する", () => {
    const emptyContext: PromptBibleContext = {
      characters: [],
      location: [],
      world_rules: [],
      motifs: [],
    };

    const prompt = buildPanelDetailPrompt(sceneStub(), 2, undefined, [], emptyContext, { atVolume: 1 });

    expect(prompt).toContain("## visibility 制約");
    expect(prompt).toContain("## bible context");
    expect(prompt).not.toContain("### キャラクター");
    expect(prompt).not.toContain("### この場所");
    expect(prompt).not.toContain("### 適用される世界ルール");
    expect(prompt).not.toContain("### モチーフ");
  });

  it("contextForSceneV2 の in_world_only context を流すと meta_truth body を prompt に入れない", () => {
    const bible = bibleStub();
    const scene = sceneStub();
    const brokerContext = contextForSceneV2(bible, scene, "in_world_only", { char: { min: 400, max: 1800 } });
    const prompt = buildPanelDetailPrompt(
      scene,
      2,
      undefined,
      [],
      {
        characters: brokerContext.characters,
        location: brokerContext.location,
        world_rules: brokerContext.world_rules,
        motifs: brokerContext.motifs,
      },
      { atVolume: 1 }
    );

    expect(prompt).toContain("アオは青いゲート前で登録証を握る新人配送員。");
    expect(prompt).toContain("登録端末");
    expect(prompt).not.toContain("不可逆刻印");
  });
});

function sceneStub(): Scene {
  return {
    scene_id: "S01",
    scene_no: 1,
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 1 },
    panel_range: { start_panel_no: 1, end_panel_no: 2 },
    arc_position: { volume: 1, episode_in_volume: 1, arc_phase: "introduce", arc_position_normalized: 0.1 },
    beat_type: "introduce",
    cast: [{ character_id: "char_a", presence: "in_person" }],
    dialogue_plan: {
      key_lines: [{ speaker: "char_a", text: "ここからなら、まだ間に合う。", uniqueness: "scene_exclusive", intent: "establish" }],
    },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: {
      belief: "手順を守れば失敗しない",
      goal: "青いゲートを通る",
      emotion: "tension",
      delta_from_prev: "登録証を握って一歩進む",
    },
    relationship_state_delta: [],
    time_axis: { label: "朝", order: 1, is_flashback: false, is_flashforward: false, duration_hint: "moments" },
    location_id: "loc_gate",
    page_budget: { min: 2, max: 2, preferred: 2 },
    mode: "introspection",
    turn_anchor: { at_panel_no: null, type: "none" },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "panel_composite",
    key_visual_intent: "青いゲート前で登録証を握る",
  };
}

function bibleStub(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-11T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "storyboard-visibility.test.ts" },
    meta: {
      slug: "storyboard-visibility-test",
      title: "Storyboard Visibility Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
      estimated_volumes: 3,
    },
    world: {
      premise: "青いゲートを通る登録配送の物語。",
      rules: ["登録証がない者は青いゲートを通れない。"],
      system: "管理局が登録証と配送報酬を管理する。",
      timeline: "第一巻は登録から初配送まで。",
      factions: [],
      power_system_logic: "登録証は選択履歴を記録する。",
      social_strata: "登録等級が仕事の単価を左右する。",
      daily_life_textures: "濡れた階段と青い低照度。",
    },
    characters: [
      {
        id: "char_a",
        name: "アオ",
        role: "protagonist",
        spec: {
          hair: { style: "短髪", color: "黒", specific: "前髪が少し跳ねる" },
          eyes: { shape: "丸い", color: "黒", expression_default: "警戒" },
          outfit_default: { top: "紺のパーカー", bottom: "黒い作業ズボン" },
          personality_visual: "慎重で、登録証を握る癖がある。",
        },
        continuity_anchors: ["登録証を握る手"],
        appears_in_volumes: [1],
        appearance_notes: "アオは青いゲート前で登録証を握る新人配送員。",
        psychology_deep: "不可逆刻印によって、失敗を自分の価値そのものと誤認している。",
      },
    ],
    locations: [
      {
        id: "loc_gate",
        name: "青いゲート",
        location_type: "other",
        spec: {
          atmosphere: "静かで冷たい",
          lighting_default: "青い低照度",
          visual_description: "青いゲートは狭い入口で、床に登録証の光が反射する。",
          iconic_objects: [{ name: "登録端末", description: "青く点滅する。" }],
        },
        continuity_anchors: ["青い低照度"],
        appears_in_episodes: [1],
      },
    ],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "生活感を優先する。", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [
      {
        name: "blue_gate",
        meaning: "境界と登録制度。",
        draw_directive: "青い矩形光を背景に控えめに反復する。",
      },
    ],
    continuity_seeds: [],
    volume_synopsis: { theme: "登録と自立", summary: "新人が青いゲートを通る。", cliffhanger: "ゲートの警報が沈黙する。" },
  } as unknown as BibleSnapshotV2;
}

function fact(
  fact_id: string,
  entity_id: string | null,
  aspect: FactNode["aspect"],
  layer: Layer,
  body: string
): FactNode {
  return {
    fact_id,
    entity_id,
    aspect,
    layer,
    body,
    evidence: { source_path: fact_id, confidence: 1 },
  };
}
