import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { buildBibleContextForSlot, type SceneSlot } from "./scoring-loop";
import type { BibleSnapshotV2 } from "../schemas-v2";

const A07_BIBLE_PATH =
  "/Users/hikarumori/Developer/AINARO/data/manga/works/a07-modern-dungeon/bible/snapshot.json";
const A07_SCENE_GRAPH_PATH =
  "/Users/hikarumori/Developer/AINARO/data/manga/works/a07-modern-dungeon/episodes/ep01/scene_graph.json";

describe("scoring-loop bible context parity (V2 legacy vs V3 broker)", () => {
  it.skipIf(!process.env.RUN_REAL_BIBLE_TEST)(
    "a07 scene_graph 各 slot で V2/V3 経路の characters / costumes 配列が一致する",
    async () => {
      const v2 = JSON.parse(await fs.readFile(A07_BIBLE_PATH, "utf-8")) as BibleSnapshotV2;
      const sg = JSON.parse(await fs.readFile(A07_SCENE_GRAPH_PATH, "utf-8")) as { scenes: unknown[] };

      for (const scene of sg.scenes) {
        const slot = slotFromScene(scene);
        const ctxV2 = buildBibleContextForSlot(v2, slot, false);
        const ctxV3 = buildBibleContextForSlot(v2, slot, true);
        expect(ctxV3.characters).toEqual(ctxV2.characters);
        expect(ctxV3.costumes).toEqual(ctxV2.costumes);
      }
    },
  );

  it.skipIf(!process.env.RUN_REAL_BIBLE_TEST)(
    "a07 scene_graph 各 slot で V2/V3 経路の motifCandidates が intersection >= 50% になる",
    async () => {
      const v2 = JSON.parse(await fs.readFile(A07_BIBLE_PATH, "utf-8")) as BibleSnapshotV2;
      const sg = JSON.parse(await fs.readFile(A07_SCENE_GRAPH_PATH, "utf-8")) as { scenes: unknown[] };
      const ratios: number[] = [];

      for (const scene of sg.scenes) {
        const slot = slotFromScene(scene);
        const ctxV2 = buildBibleContextForSlot(v2, slot, false);
        const ctxV3 = buildBibleContextForSlot(v2, slot, true);
        const v2Names = new Set(ctxV2.motifCandidates.map((m) => m.name));
        const v3Text = ctxV3.motifCandidates.map((m) => `${m.name}\n${m.description ?? ""}`).join("\n");
        const intersection = [...v2Names].filter((name) => v3Text.includes(name));

        if (v2Names.size > 0) {
          const ratio = intersection.length / v2Names.size;
          ratios.push(ratio);
          expect(ratio).toBeGreaterThanOrEqual(0.5);
        }
      }

      const average = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
      console.info(`[scoring-loop-parity] a07 motif intersection average=${average.toFixed(3)}`);
    },
  );

  it("buildBibleContextForSlot は同じ V2 入力 + 同じ slot で deterministic", () => {
    const v2 = createMinimalV2();
    const slot = createMinimalSlot();
    const ctx1 = buildBibleContextForSlot(v2, slot, false);
    const ctx2 = buildBibleContextForSlot(v2, slot, false);
    expect(ctx1).toEqual(ctx2);
  });

  it("characters / costumes は V2/V3 で完全一致", () => {
    const v2 = createMinimalV2();
    const slot = createMinimalSlot();
    const ctxV2 = buildBibleContextForSlot(v2, slot, false);
    const ctxV3 = buildBibleContextForSlot(v2, slot, true);
    expect(ctxV3.characters).toEqual(ctxV2.characters);
    expect(ctxV3.costumes).toEqual(ctxV2.costumes);
  });
});

function slotFromScene(scene: unknown): SceneSlot {
  const s = scene as SceneSlot;
  return {
    scene_id: s.scene_id,
    scene_no: s.scene_no,
    prev_scene_id: s.prev_scene_id,
    next_scene_id: s.next_scene_id,
    page_range: s.page_range,
    panel_range: s.panel_range,
    arc_position: s.arc_position,
    location_id: s.location_id,
    sub_locations: s.sub_locations,
  };
}

function createMinimalSlot(): SceneSlot {
  return {
    scene_id: "sc_test_001",
    scene_no: 1,
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 2 },
    panel_range: { start_panel_no: 1, end_panel_no: 8 },
    arc_position: {
      volume: 1,
      episode_in_volume: 1,
      arc_phase: "introduce",
      arc_position_normalized: 0.1,
    },
    location_id: "loc_gate",
    sub_locations: [],
  };
}

function createMinimalV2(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "scoring-loop-parity.test.ts" },
    meta: {
      slug: "scoring-loop-parity-test",
      title: "Scoring Loop Parity Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
      estimated_volumes: 3,
    },
    world: {
      premise: "地下都市の配送制度と青いゲートが、少年少女の仕事と秘密を結びつける。",
      rules: ["青いゲートは登録者だけが通れる", "地下都市では沈黙が警報より重い合図になる"],
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
        relationship_per_partner: [{ partner_id: "char_b", description: "案内役を頼る。" }],
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
    volume_synopsis: {
      theme: "配送と自立",
      summary: "新人が地下都市の秘密に触れる。",
      cliffhanger: "ゲートの警報が沈黙する。",
    },
  } as unknown as BibleSnapshotV2;
}
