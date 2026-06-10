import { describe, expect, it } from "vitest";
import type { PageRoleV2 } from "../schemas-v2";
import {
  buildPanelCountHintTable,
  panelCountHintByRole,
  validatePanelCount,
  type GenerationProfile,
  type PanelCountHint,
} from "./panel-count-hint";

const roles: PageRoleV2[] = [
  "opening_hook",
  "cliffhanger",
  "reveal",
  "action",
  "buildup",
  "aftermath",
  "establishing",
  "dialogue",
];

const expected: Record<GenerationProfile, Record<PageRoleV2, PanelCountHint>> = {
  balanced: {
    opening_hook: { min: 1, max: 3, preferred: 2 },
    cliffhanger: { min: 1, max: 3, preferred: 2 },
    reveal: { min: 2, max: 4, preferred: 3 },
    action: { min: 4, max: 5, preferred: 4 },
    buildup: { min: 4, max: 6, preferred: 5 },
    aftermath: { min: 4, max: 6, preferred: 5 },
    establishing: { min: 1, max: 3, preferred: 2 },
    dialogue: { min: 5, max: 7, preferred: 6 },
  },
  cinematic: {
    opening_hook: { min: 0, max: 3, preferred: 2 },
    cliffhanger: { min: 0, max: 3, preferred: 2 },
    reveal: { min: 1, max: 4, preferred: 3 },
    action: { min: 4, max: 5, preferred: 4 },
    buildup: { min: 4, max: 6, preferred: 5 },
    aftermath: { min: 4, max: 6, preferred: 5 },
    establishing: { min: 1, max: 3, preferred: 2 },
    dialogue: { min: 5, max: 7, preferred: 6 },
  },
  "clarity-first": {
    opening_hook: { min: 1, max: 3, preferred: 2 },
    cliffhanger: { min: 1, max: 3, preferred: 2 },
    reveal: { min: 2, max: 4, preferred: 3 },
    action: { min: 4, max: 4, preferred: 4 },
    buildup: { min: 5, max: 6, preferred: 5 },
    aftermath: { min: 4, max: 6, preferred: 5 },
    establishing: { min: 1, max: 3, preferred: 2 },
    dialogue: { min: 5, max: 7, preferred: 6 },
  },
};

describe("panelCountHintByRole", () => {
  it("3 profile x 8 role の hint が意図通り", () => {
    for (const profile of Object.keys(expected) as GenerationProfile[]) {
      for (const role of roles) {
        expect(panelCountHintByRole(role, profile)).toEqual(expected[profile][role]);
      }
    }
  });

  it("balanced の markdown table が全 role を含む", () => {
    const table = buildPanelCountHintTable("balanced");
    expect(table).toContain("## Panel Count Hints (balanced)");
    for (const role of roles) {
      const hint = expected.balanced[role];
      expect(table).toContain(`| ${role} | ${hint.min} | ${hint.max} | ${hint.preferred} |`);
    }
  });

  it("cinematic / clarity-first の差分が table に反映される", () => {
    expect(buildPanelCountHintTable("cinematic")).toContain("| opening_hook | 0 | 3 | 2 |");
    expect(buildPanelCountHintTable("cinematic")).toContain("| cliffhanger | 0 | 3 | 2 |");
    expect(buildPanelCountHintTable("cinematic")).toContain("| reveal | 1 | 4 | 3 |");
    expect(buildPanelCountHintTable("clarity-first")).toContain("| action | 4 | 4 | 4 |");
    expect(buildPanelCountHintTable("clarity-first")).toContain("| buildup | 5 | 6 | 5 |");
  });
});

describe("validatePanelCount", () => {
  it("範囲内なら ok", () => {
    expect(validatePanelCount({ page_role: "reveal", panels: [1, 2, 3] })).toEqual({ ok: true });
  });

  it("逸脱なら warning を返す", () => {
    const result = validatePanelCount({ page_role: "dialogue", panels: [1, 2, 3, 4] });
    expect(result.ok).toBe(false);
    expect(result.warning).toContain("page_role=dialogue");
    expect(result.warning).toContain("count=4 outside 5-7");
  });
});
