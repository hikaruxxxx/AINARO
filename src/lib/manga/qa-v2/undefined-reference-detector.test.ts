import { describe, expect, it } from "vitest";

import type { BibleSnapshotV2 } from "../schemas-v2";
import { detectUndefinedReferences, detectUndefinedReferencesInText } from "./undefined-reference-detector";

describe("detectUndefinedReferences", () => {
  it("knownTerms option の語を未定義参照から除外する", () => {
    const bible = createBible({
      world: {
        ...createBible().world,
        premise: "鑑定石プロトコルは公社窓口で使う判定手順である。",
      },
    });

    expect(
      detectUndefinedReferences(bible).some(
        (ref) => ref.matched_text === "鑑定石プロトコル"
      )
    ).toBe(true);
    expect(
      detectUndefinedReferences(bible, {
        knownTerms: ["鑑定石プロトコル"],
      }).some((ref) => ref.matched_text === "鑑定石プロトコル")
    ).toBe(false);
  });

  it("character 名の敬称付き形を known として扱う", () => {
    const bible = createBible({
      characters: [
        {
          ...createBible().characters[0],
          name: "白瀬 灯里",
        },
      ],
      world: {
        ...createBible().world,
        premise: "白瀬灯里主任は決裁フォルダを抱えて階段を上がる。",
      },
    });

    const refs = detectUndefinedReferences(bible);

    expect(refs.some((ref) => ref.matched_text === "白瀬灯里主任")).toBe(false);
  });

  it("任意テキスト内の未定義固有名詞を rewritten_text として検出する", () => {
    const refs = detectUndefinedReferencesInText(
      "桐生レンは天野レンへの理解欲と偶然許可リストを隠した。",
      createBible({
        characters: [{ ...createBible().characters[0], name: "桐生 レン" }],
      })
    );

    expect(refs.map((ref) => ref.matched_text)).toContain("天野レン");
    expect(refs.map((ref) => ref.matched_text)).toContain("偶然許可リスト");
    expect(refs.every((ref) => ref.source_path === "rewritten_text")).toBe(true);
  });

  it("任意テキストでも knownTerms option の語を未定義参照から除外する", () => {
    const refs = detectUndefinedReferencesInText(
      "鑑定石プロトコルは公社窓口で使う。",
      createBible(),
      { knownTerms: ["鑑定石プロトコル"] }
    );

    expect(refs.some((ref) => ref.matched_text === "鑑定石プロトコル")).toBe(false);
  });
});

function createBible(patch: Partial<BibleSnapshotV2> = {}): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-11T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "fixture.json" },
    meta: {
      slug: "undefined-reference-test",
      title: "Undefined Reference Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 18,
    },
    world: {
      premise: "都市の地下にダンジョンがある。",
      rules: [],
      system: "",
      timeline: "",
      factions: [],
      history: {},
      power_system_logic: "",
      cosmology: "",
      economic_system: "",
      social_strata: "",
      daily_life_textures: "",
      language_and_naming: "",
      forbidden_lore: [],
    },
    characters: [
      {
        id: "char_akari",
        name: "白瀬 灯里",
        role: "supporting",
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
    style_directives: {
      global: "",
      scene_overrides: {},
      overlay_rules: [],
    },
    visual_motifs: [],
    continuity_seeds: [],
    volume_synopsis: {
      theme: "",
      summary: "",
      cliffhanger: "",
    },
    ...patch,
  } as unknown as BibleSnapshotV2;
}
