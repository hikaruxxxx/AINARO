import { describe, expect, it } from "vitest";

import type { BibleSnapshotV2 } from "../schemas-v2";
import { deriveFactId, v2ToV3, v3ToV2 } from "./v3-adapter";

describe("v2-to-v3 determinism", () => {
  it("deriveFactId は同じ seed 入力で同じ id を返す", () => {
    const args = {
      entity_id: "char_a",
      aspect: "psychology",
      layer: "in_world_belief",
      source_path: "characters[0].psychology_deep",
    };
    expect(deriveFactId(args)).toBe(deriveFactId(args));
  });

  it("deriveFactId は seed 違うと異なる id を返す", () => {
    expect(
      deriveFactId({
        entity_id: "char_a",
        aspect: "psychology",
        layer: "in_world_belief",
      })
    ).not.toBe(
      deriveFactId({
        entity_id: "char_b",
        aspect: "psychology",
        layer: "in_world_belief",
      })
    );
  });

  it("v2ToV3 は同じ V2 入力で同じ fact_ids を出力する", () => {
    const v2 = createMinimalV2();
    const v3a = v2ToV3(v2);
    const v3b = v2ToV3(v2);
    expect(v3a.facts.map((f) => f.fact_id).sort()).toEqual(
      v3b.facts.map((f) => f.fact_id).sort()
    );
  });

  it("V2 → V3 → V2 で characters/locations/props/costumes spec が保持される", () => {
    const v2 = createMinimalV2();
    const back = v3ToV2(v2ToV3(v2));
    expect(back.characters.map((c) => c.id).sort()).toEqual(
      v2.characters.map((c) => c.id).sort()
    );
    expect(back.characters[0].backstory).toBe(v2.characters[0].backstory);
    expect(back.characters[0].psychology_deep).toBe(
      v2.characters[0].psychology_deep
    );
    expect(back.locations[0].spec).toEqual(v2.locations[0].spec);
    expect(back.props[0].spec).toEqual(v2.props[0].spec);
    expect(back.costumes[0].spec).toEqual(v2.costumes[0].spec);
    expect(back.visual_motifs[0]).toEqual(v2.visual_motifs[0]);
    expect(back.relations[0]).toEqual(v2.relations[0]);
  });

  it("V2→V3 で world.rules[] の各要素が separate fact になる", () => {
    const v2 = createMinimalV2();
    const v3 = v2ToV3(v2);
    const ruleFacts = v3.facts.filter(
      (f) =>
        f.entity_id === null &&
        f.aspect === "world_rule" &&
        f.layer === "in_world_belief" &&
        f.evidence.source_path?.startsWith("world.rules[")
    );
    expect(ruleFacts).toHaveLength(v2.world.rules.length);
  });

  it("V2→V3 で antagonist のみ origin_wound_deep が fact 化される", () => {
    const v2 = createMinimalV2();
    const v3 = v2ToV3(v2);
    expect(
      v3.facts.some(
        (f) =>
          f.entity_id === "char_antagonist" &&
          f.evidence.source_path === "characters[1].origin_wound_deep"
      )
    ).toBe(true);
    expect(
      v3.facts.some(
        (f) =>
          f.entity_id === "char_ren" &&
          f.evidence.source_path === "characters[0].origin_wound_deep"
      )
    ).toBe(false);
  });

  it.skipIf(!process.env.RUN_REAL_BIBLE_TEST)(
    "a07 modern dungeon snapshot を round-trip しても character spec が保持される",
    async () => {
      const fs = await import("node:fs/promises");
      const v2 = JSON.parse(
        await fs.readFile(
          "/Users/hikarumori/Developer/AINARO/data/manga/works/a07-modern-dungeon/bible/snapshot.json",
          "utf-8"
        )
      ) as BibleSnapshotV2;
      const back = v3ToV2(v2ToV3(v2));
      expect(back.characters.length).toBe(v2.characters.length);
      for (const orig of v2.characters) {
        const r = back.characters.find((c) => c.id === orig.id);
        expect(r).toBeDefined();
        expect(r!.backstory ?? "").toBe(orig.backstory ?? "");
        expect(r!.psychology_deep ?? "").toBe(orig.psychology_deep ?? "");
      }
    }
  );
});

function createMinimalV2(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-11T00:00:00.000Z",
    generated_from: {
      source_type: "v2_concept_json",
      source_path: "fixture/minimal.json",
    },
    meta: {
      slug: "minimal",
      title: "Minimal",
      art_style: "manga_monochrome" as never,
      genre: "modern_dungeon",
      target_pages_per_volume: 180,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 18,
    },
    world: {
      premise: "Fランク探索者が制度の隙間から成長する。",
      rules: ["ランクは公社が管理する。", "低ランクは一階のみ入域できる。", "隠し条件は公開されない。"],
      system: "経験値は討伐条件で変動する。",
      timeline: "ダンジョン出現後、公社制度が作られた。",
      factions: [{ name: "公社", summary: "探索者制度を管理する組織。" }],
      history: {
        timeline: [
          {
            year_or_era: "20年前",
            event: "最初のダンジョンが出現した。",
            impact: "探索者制度の起点になった。",
          },
        ],
      },
      power_system_logic: "条件一致時に補正が乗る。",
      cosmology: "ダンジョンは管理者層の実験場である。",
      economic_system: "素材市場が都市経済を支える。",
      social_strata: "ランクが身分のように扱われる。",
      daily_life_textures: "深夜コンビニと探索者窓口が隣接する。",
      language_and_naming: "公社用語は事務的で冷たい。",
      forbidden_lore: [
        {
          secret: "ナビは失われた人格の残響である。",
          revealed_in_volume: 3,
          setup_episodes: [1, 2],
        },
      ],
      lexicon: { forbidden_terms_global: ["実在商標"] },
    },
    characters: [
      {
        id: "char_ren",
        name: "桐生レン",
        role: "protagonist" as never,
        spec: { visual_description: "黒フードの青年" },
        attribute_classifier: {},
        continuity_anchors: ["黒フード"],
        appears_in_volumes: [1],
        appearance_notes: "黒フードと疲れた目。",
        backstory: "十五歳の鑑定でFランクになった。",
        childhood_episodes: ["灯里と訓練場に通った。"],
        psychology_deep: "怒る資格すら失った痛みを抱く。",
        defense_mechanisms: "諦めたふりで傷を隠す。",
        worldview_filter: "制度の入口で人を見る。",
        typical_day_in_life: "夜勤明けに一階ダンジョンへ向かう。",
        voice_samples: [{ line: "まだ戻れる。", intent: "establish" }],
        relationship_per_partner: [
          { partner_id: "char_antagonist", description: "制度側の敵意を受ける。" },
        ],
        growth_per_volume: [{ volume: 1, description: "最初の勝利で逃げ場を失う。" }],
        origin_wound_deep: "protagonist なので fact 化しない。",
      },
      {
        id: "char_antagonist",
        name: "氷室玲二",
        role: "antagonist" as never,
        spec: { visual_description: "銀縁眼鏡の監査官" },
        attribute_classifier: {},
        continuity_anchors: ["銀縁眼鏡"],
        appears_in_volumes: [1],
        backstory: "制度に人生を預けてきた。",
        psychology_deep: "例外を不正として処理したい。",
        origin_wound_deep: "努力が制度に認められた経験に縛られている。",
        ideology_argument: "制度がなければ弱者は守れないと信じる。",
        dark_mirror_to_protagonist: "制度を憎むレンの反転像。",
      },
    ],
    locations: [
      {
        id: "loc_store",
        name: "ブルーゲートマート",
        location_type: "other" as never,
        spec: {
          visual_description: "青白い深夜店舗",
          who_typically_inhabits: "夜勤労働者と探索者予備軍。",
          iconic_objects: [{ name: "自動ドア", description: "入口チャイムが鳴る。" }],
        },
        continuity_anchors: ["青白い看板"],
        appears_in_episodes: [1],
      },
    ],
    props: [
      {
        id: "prop_phone",
        name: "ヒビ入り端末",
        owner_character_id: "char_ren",
        spec: { visual_description: "画面にヒビが入った端末" },
        continuity_anchors: ["画面のヒビ"],
      },
    ],
    costumes: [
      {
        id: "costume_ren_work",
        character_id: "char_ren",
        valid_from_episode: 1,
        valid_until_episode: null,
        spec: { outfit_description: "黒フードと作業ズボン" },
      },
    ],
    relations: [
      {
        from_character_id: "char_ren",
        to_character_id: "char_antagonist",
        relation_type: "rivals_with",
        description: "制度を挟んで対立する。",
      },
    ],
    style_directives: {
      global: "線は細く、背景は白を基調にする。",
      scene_overrides: {},
      overlay_rules: [],
    },
    visual_motifs: [
      {
        name: "左半歩",
        meaning: "自分で選ぶ余白。",
        draw_directive: "足元の小さなズレで描く。",
      },
    ],
    continuity_seeds: [
      {
        group_id: "char_ren_face_v1",
        kind: "character_face",
        target_id: "char_ren",
        invariant_description: "疲れた目元。",
      },
    ],
    volume_synopsis: {
      theme: "制度の外から入口を開く。",
      summary: "レンがナビの声で最初の勝利を得る。",
      cliffhanger: "声が沈黙する。",
    },
  } as unknown as BibleSnapshotV2;
}
