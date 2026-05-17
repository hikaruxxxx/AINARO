import { describe, expect, it } from "vitest";
import type { SceneGraphV1, Scene } from "./schema";
import { mergeDirectingIntentFromVolumePlot } from "./storyboard-from-scenes";
import { buildPanelDetailPrompt } from "./storyboard-from-scenes";
import type {
  VolumeEpisodePlan,
  SceneSkeleton,
  DirectingIntent,
} from "../storyboard-v2/volume-plot";

function makeScene(scene_no: number, scene_id: string, patch: Partial<Scene> = {}): Scene {
  return {
    scene_id,
    scene_no,
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 3 },
    panel_range: { start_panel_no: 1, end_panel_no: 6 },
    arc_position: { volume: 1, episode_in_volume: 1, arc_phase: "introduce", arc_position_normalized: 0.05 },
    beat_type: "introduce",
    cast: [{ character_id: "char_a", presence: "in_person" }],
    dialogue_plan: { key_lines: [] },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: {
      belief: "底辺",
      goal: "声を確かめる",
      emotion: "tension",
      delta_from_prev: "scene 開始時の状態",
    },
    relationship_state_delta: [],
    time_axis: { label: "morning", order: 1, is_flashback: false, is_flashforward: false, duration_hint: "minutes" },
    location_id: "loc_a",
    sub_locations: [],
    page_budget: { min: 2, max: 3, preferred: 3 },
    mode: "dialogue",
    turn_anchor: { at_panel_no: null, type: "reveal_turn" },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "panel_composite",
    key_visual_intent: "コンビニ通路",
    ...patch,
  };
}

function makeSceneGraph(scenes: Scene[]): SceneGraphV1 {
  return {
    schema_version: 1,
    episode_id: { slug: "test", volume: 1, episode: 1 },
    scenes,
    pull_link: null,
  } as unknown as SceneGraphV1;
}

function makeSkeleton(scene_no: number, di: DirectingIntent): SceneSkeleton {
  return {
    scene_id: `ep01_s0${scene_no}`,
    scene_no,
    page_range: [1, 3],
    location_id: "loc_a",
    time_of_day: "朝",
    cast_ids: ["char_a"],
    purpose: "テスト用",
    emotional_beat: "緊張",
    key_action: "テスト動作",
    connection_to_next: "次へ",
    directing_intent: di,
  };
}

describe("mergeDirectingIntentFromVolumePlot", () => {
  it("scene_no 一致で directing_intent をコピー", () => {
    const sg = makeSceneGraph([
      makeScene(1, "S01"),
      makeScene(2, "S02"),
      makeScene(3, "S03"),
    ]);
    const volEp: Partial<VolumeEpisodePlan> = {
      episode_no: 1,
      scenes: [
        makeSkeleton(1, {
          kind: "opening_hook",
          hook_pattern: "system_reveal",
          key_visual: "コンビニ通路に立つレン",
          narration_lines: ["午前六時十四分", "声が降る"],
        }),
        makeSkeleton(3, {
          kind: "final_pull",
          pull_visual: "ヒビ入りスマホ",
          next_episode_hook: "灯里の影",
        }),
      ],
    };
    const merged = mergeDirectingIntentFromVolumePlot(sg, volEp);
    expect(merged.scenes[0].directing_intent?.kind).toBe("opening_hook");
    expect(merged.scenes[1].directing_intent).toBeUndefined();
    expect(merged.scenes[2].directing_intent?.kind).toBe("final_pull");
  });

  it("scenes が空ならそのまま返す (no-op)", () => {
    const sg = makeSceneGraph([makeScene(1, "S01")]);
    expect(mergeDirectingIntentFromVolumePlot(sg, undefined)).toBe(sg);
    expect(mergeDirectingIntentFromVolumePlot(sg, { scenes: [] })).toBe(sg);
  });

  it("既存 directing_intent は上書きしない", () => {
    const existing: DirectingIntent = {
      kind: "midpoint_turn",
      reveal: "既存",
      emotional_shift: "既存",
    };
    const sg = makeSceneGraph([makeScene(1, "S01", { directing_intent: existing })]);
    const volEp: Partial<VolumeEpisodePlan> = {
      scenes: [
        makeSkeleton(1, {
          kind: "opening_hook",
          hook_pattern: "system_reveal",
          key_visual: "上書き候補",
        }),
      ],
    };
    const merged = mergeDirectingIntentFromVolumePlot(sg, volEp);
    expect(merged.scenes[0].directing_intent).toBe(existing);
  });
});

describe("buildPanelDetailPrompt + directing_intent", () => {
  it("opening_hook scene は narration_lines を注入する", () => {
    const scene = makeScene(1, "S01", {
      directing_intent: {
        kind: "opening_hook",
        hook_pattern: "monologue_anchor",
        key_visual: "夜明けのコンビニ",
        narration_lines: ["午前六時十四分", "声が降る"],
      },
    });
    const prompt = buildPanelDetailPrompt(scene, 6);
    expect(prompt).toContain("L2b DIRECTING_INTENT");
    expect(prompt).toContain("opening_hook");
    expect(prompt).toContain("夜明けのコンビニ");
    expect(prompt).toContain("午前六時十四分");
    expect(prompt).toContain("声が降る");
  });

  it("world_anchor scene は target_facts と delivery を注入する", () => {
    const scene = makeScene(2, "S02", {
      directing_intent: {
        kind: "world_anchor",
        delivery: "system_text",
        target_facts: ["Fランクは1F限定", "公社が監視", "声は固有"],
      },
    });
    const prompt = buildPanelDetailPrompt(scene, 5);
    expect(prompt).toContain("world_anchor");
    expect(prompt).toContain("system_text");
    expect(prompt).toContain("Fランクは1F限定");
    expect(prompt).toContain("公社が監視");
  });

  it("final_pull scene は pull_visual と next_episode_hook を最終 panel 指定で注入", () => {
    const scene = makeScene(5, "S05", {
      panel_range: { start_panel_no: 20, end_panel_no: 24 },
      directing_intent: {
        kind: "final_pull",
        pull_visual: "割れた端末",
        next_episode_hook: "灯里の影",
      },
    });
    const prompt = buildPanelDetailPrompt(scene, 5);
    expect(prompt).toContain("final_pull");
    expect(prompt).toContain("割れた端末");
    expect(prompt).toContain("灯里の影");
    expect(prompt).toContain("panel#24");
  });

  it("kind=normal の scene は directing_intent セクションを出さない", () => {
    const scene = makeScene(3, "S03", { directing_intent: { kind: "normal" } });
    const prompt = buildPanelDetailPrompt(scene, 4);
    expect(prompt).not.toContain("L2b DIRECTING_INTENT");
  });

  it("directing_intent 無しの scene も section 無し", () => {
    const scene = makeScene(4, "S04");
    const prompt = buildPanelDetailPrompt(scene, 4);
    expect(prompt).not.toContain("L2b DIRECTING_INTENT");
  });
});
