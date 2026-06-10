/**
 * scoring-loop の VolumeContext 拡張テスト (L2b 物語OS再設計、Phase 4)
 *
 * - VolumeContext.current_episode.scenes (skeleton) が形成される
 * - formatVolumeContextSection に scene skeleton セクションが含まれる
 * - directing_intent が markdown 整形される
 */
import { describe, expect, it } from "vitest";
import { formatVolumeContextSection, type VolumeContext } from "./scoring-loop";
import type { SceneSkeleton } from "../storyboard-v2/volume-plot";

function skeleton(no: number, di?: SceneSkeleton["directing_intent"]): SceneSkeleton {
  return {
    scene_id: `ep01_s0${no}`,
    scene_no: no,
    page_range: [(no - 1) * 4 + 1, no * 4],
    location_id: "loc_store",
    time_of_day: "夜明け前",
    cast_ids: ["char_ren"],
    purpose: `scene${no} の目的: 主人公の現状を見せる`,
    emotional_beat: "緊張",
    key_action: "コンビニ夜勤を終える",
    connection_to_next: "次scene へ",
    directing_intent: di,
  };
}

function vc(currentEpisodePatch: Partial<NonNullable<VolumeContext["current_episode"]>> = {}): VolumeContext {
  return {
    volume_no: 1,
    title_working: "覚醒編",
    volume_theme: "Fランクの少年が記録更新者になる",
    belongs_to_arcs: [
      {
        arc_id: "arc_01_awakening",
        coverage: "full",
        arc_progression: "巻全体で覚醒",
      },
    ],
    current_episode: {
      episode_no: 1,
      title_working: "夜明けの声",
      theme: "声と出会う",
      protagonist_arc: {
        start: "底辺で諦めている",
        turn: "声を信じる",
        end: "経験値が積まれる",
      },
      core_hook_usage: "ナビの一文を初めて聞く",
      pairing_progression: undefined,
      must_include_events: ["コンビニ夜勤", "ナビの最初の声"],
      cliffhanger_hook: "公社からの呼び出し",
      beats_summary_lines: ["[hook] 夜明けの店内", "[turn] 声"],
      arc_position: { arc_id: "arc_01_awakening", role_in_arc: "setup" },
      volume_position: "opening",
      ...currentEpisodePatch,
    },
    prev_episode_brief: null,
    next_episode_brief: null,
    foreshadows_seeded_here: [],
    foreshadows_paid_off_here: [],
  };
}

describe("formatVolumeContextSection: scene skeleton", () => {
  it("scenes が無くても従来 section は生成される", () => {
    const section = formatVolumeContextSection(vc({ scenes: undefined }));
    expect(section).toContain("## 巻内位置");
    expect(section).toContain("### 当 episode の役割");
    // scenes が空なら skeleton 専用 section heading は出ない
    expect(section).not.toContain("scene skeleton (L2b 設計、必須遵守)");
  });

  it("scenes があれば skeleton section が出る", () => {
    const section = formatVolumeContextSection(
      vc({
        scenes: [skeleton(1), skeleton(2), skeleton(3)],
      }),
    );
    expect(section).toContain("scene skeleton (L2b 設計、必須遵守)");
    expect(section).toContain("scene 数: 3");
    expect(section).toContain("ep01_s01");
    expect(section).toContain("ep01_s02");
    expect(section).toContain("ep01_s03");
    expect(section).toContain("@loc_store");
    expect(section).toContain("scene1 の目的");
  });

  it("arc_position / volume_position / belongs_to_arcs が反映される", () => {
    const section = formatVolumeContextSection(vc());
    expect(section).toContain("arc_id: arc_01_awakening");
    expect(section).toContain("role_in_arc: setup");
    expect(section).toContain("volume_position: opening");
    expect(section).toContain("この巻が属する arc (SeriesPlan より)");
    expect(section).toContain("arc_01_awakening (full)");
  });
});

describe("formatVolumeContextSection: directing_intent 整形", () => {
  it("opening_hook が 1 行表記される", () => {
    const section = formatVolumeContextSection(
      vc({
        scenes: [
          skeleton(1, {
            kind: "opening_hook",
            hook_pattern: "monologue_anchor",
            key_visual: "夜明けのコンビニ",
            narration_lines: ["午前六時", "外気五度"],
          }),
        ],
      }),
    );
    expect(section).toContain("opening_hook:monologue_anchor");
    expect(section).toContain("narration=2個");
    expect(section).toContain("夜明けのコンビニ");
  });

  it("world_anchor の facts が要約される", () => {
    const section = formatVolumeContextSection(
      vc({
        scenes: [
          skeleton(1, {
            kind: "world_anchor",
            delivery: "system_text",
            target_facts: ["Fランクは1F限定", "公社が監視", "声は固有"],
          }),
        ],
      }),
    );
    expect(section).toContain("world_anchor:system_text");
    expect(section).toContain("facts=3個");
    expect(section).toContain("Fランクは1F限定");
  });

  it("final_pull は pull_visual と next hook を含む", () => {
    const section = formatVolumeContextSection(
      vc({
        scenes: [
          skeleton(5, {
            kind: "final_pull",
            pull_visual: "割れた端末",
            next_episode_hook: "灯里の影",
          }),
        ],
      }),
    );
    expect(section).toContain("final_pull");
    expect(section).toContain("割れた端末");
    expect(section).toContain("灯里の影");
  });

  it("normal は normal と表記され目立たない", () => {
    const section = formatVolumeContextSection(
      vc({ scenes: [skeleton(1, { kind: "normal" })] }),
    );
    // normal は出るが、key_visual 等は出ない
    expect(section).toContain("〔normal〕");
  });
});
