import { describe, expect, it } from "vitest";
import { enforceVarianceRule, type PagePlan } from "./L05-page-director";
import type { PagePlanPanel } from "../../../src/lib/manga/schemas-v2";

const PAGE_DIMS = { w: 1000, h: 1000 };

function panel(panelNo: number, rect: PagePlanPanel["rect"], importance: PagePlanPanel["importance"] = 3): PagePlanPanel {
  return {
    panel_id: `p1_${panelNo}`,
    slot_id: `slot_${panelNo}`,
    rect,
    reading_order: panelNo,
    importance,
  };
}

function plan(panels: PagePlanPanel[]): PagePlan {
  return {
    schema_version: 2,
    episode_id: "test-ep01",
    capability_profile_id: "test",
    pages: [
      {
        page_no: 1,
        layout_template_id: "test_layout",
        page_role: "buildup",
        render_strategy: "page_one_shot",
        panels,
      },
    ],
  };
}

function ratios(panels: PagePlanPanel[]): { largest: number; smallest: number; variance: number } {
  const areas = panels.map((p) => p.rect.w * p.rect.h);
  const largest = Math.max(...areas) / (PAGE_DIMS.w * PAGE_DIMS.h);
  const smallest = Math.min(...areas) / (PAGE_DIMS.w * PAGE_DIMS.h);
  return { largest, smallest, variance: largest / smallest };
}

describe("enforceVarianceRule", () => {
  it("auto-corrects an even 5-panel page into large/small/medium variance", () => {
    const input = plan([
      panel(1, { x: 0, y: 0, w: 1000, h: 200 }),
      panel(2, { x: 0, y: 200, w: 1000, h: 200 }),
      panel(3, { x: 0, y: 400, w: 1000, h: 200 }),
      panel(4, { x: 0, y: 600, w: 1000, h: 200 }),
      panel(5, { x: 0, y: 800, w: 1000, h: 200 }),
    ]);

    const result = enforceVarianceRule(input, PAGE_DIMS);
    const corrected = result.corrected.pages[0].panels;
    const actual = ratios(corrected);

    expect(result.violations.map((v) => v.kind)).toEqual([
      "largest_too_small",
      "smallest_too_large",
      "variance_too_low",
    ]);
    expect(actual.largest).toBeGreaterThanOrEqual(0.4);
    expect(actual.smallest).toBeLessThanOrEqual(0.1);
    expect(actual.variance).toBeGreaterThanOrEqual(3.0);
    expect(corrected.every((p) => p.polygon?.length === 4)).toBe(true);
  });

  it("leaves an already variance-rich page unchanged", () => {
    const input = plan([
      panel(1, { x: 0, y: 0, w: 1000, h: 400 }),
      panel(2, { x: 500, y: 400, w: 500, h: 200 }),
      panel(3, { x: 0, y: 400, w: 500, h: 200 }),
      panel(4, { x: 500, y: 600, w: 500, h: 400 }),
      panel(5, { x: 0, y: 600, w: 500, h: 400 }),
    ]);

    const result = enforceVarianceRule(input, PAGE_DIMS);

    expect(result.violations).toEqual([]);
    expect(result.corrected).toBe(input);
  });

  it("honors relaxed custom variance config", () => {
    const input = plan([
      panel(1, { x: 0, y: 0, w: 1000, h: 200 }),
      panel(2, { x: 0, y: 200, w: 1000, h: 200 }),
      panel(3, { x: 0, y: 400, w: 1000, h: 200 }),
      panel(4, { x: 0, y: 600, w: 1000, h: 200 }),
      panel(5, { x: 0, y: 800, w: 1000, h: 200 }),
    ]);

    const result = enforceVarianceRule(input, PAGE_DIMS, {
      largestMinRatio: 0.19,
      smallestMaxRatio: 0.21,
      varianceMinRatio: 1.0,
    });

    expect(result.violations).toEqual([]);
    expect(result.corrected).toBe(input);
  });
});
