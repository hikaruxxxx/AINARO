import { describe, expect, it } from "vitest";
import type { PagePlanPanel } from "../schemas-v2";
import type { Pattern } from "./pattern-loader";
import { applyPattern } from "./pattern-applier";

function panel(id: string, readingOrder: number, rect = { x: 1, y: 2, w: 3, h: 4 }): PagePlanPanel {
  return {
    panel_id: id,
    slot_id: `old_${id}`,
    rect,
    reading_order: readingOrder,
    importance: 3,
  };
}

function pattern(slotCount: number): Pattern {
  return {
    id: "pat_test",
    name: "test",
    panel_count: slotCount,
    page_role_hints: ["dialogue"],
    subtype_hints: [],
    purpose_summary: "",
    trigger_conditions: "",
    frequency: "medium",
    example_pages: [1],
    features: [],
    slots: Array.from({ length: slotCount }, (_, index) => {
      const x = index * 100;
      return {
        slot_id: `s${index + 1}`,
        reading_order: index + 1,
        role_hint: "body",
        size_class: "medium",
        polygon: [[x, 10], [x + 80, 20], [x + 70, 90], [x + 5, 70]],
      };
    }),
  };
}

describe("applyPattern", () => {
  it("n_panels == n_slots の正常マッチで rect が polygon bbox と一致する", () => {
    const result = applyPattern({
      panels: [panel("p2", 2), panel("p1", 1)],
      pattern: pattern(2),
    });

    expect(result.appliedCount).toBe(2);
    expect(result.planPanels[1].polygon).toEqual([[0, 10], [80, 20], [70, 90], [5, 70]]);
    expect(result.planPanels[1].rect).toEqual({ x: 0, y: 10, w: 80, h: 80 });
    expect(result.planPanels[0].polygon).toEqual([[100, 10], [180, 20], [170, 90], [105, 70]]);
    expect(result.planPanels[0].rect).toEqual({ x: 100, y: 10, w: 80, h: 80 });
  });

  it("n_panels > n_slots では余り panel は polygon 未注入、rect は v3 値のまま", () => {
    const fallbackRect = { x: 9, y: 8, w: 7, h: 6 };
    const result = applyPattern({
      panels: [panel("p1", 1), panel("p2", 2), panel("p3", 3, fallbackRect)],
      pattern: pattern(2),
    });

    expect(result.appliedCount).toBe(2);
    expect(result.planPanels[2].polygon).toBeUndefined();
    expect(result.planPanels[2].rect).toBe(fallbackRect);
  });

  it("polygon 注入時に rect が bbox に上書きされている", () => {
    const result = applyPattern({
      panels: [panel("p1", 1, { x: 999, y: 999, w: 1, h: 1 })],
      pattern: pattern(1),
    });

    const polygon = result.planPanels[0].polygon!;
    expect(result.planPanels[0].rect.x).toBe(Math.min(...polygon.map(([x]) => x)));
    expect(result.planPanels[0].rect.y).toBe(Math.min(...polygon.map(([, y]) => y)));
    expect(result.planPanels[0].rect.w).toBe(Math.max(...polygon.map(([x]) => x)) - result.planPanels[0].rect.x);
    expect(result.planPanels[0].rect.h).toBe(Math.max(...polygon.map(([, y]) => y)) - result.planPanels[0].rect.y);
  });
});
