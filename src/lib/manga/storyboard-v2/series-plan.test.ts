import { describe, expect, it, vi } from "vitest";
import { runCodexText } from "../llm/codex-text";
import type { BibleSnapshotV2, SeriesPlan, ArcPlan } from "../schemas-v2";
import type { V2Concept } from "../bible/v2-adapter";
import {
  generateSeriesPlan,
  findArcsForVolume,
  classifyVolumeCoverage,
} from "./series-plan";

vi.mock("../llm/codex-text", () => ({
  runCodexText: vi.fn(),
}));

function bible(): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-13T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "test-series",
      title: "test",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 22,
      estimated_volumes: 5,
    },
    world: { premise: "", rules: [], system: "", timeline: "", factions: [], lexicon: {} },
    characters: [
      {
        id: "char_a",
        name: "主人公",
        role: "protagonist",
        spec: {},
        attribute_classifier: {},
        continuity_anchors: [],
        appears_in_volumes: [1, 2, 3, 4, 5],
      },
    ],
    locations: [],
    props: [],
    costumes: [],
    relations: [],
    style_directives: { global: "", scene_overrides: [] },
    visual_motifs: [],
    continuity_seeds: [],
    narration_style_guide: { style: "", examples: [] },
    nav_full_spec: {},
    volume_synopsis: null as never,
  } as unknown as BibleSnapshotV2;
}

function v2Concept(): V2Concept {
  return {
    main_arc: "全 5 巻で主人公が覚醒→失敗→再起",
    volume_outline: "1: 覚醒 / 2-3: 上昇 / 4: 危機 / 5: 解決",
    volume1_detail: "ep1-10 を覚醒の物語に",
  } as V2Concept;
}

const validSeriesPlanResponse = {
  series_theme: "声を持たない者の翻訳",
  long_arc_outline: "vol1 で覚醒、vol2-3 で上昇、vol4 で失敗、vol5 で再起。".repeat(50),
  arcs: [
    {
      arc_id: "arc_01_awakening",
      arc_name: "覚醒編",
      arc_phase: "prologue",
      volume_range: [1, 1],
      arc_theme: "Fランクの主人公がナビと出会う",
      protagonist_growth: "底辺から手応えへ",
      turning_points: [
        { volume: 1, episode: 4, event: "スキル覚醒" },
        { volume: 1, episode: 8, event: "二十階突破" },
      ],
      arc_opening: "コンビニ夜勤",
      arc_climax: "番人撃破",
      arc_resolution: "ナビ沈黙",
    },
    {
      arc_id: "arc_02_ascend",
      arc_name: "上昇編",
      arc_phase: "rising",
      volume_range: [2, 3],
      arc_theme: "公開記録更新の連鎖",
      protagonist_growth: "認知から責任へ",
      turning_points: [{ volume: 3, episode: 7, event: "灯里との再会" }],
      arc_opening: "監査開始",
      arc_climax: "三十階制覇",
      arc_resolution: "公開と保護のジレンマ",
    },
    {
      arc_id: "arc_03_doubt",
      arc_name: "疑念編",
      arc_phase: "crisis",
      volume_range: [4, 4],
      arc_theme: "ナビの正体への疑い",
      protagonist_growth: "依存から自律へ",
      turning_points: [{ volume: 4, episode: 5, event: "ナビ嘘発覚" }],
      arc_opening: "声の沈黙",
      arc_climax: "玄蔵との対話",
      arc_resolution: "ナビ放棄の覚悟",
    },
    {
      arc_id: "arc_04_rebuild",
      arc_name: "再起編",
      arc_phase: "climax",
      volume_range: [5, 5],
      arc_theme: "声なしで世界を読む",
      protagonist_growth: "翻訳者としての主人公",
      turning_points: [{ volume: 5, episode: 9, event: "ランク制度撤廃" }],
      arc_opening: "新制度開始",
      arc_climax: "最後の番人戦",
      arc_resolution: "継承の余韻",
    },
  ],
  protagonist_long_arc: {
    starting_state: "Fランクで諦めている",
    arc_endings: [
      "覚醒し記録更新者",
      "認知され追われる存在",
      "ナビを失う",
      "翻訳者として立つ",
    ],
    final_state: "新人の前で半歩横に立つ",
  },
  core_hook_evolution:
    "ナビの声が主人公だけに → 信頼 → 疑念 → 喪失 → 自律 へと進化する",
};

describe("generateSeriesPlan", () => {
  it("有効な Codex 応答から SeriesPlan を組み立てる", async () => {
    vi.mocked(runCodexText).mockResolvedValueOnce({
      stdout: "",
      parsed: validSeriesPlanResponse,
      attempts: 1,
      totalDurationMs: 1,
    });
    const plan = await generateSeriesPlan({
      bible: bible(),
      v2Concept: v2Concept(),
      totalVolumes: 5,
    });
    expect(plan.schema_version).toBe(1);
    expect(plan.slug).toBe("test-series");
    expect(plan.total_volumes).toBe(5);
    expect(plan.arcs).toHaveLength(4);
    expect(plan.protagonist_long_arc.arc_endings).toHaveLength(4);
    expect(plan.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("arcs と arc_endings の数が不一致なら throw", async () => {
    vi.mocked(runCodexText).mockResolvedValueOnce({
      stdout: "",
      parsed: {
        ...validSeriesPlanResponse,
        protagonist_long_arc: {
          ...validSeriesPlanResponse.protagonist_long_arc,
          arc_endings: ["a", "b"], // arcs.length=4 だが endings=2
        },
      },
      attempts: 1,
      totalDurationMs: 1,
    });
    await expect(
      generateSeriesPlan({ bible: bible(), v2Concept: v2Concept(), totalVolumes: 5 }),
    ).rejects.toThrow(/不一致/);
  });

  it("Codex parsed が null なら throw", async () => {
    vi.mocked(runCodexText).mockResolvedValueOnce({
      stdout: "",
      parsed: null,
      attempts: 1,
      totalDurationMs: 1,
    });
    await expect(
      generateSeriesPlan({ bible: bible(), v2Concept: v2Concept(), totalVolumes: 5 }),
    ).rejects.toThrow(/JSON 抽出失敗/);
  });
});

describe("findArcsForVolume / classifyVolumeCoverage", () => {
  const plan: SeriesPlan = {
    schema_version: 1,
    slug: "test",
    total_volumes: 5,
    generated_at: "2026-05-13T00:00:00.000Z",
    series_theme: "x",
    long_arc_outline: "x",
    arcs: validSeriesPlanResponse.arcs as ArcPlan[],
    protagonist_long_arc: validSeriesPlanResponse.protagonist_long_arc,
    core_hook_evolution: validSeriesPlanResponse.core_hook_evolution,
  };

  it("vol1 は arc_01_awakening (full)", () => {
    const arcs = findArcsForVolume(plan, 1);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].arc_id).toBe("arc_01_awakening");
    expect(classifyVolumeCoverage(arcs[0], 1)).toBe("full");
  });

  it("vol2 は arc_02_ascend (partial_start)", () => {
    const arcs = findArcsForVolume(plan, 2);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].arc_id).toBe("arc_02_ascend");
    expect(classifyVolumeCoverage(arcs[0], 2)).toBe("partial_start");
  });

  it("vol3 は arc_02_ascend (partial_end)", () => {
    const arcs = findArcsForVolume(plan, 3);
    expect(arcs).toHaveLength(1);
    expect(classifyVolumeCoverage(arcs[0], 3)).toBe("partial_end");
  });

  it("vol99 は空配列", () => {
    expect(findArcsForVolume(plan, 99)).toEqual([]);
  });
});
