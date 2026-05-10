import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCodexText } from "../llm/codex-text";
import { lintName, llmLintName, staticLintName } from "./name-lint";

vi.mock("../llm/codex-text", () => ({
  runCodexText: vi.fn(),
}));

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

function sceneGraph() {
  return {
    scenes: [
      {
        scene_id: "S01",
        page_range: { start: 1, end: 1 },
        panel_range: { start_panel_no: 1, end_panel_no: 2 },
        beat_type: "introduce",
        mode: "establishing",
        arc_position: { arc_phase: "introduce", arc_position_normalized: 0.01 },
        cast: [{ character_id: "char_ren", presence: "in_person" }],
        dialogue_plan: { key_lines: [{ speaker: "char_ren", text: "夜勤明けだ。" }] },
      },
    ],
  };
}

beforeEach(() => {
  vi.mocked(runCodexText).mockReset();
});

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

  it("does not detect panel_content_duplicate for very short matching text", () => {
    expect(
      rulesFor([
        panel(1, { action: "夜", key_visual: "廊下" }),
        panel(2, { action: "夜", key_visual: "廊下" }),
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

  it("detects monologue_repetition for three consecutive monologues by the same character", () => {
    const findings = staticLintName(
      input([
        panel(1, { monologue: [{ speaker: "char_ren", text: "まだ終わらない。" }] }),
        panel(2, { monologue: [{ speaker: "char_ren", text: "また同じだ。" }] }),
        panel(3, { monologue: [{ speaker: "char_ren", text: "朝が遠い。" }] }),
      ]),
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "info",
        scope: "panel",
        panel_no: 3,
        rule: "monologue_repetition",
      }),
    );
  });

  it("does not detect monologue_repetition for two consecutive monologues", () => {
    expect(
      rulesFor([
        panel(1, { monologue: [{ speaker: "char_ren", text: "まだ終わらない。" }] }),
        panel(2, { monologue: [{ speaker: "char_ren", text: "また同じだ。" }] }),
        panel(3, { monologue: [{ speaker: "char_akari", text: "急がないと。" }] }),
      ]),
    ).not.toContain("monologue_repetition");
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
      skipLlm: true,
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

  it("does not call LLM when skipLlm is true", async () => {
    await lintName({
      ...input([panel(1), panel(2)]),
      sceneGraph: sceneGraph(),
      slug: "test-slug",
      episode: 1,
      skipLlm: true,
    });

    expect(runCodexText).not.toHaveBeenCalled();
  });

  it("adds an info finding when LLM judge fails", async () => {
    vi.mocked(runCodexText).mockRejectedValue(new Error("codex unavailable"));

    const report = await lintName({
      ...input([panel(1), panel(2)]),
      sceneGraph: sceneGraph(),
      slug: "test-slug",
      episode: 1,
    });

    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "info",
        scope: "episode",
        rule: "llm_judge_failed",
      }),
    );
  });
});

describe("llmLintName", () => {
  it("converts LlmJudgeOutput to NameLintFinding entries", async () => {
    vi.mocked(runCodexText).mockResolvedValue({
      stdout: "{}",
      parsed: {
        overall_assessment: "shallow",
        rationale: "感情の変化が薄い。",
        shallowness_findings: [
          {
            severity: "warn",
            scope: "panel",
            page_no: 1,
            panel_no: 2,
            rule: "emotion_arc_flat",
            message: "レンの反応が説明に寄りすぎている。",
            hint: "表情か手元の変化で感情を出す。",
          },
        ],
      },
      attempts: 1,
      totalDurationMs: 1,
    });

    const findings = await llmLintName({
      storyboard: input([panel(1), panel(2)]).storyboard,
      sceneGraph: sceneGraph(),
      bible: { meta: { genre: "modern_dungeon", subtype: "external_social", core_hook: { one_liner: "ナビだけが最短攻略を知る" } } },
      cwd: "/tmp",
    });

    expect(runCodexText).toHaveBeenCalledTimes(1);
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "info",
        scope: "episode",
        scene_id: "S01",
        rule: "overall_assessment",
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "warn",
        scope: "panel",
        page_no: 1,
        panel_no: 2,
        scene_id: "S01",
        rule: "emotion_arc_flat",
      }),
    );
  });
});
