/**
 * bootstrap-from-skeleton (L3.5 bootstrap mode, 2026-05-13 物語OS再設計)
 *
 * SceneSkeleton[] → Scene[] / SceneGraphV1 への変換が
 * directing_intent / page_range / location_id / cast_ids を正しく継承することを検証。
 */
import { describe, expect, it } from "vitest";
import {
  bootstrapScenesFromSkeleton,
  bootstrapSceneGraphFromVolumePlot,
} from "./bootstrap-from-skeleton";
import type {
  VolumePlot,
  SceneSkeleton,
  DirectingIntent,
} from "../storyboard-v2/volume-plot";

function makeSkeleton(
  no: number,
  page_range: [number, number],
  di?: DirectingIntent,
  overrides: Partial<SceneSkeleton> = {},
): SceneSkeleton {
  return {
    scene_id: `ep01_s0${no}`,
    scene_no: no,
    page_range,
    location_id: "loc_test_v1",
    time_of_day: "夜明け前",
    cast_ids: ["char_a_v1", "char_b_v1"],
    purpose: `scene${no} purpose`,
    emotional_beat: `scene${no} beat`,
    key_action: `scene${no} action`,
    connection_to_next: `to next`,
    directing_intent: di,
    ...overrides,
  };
}

describe("bootstrapScenesFromSkeleton", () => {
  it("page_range / cast / location を継承する", () => {
    const skeletons: SceneSkeleton[] = [
      makeSkeleton(1, [1, 3]),
      makeSkeleton(2, [4, 6]),
      makeSkeleton(3, [7, 10]),
    ];
    const scenes = bootstrapScenesFromSkeleton(skeletons, {
      volumeNo: 1,
      episodeNo: 1,
      volumePosition: "opening",
      protagonistArc: { start: "start", turn: "turn", end: "end" },
    });
    expect(scenes).toHaveLength(3);
    expect(scenes[0].scene_id).toBe("S01");
    expect(scenes[0].page_range).toEqual({ start: 1, end: 3 });
    expect(scenes[0].location_id).toBe("loc_test_v1");
    expect(scenes[0].cast.map((c) => c.character_id)).toEqual(["char_a_v1", "char_b_v1"]);
    expect(scenes[0].cast.every((c) => c.presence === "in_person")).toBe(true);
    expect(scenes[0].prev_scene_id).toBeNull();
    expect(scenes[0].next_scene_id).toBe("S02");
    expect(scenes[2].next_scene_id).toBeNull();
  });

  it("directing_intent と beat_type / mode の対応関係", () => {
    const skeletons: SceneSkeleton[] = [
      makeSkeleton(1, [1, 3], {
        kind: "opening_hook",
        hook_pattern: "world_glimpse",
        key_visual: "夜明けの店内",
        narration_lines: ["世界観テロップ"],
      }),
      makeSkeleton(2, [4, 6], {
        kind: "world_anchor",
        delivery: "narration",
        target_facts: ["fact1", "fact2"],
      }),
      makeSkeleton(3, [7, 10], {
        kind: "midpoint_turn",
        reveal: "謎の reveal",
        emotional_shift: "shift",
      }),
      makeSkeleton(4, [11, 14], {
        kind: "cliffhanger_setup",
        build_up: "高揚",
      }),
      makeSkeleton(5, [15, 22], {
        kind: "final_pull",
        pull_visual: "引きの絵",
        next_episode_hook: "次話 hook",
      }),
    ];
    const scenes = bootstrapScenesFromSkeleton(skeletons, {
      volumeNo: 1,
      episodeNo: 1,
      volumePosition: "opening",
      protagonistArc: { start: "s", turn: "t", end: "e" },
    });
    expect(scenes[0].beat_type).toBe("introduce");
    expect(scenes[0].mode).toBe("establishing");
    expect(scenes[1].beat_type).toBe("setup");
    expect(scenes[1].mode).toBe("introspection");
    expect(scenes[2].beat_type).toBe("turn");
    expect(scenes[2].turn_anchor.type).toBe("reveal_turn");
    expect(scenes[3].beat_type).toBe("cliff");
    expect(scenes[3].mode).toBe("action");
    expect(scenes[4].beat_type).toBe("cliff");
    expect(scenes[4].mode).toBe("silence");
  });

  it("directing_intent を Scene にコピーする", () => {
    const di: DirectingIntent = {
      kind: "opening_hook",
      hook_pattern: "system_reveal",
      key_visual: "コンビニの白",
      narration_lines: ["午前六時十四分"],
    };
    const skeletons = [makeSkeleton(1, [1, 3], di), makeSkeleton(2, [4, 22])];
    const scenes = bootstrapScenesFromSkeleton(skeletons, {
      volumeNo: 1,
      episodeNo: 1,
      volumePosition: "opening",
      protagonistArc: { start: "s", turn: "t", end: "e" },
    });
    expect(scenes[0].directing_intent).toBe(di);
    expect(scenes[1].directing_intent).toBeUndefined();
  });

  it("opening_hook の key_visual を key_visual_intent に反映", () => {
    const skeletons = [
      makeSkeleton(1, [1, 3], {
        kind: "opening_hook",
        hook_pattern: "world_glimpse",
        key_visual: "強い引き絵",
      }),
    ];
    const scenes = bootstrapScenesFromSkeleton(skeletons, {
      volumeNo: 1,
      episodeNo: 1,
      volumePosition: "opening",
      protagonistArc: { start: "s", turn: "t", end: "e" },
    });
    expect(scenes[0].key_visual_intent).toBe("強い引き絵");
  });

  it("arc_position が volume_position から導出される", () => {
    const skeletons = [makeSkeleton(1, [1, 22])];
    const scenes = bootstrapScenesFromSkeleton(skeletons, {
      volumeNo: 2,
      episodeNo: 5,
      volumePosition: "climax",
      protagonistArc: { start: "s", turn: "t", end: "e" },
    });
    expect(scenes[0].arc_position.volume).toBe(2);
    expect(scenes[0].arc_position.episode_in_volume).toBe(5);
    expect(scenes[0].arc_position.arc_phase).toBe("climax");
  });
});

describe("bootstrapSceneGraphFromVolumePlot", () => {
  function makeVP(): VolumePlot {
    return {
      schema_version: 2,
      slug: "test-slug",
      volume_no: 1,
      title_working: "Test Volume",
      volume_theme: "theme",
      estimated_pages: 220,
      foreshadow_map: [],
      episodes: [
        {
          episode_no: 1,
          title_working: "ep1",
          theme: "ep1 theme",
          protagonist_arc: { start: "start", turn: "turn", end: "end" },
          beats: [],
          must_include_events: [],
          cliffhanger_hook: "hook",
          page_target: 22,
          brief_for_L3: "brief",
          arc_position: { arc_id: "arc_01", role_in_arc: "setup" },
          volume_position: "opening",
          scenes: [
            makeSkeleton(1, [1, 11], {
              kind: "opening_hook",
              hook_pattern: "world_glimpse",
              key_visual: "kv",
            }),
            makeSkeleton(2, [12, 22], { kind: "final_pull", pull_visual: "p", next_episode_hook: "h" }),
          ],
        },
      ],
    };
  }

  it("正常系: SceneGraphV1 を組み立てる", () => {
    const sg = bootstrapSceneGraphFromVolumePlot({
      volumePlot: makeVP(),
      episodeNo: 1,
      bibleSnapshotPath: "bible.json",
      briefPath: "_brief.v2.md",
      shotlistPath: "shotlist.json",
    });
    expect(sg.schema_version).toBe(1);
    expect(sg.episode_id).toBe("test-slug-ep01");
    expect(sg.scenes).toHaveLength(2);
    expect(sg.scenes[0].directing_intent?.kind).toBe("opening_hook");
    expect(sg.scenes[1].directing_intent?.kind).toBe("final_pull");
    expect(sg.source.volume_plot_path).toMatch(/v01\/plot.json/);
  });

  it("scenes 無しの旧 plot.json は throw", () => {
    const vp = makeVP();
    vp.episodes[0].scenes = undefined;
    expect(() =>
      bootstrapSceneGraphFromVolumePlot({
        volumePlot: vp,
        episodeNo: 1,
        bibleSnapshotPath: "b",
        briefPath: "b",
        shotlistPath: "s",
      }),
    ).toThrow(/scenes \(L2b skeleton\) がありません/);
  });

  it("存在しない episode_no は throw", () => {
    expect(() =>
      bootstrapSceneGraphFromVolumePlot({
        volumePlot: makeVP(),
        episodeNo: 99,
        bibleSnapshotPath: "b",
        briefPath: "b",
        shotlistPath: "s",
      }),
    ).toThrow(/episode_no=99 が見つかりません/);
  });
});
