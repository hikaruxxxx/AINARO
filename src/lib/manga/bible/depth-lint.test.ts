import { describe, expect, it } from "vitest";
import type { BibleSnapshotV2 } from "../schemas-v2";
import { depthCoverageReport, depthLint } from "./depth-lint";
import { measureChars, measureCount, resolvePath } from "./depth-spec";

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
