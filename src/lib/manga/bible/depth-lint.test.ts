import { describe, expect, it } from "vitest";
import type { Aspect, BibleSnapshotV2, BibleSnapshotV3, FactNode, Layer } from "../schemas-v2";
import { depthCoverageReport, depthLint, depthLintV3, depthLintWithFlag, detectLayerReveals } from "./depth-lint";
import { measureChars, measureCount, resolvePath } from "./depth-spec";
import { v2ToV3 } from "./v3-adapter";

function text(chars: number): string {
  return "あ".repeat(chars);
}

function baseBible(characterPatch: Record<string, unknown> = {}): BibleSnapshotV2 {
  return {
    schema_version: 2,
    generated_at: "2026-05-10T00:00:00.000Z",
    generated_from: { source_type: "test", source_path: "test" },
    meta: {
      slug: "depth-test",
      title: "深度テスト",
      art_style: "manga_bw_seinen_urban",
      genre: "modern_dungeon",
      target_pages_per_volume: 200,
      target_episodes_per_volume: 10,
      target_pages_per_episode: 20,
      core_hook: { one_liner: "地図を縫う", type: "A", hit_references: ["参考作A"] },
    },
    world: {
      premise: text(120),
      rules: ["登録制", "時間差", "記録", "救助", "報酬"],
      system: "管理局が運用する。",
      timeline: "第一巻の時系列。",
      factions: [{ name: "管理局", summary: text(40) }],
    },
    characters: [
      {
        id: "char_main",
        name: "青井レン",
        role: "protagonist",
        spec: {
          hair: { style: "short", color: "black", specific: "左側だけ跳ねた短髪" },
          outfit_default: { top: "灰色の作業上着", bottom: "黒い作業ズボン" },
        },
        attribute_classifier: {},
        continuity_anchors: ["左側だけ跳ねた短髪", "古い配達鞄", "袖口を握る"],
        appears_in_volumes: [1],
        appearance_notes: text(200),
        ...characterPatch,
      },
    ],
    locations: [
      {
        id: "loc_arcade",
        name: "灯町アーケード",
        location_type: "other",
        spec: { layout: { furniture: [{ type: "掲示板", position: "入口右手" }] } },
        continuity_anchors: ["掲示板", "古い照明"],
        appears_in_episodes: [1],
      },
    ],
    props: [{ id: "prop_bag", name: "古い配達鞄", spec: { kind: "bag" }, continuity_anchors: ["補修跡"] }],
    costumes: [
      {
        id: "costume_work",
        character_id: "char_main",
        valid_from_episode: 1,
        valid_until_episode: null,
        spec: { top: "灰色の作業上着", bottom: "黒い作業ズボン" },
      },
    ],
    relations: [
      {
        from_character_id: "char_main",
        to_character_id: "char_mentor",
        relation_type: "mentor",
        description: text(900),
      },
    ],
    style_directives: { global: "線は細く。", scene_overrides: {}, overlay_rules: [] },
    visual_motifs: [{ name: "ほどけた紐", meaning: text(500), draw_directive: text(600) }],
    continuity_seeds: [
      {
        group_id: "char_main_face_v1",
        kind: "character_face",
        target_id: "char_main",
        invariant_description: "左側だけ跳ねた短髪。",
      },
    ],
    volume_synopsis: { theme: "自立", summary: text(220) },
  } as BibleSnapshotV2;
}

function findingFor(bible: BibleSnapshotV2, rule: string) {
  return depthLint(bible).find((finding) => finding.rule === rule);
}

function reportFor(bible: BibleSnapshotV2, rule: string) {
  const report = depthCoverageReport(bible).find((item) => `depth:${item.rule.path}` === rule);
  if (!report) throw new Error(`missing report: ${rule}`);
  return report;
}

function createMinimalV2WithBackstory(args: { length: number }): BibleSnapshotV2 {
  return baseBible({ backstory: text(args.length) });
}

function createMinimalV3WithMixedLayers(): BibleSnapshotV3 {
  return v2ToV3(baseBible({ backstory: text(5000), psychology_deep: text(100) }));
}

function createMinimalV3WithReveal(args: {
  character_id: string;
  aspect: Aspect;
  layers: Layer[];
}): BibleSnapshotV3 {
  const v3 = v2ToV3(baseBible({ backstory: text(5000) }));
  v3.entities.push({
    id: args.character_id,
    kind: "character",
    name: "Reveal Test",
    spec: { id: args.character_id, role: "supporting" },
    fact_ids: [],
    appears_in_volumes: [1],
  });
  v3.facts.push(
    ...args.layers.map((layer, index): FactNode => ({
      fact_id: `fact_reveal_${index}`,
      entity_id: args.character_id,
      aspect: args.aspect,
      layer,
      body: `reveal fact ${index}`,
      priority: index,
      evidence: {
        source_path: `test.reveal[${index}]`,
        json_pointer: `/test/reveal/${index}`,
        source_span: [0, 13],
        confidence: 1,
      },
    })),
  );
  return v3;
}

describe("depthLint", () => {
  it("protagonist.backstory が 200字なら fatal", () => {
    const finding = findingFor(baseBible({ backstory: text(200) }), "depth:characters[role=protagonist].backstory");
    expect(finding).toEqual(expect.objectContaining({ severity: "fatal", scope: "character", target_id: "char_main" }));
  });

  it("protagonist.backstory が 5000字なら warn", () => {
    const finding = findingFor(baseBible({ backstory: text(5000) }), "depth:characters[role=protagonist].backstory");
    expect(finding).toEqual(expect.objectContaining({ severity: "warn", scope: "character", target_id: "char_main" }));
  });

  it("protagonist.backstory が 10000字なら ok", () => {
    const report = reportFor(baseBible({ backstory: text(10000) }), "depth:characters[role=protagonist].backstory");
    expect(report.per_match[0]).toEqual(expect.objectContaining({ severity: "ok", chars: 10000 }));
    expect(findingFor(baseBible({ backstory: text(10000) }), "depth:characters[role=protagonist].backstory")).toBeUndefined();
  });

  it("protagonist.backstory が undefined なら未着手 warn", () => {
    const finding = findingFor(baseBible(), "depth:characters[role=protagonist].backstory");
    expect(finding).toEqual(expect.objectContaining({ severity: "warn", scope: "character", target_id: "char_main" }));
    expect(finding?.message).toContain("未着手");
  });

  it("visual_motifs[*].meaning が 5件各500字なら min gate を満たす", () => {
    const bible = {
      ...baseBible({ backstory: text(10000) }),
      visual_motifs: Array.from({ length: 5 }, (_, index) => ({
        name: `motif_${index}`,
        meaning: text(500),
        draw_directive: text(2000),
      })),
    };
    const report = reportFor(bible, "depth:visual_motifs[*].meaning");
    expect(report.per_match).toHaveLength(5);
    expect(report.per_match.every((match) => match.chars >= 300)).toBe(true);
    expect(report.aggregate.fatal_count).toBe(0);
  });

  it("relations[*].description が 0件なら fatal", () => {
    const bible = { ...baseBible({ backstory: text(10000) }), relations: [] };
    const finding = findingFor(bible, "depth:relations[*].description");
    expect(finding).toEqual(expect.objectContaining({ severity: "fatal", scope: "relation" }));
  });
});

describe("depth-spec helpers", () => {
  it("filter path と文字数計測を扱う", () => {
    const values = resolvePath(baseBible({ backstory: text(42) }), "characters[role=protagonist].backstory");
    expect(values).toHaveLength(1);
    expect(measureChars(values[0])).toBe(42);
  });

  it("wildcard path と count 計測を扱う", () => {
    const values = resolvePath(baseBible(), "visual_motifs[*].meaning");
    expect(values).toHaveLength(1);
    expect(measureCount(resolvePath(baseBible(), "characters[*]"))).toBe(1);
  });
});

describe("depthLintV3 (V3 fact-based depth check)", () => {
  it("characters[*].backstory の depth check が V3 fact 経由で動く", () => {
    const v2 = createMinimalV2WithBackstory({ length: 1000 });
    const v3 = v2ToV3(v2);
    const findings = depthLintV3(v3);
    expect(findings.some((finding) => finding.rule.includes("backstory"))).toBe(true);
  });

  it("layerFilter で in_world_belief のみ check", () => {
    const v3 = createMinimalV3WithMixedLayers();
    const findings = depthLintV3(v3, { layerFilter: ["in_world_belief"] });
    expect(findings.some((finding) => finding.rule === "depth:characters[role=protagonist].psychology_deep")).toBe(false);
  });

  it("detectLayerReveals が同 entity 同 aspect 複数 layer fact を info で報告", () => {
    const v3 = createMinimalV3WithReveal({
      character_id: "char_a",
      aspect: "psychology",
      layers: ["in_world_belief", "meta_truth"],
    });
    const findings = detectLayerReveals(v3);
    expect(findings.some((finding) => finding.rule === "layer_reveal_present" && finding.scope === "layer_consistency")).toBe(true);
  });

  it("motif の reference_scenes が5件なら V3 depth lint で fatal にならない", () => {
    const v3 = v2ToV3({
      ...baseBible(),
      visual_motifs: [{
        name: "参照場面",
        meaning: "",
        draw_directive: "",
        reference_scenes: ["s0", "s1", "s2", "s3", "s4"],
      }],
    });

    const finding = depthLintV3(v3).find((item) => item.rule === "depth:visual_motifs[*].reference_scenes");
    expect(finding).toEqual(expect.objectContaining({ severity: "warn", scope: "motif" }));
    expect(finding?.message).toContain("count=5");
  });

  it("motif の reference_scenes が3件なら V3 depth lint で fatal", () => {
    const v3 = v2ToV3({
      ...baseBible(),
      visual_motifs: [{
        name: "参照場面",
        meaning: "",
        draw_directive: "",
        reference_scenes: ["s0", "s1", "s2"],
      }],
    });

    const finding = depthLintV3(v3).find((item) => item.rule === "depth:visual_motifs[*].reference_scenes");
    expect(finding).toEqual(expect.objectContaining({ severity: "fatal", scope: "motif" }));
    expect(finding?.message).toContain("count=3");
  });

  it("depthLintWithFlag(false) は legacy depthLint と同じ", () => {
    const v2 = baseBible();
    expect(depthLintWithFlag(v2, false)).toEqual(depthLint(v2));
  });
});
