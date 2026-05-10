import { describe, expect, it } from "vitest";

import type { BibleSnapshotV2, EpisodeStoryboardV2 } from "../schemas-v2";
import { checkMonologueLayerLeak } from "./monologue-layer-check";

describe("checkMonologueLayerLeak", () => {
  it("detects V2 meta-truth phrases in cast monologue as fatal", () => {
    const findings = checkMonologueLayerLeak(
      storyboardWithText({ speaker_id: "char_ren", text: "不可逆刻印のことを思い出す。" }),
      bibleFixture()
    );

    expect(findings).toMatchObject([
      {
        page_no: 1,
        panel_id: "p1_1",
        speaker_id: "char_ren",
        matched_meta_phrase: "不可逆刻印",
        source_character_id: "char_antagonist",
        severity: "fatal",
      },
    ]);
  });

  it("reports narration leaks as warn", () => {
    const findings = checkMonologueLayerLeak(
      storyboardWithText({ speaker_id: null, text: "不可逆刻印はまだ誰にも知られていない。" }),
      bibleFixture()
    );

    expect(findings[0]?.severity).toBe("warn");
    expect(findings[0]?.speaker_id).toBeNull();
  });

  it("allows the source character to think their own origin wound", () => {
    const findings = checkMonologueLayerLeak(
      storyboardWithText({ speaker_id: "char_antagonist", text: "不可逆刻印だけが自分を支えていた。" }),
      bibleFixture()
    );

    expect(findings).toHaveLength(0);
  });

  it("does not flag known entity names extracted from meta text", () => {
    const findings = checkMonologueLayerLeak(
      storyboardWithText({ speaker_id: "char_ren", text: "青影公社の廊下は静かだった。" }),
      bibleFixture()
    );

    expect(findings).toHaveLength(0);
  });

  it("detects V3 meta_truth facts when facts are present", () => {
    const bible = {
      ...bibleFixture(),
      facts: [
        {
          fact_id: "fact_secret",
          entity_id: "char_antagonist",
          aspect: "backstory",
          layer: "meta_truth",
          body: "深層鍵盤は作者だけが知る制御名。",
          evidence: { confidence: 1 },
        },
      ],
    } as BibleSnapshotV2;
    const findings = checkMonologueLayerLeak(
      storyboardWithText({ speaker_id: "char_ren", text: "深層鍵盤が開いた気がする。" }),
      bible
    );

    expect(findings[0]?.matched_meta_phrase).toBe("深層鍵盤");
    expect(findings[0]?.severity).toBe("fatal");
  });
});

function storyboardWithText(input: { speaker_id: string | null; text: string }): EpisodeStoryboardV2 {
  return {
    schema_version: 2,
    episode_id: "ep01",
    total_pages: 1,
    pages: [
      {
        page_no: 1,
        page_role: "buildup",
        panels: [
          {
            panel_id: "p1_1",
            panel_no: 1,
            reading_order: 1,
            shot_type: "medium" as never,
            camera: "eye_level" as never,
            bleed: false,
            silence: false,
            importance: 3,
            entities: {
              characters: [
                {
                  character_id: input.speaker_id ?? "char_ren",
                  role: "speaker" as never,
                  on_screen_via: "in_person",
                  expression: "neutral",
                },
              ],
              location_id: "loc_hall",
              props: [],
              focus_entity_id: input.speaker_id ?? "loc_hall",
            },
            action: "",
            key_visual: "",
            dialogue: [],
            monologue: input.speaker_id ? [{ character_id: input.speaker_id, text: input.text }] : [],
            narration: input.speaker_id ? [] : [input.text],
            sfx: [],
          },
        ],
      },
    ],
  };
}

function bibleFixture(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-11T00:00:00.000Z",
    generated_from: { source_type: "v2_concept_json", source_path: "fixture.json" },
    meta: {
      slug: "fixture",
      title: "Fixture",
      art_style: "manga_monochrome" as never,
      genre: "modern_dungeon",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 18,
    },
    world: {
      premise: "",
      rules: [],
      system: "",
      timeline: "",
      factions: [{ name: "青影公社", summary: "制度側組織。" }],
    },
    characters: [
      {
        id: "char_ren",
        name: "桐生レン",
        role: "protagonist" as never,
        spec: {} as never,
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
      },
      {
        id: "char_antagonist",
        name: "氷室玲二",
        role: "antagonist" as never,
        spec: {} as never,
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
        origin_wound_deep: "青影公社で不可逆刻印を受けた過去を隠している。",
      },
    ],
    locations: [{ id: "loc_hall", name: "監査廊下", location_type: "other" as never, spec: {}, continuity_anchors: [], appears_in_episodes: [1] }],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: { theme: "", summary: "", cliffhanger: "" },
  } as BibleSnapshotV2;
}
