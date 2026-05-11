import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2, BibleSnapshotV3, FactNode, Layer } from "../schemas-v2";
import type { Scene } from "../scene-graph/schema";
import {
  activeCostumeFor,
  attributeTagsFor,
  continuityAnchorTextFor,
  relationshipStateAt,
  relevantMotifs,
  relevantWorldRules,
  sceneOverrideTextFor,
  summarizeCharacterForEpisode,
  summarizeLocationForScene,
  summarizeMotifForPanel,
  summarizeWorldRulesForScene,
} from "./broker";
import {
  activeCostumeForV3,
  attributeTagsForV3,
  continuityAnchorTextForV3,
  contextForScene,
  queryBible,
  relationshipStateAtV3,
  relevantMotifsV3,
  relevantWorldRulesV3,
  relevantWorldRulesV3FromV2,
  sceneOverrideTextForV3,
  summarizeCharacterForEpisodeV3,
  summarizeCharacterForEpisodeV3FromV2,
  summarizeLocationForSceneV3,
  summarizeMotifForPanelV3,
  summarizeWorldRulesForSceneV3,
} from "./broker-v3";
import { writeSnapshotV3Atomic } from "./atomic-write";
import { v2ToV3 } from "./v3-adapter";
import { loadBibleSnapshotV3FromDir } from "./v3-loader";

describe("broker-v3 read-only mirror parity with legacy broker", () => {
  it("V3 経由 summarizeCharacterForEpisode は V2 と同じキャラ情報を含む", () => {
    const v2 = createMinimalV2();
    const v2Result = summarizeCharacterForEpisode(v2, 1, "char_a", { tier: "minimal" });
    const v3Result = summarizeCharacterForEpisodeV3FromV2(v2, 1, "char_a", { tier: "minimal" });
    expect(v3Result).toContain("アオ");
    expect(v3Result).toContain("char_a");
    expect(v3Result.length).toBeGreaterThan(v2Result.length * 0.5);
    expect(v3Result.length).toBeLessThan(v2Result.length * 2.0);
  });

  it("activeCostumeFor の出力が一致する", () => {
    const v2 = createMinimalV2();
    expect(activeCostumeForV3(v2, 2, "char_a")).toEqual(activeCostumeFor(v2, 2, "char_a"));
  });

  it("relevantWorldRulesV3FromV2 は 4 件 hard-clip を超えて取れる", () => {
    const v2 = createMinimalV2WithManyRules(10);
    const scene = sceneStub();
    const v2Result = relevantWorldRules(v2, scene);
    const v3Result = relevantWorldRulesV3FromV2(v2, scene, { charBudget: { min: 0, max: 2000 } });
    expect(v2Result).toHaveLength(4);
    expect(v3Result.length).toBeGreaterThan(4);
  });

  it("relevantWorldRulesV3 は V3 facts から world_rule を読む", () => {
    const v2 = createMinimalV2();
    const scene = sceneStub();
    expect(relevantWorldRulesV3(v2ToV3(v2), scene)).toContain("青いゲートは登録者だけが通れる");
  });

  it("relevantMotifs の出力配列が一致する", () => {
    const v2 = createMinimalV2();
    const scene = sceneStub();
    expect(relevantMotifsV3(v2, scene)).toEqual(relevantMotifs(v2, scene));
  });

  it("summarizeWorldRulesForScene の出力 string が一致する", () => {
    const v2 = createMinimalV2();
    const scene = sceneStub();
    expect(summarizeWorldRulesForSceneV3(v2, scene, { tier: "minimal" })).toBe(
      summarizeWorldRulesForScene(v2, scene, { tier: "minimal" }),
    );
  });

  it("relationshipStateAt の出力 object が一致する", () => {
    const v2 = createMinimalV2();
    expect(relationshipStateAtV3(v2, 1, ["char_a", "char_b"])).toEqual(
      relationshipStateAt(v2, 1, ["char_a", "char_b"]),
    );
  });

  it("追加 V3 wrapper の出力が legacy broker と一致する", () => {
    const v2 = createMinimalV2();
    const scene = sceneStub();
    const panel = { panel_no: 1 };

    expect(summarizeLocationForSceneV3(v2, scene, { tier: "minimal" })).toBe(
      summarizeLocationForScene(v2, scene, { tier: "minimal" }),
    );
    expect(summarizeMotifForPanelV3(v2, panel, scene, { tier: "minimal" })).toBe(
      summarizeMotifForPanel(v2, panel, scene, { tier: "minimal" }),
    );
    expect(attributeTagsForV3(v2, "char_a")).toEqual(attributeTagsFor(v2, "char_a"));
    expect(continuityAnchorTextForV3(v2, "char_a")).toBe(continuityAnchorTextFor(v2, "char_a"));
    expect(sceneOverrideTextForV3(v2, scene)).toBe(sceneOverrideTextFor(v2, scene));
  });
});

describe("queryBible primitive operations", () => {
  it("visibility=in_world_only で meta_truth fact を返さない", () => {
    const result = queryBible(createPrimitiveV3(), { visibility: "in_world_only", at_volume: 1 });
    expect(result.facts.map((fact) => fact.layer)).not.toContain("meta_truth");
  });

  it("visibility=in_world_plus_revealed_up_to_vol で revealed_at_volume <= at_volume の fact を返す", () => {
    const result = queryBible(createPrimitiveV3(), { visibility: "in_world_plus_revealed_up_to_vol", at_volume: 2 });
    expect(result.facts.map((fact) => fact.fact_id)).toContain("fact_revealed_v2");
    expect(result.facts.map((fact) => fact.fact_id)).not.toContain("fact_revealed_v3");
  });

  it("visibility=author_omniscient で全 fact を返す", () => {
    const result = queryBible(createPrimitiveV3(), { visibility: "author_omniscient", at_volume: 1 });
    expect(result.facts).toHaveLength(5);
  });

  it("aspects フィルタが効く", () => {
    const result = queryBible(createPrimitiveV3(), {
      visibility: "author_omniscient",
      at_volume: 1,
      aspects: ["appearance"],
    });
    expect(result.facts.map((fact) => fact.aspect)).toEqual(["appearance"]);
  });

  it("entity_ids フィルタが効く", () => {
    const result = queryBible(createPrimitiveV3(), {
      visibility: "author_omniscient",
      at_volume: 1,
      entity_ids: ["char_a"],
      include_entities: true,
    });
    expect(result.facts.every((fact) => fact.entity_id === "char_a")).toBe(true);
    expect(result.entities?.map((entity) => entity.id)).toEqual(["char_a"]);
  });

  it("char_budget 超過時 truncated:true を返す", () => {
    const result = queryBible(createPrimitiveV3(), {
      visibility: "author_omniscient",
      at_volume: 1,
      char_budget: { min: 1, max: 20 },
    });
    expect(result.truncated).toBe(true);
    expect(result.warnings).toContain("char_budget_truncated:20");
  });
});

describe("contextForScene smoke test", () => {
  it("cast / location / world_rules / motifs / props を返す", () => {
    const v3 = v2ToV3(createMinimalV2());
    const result = contextForScene(v3, sceneStub(), "author_omniscient");
    expect(result.characters.length).toBeGreaterThan(0);
    expect(result.location.length).toBeGreaterThan(0);
    expect(result.world_rules.length).toBeGreaterThan(0);
    expect(result.motifs.length).toBeGreaterThan(0);
    expect(result.props.length).toBeGreaterThan(0);
    expect(result.active_costumes).toEqual([{ character_id: "char_a", costume_id: "costume_a_active" }]);
    expect(result.premise_excerpt).toContain("地下都市");
  });
});

describe("broker-v3 fact-based logic", () => {
  it("summarizeCharacterForEpisodeV3 は V3 facts の visibility を反映する", () => {
    const result = summarizeCharacterForEpisodeV3(createPrimitiveV3(), 15, "char_a", { tier: "minimal" });
    expect(result).toContain("アオ");
    expect(result).toContain("short black hair");
    expect(result).toContain("volume two reveal");
    expect(result).not.toContain("volume three reveal");
    expect(result).not.toContain("author only truth");
  });

  it("loadBibleSnapshotV3FromDir は snapshot.v3.json + facts/ を再構築する", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ainaro-v3-loader-"));
    const source = createPrimitiveV3();
    source.entities[0].fact_ids = source.facts
      .filter((fact) => fact.entity_id === "char_a")
      .map((fact) => fact.fact_id);

    const writeResult = await writeSnapshotV3Atomic(source, {
      bibleDir: tmpDir,
      stageLabel: "loader-test",
      splitFacts: true,
    });
    expect(writeResult.ok).toBe(true);

    const loaded = await loadBibleSnapshotV3FromDir({ bibleDir: tmpDir });
    expect(loaded.facts.map((fact) => fact.fact_id)).toEqual(source.facts.map((fact) => fact.fact_id));
    expect(loaded.entities[0].fact_ids.length).toBeGreaterThan(0);
  });
});

it.skipIf(!process.env.RUN_REAL_BIBLE_TEST)(
  "a07 で V3 経路 summarizeCharacterForEpisode が legacy と意味的に等価",
  async () => {
    const fs = await import("node:fs/promises");
    const v2 = JSON.parse(
      await fs.readFile(
        "/Users/hikarumori/Developer/AINARO/data/manga/works/a07-modern-dungeon/bible/snapshot.json",
        "utf-8",
      ),
    ) as BibleSnapshotV2;
    for (const c of v2.characters) {
      const v2Result = summarizeCharacterForEpisode(v2, 1, c.id, { tier: "minimal" });
      const v3Result = summarizeCharacterForEpisodeV3FromV2(v2, 1, c.id, { tier: "minimal" });
      expect(v3Result).toContain(c.name);
      expect(v3Result.length).toBeGreaterThan(v2Result.length * 0.5);
      expect(v3Result.length).toBeLessThan(v2Result.length * 2.0);
    }
    expect(summarizeWorldRulesForSceneV3(v2, sceneStub(), { tier: "minimal" })).toBe(
      summarizeWorldRulesForScene(v2, sceneStub(), { tier: "minimal" }),
    );
  },
);

function sceneStub(): Pick<Scene, "location_id" | "beat_type" | "mode" | "key_visual_intent" | "time_axis" | "cast"> & {
  arc_position: { volume: number; episode: number };
} {
  return {
    location_id: "loc_gate",
    beat_type: "aftermath" as Scene["beat_type"],
    mode: "silence" as Scene["mode"],
    key_visual_intent: "青いゲート前の沈黙",
    time_axis: {
      label: "present",
      order: 1,
      is_flashback: false,
      is_flashforward: false,
      duration_hint: "minutes",
    },
    cast: [{ character_id: "char_a", presence: "in_person" }, { character_id: "char_b", presence: "in_person" }],
    arc_position: { volume: 1, episode: 2 },
  };
}

function createMinimalV2(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "broker-v3.test.ts" },
    meta: {
      slug: "broker-v3-test",
      title: "Broker V3 Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
      estimated_volumes: 3,
    },
    world: {
      premise: "地下都市の配送制度と青いゲートが、少年少女の仕事と秘密を結びつける。",
      rules: ["青いゲートは登録者だけが通れる", "地下都市では沈黙が警報より重い合図になる", "配送鞄の封印は本人以外が開けられない"],
      system: "管理局が登録証と配送報酬を管理する。",
      timeline: "第一巻は登録から初配送まで。",
      factions: [{ name: "配送局", summary: "地下都市の物流を支える組織。" }],
      power_system_logic: "登録証は経験ではなく選択履歴を記録する。",
      social_strata: "登録等級が仕事の単価と発言権を左右する。",
      daily_life_textures: "濡れた階段、古い掲示板、朝の配送ベルが日常の質感になる。",
    },
    characters: [
      {
        id: "char_a",
        name: "アオ",
        role: "protagonist",
        spec: {
          hair: { style: "短髪", color: "黒", specific: "前髪が少し跳ねる" },
          eyes: { shape: "丸い", color: "黒", expression_default: "警戒" },
          outfit_default: { top: "紺のパーカー", bottom: "黒い作業ズボン" },
          personality_visual: "慎重で、安心すると肩の力が抜ける。",
        },
        attribute_classifier: { hair_color: "black", age_band: "teen", archetype: "runner" },
        continuity_anchors: ["跳ねた前髪", "古い配送鞄"],
        appears_in_volumes: [1],
        appearance_notes: "小柄で足運びが速く、青いゲート前では鞄の留め具に触れる。",
        psychology_deep: "失敗を恐れるが、目の前の相手を置いていけない。",
        backstory: "過去の配送遅延で誰かを待たせた記憶がある。",
        defense_mechanisms: "不安になると手順を確認する。",
        worldview_filter: "街は怖いが、道順を守れば少し信じられる。",
        relationship_per_partner: [{ partner_id: "char_b", description: "案内役を頼りつつ、読まれすぎることを怖がる。" }],
      },
      {
        id: "char_b",
        name: "ビー",
        role: "supporting",
        spec: { hair: { style: "ボブ", color: "銀" }, outfit_default: { top: "白いケープ" } },
        attribute_classifier: { hair_color: "silver", age_band: "teen", archetype: "guide" },
        continuity_anchors: ["青い発光リング"],
        appears_in_volumes: [1],
      },
    ],
    locations: [
      {
        id: "loc_gate",
        name: "青いゲート",
        location_type: "other",
        spec: {
          atmosphere: "静かで冷たい",
          lighting_default: "青い低照度",
          visual_description: "登録証の光が床に反射する狭い入口。",
          iconic_objects: [{ name: "登録端末", description: "沈黙の場面で青く点滅する。" }],
        },
        continuity_anchors: ["青い低照度"],
        appears_in_episodes: [1, 2],
      },
    ],
    props: [
      {
        id: "prop_bag",
        name: "古い配送鞄",
        owner_character_id: "char_a",
        spec: { kind: "bag", color: "brown", distinguishing_features: ["右下の補修跡"] },
        continuity_anchors: ["右下の補修跡"],
      },
    ],
    costumes: [
      {
        id: "costume_a_active",
        character_id: "char_a",
        valid_from_episode: 1,
        valid_until_episode: 3,
        spec: { top: "灰色の訓練ジャケット", bottom: "黒い作業ズボン" },
      },
    ],
    relations: [
      {
        from_character_id: "char_a",
        to_character_id: "char_b",
        relation_type: "guide",
        description: "新人と案内役。",
        bidirectional_a_to_b: "頼りたいが、弱さまで読まれることを怖がる。",
        bidirectional_b_to_a: "選択の自由を観察している。",
        per_volume_delta: "vol.1 で業務関係から信頼の入口へ寄る。",
      },
    ],
    style_directives: { global: "生活感を優先する。", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [
      {
        name: "blue_gate",
        meaning: "境界と登録制度。",
        draw_directive: "青い矩形光を背景や小物へ控えめに反復する。",
      },
    ],
    continuity_seeds: [],
    volume_synopsis: { theme: "配送と自立", summary: "新人が地下都市の秘密に触れる。", cliffhanger: "ゲートの警報が沈黙する。" },
  };
}

function createMinimalV2WithManyRules(count: number): BibleSnapshotV2 {
  const v2 = createMinimalV2();
  v2.world.rules = Array.from(
    { length: count },
    (_, index) => `青いゲート rule ${index + 1}: 登録配送の制約 ${index + 1}`,
  );
  return v2;
}

function createPrimitiveV3(): BibleSnapshotV3 {
  return {
    schema_version: 3,
    meta: createMinimalV2().meta,
    style_directives: { global: "", scene_overrides: {}, overlay_rules: [] },
    entities: [{ id: "char_a", kind: "character", name: "アオ", fact_ids: [], appears_in_volumes: [1] }],
    relations: [],
    facts: [
      fact("fact_public", "char_a", "identity", "in_world_belief", "public identity", 0),
      fact("fact_appearance", "char_a", "appearance", "in_world_belief", "short black hair", 1),
      fact("fact_revealed_v2", "char_a", "backstory", "revealed_at_volume", "volume two reveal", 2, 2),
      fact("fact_revealed_v3", "char_a", "backstory", "revealed_at_volume", "volume three reveal", 3, 3),
      fact("fact_meta", "char_a", "psychology", "meta_truth", "author only truth", 4),
    ],
    volumes: {},
    continuity_seeds: [],
    generated_at: "2026-05-10T00:00:00.000Z",
  };
}

function fact(
  fact_id: string,
  entity_id: string | null,
  aspect: FactNode["aspect"],
  layer: Layer,
  body: string,
  priority: number,
  revealed_at_volume?: number,
): FactNode {
  return {
    fact_id,
    entity_id,
    aspect,
    layer,
    body,
    priority,
    revealed_at_volume,
    evidence: { source_path: fact_id, confidence: 1 },
  };
}
