import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import { buildCraftGuideDirectives } from "./craft-guide-directives";
import { buildTextQualityMaterials } from "./storyboard-extractor";

function bibleWithTextQuality(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-06T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "test",
      title: "test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      subtype: "external_social",
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

describe("text quality pipeline integration", () => {
  it("storyboard materials expose optional text quality sections", () => {
    const materials = buildTextQualityMaterials(bibleWithTextQuality());

    expect(materials.world_lexicon?.forbidden_terms_global).toContain("世界記録 (単独使用)");
    expect(materials.narration_style_guide?.p1_opening_directive_specific?.max_lines).toBe(2);
    expect(materials.nav_full_spec?.canonical_disclosure_lines_vol_1).toContain("経験値倍化条件、開示します");
    expect(materials.character_speech_styles).toEqual([
      {
        id: "char_ren",
        role: "protagonist",
        speech_style: {
          first_person: "俺",
          register: "タメ口主体",
          ban_phrases: ["最短ルート"],
        },
      },
    ]);
  });

  it("craft guide adds TX rules only when optional sections exist", () => {
    const bible = bibleWithTextQuality();
    const directives = buildCraftGuideDirectives(
      bible.meta.tone_profile,
      bible.meta.genre,
      bible.meta.subtype,
      {
        worldLexicon: bible.world.lexicon,
        narrationStyleGuide: bible.narration_style_guide,
        navFullSpec: bible.nav_full_spec,
        characters: bible.characters,
      },
    );

    expect(directives).toContain("RULE TX-1");
    expect(directives).toContain("RULE TX-2");
    expect(directives).toContain("RULE TX-3");
    expect(directives).toContain("RULE TX-4");
    expect(directives).toContain("世界記録 (単独使用)");
    expect(directives).toContain("平坦・敬体・事務的");
  });

  it("craft guide remains backward compatible without optional sections", () => {
    const directives = buildCraftGuideDirectives(undefined, "modern_dungeon", "external_social");

    expect(directives).toContain("Manga Craft Directives");
    expect(directives).not.toContain("RULE TX-1");
  });
});
