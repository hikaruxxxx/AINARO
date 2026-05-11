import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../../../src/lib/manga/schemas-v2";
import { buildConceptFromSnapshot, parseArgs } from "./deepen-snapshot-field";

describe("deepen-snapshot-field", () => {
  it("buildConceptFromSnapshot reconstructs the minimum V2 concept from snapshot", () => {
    const concept = buildConceptFromSnapshot(bible());

    expect(concept.id).toBe("fixture");
    expect(concept.title).toBe("Fixture Title");
    expect(concept.core_hook?.one_liner).toBe("gate loop");
    expect(concept.synopsis).toBe("volume summary");
    expect(concept.protagonist.name).toBe("Ren");
    expect(concept.protagonist.appearance).toBe("black hoodie, tired eyes");
    expect(concept.protagonist.personality).toBe("defensive but kind");
    expect(concept.protagonist.background).toBe("lost his old party");
    expect(concept.supporting_chars).toEqual([
      {
        name: "Akari",
        role: "supporting",
        summary: "guild operator with a careful eye",
      },
    ]);
    expect(concept.world).toEqual({
      premise: "modern dungeon premise",
      rules: ["rule one"],
      system: "rank card system",
      timeline: "2026 gates open",
      factions: [{ name: "guild", summary: "public dungeon office" }],
    });
  });

  it("parseArgs accepts required CLI flags and dry-run", () => {
    expect(
      parseArgs([
        "--slug",
        "a07-modern-dungeon",
        "--scope",
        "character",
        "--target",
        "char_ren_v1",
        "--sub-stage",
        "psychology",
        "--dry-run",
      ]),
    ).toEqual({
      slug: "a07-modern-dungeon",
      scope: "character",
      target: "char_ren_v1",
      subStage: "psychology",
      dryRun: true,
    });
  });
});

function bible(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-12T00:00:00.000Z",
    generated_from: { source_type: "v2_concept_json", source_path: "fixture.json" },
    meta: {
      slug: "fixture",
      title: "Fixture Title",
      art_style: "manga",
      genre: "modern dungeon",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 8,
      target_pages_per_episode: 22,
      core_hook: { one_liner: "gate loop", type: "A", hit_references: ["ref"] },
    },
    world: {
      premise: "modern dungeon premise",
      rules: ["rule one"],
      system: "rank card system",
      timeline: "2026 gates open",
      factions: [{ name: "guild", summary: "public dungeon office" }],
    },
    characters: [
      {
        id: "char_ren_v1",
        name: "Ren",
        role: "protagonist",
        spec: {
          hair: { style: "short", color: "black", specific: "messy fringe" },
          eyes: { shape: "round", color: "black", expression_default: "tired" },
          outfit_default: { top: "hoodie" },
        },
        attribute_classifier: {},
        continuity_anchors: ["black hoodie"],
        appears_in_volumes: [1],
        appearance_notes: "black hoodie, tired eyes",
        backstory: "lost his old party",
        psychology_deep: "defensive but kind",
      },
      {
        id: "char_akari_v1",
        name: "Akari",
        role: "supporting",
        spec: {
          hair: { style: "bob", color: "brown", specific: "neat bob" },
          eyes: { shape: "round", color: "brown", expression_default: "alert" },
          outfit_default: { top: "jacket" },
        },
        attribute_classifier: {},
        continuity_anchors: ["red ribbon"],
        appears_in_volumes: [1],
        backstory: "guild operator with a careful eye",
      },
    ],
    locations: [],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "manga", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: { theme: "theme", summary: "volume summary" },
  } as BibleSnapshotV2;
}
