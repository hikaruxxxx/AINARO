import { describe, expect, it } from "vitest";
import { buildAgentPrompt, parseArgs } from "./evaluate-and-rewrite";

describe("evaluate-and-rewrite", () => {
  it("Agent 用 prompt に対象情報、コンテキスト、JSON schema を含める", () => {
    const prompt = buildAgentPrompt({
      slug: "a07-modern-dungeon",
      targetId: "char_reiji_v1",
      scope: "character",
      field: "psychology_deep",
      bible: {
        meta: { title: "Fixture", core_hook: { one_liner: "hidden rule voice" } },
        world: { premise: "rank system premise" },
        depth_spec: { psychology_deep: { min: 1200, ideal: 3600 } },
        characters: [
          {
            id: "char_reiji_v1",
            name: "氷室 玲二",
            role: "antagonist",
            backstory: "Sランク部隊の検証主義者",
            psychology_deep: "現状テキスト",
            origin_wound_deep: "妹の事故と予備鑑定の誤表示",
          },
        ],
      },
    });

    expect(prompt).toContain("# AINARO 漫画 bible 文書評価タスク");
    expect(prompt).toContain("- target_id: char_reiji_v1");
    expect(prompt).toContain("- character_name: 氷室 玲二");
    expect(prompt).toContain("- character_role: antagonist");
    expect(prompt).toContain("- 字数 min/ideal: 1200 / 3600");
    expect(prompt).toContain("origin_wound_deep: 妹の事故");
    expect(prompt).toContain("現状テキスト");
    expect(prompt).toContain('"needs_rewrite": true');
    expect(prompt).toContain("rewritten_text は ideal 字数を目指す");
    expect(prompt).toContain("## ⚠️ 厳守ルール (hallucination 防止)");
    expect(prompt).toContain("**キャラ名厳守**");
    expect(prompt).toContain("**新規固有名詞の禁止**");
    expect(prompt).toContain("**既存設定の優先**");
  });

  it("parseArgs は emit-prompt default と required flags を扱う", () => {
    expect(
      parseArgs([
        "--slug",
        "a07-modern-dungeon",
        "--target-id",
        "char_氷室_玲二_v1",
        "--scope",
        "character",
        "--field",
        "psychology_deep",
      ]),
    ).toEqual({
      slug: "a07-modern-dungeon",
      targetId: "char_氷室_玲二_v1",
      scope: "character",
      field: "psychology_deep",
      emitPrompt: "/tmp/bible-eval-prompt.md",
    });
  });
});
