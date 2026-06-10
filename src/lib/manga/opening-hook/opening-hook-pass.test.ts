import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractStructuredJson } from "../llm/codex-text";
import type {
  BibleSnapshotV2,
  EpisodeStoryboardV2,
} from "../schemas-v2";
import {
  buildOpeningHookTextQualityDirectives,
  generateOpeningHookProposals,
  type OpeningHookPatternBank,
} from "./opening-hook-pass";

vi.mock("../llm/codex-text", () => ({
  extractStructuredJson: vi.fn(),
}));

function bible(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-06T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "test-modern-dungeon",
      title: "test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 22,
    },
    world: {
      premise: "",
      rules: [],
      system: "",
      timeline: "",
      factions: [],
      lexicon: {
        forbidden_terms_global: ["世界記録 (単独使用)", "最短ルート"],
        p1_opening_directive: "冒頭では世界記録と最短ルートを使わない",
      },
    },
    characters: [
      {
        id: "char_ren",
        name: "桐生 レン",
        role: "protagonist",
        spec: {},
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
        speech_style: {
          first_person: "俺",
          register: "タメ口主体",
          ban_phrases: ["最短ルート"],
        },
      },
      {
        id: "char_nav",
        name: "ナビ",
        role: "support",
        spec: {},
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1],
      },
    ],
    locations: [],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [],
    continuity_seeds: [],
    narration_style_guide: {
      p1_opening_directive_specific: {
        max_lines: 2,
        max_chars_per_line: 18,
        must_avoid: ["世界記録"],
        rejected_pattern_examples: ["世界記録を塗り替える三十秒前"],
      },
    },
    nav_full_spec: {
      voice_persona: { default_tone: "平坦・敬体・事務的" },
      canonical_disclosure_lines_vol_1: ["経験値倍化条件、開示します"],
      anti_pattern_dialogue: {
        rejected: "ナビ、最短ルートを出せ。",
      },
    },
    volume_synopsis: { theme: "", summary: "" },
  } as BibleSnapshotV2;
}

function storyboard(): EpisodeStoryboardV2 {
  return {
    schema_version: 2,
    episode_id: "ep01",
    total_pages: 3,
    pages: [1, 2, 3].map((pageNo) => ({
      page_no: pageNo,
      page_role: pageNo === 1 ? "opening_hook" : "buildup",
      panels: [
        {
          panel_id: `p${pageNo}-1`,
          panel_no: 1,
          reading_order: 1,
          shot_type: "close_up",
          camera: "eye_level",
          bleed: false,
          silence: false,
          importance: 3,
          entities: {
            characters: [],
            location_id: "",
            props: [],
            focus_entity_id: "",
          },
          action: "レンが立ち止まる",
          key_visual: "薄暗い通路",
          dialogue: [],
          monologue: [],
          narration: [],
          sfx: [],
        },
      ],
    })),
  } as EpisodeStoryboardV2;
}

function patternsBank(): OpeningHookPatternBank {
  return {
    schema_version: 1,
    patterns: [
      {
        id: "P1_test",
        name: "test hook",
        description: "opening hook test",
        best_for_genres: ["modern_dungeon"],
        best_for_tone: [],
        structure: [
          {
            page: 1,
            panels: [
              {
                panel_no: 1,
                shot_type: "close",
                importance: 4,
                purpose: "主人公の違和感を見せる",
              },
            ],
          },
        ],
        speech_distribution: {
          page1: { dialogue: 1, monologue: 1, narration: 0 },
        },
        narration_quota_total: 1,
        first_speech_panel: 1,
        examples: { best: "薄い違和感から入る", worst: "説明で始める" },
        expected_effect: "hook_strength +0.2",
      },
    ],
    selection_guide: {
      by_tone_profile: {},
      by_genre: {
        modern_dungeon: ["P1_test"],
      },
    },
  };
}

function proposalResult(text: string) {
  return {
    pattern_id: "P1_test",
    pattern_name: "test hook",
    rationale: "冒頭の違和感を優先する",
    expected_effect: "hook_strength +0.2",
    pages: [
      {
        page_no: 1,
        page_role: "opening_hook",
        panels: [
          {
            panel_no: 1,
            shot_type: "close",
            importance: 4,
            silence: false,
            action: "レンが足を止める",
            key_visual: "足元の影",
            dialogue: [{ character_id: "char_ren", text }],
            monologue: [],
            narration: [],
            sfx: [],
          },
        ],
      },
    ],
  };
}

describe("opening-hook-pass text quality integration", () => {
  beforeEach(() => {
    vi.mocked(extractStructuredJson).mockReset();
  });

  it("injects text quality bible sections into the Codex prompt", async () => {
    vi.mocked(extractStructuredJson).mockResolvedValue(proposalResult("……変だ。"));

    await generateOpeningHookProposals({
      bible: bible(),
      storyboard: storyboard(),
      patternsBank: patternsBank(),
      maxProposals: 1,
    });

    const callArgs = vi.mocked(extractStructuredJson).mock.calls[0][0];

    expect(callArgs.materials.world_lexicon).toContain("最短ルート");
    expect(callArgs.materials.narration_style_guide).toContain("p1_opening_directive_specific");
    expect(callArgs.materials.nav_full_spec).toContain("canonical_disclosure_lines_vol_1");
    expect(callArgs.materials.character_speech_styles).toContain("char_ren");
    expect(callArgs.systemContext).toContain("forbidden_terms_global は禁止語リスト");
    expect(callArgs.systemContext).toContain("anti_pattern_dialogue は絶対禁止例");
    expect(callArgs.instruction).toContain("forbidden_terms_global");
    expect(callArgs.instruction).toContain("canonical_disclosure_lines_vol_1");
  });

  it("keeps directives backward compatible without optional text quality sections", () => {
    const noTextQuality = {
      ...bible(),
      world: {
        ...bible().world,
        lexicon: undefined,
      },
      narration_style_guide: undefined,
      nav_full_spec: undefined,
      characters: bible().characters.map((character) => ({
        ...character,
        speech_style: undefined,
      })),
    } as BibleSnapshotV2;

    const directives = buildOpeningHookTextQualityDirectives(noTextQuality);

    expect(directives).toContain("Text Quality Directives");
    expect(directives).not.toContain("forbidden_terms_global:");
    expect(directives).not.toContain("anti_pattern_dialogue は絶対禁止例");
  });

  it("warns when generated proposal text violates validatePanelText", async () => {
    vi.mocked(extractStructuredJson).mockResolvedValue(proposalResult("ナビ、最短ルートを出せ。"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await generateOpeningHookProposals({
      bible: bible(),
      storyboard: storyboard(),
      patternsBank: patternsBank(),
      maxProposals: 1,
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("forbidden term in dialogue: 最短ルート"),
    );

    warn.mockRestore();
  });
});
