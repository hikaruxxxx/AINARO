import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import { v2ToV3 } from "./v3-adapter";

function baseBible(patch: Partial<BibleSnapshotV2> = {}): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "v3-adapter-test",
      title: "V3 Adapter Test",
      art_style: "manga_bw",
      genre: "test",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
      core_hook: { one_liner: "test", type: "test", hit_references: [] },
    },
    world: {
      premise: "premise",
      rules: [],
      system: "system",
      timeline: "timeline",
      factions: [],
    },
    characters: [
      {
        id: "c1",
        name: "Character",
        role: "protagonist",
        spec: {},
        attribute_classifier: {},
        continuity_anchors: [],
      },
    ],
    locations: [
      {
        id: "loc1",
        name: "Location",
        location_type: "other",
        spec: {},
        continuity_anchors: [],
      },
    ],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: { theme: "theme", summary: "summary" },
    ...patch,
  } as BibleSnapshotV2;
}

describe("v2ToV3", () => {
  it("growth_per_volume の volume/description 形式を fact 化する", () => {
    const v3 = v2ToV3(baseBible({
      characters: [{
        ...baseBible().characters[0],
        growth_per_volume: [{ volume: 1, description: "旧形式の成長" }],
      }],
    }));

    const fact = v3.facts.find((item) => item.evidence.source_path === "characters[0].growth_per_volume[0]");
    expect(fact).toEqual(expect.objectContaining({ body: "旧形式の成長", arc_at_volume: 1 }));
  });

  it("growth_per_volume の vol/growth 形式を fact 化する", () => {
    const v3 = v2ToV3(baseBible({
      characters: [{
        ...baseBible().characters[0],
        growth_per_volume: [{ vol: 2, growth: "新形式の成長" }],
      }],
    }));

    const fact = v3.facts.find((item) => item.evidence.source_path === "characters[0].growth_per_volume[0]");
    expect(fact).toEqual(expect.objectContaining({ body: "新形式の成長", arc_at_volume: 2 }));
  });

  it("growth_per_volume の両形式混在を要素ごとに fact 化する", () => {
    const v3 = v2ToV3(baseBible({
      characters: [{
        ...baseBible().characters[0],
        growth_per_volume: [
          { volume: 1, description: "一巻" },
          { vol: 2, growth: "二巻" },
        ],
      }],
    }));

    const facts = v3.facts.filter((item) => (item.evidence.source_path ?? "").includes(".growth_per_volume["));
    expect(facts.map((fact) => fact.body)).toEqual(["一巻", "二巻"]);
    expect(facts.map((fact) => fact.arc_at_volume)).toEqual([1, 2]);
  });

  it("motif の reference_scenes が空なら reference_scenes 由来 fact を作らない", () => {
    const v3 = v2ToV3(baseBible({
      visual_motifs: [{ name: "Motif", meaning: "", draw_directive: "", reference_scenes: [] }],
    }));

    expect(v3.facts.filter((fact) => (fact.evidence.source_path ?? "").includes(".reference_scenes["))).toHaveLength(0);
  });

  it("motif の reference_scenes を array 要素ごとに fact 化する", () => {
    const v3 = v2ToV3(baseBible({
      visual_motifs: [{ name: "Motif", meaning: "", draw_directive: "", reference_scenes: ["scene0", "scene1", "scene2"] }],
    }));

    const facts = v3.facts.filter((fact) => (fact.evidence.source_path ?? "").includes(".reference_scenes["));
    expect(facts.map((fact) => fact.body)).toEqual(["scene0", "scene1", "scene2"]);
    expect(facts.map((fact) => fact.evidence.source_path)).toEqual([
      "visual_motifs[0].reference_scenes[0]",
      "visual_motifs[0].reference_scenes[1]",
      "visual_motifs[0].reference_scenes[2]",
    ]);
  });

  it("motif の meaning/draw_directive を別 fact 化する", () => {
    const v3 = v2ToV3(baseBible({
      visual_motifs: [{ name: "Motif", meaning: "意味", draw_directive: "作画指示" }],
    }));

    expect(v3.facts.find((fact) => fact.evidence.source_path === "visual_motifs[0].meaning")?.body).toBe("意味");
    expect(v3.facts.find((fact) => fact.evidence.source_path === "visual_motifs[0].draw_directive")?.body).toBe("作画指示");
  });

  it("location.spec.history を fact 化する", () => {
    const v3 = v2ToV3(baseBible({
      locations: [{
        ...baseBible().locations[0],
        spec: { history: "場所の履歴" },
      }],
    }));

    const fact = v3.facts.find((item) => item.evidence.source_path === "locations[0].spec.history");
    expect(fact).toEqual(expect.objectContaining({ body: "場所の履歴", aspect: "location_history" }));
  });

  it("location.spec.history が空文字なら fact 化しない", () => {
    const v3 = v2ToV3(baseBible({
      locations: [{
        ...baseBible().locations[0],
        spec: { history: "" },
      }],
    }));

    expect(v3.facts.find((item) => item.evidence.source_path === "locations[0].spec.history")).toBeUndefined();
  });
});
