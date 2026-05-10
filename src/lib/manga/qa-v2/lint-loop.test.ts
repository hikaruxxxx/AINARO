import { describe, expect, it } from "vitest";
import type { SceneGraphV1 } from "../scene-graph/schema";
import type { NameLintFinding, NameLintReport } from "./name-lint";
import { aggregateLintFeedbackByScene, compareReports, filterFeedbackByPanelNos, selectScenesForReEnrich } from "./lint-loop";

function sceneGraph(): SceneGraphV1 {
  const sceneBase = {
    prev_scene_id: null,
    next_scene_id: null,
    page_range: { start: 1, end: 1 },
    beat_type: "introduce" as const,
    arc_position: { volume: 1, episode_in_volume: 1, arc_phase: "introduce" as const, arc_position_normalized: 0.1 },
    cast: [],
    dialogue_plan: { key_lines: [] },
    foreshadow_setup: [],
    foreshadow_payoff: [],
    protagonist_arc_state: { belief: "b", goal: "g", emotion: "resignation" as const, delta_from_prev: "d" },
    relationship_state_delta: [],
    time_axis: { label: "t", order: 1, is_flashback: false, is_flashforward: false, duration_hint: "minutes" as const },
    location_id: "loc",
    page_budget: { min: 1, max: 1, preferred: 1 },
    mode: "dialogue" as const,
    turn_anchor: { at_panel_no: null, type: "none" as const },
    layout_pattern_id: null,
    subtype_directive: { external_social: false, gacha_ui: false, hybrid: false },
    render_strategy: "page_one_shot" as const,
    key_visual_intent: "intent",
  };
  return {
    schema_version: 1,
    episode_id: "ep",
    generated_at: "2026-05-10T00:00:00.000Z",
    source: { brief_path: "", shotlist_path: "", bible_snapshot_path: "" },
    scenes: [
      { ...sceneBase, scene_id: "S01", scene_no: 1, next_scene_id: "S02", panel_range: { start_panel_no: 1, end_panel_no: 10 } },
      { ...sceneBase, scene_id: "S02", scene_no: 2, prev_scene_id: "S01", panel_range: { start_panel_no: 11, end_panel_no: 20 } },
    ],
  };
}

function finding(patch: Partial<NameLintFinding>): NameLintFinding {
  return {
    severity: "warn",
    scope: "panel",
    rule: "dialogue_unnatural",
    message: "bad",
    ...patch,
  };
}

function report(count: number): NameLintReport {
  return {
    schema_version: 1,
    audited_at: "2026-05-10T00:00:00.000Z",
    slug: "s",
    episode: 1,
    pages_total: 1,
    fatal_count: 0,
    warn_count: count,
    info_count: 0,
    findings: Array.from({ length: count }, (_, i) => finding({ panel_no: i + 1 })),
    summary: `fatal=0 warn=${count} info=0`,
  };
}

describe("aggregateLintFeedbackByScene", () => {
  it("groups panel findings by scene panel_range", () => {
    const feedback = aggregateLintFeedbackByScene(
      [
        finding({ panel_no: 3, rule: "key_visual_generic" }),
        finding({ panel_no: 12, rule: "dialogue_unnatural" }),
      ],
      sceneGraph(),
    );

    expect(feedback.get("S01")?.[0]).toEqual(expect.objectContaining({ panel_no: 3 }));
    expect(feedback.get("S02")?.[0]).toEqual(expect.objectContaining({ panel_no: 12 }));
  });

  it("filters info and non panel/page scopes", () => {
    const feedback = aggregateLintFeedbackByScene(
      [
        finding({ severity: "info", panel_no: 3 }),
        finding({ scope: "scene", scene_id: "S01" }),
      ],
      sceneGraph(),
    );

    expect(feedback.size).toBe(0);
  });

  it("maps page findings with scene_id to the scene start panel", () => {
    const feedback = aggregateLintFeedbackByScene(
      [finding({ scope: "page", scene_id: "S02", panel_no: undefined, rule: "scene_pacing_off" })],
      sceneGraph(),
    );

    expect(feedback.get("S02")?.[0]).toEqual(expect.objectContaining({ panel_no: 11 }));
  });

  it("maps page findings without scene_id by page_range", () => {
    const feedback = aggregateLintFeedbackByScene(
      [finding({ scope: "page", page_no: 1, panel_no: undefined, rule: "importance_flat" })],
      sceneGraph(),
    );

    expect(feedback.get("S01")?.[0]).toEqual(expect.objectContaining({ panel_no: 1 }));
  });

  it("limits feedback to five panels per scene", () => {
    const feedback = aggregateLintFeedbackByScene(
      Array.from({ length: 8 }, (_, i) => finding({ panel_no: i + 1 })),
      sceneGraph(),
    );

    expect(feedback.get("S01")).toHaveLength(5);
  });
});

describe("compareReports", () => {
  it("computes improvement rate", () => {
    expect(compareReports(report(100), report(80))).toEqual({ improvementRate: 0.2, regressed: false });
  });

  it("marks regression", () => {
    expect(compareReports(report(10), report(12))).toEqual({ improvementRate: -0.2, regressed: true });
  });

  it("handles same count", () => {
    expect(compareReports(report(10), report(10))).toEqual({ improvementRate: 0, regressed: false });
  });
});

describe("selectScenesForReEnrich", () => {
  it("returns scene ids with feedback", () => {
    const feedback = new Map([
      ["S01", [{ panel_no: 1, findings: [{ rule: "r", severity: "warn" as const, message: "m" }] }]],
      ["S02", []],
    ]);

    expect(selectScenesForReEnrich(feedback)).toEqual(["S01"]);
  });

  it("filters scene ids by targetPanelNos", () => {
    const feedback = new Map([
      ["S01", [{ panel_no: 1, findings: [{ rule: "r", severity: "warn" as const, message: "m" }] }]],
      ["S02", [{ panel_no: 12, findings: [{ rule: "r", severity: "warn" as const, message: "m" }] }]],
    ]);

    expect(selectScenesForReEnrich(feedback, { targetPanelNos: [12] })).toEqual(["S02"]);
  });
});

describe("filterFeedbackByPanelNos", () => {
  it("keeps only matching panels", () => {
    const feedback = new Map([
      [
        "S01",
        [
          { panel_no: 1, findings: [{ rule: "r1", severity: "warn" as const, message: "m" }] },
          { panel_no: 2, findings: [{ rule: "r2", severity: "fatal" as const, message: "m" }] },
        ],
      ],
    ]);

    expect(filterFeedbackByPanelNos(feedback, [2]).get("S01")).toEqual([
      { panel_no: 2, findings: [{ rule: "r2", severity: "fatal", message: "m" }] },
    ]);
  });

  it("drops scenes with no matching panels", () => {
    const feedback = new Map([
      ["S01", [{ panel_no: 1, findings: [{ rule: "r", severity: "warn" as const, message: "m" }] }]],
    ]);

    expect(filterFeedbackByPanelNos(feedback, [99]).size).toBe(0);
  });
});
