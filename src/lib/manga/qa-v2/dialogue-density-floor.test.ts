import { describe, expect, it } from "vitest";
import type { EpisodeStoryboardV2, PageRoleV2, StoryboardPageV2 } from "../schemas-v2";
import {
  auditPageDensity,
  auditStoryboardDensity,
  buildDialogueDensityFloorDirective,
  DEFAULT_DIALOGUE_DENSITY_FLOORS,
} from "./dialogue-density-floor";

function buildPage(
  page_role: PageRoleV2,
  texts: {
    dialogue?: string[];
    monologue?: string[];
    narration?: string[];
    sfx?: string[];
  } = {},
): StoryboardPageV2 {
  return {
    page_no: 1,
    page_role,
    panels: [
      {
        panel_id: "p1",
        panel_no: 1,
        reading_order: 1,
        shot_type: "medium",
        camera: "eye_level",
        bleed: false,
        silence: false,
        importance: 3,
        entities: {
          characters: [],
          location_id: "loc_test",
          props: [],
          focus_entity_id: "loc_test",
        },
        action: "test",
        key_visual: "test",
        dialogue: (texts.dialogue ?? []).map((text, i) => ({
          character_id: `char_${i + 1}`,
          text,
        })),
        monologue: (texts.monologue ?? []).map((text, i) => ({
          character_id: `char_${i + 1}`,
          text,
        })),
        narration: texts.narration ?? [],
        sfx: texts.sfx ?? [],
      },
    ],
  } as unknown as StoryboardPageV2;
}

describe("dialogue-density-floor", () => {
  it("dialogue page で dialogue 0 行は dialogue_floor_below + text_total_floor_below を検出", () => {
    const page = buildPage("dialogue", { narration: ["test"] });
    const findings = auditPageDensity(page);
    expect(findings.some((f) => f.kind === "dialogue_floor_below")).toBe(true);
    expect(findings.some((f) => f.kind === "text_total_floor_below")).toBe(true);
    const dlgFinding = findings.find((f) => f.kind === "dialogue_floor_below")!;
    expect(dlgFinding.found).toBe(0);
    expect(dlgFinding.expected_min).toBe(3);
  });

  it("dialogue page で dialogue 3 + narration 1 行は findings 0 (text_total=4 で v57 floor 4 ぎり通過)", () => {
    const page = buildPage("dialogue", {
      dialogue: ["a", "b", "c"],
      narration: ["x"],
    });
    const findings = auditPageDensity(page);
    expect(findings).toHaveLength(0);
  });

  it("opening_hook で narration 1 行のみは narration_min=1 を満たすが text_total_min=2 で warning", () => {
    const page = buildPage("opening_hook", { narration: ["a"] });
    const findings = auditPageDensity(page);
    expect(findings.some((f) => f.kind === "narration_floor_below")).toBe(false);
    expect(findings.some((f) => f.kind === "text_total_floor_below")).toBe(true);
  });

  it("v57: opening_hook で monologue+narration が上限 4 を超えると mono_narration_over_cap を検出", () => {
    const page = buildPage("opening_hook", {
      monologue: ["a", "b", "c"],
      narration: ["x", "y"],
    });
    const findings = auditPageDensity(page);
    const cap = findings.find((f) => f.kind === "mono_narration_over_cap");
    expect(cap).toBeDefined();
    expect(cap!.found).toBe(5);
    expect(cap!.expected_min).toBe(4);
  });

  it("v57: opening_hook で monologue+narration が上限ちょうど (4) なら cap finding なし", () => {
    const page = buildPage("opening_hook", {
      dialogue: ["a"],
      monologue: ["m", "n"],
      narration: ["x", "y"],
    });
    const findings = auditPageDensity(page);
    expect(findings.some((f) => f.kind === "mono_narration_over_cap")).toBe(false);
  });

  it("v57: dialogue page には mono_narration_max がない (会話 page の narration は floor のみ)", () => {
    const page = buildPage("dialogue", {
      dialogue: ["a", "b", "c"],
      narration: ["1", "2", "3", "4", "5", "6"],
    });
    const findings = auditPageDensity(page);
    expect(findings.some((f) => f.kind === "mono_narration_over_cap")).toBe(false);
  });

  it("action page で SFX 3 + dialogue 1 は OK (擬音メインで text 緩和)", () => {
    const page = buildPage("action", {
      dialogue: ["ガッ"],
      sfx: ["ドン", "ガン", "バキ"],
    });
    const findings = auditPageDensity(page);
    expect(findings).toHaveLength(0);
  });

  it("action page で SFX 1 件は sfx_floor_below を検出", () => {
    const page = buildPage("action", { sfx: ["ドン"], narration: ["test"] });
    const findings = auditPageDensity(page);
    expect(findings.some((f) => f.kind === "sfx_floor_below")).toBe(true);
  });

  it("buildup で dialogue+monologue=0 は dialogue_or_monologue_floor_below を検出", () => {
    const page = buildPage("buildup", { narration: ["x", "y", "z"] });
    const findings = auditPageDensity(page);
    expect(findings.some((f) => f.kind === "dialogue_or_monologue_floor_below")).toBe(true);
  });

  it("auditStoryboardDensity: 複数 page の集計と pageCounts が正しく返る", () => {
    const sb: EpisodeStoryboardV2 = {
      pages: [
        { ...buildPage("dialogue", { narration: ["a"] }), page_no: 1 },
        { ...buildPage("action", { sfx: ["ドン", "ガン", "バキ"], dialogue: ["a"] }), page_no: 2 },
      ],
    } as unknown as EpisodeStoryboardV2;

    const result = auditStoryboardDensity(sb);
    expect(result.totalPages).toBe(2);
    expect(result.pageCounts).toHaveLength(2);
    expect(result.pageCounts[0].total_text).toBe(1);
    expect(result.pageCounts[1].total_text).toBe(1);
    expect(result.findings.some((f) => f.page_no === 1)).toBe(true);
    expect(result.findings.some((f) => f.page_no === 2)).toBe(false);
  });

  it("DEFAULT_DIALOGUE_DENSITY_FLOORS は全 page_role を網羅", () => {
    const allRoles: PageRoleV2[] = [
      "opening_hook",
      "buildup",
      "reveal",
      "cliffhanger",
      "aftermath",
      "establishing",
      "dialogue",
      "action",
    ];
    for (const role of allRoles) {
      expect(DEFAULT_DIALOGUE_DENSITY_FLOORS[role]).toBeDefined();
    }
  });

  describe("Sprint 20 案1: buildDialogueDensityFloorDirective (L04 prompt 用)", () => {
    it("page_role 全 8 種類の下限を含む directive を生成", () => {
      const directive = buildDialogueDensityFloorDirective();
      expect(directive).toContain("## Page Role Density Floor");
      expect(directive).toContain("opening_hook");
      expect(directive).toContain("dialogue (会話で物語進行)");
      expect(directive).toContain("dialogue ≥ 3");
      expect(directive).toContain("text 合計 (dialogue+monologue+narration) ≥ 4");
      expect(directive).toContain("action");
      expect(directive).toContain("SFX ≥ 3");
      // v57: 前半 page_role の独白・地の文上限が directive に出る
      expect(directive).toContain("monologue+narration ≤ 4 (上限)");
      expect(directive).toContain("monologue+narration ≤ 3 (上限)");
    });

    it("directive に不足時の補強パターン (off-frame voice / システム音声等) を含む", () => {
      const directive = buildDialogueDensityFloorDirective();
      expect(directive).toContain("off-frame voice");
      expect(directive).toContain("システム音声");
      expect(directive).toContain("リアクション dialogue");
      expect(directive).toContain("会話していない会話シーン");
    });

    it("audit との同期メッセージを含む (生成 → 検証の整合性担保)", () => {
      const directive = buildDialogueDensityFloorDirective();
      expect(directive).toContain("audit-dialogue-density");
    });
  });
});
