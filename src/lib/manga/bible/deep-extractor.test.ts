import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import type { V2Concept } from "./v2-adapter";
import {
  runStage1aCharacterBackground,
  runStage1bCharacterPsychology,
  runStage1Character,
  runStage1cCharacterDailyAndRelations,
  runStage2Location,
  runStage3World,
  runStage5Prop,
  runStage7Relation,
} from "./deep-extractor";

describe("deep-extractor stage dry-run prompts", () => {
  it("Stage 1 character prompt starts with compliance and includes character depth targets", async () => {
    const result = await runStage1Character({
      bible: bible(),
      v2Concept: concept(),
      characterId: "char_ren_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    expect(result).toHaveProperty("dryRunPrompt");
    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt.startsWith("## コンプライアンス")).toBe(true);
    expect(prompt).toContain("character_id=char_ren_v1");
    expect(prompt).toContain("characters[role=protagonist].backstory");
    expect(prompt).toContain("最低 3,000 字、ideal 8,000 字");
    expect(prompt).toContain("1コール = 1対象");
  });

  it("Stage 1a character background prompt focuses on backstory and childhood episodes", async () => {
    const result = await runStage1aCharacterBackground({
      bible: bible(),
      v2Concept: concept(),
      characterId: "char_ren_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt.startsWith("## コンプライアンス")).toBe(true);
    expect(prompt).toContain("この sub-stage では下記のフィールドのみに集中してください。他のフィールドは埋めない。");
    expect(prompt).toContain("backstory");
    expect(prompt).toContain("childhood_episodes");
    expect(prompt).toContain("**この sub-stage の合計出力は最低 5,000 字を必ず超えること**");
    expect(prompt).toContain("characters[role=protagonist].backstory");
    expect(prompt).toContain("characters[role=protagonist].childhood_episodes");
  });

  it("Stage 1b character psychology prompt focuses on psychology, defenses, worldview, and appearance", async () => {
    const result = await runStage1bCharacterPsychology({
      bible: bible(),
      v2Concept: concept(),
      characterId: "char_ren_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt.startsWith("## コンプライアンス")).toBe(true);
    expect(prompt).toContain("psychology_deep");
    expect(prompt).toContain("defense_mechanisms");
    expect(prompt).toContain("worldview_filter");
    expect(prompt).toContain("appearance_notes");
    expect(prompt).toContain("表層 → 防衛機制 → 深層動機 → 世界観フィルタ");
    expect(prompt).toContain("**この sub-stage の合計出力は最低 5,000 字を必ず超えること**");
  });

  it("Stage 1b character psychology prompt includes antagonist-only fields for antagonists", async () => {
    const result = await runStage1bCharacterPsychology({
      bible: bible(),
      v2Concept: concept(),
      characterId: "char_rival_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt).toContain("origin_wound_deep");
    expect(prompt).toContain("ideology_argument");
    expect(prompt).toContain("dark_mirror_to_protagonist");
    expect(prompt).toContain("characters[role=antagonist].origin_wound_deep");
  });

  it("Stage 1c character daily and relations prompt requires voice samples, daily life, relationships, and growth", async () => {
    const result = await runStage1cCharacterDailyAndRelations({
      bible: bible(),
      v2Concept: concept(),
      characterId: "char_ren_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt.startsWith("## コンプライアンス")).toBe(true);
    expect(prompt).toContain("voice_samples は 30 件以上");
    expect(prompt).toContain("typical_day_in_life");
    expect(prompt).toContain("relationship_per_partner");
    expect(prompt).toContain("growth_per_volume");
    expect(prompt).toContain("**この sub-stage の合計出力は最低 8,000 字を必ず超えること**");
  });

  it("Stage 1a total output target matches depth-spec minimums", async () => {
    const result = await runStage1aCharacterBackground({
      bible: bible(),
      v2Concept: concept(),
      characterId: "char_ren_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt).toContain("最低 5,000 字、ideal");
    expect(prompt).toContain("最低 3,000 字、ideal 8,000 字");
    expect(prompt).toContain("最低 5 件、各 400 字以上");
  });

  it("Stage 2 location prompt passes only the target location as the main context", async () => {
    const result = await runStage2Location({
      bible: bible(),
      locationId: "loc_gate_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt).toContain("location_id=loc_gate_v1");
    expect(prompt).toContain("target_location");
    expect(prompt).toContain("locations[*].spec.visual_description");
    expect(prompt).toContain("最低 1,500 字、ideal 4,000 字");
  });

  it("Stage 3 world prompt narrows depth targets by aspect", async () => {
    const result = await runStage3World({
      bible: bible(),
      v2Concept: concept(),
      aspect: "power_system",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt).toContain("world_aspect=power_system");
    expect(prompt).toContain("world.power_system_logic");
    expect(prompt).toContain("最低 5,000 字、ideal 15,000 字");
    expect(prompt).not.toContain("world.economic_system: 最低 3,000 字");
  });

  it("Stage 5 prop prompt includes owner context and prop depth rules", async () => {
    const result = await runStage5Prop({
      bible: bible(),
      propId: "prop_card_v1",
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt).toContain("prop_id=prop_card_v1");
    expect(prompt).toContain("owner_character");
    expect(prompt).toContain("props[*].spec.function_and_lore");
    expect(prompt).toContain("実在企業・実在商標・実在人物名・実在著作物名");
  });

  it("Stage 7 relation prompt uses one relation pair and relation schema", async () => {
    const result = await runStage7Relation({
      bible: bible(),
      relation: { a_id: "char_ren_v1", b_id: "char_akari_v1" },
      styleReferenceNote: "style note",
      dryRun: true,
    });

    const prompt = "dryRunPrompt" in result ? result.dryRunPrompt : "";
    expect(prompt).toContain("relation=char_ren_v1->char_akari_v1");
    expect(prompt).toContain("relations[*].description");
    expect(prompt).toContain("type RelationDeepPatch");
    expect(prompt).toContain("1 relation pair");
  });
});

function bible(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "v2_concept_json", source_path: "fixture.json" },
    meta: {
      slug: "fixture",
      title: "Fixture",
      art_style: "manga",
      genre: "modern dungeon",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 8,
      target_pages_per_episode: 22,
      estimated_volumes: 1,
    },
    world: {
      premise: "modern dungeon premise",
      rules: ["rule"],
      system: "system",
      timeline: "timeline",
      factions: [{ name: "guild", summary: "summary" }],
    },
    characters: [
      {
        id: "char_ren_v1",
        name: "Ren",
        role: "protagonist",
        spec: {
          hair: { style: "short", color: "black", specific: "neat" },
          eyes: { shape: "round", color: "black", expression_default: "calm" },
          outfit_default: { top: "hoodie", bottom: "pants" },
        },
        attribute_classifier: { gender: "male", age_band: "teen", body_type: "average", hair_length: "short", hair_color: "black", eye_shape: "round", archetype: "lead" },
        continuity_anchors: ["black hoodie"],
        appears_in_volumes: [1],
      },
      {
        id: "char_akari_v1",
        name: "Akari",
        role: "supporting",
        spec: {
          hair: { style: "bob", color: "brown", specific: "soft" },
          eyes: { shape: "round", color: "brown", expression_default: "bright" },
          outfit_default: { top: "jacket", bottom: "skirt" },
        },
        attribute_classifier: { gender: "female", age_band: "teen", body_type: "average", hair_length: "medium", hair_color: "brown", eye_shape: "round", archetype: "ally" },
        continuity_anchors: ["red ribbon"],
        appears_in_volumes: [1],
      },
      {
        id: "char_rival_v1",
        name: "Rival",
        role: "antagonist",
        spec: {
          hair: { style: "slick", color: "silver", specific: "sharp" },
          eyes: { shape: "narrow", color: "gray", expression_default: "cold" },
          outfit_default: { top: "coat", bottom: "pants" },
        },
        attribute_classifier: { gender: "male", age_band: "adult", body_type: "slender", hair_length: "short", hair_color: "silver", eye_shape: "narrow", archetype: "rival" },
        continuity_anchors: ["silver hair"],
        appears_in_volumes: [1],
      },
    ],
    locations: [
      {
        id: "loc_gate_v1",
        name: "Gate",
        location_type: "dungeon",
        spec: {
          era: "modern",
          atmosphere: "cold",
          layout: { type: "gate" },
          lighting_default: "blue",
          color_palette: ["blue", "gray"],
        },
        continuity_anchors: ["blue gate"],
        appears_in_episodes: [1],
      },
    ],
    props: [
      {
        id: "prop_card_v1",
        name: "Explorer Card",
        owner_character_id: "char_ren_v1",
        spec: { kind: "card", color: "black", material: "plastic", distinguishing_features: ["scratched edge"] },
        continuity_anchors: ["scratched edge"],
      },
    ],
    costumes: [],
    relations: [
      {
        from_character_id: "char_ren_v1",
        to_character_id: "char_akari_v1",
        relation_type: "ally",
        description: "allies",
      },
      {
        from_character_id: "char_ren_v1",
        to_character_id: "char_rival_v1",
        relation_type: "rival",
        description: "rivals",
      },
    ],
    style_directives: { global: "manga", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [{ name: "Blue Gate", meaning: "threshold", draw_directive: "draw blue gate" }],
    continuity_seeds: [],
    volume_synopsis: { theme: "theme", summary: "summary" },
  } as unknown as BibleSnapshotV2;
}

function concept(): V2Concept {
  return {
    id: "fixture",
    title: "Fixture",
    protagonist: { name: "Ren" },
    world: {
      premise: "premise",
      rules: ["rule"],
      system: "system",
      timeline: "timeline",
      factions: [{ name: "guild", summary: "summary" }],
    },
  };
}
