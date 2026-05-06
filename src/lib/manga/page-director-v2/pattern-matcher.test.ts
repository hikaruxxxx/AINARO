import { describe, expect, it } from "vitest";
import type { StoryboardPageV2 } from "../schemas-v2";
import type { Pattern, PatternDict, PatternFrequency, PatternSizeClass } from "./pattern-loader";
import { loadPatternDict } from "./pattern-loader";
import { matchPattern } from "./pattern-matcher";

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
      polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
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
    expect(result?.alternatives).toContainEqual({ id: "pat_010_diag_speedline_combat_3", score: 2, phase: 1 });
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
    expect(result?.alternatives).toContainEqual({ id: "p_n4", score: 2, phase: 1 });
  });
});
