import { describe, expect, it } from "vitest";
import type { CapabilityProfile } from "../capability/capability";
import type { StoryboardPageV2 } from "../schemas-v2";
import { buildPagePlanFromStoryboardV4 } from "./page-mapper-v4";
import type { Pattern, PatternDict, PatternFrequency, PatternSizeClass } from "./pattern-loader";
import { loadPatternDict } from "./pattern-loader";
import { isAxisAlignedRect, isNonRect, matchPattern } from "./pattern-matcher";

function page(args: {
  role: StoryboardPageV2["page_role"];
  panelCount: number;
  importance?: 1 | 2 | 3 | 4 | 5;
}): StoryboardPageV2 {
  return {
    page_no: 1,
    page_role: args.role,
    panels: Array.from({ length: args.panelCount }, (_, index) => ({
      panel_id: `p${index + 1}`,
      reading_order: index + 1,
      importance: args.importance ?? 3,
    })),
  } as StoryboardPageV2;
}

function pattern(args: {
  id: string;
  panelCount: number;
  roles: string[];
  frequency?: PatternFrequency;
  subtypeHints?: string[];
  sizeClass?: PatternSizeClass;
  polygon?: [number, number][];
}): Pattern {
  return {
    id: args.id,
    name: args.id,
    panel_count: args.panelCount,
    page_role_hints: args.roles,
    subtype_hints: args.subtypeHints ?? [],
    purpose_summary: "",
    trigger_conditions: "",
    frequency: args.frequency ?? "medium",
    example_pages: [1],
    features: [],
    slots: Array.from({ length: args.panelCount }, (_, index) => ({
      slot_id: `s${index + 1}`,
      reading_order: index + 1,
      role_hint: "body",
      size_class: args.sizeClass ?? "medium",
      polygon: args.polygon ?? [[0, 0], [10, 0], [10, 10], [0, 10]],
    })),
  };
}

function dict(patterns: Pattern[]): PatternDict {
  return {
    schema_version: 1,
    page_dimensions: { width: 1748, height: 2480 },
    page_margin: 60,
    page_gutter: 20,
    patterns,
  };
}

describe("matchPattern", () => {
  it("厳格マッチが効く: panel_count=5, role=buildup → pat_001", async () => {
    const actualDict = await loadPatternDict("data/manga/layout_patterns/v1.json");
    const result = matchPattern({
      page: page({ role: "buildup", panelCount: 5 }),
      dict: actualDict,
    });

    expect(result?.phase).toBe(1);
    expect(result?.pattern.id).toBe("pat_001_3tier_dialogue_5");
    expect(result?.warnings).toEqual([]);
  });

  it("Phase 1 の n±1 候補が効く: panel_count=5, role=action は exact n=5 を優先する", async () => {
    const actualDict = await loadPatternDict("data/manga/layout_patterns/v1.json");
    const result = matchPattern({
      page: page({ role: "action", panelCount: 5 }),
      dict: actualDict,
    });

    expect(result?.phase).toBe(1);
    expect(result?.pattern.id).toBe("pat_026_explosive_top_calm_bottom_5");
    expect(result?.alternatives).toContainEqual({ id: "pat_010_diag_speedline_combat_3", score: 2.5, phase: 1 });
    expect(result?.warnings).toEqual([]);
  });

  it("役割無視で frequency=high が選ばれる", () => {
    const result = matchPattern({
      page: page({ role: "establishing", panelCount: 2 }),
      dict: dict([
        pattern({ id: "p_low", panelCount: 2, roles: ["dialogue"], frequency: "medium" }),
        pattern({ id: "p_high", panelCount: 2, roles: ["action_combat"], frequency: "high" }),
      ]),
    });

    expect(result?.phase).toBe(3);
    expect(result?.pattern.id).toBe("p_high");
  });

  it("subtype が一致する archetype が優先される", () => {
    const result = matchPattern({
      page: page({ role: "dialogue", panelCount: 3 }),
      storyboardSubtype: "gacha_ui",
      dict: dict([
        pattern({ id: "p_generic", panelCount: 3, roles: ["dialogue"], frequency: "medium" }),
        pattern({
          id: "p_subtype",
          panelCount: 3,
          roles: ["dialogue"],
          frequency: "medium",
          subtypeHints: ["gacha_ui"],
        }),
      ]),
    });

    expect(result?.phase).toBe(1);
    expect(result?.pattern.id).toBe("p_subtype");
  });

  it("importance_max=5 のとき大 size_class を持つ archetype が優先される", () => {
    const result = matchPattern({
      page: page({ role: "reveal", panelCount: 2, importance: 5 }),
      dict: dict([
        pattern({ id: "p_medium", panelCount: 2, roles: ["reveal"], frequency: "medium", sizeClass: "medium" }),
        pattern({
          id: "p_extra_large",
          panelCount: 2,
          roles: ["reveal"],
          frequency: "medium",
          sizeClass: "extra_large",
        }),
      ]),
    });

    expect(result?.phase).toBe(1);
    expect(result?.pattern.id).toBe("p_extra_large");
  });

  it("history penalty で 3 page 目は別の buildup archetype が選ばれる", async () => {
    const actualDict = await loadPatternDict("data/manga/layout_patterns/v1.json");
    const history: string[] = [];

    const first = matchPattern({
      page: page({ role: "buildup", panelCount: 5 }),
      dict: actualDict,
      history,
      historyPenaltyDepth: 3,
    });
    expect(first).not.toBeNull();
    history.push(first!.pattern.id);

    const second = matchPattern({
      page: page({ role: "buildup", panelCount: 5 }),
      dict: actualDict,
      history,
      historyPenaltyDepth: 3,
    });
    expect(second).not.toBeNull();
    history.push(second!.pattern.id);

    const third = matchPattern({
      page: page({ role: "buildup", panelCount: 5 }),
      dict: actualDict,
      history,
      historyPenaltyDepth: 3,
    });

    expect(third?.phase).toBe(1);
    expect(third?.pattern.id).not.toBe(first?.pattern.id);
    expect(third?.pattern.id).not.toBe(second?.pattern.id);
    expect(third?.penalty).toBe(0);
  });

  it("history penalty depth=3 で 4 件前の archetype は penalty 対象外になる", () => {
    const result = matchPattern({
      page: page({ role: "dialogue", panelCount: 5 }),
      dict: dict([
        pattern({ id: "p_a", panelCount: 5, roles: ["dialogue"], frequency: "medium" }),
        pattern({ id: "p_b", panelCount: 5, roles: ["dialogue"], frequency: "medium" }),
        pattern({ id: "p_c", panelCount: 5, roles: ["dialogue"], frequency: "medium" }),
        pattern({ id: "p_d", panelCount: 5, roles: ["dialogue"], frequency: "medium" }),
      ]),
      history: ["p_a", "p_b", "p_c", "p_d"],
      historyPenaltyDepth: 3,
    });

    expect(result?.phase).toBe(1);
    expect(result?.pattern.id).toBe("p_a");
    expect(result?.penalty).toBe(0);
  });

  it("Phase 1 候補プール拡大で panel_count=5 の page に n=4 archetype も含まれる", () => {
    const result = matchPattern({
      page: page({ role: "dialogue", panelCount: 5 }),
      dict: dict([
        pattern({ id: "p_exact", panelCount: 5, roles: ["dialogue"], frequency: "high" }),
        pattern({ id: "p_n4", panelCount: 4, roles: ["dialogue"], frequency: "medium" }),
      ]),
    });

    expect(result?.phase).toBe(1);
    expect(result?.pattern.id).toBe("p_exact");
    expect(result?.alternatives).toContainEqual({ id: "p_n4", score: 2.5, phase: 1 });
  });

  it("P.1 importance=4, role=opening_hook → non-rect (pat_017/pat_018) が選ばれる", async () => {
    const actualDict = await loadPatternDict("data/manga/layout_patterns/v1.json");
    const result = matchPattern({
      page: page({ role: "opening_hook", panelCount: 2, importance: 4 }),
      dict: {
        ...actualDict,
        patterns: actualDict.patterns.filter((p) =>
          ["pat_013_two_shot_iconic_2", "pat_017_bubble_panel_power_2", "pat_018_diagonal_skewed_panel_2"].includes(p.id)
        ),
      },
    });

    expect(result?.pattern.id).toMatch(/^pat_01[78]_/);
    expect(result?.pattern).toSatisfy((p: Pattern) => isNonRect(p));
  });

  it("rect 3 連続後に rect-only + non-rect が同 score 帯なら non-rect が勝つ (variety_window)", () => {
    const result = matchPattern({
      page: page({ role: "dialogue", panelCount: 2 }),
      dict: dict([
        pattern({ id: "p_rect", panelCount: 2, roles: ["dialogue"], frequency: "medium" }),
        pattern({
          id: "p_non_rect",
          panelCount: 2,
          roles: ["dialogue"],
          frequency: "medium",
          polygon: [[0, 0], [10, 0], [8, 10], [0, 10]],
        }),
      ]),
      recentNonRectHistory: [false, false, false],
    });

    expect(result?.pattern.id).toBe("p_non_rect");
  });

  it("history push は applied 後 (polygon validation 失敗時 history 不変)", () => {
    const capability = {
      profile_id: "test",
      recommended_strategy: "page_one_shot",
    } as CapabilityProfile;
    const result = buildPagePlanFromStoryboardV4({
      capability,
      storyboard: {
        schema_version: 2,
        episode_id: "ep-test",
        total_pages: 2,
        pages: [
          page({ role: "dialogue", panelCount: 1 }),
          { ...page({ role: "dialogue", panelCount: 1 }), page_no: 2 },
        ],
      },
      dict: dict([
        pattern({
          id: "p_a_bad",
          panelCount: 1,
          roles: ["dialogue"],
          frequency: "medium",
          polygon: [[0, 0], [2000, 0], [2000, 20], [0, 20]],
        }),
        pattern({ id: "p_b_good", panelCount: 1, roles: ["dialogue"], frequency: "medium" }),
      ]),
    });

    expect(result.pages[0]._layout_match_meta).toMatchObject({
      pattern_id: "p_a_bad",
      actualApplied: false,
    });
    expect(result.pages[1]._layout_match_meta).toMatchObject({
      pattern_id: "p_a_bad",
      actualApplied: false,
    });
  });

  it("isAxisAlignedRect: 4 頂点軸並行 rect は true, 4 頂点斜め台形は false, 5 頂点 polygon は false", () => {
    expect(isAxisAlignedRect([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(true);
    expect(isAxisAlignedRect([[0, 0], [10, 2], [8, 10], [0, 10]])).toBe(false);
    expect(isAxisAlignedRect([[0, 0], [10, 0], [10, 5], [5, 10], [0, 10]])).toBe(false);
  });
});
