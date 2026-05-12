import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import {
  DEFAULT_SCORING_CONFIG,
  buildBibleContextForSlot,
  buildSceneCandidatePrompt,
  generateSceneCandidates,
  needsTier2Regeneration,
  type BibleContextForSlot,
  type GenerationContext,
  type SceneSlot,
  type Tier2Feedback,
} from "./scoring-loop";
import type { Scene } from "./schema";
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

  it("generateSceneCandidates は feedback 付き dry-run でも stub candidate を返す", async () => {
    const slot = createMinimalSlot();
    const prev = createMinimalScene(slot);
    const feedback: Tier2Feedback = {
      prev_selected: prev,
      prev_anchor_score: 0.42,
      prev_pairwise_score: 0.75,
      iteration: 2,
    };

    const candidates = await generateSceneCandidates(
      slot,
      createMinimalContext(),
      { ...DEFAULT_SCORING_CONFIG, candidatesPerScene: 3, dry_run: true },
      feedback,
    );

    expect(candidates).toHaveLength(3);
    expect(candidates[0].scene_id).toBe(slot.scene_id);
    expect(candidates[0].key_visual_intent).toContain("[stub-cand-0]");
  });

  it("buildSceneCandidatePrompt は feedback の有無で再生成 section を切り替える", () => {
    const slot = createMinimalSlot();
    const context = createMinimalContext();
    const bibleContext = createMinimalBibleContext();
    const prev = createMinimalScene(slot);
    const promptWithoutFeedback = buildSceneCandidatePrompt(slot, context, 2, bibleContext);
    const promptWithFeedback = buildSceneCandidatePrompt(slot, context, 2, bibleContext, {
      prev_selected: prev,
      prev_anchor_score: 0.42,
      prev_pairwise_score: 0.75,
      iteration: 2,
      anchor_feedback_text: "key visual が抽象的",
    });

    expect(promptWithoutFeedback).not.toContain("## 再生成 (Tier 2");
    expect(promptWithFeedback).toContain("## 再生成 (Tier 2 / 周回 2)");
    expect(promptWithFeedback).toContain("llm_score=0.42");
    expect(promptWithFeedback).toContain("key visual が抽象的");
  });

  it("buildSceneCandidatePrompt は確定済み scene_exclusive 台詞 section を出す", () => {
    const slot = createMinimalSlot();
    const finalizedSlot = { ...slot, scene_id: "S03", scene_no: 3 };
    const finalized = createMinimalScene(finalizedSlot);
    finalized.dialogue_plan = {
      key_lines: [
        { speaker: "char_a", text: "経験値倍化条件、開示します。", uniqueness: "scene_exclusive", intent: "reveal" },
        { speaker: "char_a", text: "これは繰り返してよい。", uniqueness: "may_repeat", intent: "callback" },
      ],
    };

    const prompt = buildSceneCandidatePrompt(
      slot,
      { ...createMinimalContext(), finalizedScenes: [finalized] },
      2,
      createMinimalBibleContext(),
    );

    expect(prompt).toContain("## 過去 scene で確定済みの scene_exclusive 台詞 (絶対重複禁止)");
    expect(prompt).toContain("- [S03 char_a] 「経験値倍化条件、開示します。」");
    expect(prompt).toContain("uniqueness を may_repeat にしても禁止");
    expect(prompt).not.toContain("これは繰り返してよい。");
  });

  it("buildSceneCandidatePrompt は finalizedScenes が空または排他台詞なしなら section を出さない", () => {
    const slot = createMinimalSlot();
    const finalized = createMinimalScene({ ...slot, scene_id: "S01", scene_no: 1 });
    finalized.dialogue_plan = {
      key_lines: [{ speaker: "char_a", text: "通常台詞です。", uniqueness: "may_repeat", intent: "establish" }],
    };

    const emptyPrompt = buildSceneCandidatePrompt(slot, createMinimalContext(), 2, createMinimalBibleContext());
    const noExclusivePrompt = buildSceneCandidatePrompt(
      slot,
      { ...createMinimalContext(), finalizedScenes: [finalized] },
      2,
      createMinimalBibleContext(),
    );

    expect(emptyPrompt).not.toContain("過去 scene で確定済みの scene_exclusive 台詞");
    expect(noExclusivePrompt).not.toContain("過去 scene で確定済みの scene_exclusive 台詞");
  });

  it("buildSceneCandidatePrompt の排他台詞 section は feedback section と独立して出る", () => {
    const slot = createMinimalSlot();
    const finalized = createMinimalScene({ ...slot, scene_id: "S07", scene_no: 7 });
    finalized.dialogue_plan = {
      key_lines: [{ speaker: "char_a", text: "ここだ。", uniqueness: "scene_exclusive", intent: "hook" }],
    };
    const feedback: Tier2Feedback = {
      prev_selected: createMinimalScene(slot),
      prev_anchor_score: 0.41,
      prev_pairwise_score: 0.7,
      iteration: 2,
    };

    const prompt = buildSceneCandidatePrompt(
      slot,
      { ...createMinimalContext(), finalizedScenes: [finalized] },
      2,
      createMinimalBibleContext(),
      feedback,
    );

    expect(prompt).toContain("## 過去 scene で確定済みの scene_exclusive 台詞 (絶対重複禁止)");
    expect(prompt).toContain("- [S07 char_a] 「ここだ。」");
    expect(prompt).toContain("## 再生成 (Tier 2 / 周回 2)");
    expect(prompt).toContain("scene_exclusive 台詞も候補間で重複させない");
  });

  it("DEFAULT_SCORING_CONFIG は Tier 2 閾値 0.50 を使う", () => {
    expect(DEFAULT_SCORING_CONFIG.tier2_threshold_pct).toBe(0.5);
  });

  it("needsTier2Regeneration はデフォルト閾値で llm_score 0.60 を通し 0.40 を再生成に回す", () => {
    expect(needsTier2Regeneration(0.6, DEFAULT_SCORING_CONFIG)).toBe(false);
    expect(needsTier2Regeneration(0.4, DEFAULT_SCORING_CONFIG)).toBe(true);
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

function createMinimalContext(): GenerationContext {
  return {
    slug: "a07-modern-dungeon",
    episode: 1,
    bibleSnapshotPath: "/tmp/bible-snapshot.json",
    briefPath: "/tmp/brief.json",
    finalizedScenes: [],
  };
}

function createMinimalBibleContext(): BibleContextForSlot {
  return {
    characters: [{ id: "char_a", name: "アオ", role: "protagonist" }],
    costumes: [{ id: "costume_a_active", character_id: "char_a", name: "訓練服" }],
    motifCandidates: [{ id: "motif_blue_gate", name: "blue_gate", description: "青い境界光" }],
    worldRuleCandidates: ["青いゲートは登録者だけが通れる"],
    propCandidates: [{ id: "prop_bag", name: "古い配送鞄" }],
  };
}

function createMinimalScene(slot: SceneSlot): Scene {
  return {
    ...slot,
    beat_type: "transition",
    cast: [],
    dialogue_plan: { key_lines: [] },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: {
      belief: "街は怖いが、道順は信じられる",
      goal: "青いゲートを通る",
      emotion: "tension",
      delta_from_prev: "恐怖から小さな決意へ動く",
    },
    relationship_state_delta: [],
    time_axis: {
      label: "present",
      order: 1,
      is_flashback: false,
      is_flashforward: false,
      duration_hint: "moments",
    },
    page_budget: { min: 1, max: 1, preferred: 1 },
    mode: "transition_montage",
    turn_anchor: { at_panel_no: null, type: "none" },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "page_one_shot",
    key_visual_intent: "青いゲート前で古い配送鞄を握る",
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
