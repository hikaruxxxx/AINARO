import { describe, expect, it } from "vitest";
import { lintName, staticLintName } from "./name-lint";

type PanelPatch = Partial<{
  panel_no: number;
  reading_order: number;
  action: string;
  key_visual: string;
  shot_type: string;
  camera: string;
  importance: number;
  dialogue: unknown[];
  monologue: unknown[];
  narration: unknown[];
}>;

function panel(n: number, patch: PanelPatch = {}) {
  return {
    panel_id: `p${String(n).padStart(2, "0")}`,
    panel_no: n,
    reading_order: n,
    action: `action ${n} unique movement`,
    key_visual: `visual ${n} unique image`,
    shot_type: "wide",
    camera: n % 2 === 0 ? "high_angle" : "eye_level",
    importance: 4,
    dialogue: [],
    monologue: [],
    narration: [],
    ...patch,
  };
}

function input(panels: unknown[], pageRole = "buildup") {
  return {
    storyboard: {
      pages: [
        {
          page_no: 1,
          page_role: pageRole,
          panels,
        },
      ],
    },
    pagePlan: {
      pages: [
        {
          page_no: 1,
          page_role: pageRole,
          panels: [],
        },
      ],
    },
    sceneGraph: {},
    brief: "",
    bible: {},
  };
}

function rulesFor(panels: unknown[], pageRole = "buildup"): string[] {
  return staticLintName(input(panels, pageRole)).map((finding) => finding.rule);
}

describe("staticLintName", () => {
  it("detects placeholder_text in action", () => {
    const findings = staticLintName(
      input([
        panel(1, {
          action: "S01 (introduce/establishing) panel 1/12: placeholder",
          key_visual: "distinct visual",
        }),
      ]),
    );

    expect(findings).toContainEqual(expect.objectContaining({ severity: "fatal", rule: "placeholder_text" }));
  });

  it("detects panel_content_duplicate for identical action", () => {
    const findings = staticLintName(
      input([
        panel(1, { action: "レンが濡れたレジ横で同じ棚を見つめる" }),
        panel(2, { action: "レンが濡れたレジ横で同じ棚を見つめる" }),
      ]),
    );

    expect(findings).toContainEqual(expect.objectContaining({ severity: "warn", rule: "panel_content_duplicate" }));
  });

  it("does not detect panel_content_duplicate for different action", () => {
    expect(
      rulesFor([
        panel(1, { action: "レンがレジ横でスマホの通知を見る", key_visual: "青い画面の反射" }),
        panel(2, { action: "灯里のニュース映像が天井テレビに映る", key_visual: "白い字幕が揺れるテレビ" }),
      ]),
    ).not.toContain("panel_content_duplicate");
  });

  it("detects shot_type_diversity_low for five close ups", () => {
    expect(
      rulesFor([
        panel(1, { shot_type: "close_up" }),
        panel(2, { shot_type: "close_up" }),
        panel(3, { shot_type: "close_up" }),
        panel(4, { shot_type: "close_up" }),
        panel(5, { shot_type: "close_up" }),
      ]),
    ).toContain("shot_type_diversity_low");
  });

  it("does not detect shot_type_diversity_low for diverse shots", () => {
    expect(
      rulesFor([
        panel(1, { shot_type: "establishing" }),
        panel(2, { shot_type: "wide" }),
        panel(3, { shot_type: "medium" }),
        panel(4, { shot_type: "close_up" }),
        panel(5, { shot_type: "insert" }),
      ]),
    ).not.toContain("shot_type_diversity_low");
  });

  it("detects camera_angle_static for one camera angle", () => {
    expect(
      rulesFor([
        panel(1, { camera: "eye_level" }),
        panel(2, { camera: "eye_level" }),
        panel(3, { camera: "eye_level" }),
      ]),
    ).toContain("camera_angle_static");
  });

  it("detects importance_flat when no hero panel exists", () => {
    expect(
      rulesFor([
        panel(1, { importance: 2 }),
        panel(2, { importance: 2 }),
        panel(3, { importance: 2 }),
        panel(4, { importance: 2 }),
      ]),
    ).toContain("importance_flat");
  });

  it("detects importance_overload when three hero panels exist", () => {
    expect(
      rulesFor([
        panel(1, { importance: 4 }),
        panel(2, { importance: 4 }),
        panel(3, { importance: 5 }),
      ]),
    ).toContain("importance_overload");
  });

  it("detects establishing_misplaced on final panel", () => {
    expect(
      rulesFor([
        panel(1, { shot_type: "wide" }),
        panel(2, { shot_type: "medium" }),
        panel(3, { shot_type: "establishing" }),
      ]),
    ).toContain("establishing_misplaced");
  });

  it("detects cliff_panel_too_many for five-panel cliffhanger", () => {
    expect(
      rulesFor([
        panel(1),
        panel(2),
        panel(3),
        panel(4),
        panel(5),
      ], "cliffhanger"),
    ).toContain("cliff_panel_too_many");
  });

  it("does not detect cliff_panel_too_many for two-panel cliffhanger", () => {
    expect(rulesFor([panel(1), panel(2)], "cliffhanger")).not.toContain("cliff_panel_too_many");
  });

  it("detects action_panel_too_few for short action page", () => {
    expect(rulesFor([panel(1), panel(2), panel(3)], "action")).toContain("action_panel_too_few");
  });

  it("detects dialogue_overflow for long dialogue text", () => {
    expect(
      rulesFor([
        panel(1, {
          dialogue: [
            {
              speaker: "レン",
              text: "これは六十字を大きく超える長い台詞で、ひとつのコマに入れるには情報量が多すぎるため読みづらくなる想定の文章です。さらに説明を重ねて百字近くまで伸ばします。",
            },
          ],
        }),
      ]),
    ).toContain("dialogue_overflow");
  });

  it("detects dialogue_overflow for too many text lines", () => {
    expect(
      rulesFor([
        panel(1, {
          dialogue: [{ text: "a" }, { text: "b" }],
          monologue: [{ text: "c" }, { text: "d" }],
          narration: [{ text: "e" }],
        }),
      ]),
    ).toContain("dialogue_overflow");
  });
});

describe("lintName", () => {
  it("returns a NameLintReport", async () => {
    const report = await lintName({
      ...input([
        panel(1, { action: "S01 (introduce/establishing) panel 1/12: placeholder" }),
        panel(2),
      ]),
      slug: "test-slug",
      episode: 1,
    });

    expect(report).toEqual(
      expect.objectContaining({
        schema_version: 1,
        slug: "test-slug",
        episode: 1,
        pages_total: 1,
        fatal_count: 1,
        summary: expect.stringMatching(/^fatal=\d+ warn=\d+ info=\d+$/),
      }),
    );
    expect(report.findings).toContainEqual(expect.objectContaining({ rule: "placeholder_text" }));
  });
});
