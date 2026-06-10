import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import type { Scene } from "../scene-graph/schema";
import {
  activeCostumeFor,
  continuityAnchorTextFor,
  relationshipStateAt,
  relevantMotifs,
  sceneOverrideTextFor,
  summarizeCharacterForEpisode,
  summarizeLocationForScene,
  summarizeMotifForPanel,
  summarizeWorldRulesForScene,
} from "./broker";

describe("bible broker resolvers", () => {
  it("activeCostumeFor: episode 5 で active costume を返す", () => {
    const result = activeCostumeFor(bible(), 5, "char_ren");

    expect(result.source).toBe("costume");
    expect(result.costume_id).toBe("costume_ren_training");
    expect(result.spec?.top).toBe("灰色の訓練ジャケット");
  });

  it("activeCostumeFor: 該当なしで outfit_default を返す", () => {
    const result = activeCostumeFor(bible(), 9, "char_ren");

    expect(result.source).toBe("outfit_default");
    expect(result.spec?.top).toBe("紺のパーカー");
  });

  it("relationshipStateAt: pair が relations にあれば description を返す", () => {
    const result = relationshipStateAt(bible(), 5, ["char_ren", "char_navi"]);

    expect(result.found).toBe(true);
    expect(result.description).toContain("新人と案内役");
    expect(result.bidirectional_a_to_b).toContain("頼りたい");
  });

  it("relevantMotifs: scene.mode=silence で sleep_strategy 系 motif を返す", () => {
    const result = relevantMotifs(bible(), {
      beat_type: "aftermath",
      location_id: "loc_rooftop",
      mode: "silence",
      key_visual_intent: "夜明け前の沈黙",
    });

    expect(result.map((motif) => motif.name)).toContain("sleep_strategy");
  });

  it("sceneOverrideTextFor: scene_overrides[mode] の本文を返す", () => {
    const result = sceneOverrideTextFor(bible(), { mode: "silence", beat_type: "aftermath" });

    expect(result).toBe("無音の間を広く取り、寝息と環境音だけで心理を見せる。");
    expect(result).not.toBe("silence");
  });

  it("continuityAnchorTextFor: anchors[] を joinable な 1 行に整形", () => {
    const result = continuityAnchorTextFor(bible(), "char_ren");

    expect(result).toBe("レン continuity: 左側だけ跳ねた短髪 / 古い配達鞄 / 緊張時に袖口を握る");
  });
});

describe("bible broker summarizers", () => {
  it("summarizeCharacterForEpisode: tier ごとの文字数範囲に圧縮する", () => {
    const source = bible();
    const deep = summarizeCharacterForEpisode(source, 15, "char_ren", { tier: "deep" });
    const medium = summarizeCharacterForEpisode(source, 15, "char_ren", { tier: "medium" });
    const minimal = summarizeCharacterForEpisode(source, 15, "char_ren", { tier: "minimal" });

    expect(deep.length).toBeGreaterThanOrEqual(800);
    expect(deep.length).toBeLessThanOrEqual(1500);
    expect(medium.length).toBeGreaterThanOrEqual(400);
    expect(medium.length).toBeLessThanOrEqual(800);
    expect(minimal.length).toBeGreaterThanOrEqual(150);
    expect(minimal.length).toBeLessThanOrEqual(250);
    expect(deep).toContain("vol.2");
    expect(medium).toContain("レン");
    expect(minimal).toContain("レン");
  });

  it("summarizeCharacterForEpisode: tier 未指定時は minimal で 150-250 字に収める", () => {
    const result = summarizeCharacterForEpisode(bible(), 15, "char_ren");

    expect(result).toContain("レン");
    expect(result).toContain("外見:");
    expect(result).toContain("心理:");
    expect(result.length).toBeGreaterThanOrEqual(150);
    expect(result.length).toBeLessThanOrEqual(250);
  });

  it("summarizeCharacterForEpisode: psychology_deep 未着手でも personality_visual から fallback", () => {
    const source = bible({
      characters: bible().characters.map((character) =>
        character.id === "char_ren"
          ? {
              ...character,
              backstory: undefined,
              psychology_deep: undefined,
              defense_mechanisms: undefined,
              worldview_filter: undefined,
              spec: { ...character.spec, personality_visual: "視線を落としてから一拍遅れて笑う慎重な主人公。" },
            }
          : character,
      ),
    });

    const result = summarizeCharacterForEpisode(source, 1, "char_ren", { tier: "minimal" });

    expect(result).toContain("視線を落としてから一拍遅れて笑う");
    expect(result.length).toBeGreaterThan(0);
  });

  it("summarizeLocationForScene: visual_description 未着手でも atmosphere / lighting_default から fallback", () => {
    const source = bible({
      locations: bible().locations.map((location) =>
        location.id === "loc_rooftop"
          ? {
              ...location,
              spec: {
                ...location.spec,
                visual_description: undefined,
                atmosphere: "風が強く、街の灯りが遠くに滲む",
                lighting_default: "夜明け前の青い低照度",
              },
            }
          : location,
      ),
    });

    const result = summarizeLocationForScene(source, {
      location_id: "loc_rooftop",
      mode: "silence" as Scene["mode"],
      beat_type: "aftermath" as Scene["beat_type"],
    }, { tier: "medium" });

    expect(result).toContain("風が強く");
    expect(result).toContain("夜明け前");
    expect(result.length).toBeGreaterThanOrEqual(300);
    expect(result.length).toBeLessThanOrEqual(600);
  });

  it("minimal tier summaries keep location, world rules, and motif compact", () => {
    const source = bible();
    const scene: Pick<Scene, "location_id" | "mode" | "beat_type" | "time_axis"> & {
      visual_motif_anchors: Array<{ motif_name: string; intensity: number }>;
    } = {
      location_id: "loc_rooftop",
      mode: "silence",
      beat_type: "aftermath",
      time_axis: {
        label: "present",
        order: 1,
        is_flashback: false,
        is_flashforward: false,
        duration_hint: "minutes",
      },
      visual_motif_anchors: [{ motif_name: "sleep_strategy", intensity: 1 }],
    };

    const location = summarizeLocationForScene(source, scene);
    const rules = summarizeWorldRulesForScene(source, scene);
    const motif = summarizeMotifForPanel(source, { panel_no: 1 }, scene);

    expect(location).toContain("組合屋上");
    expect(location.length).toBeLessThanOrEqual(220);
    expect(rules.length).toBeLessThanOrEqual(240);
    expect(motif).toContain("sleep_strategy");
    expect(motif.length).toBeLessThanOrEqual(220);
  });
});

function bible(patch: Partial<BibleSnapshotV2> = {}): BibleSnapshotV2 {
  const base: BibleSnapshotV2 = {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "broker.test.ts" },
    meta: {
      slug: "broker-test",
      title: "Broker Test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
      estimated_volumes: 3,
    },
    world: {
      premise: "都市の地下迷宮と日常配送が結びつき、少年少女が小さな仕事から都市の秘密へ近づく。",
      rules: ["迷宮入口は登録制で、未登録者は警報が鳴る", "深層ほど時間が遅く、帰還時に外界とのズレが出る", "屋上の避難標識は緊急時だけ青く点く"],
      system: "管理局が通行証と報酬を管理する。",
      timeline: "第一巻は春の登録試験から初任務まで。",
      factions: [{ name: "運び屋組合", summary: "迷宮内配送を請け負う職人集団。" }],
      power_system_logic: long("通行証は経験値を記録するが、強さそのものではなく選択の履歴を可視化する。", 16),
      social_strata: long("登録等級が仕事の単価と発言権を左右し、未熟な新人ほど危険な雑用に流されやすい。", 12),
      daily_life_textures: long("早朝の市場、濡れた制服、古い掲示板の紙片が、迷宮都市の日常を支えている。", 12),
    },
    characters: [
      {
        id: "char_ren",
        name: "レン",
        role: "protagonist",
        age_visual: "16",
        spec: {
          hair: { style: "短髪", color: "黒", specific: "左側だけ跳ねる" },
          eyes: { shape: "丸い", color: "黒", expression_default: "少し緊張" },
          outfit_default: { top: "紺のパーカー", bottom: "黒い作業ズボン", shoes: "擦れたスニーカー" },
          personality_visual: "慎重で観察が先に立ち、安心すると表情が一気に緩む。",
        },
        attribute_classifier: {
          hair_color: "black",
          hair_style: "short_with_cowlick",
          gender_visual: "male",
          age_band: "teen",
          outfit_default: "navy_hoodie",
          archetype: "careful_runner",
        },
        continuity_anchors: ["左側だけ跳ねた短髪", "古い配達鞄", "緊張時に袖口を握る"],
        appears_in_volumes: [1, 2, 3],
        appearance_notes: long("小柄だが足運びは速く、視線を正面から少し外す。考える時は配達鞄の留め具に触れる。", 22),
        backstory: long("幼い頃に配達の失敗で誰かを待たせた記憶があり、遅れることを極端に恐れている。", 24),
        psychology_deep: long("表面では従順だが、内側では自分の判断で誰かを助けたい欲求が強い。失敗を避けるほど視野が狭くなる。", 26),
        defense_mechanisms: long("不安になると作業手順を何度も確認し、相手の怒りを先読みして謝る。", 12),
        worldview_filter: long("街は怖いが、道順と約束を守れば少しずつ信じられる場所になると見ている。", 12),
        voice_samples: [
          { episode_or_scene_hint: "volume 2 episode 15", line: "まだ間に合うなら、僕が走ります。", intent: "determination" },
          { episode_or_scene_hint: "vol.2 rooftop", line: "怖いです。でも、置いていく方がもっと怖い。", intent: "reveal" },
          { episode_or_scene_hint: "volume 1", line: "すみません、確認だけさせてください。", intent: "establish" },
          { episode_or_scene_hint: "volume 2", line: "この道順、誰かが消したんじゃないですか。", intent: "mystery" },
          { episode_or_scene_hint: "volume 2 cliff", line: "ナビ、今だけ嘘をつかないで。", intent: "cliff" },
          { episode_or_scene_hint: "volume 3", line: "僕の失敗なら、僕が届け直します。", intent: "growth" },
        ],
        relationship_per_partner: [
          { partner_id: "char_navi", description: long("便利な案内役として頼りたい一方、感情を読まれることへの抵抗がある。", 8) },
        ],
        growth_per_volume: [
          { volume: 1, description: long("規則を守ることで安心しようとする段階。", 8) },
          { volume: 2, description: long("規則より目の前の相手を優先する判断を学ぶ段階。", 8) },
        ],
      },
      {
        id: "char_navi",
        name: "ナビ",
        role: "supporting",
        spec: {
          hair: { style: "ボブ", color: "銀", specific: "光を受けると青く見える" },
          outfit_default: { top: "白いケープ", bottom: "短いスカート" },
        },
        attribute_classifier: { hair_color: "silver", age_band: "teen", archetype: "guide" },
        continuity_anchors: ["青い発光リング", "無表情から遅れて瞬きする"],
        appears_in_volumes: [1, 2],
      },
    ],
    locations: [
      {
        id: "loc_rooftop",
        name: "組合屋上",
        location_type: "outdoor",
        spec: {
          atmosphere: "風が強く静か",
          lighting_default: "夜明け前の青",
          visual_description: long("低いフェンス、古い給水塔、濡れた床面があり、街の看板光が遠くで滲む。", 12),
          sensory_textures: long("風で紙が鳴り、排気口から温い空気が漏れ、眠気と冷気が同時に肌へ来る。", 8),
          iconic_objects: [
            { name: "給水塔", description: "古い塗装が剥げ、二人の沈黙を受け止める大きな影になる。" },
            { name: "避難標識", description: "青い低照度で点き、迷宮入口の警告色と呼応する。" },
          ],
        },
        continuity_anchors: ["低いフェンス", "剥げた給水塔", "青い避難標識"],
        appears_in_episodes: [5, 15],
      },
    ],
    props: [
      {
        id: "prop_bag",
        name: "古い配達鞄",
        owner_character_id: "char_ren",
        spec: { kind: "bag", color: "brown", distinguishing_features: ["右下の補修跡"] },
        continuity_anchors: ["右下の補修跡"],
      },
    ],
    costumes: [
      {
        id: "costume_ren_training",
        character_id: "char_ren",
        valid_from_episode: 3,
        valid_until_episode: 7,
        spec: { top: "灰色の訓練ジャケット", bottom: "黒い作業ズボン", notes: "袖に仮登録ワッペン" },
      },
    ],
    relations: [
      {
        from_character_id: "char_ren",
        to_character_id: "char_navi",
        relation_type: "guide",
        description: "新人と案内役。便利さと不信が同居する。",
        bidirectional_a_to_b: "頼りたいが、弱さまで読まれることを怖がる。",
        bidirectional_b_to_a: "守る対象として見つつ、選択の自由を観察している。",
        per_volume_delta: "vol.2 で命令関係から相互選択へ寄る。",
      },
    ],
    style_directives: {
      global: "線は細く、生活感を優先する。",
      scene_overrides: {
        silence: "無音の間を広く取り、寝息と環境音だけで心理を見せる。",
      },
      overlay_rules: [],
    },
    visual_motifs: [
      {
        name: "sleep_strategy",
        meaning: "危機の後、眠りを戦術として選ぶことで信頼の入口を描く。",
        draw_directive: "沈黙のコマでは瞼、肩の落ち方、呼吸の白さを小さく反復し、説明台詞を避ける。",
        symbolic_lineage: "休息が逃避ではなく次の選択を準備する行為として積み上がる。",
      },
      {
        name: "blue_gate",
        meaning: "境界と登録制度。",
        draw_directive: "青い矩形光を背景や小物へ控えめに反復する。",
      },
    ],
    continuity_seeds: [],
    volume_synopsis: { theme: "仕事を通じた自立", summary: "新人配達員が都市の秘密に近づく。" },
  };

  return { ...base, ...patch };
}

function long(seed: string, repeat: number): string {
  return Array.from({ length: repeat }, (_, index) => `${seed}${index + 1}`).join("");
}
