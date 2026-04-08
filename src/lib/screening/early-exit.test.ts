import { describe, it, expect } from "vitest";
import { earlyExitCheck } from "./early-exit";

function makeText(opts: {
  chars: number;
  dialogueChars?: number;
  withProperNoun?: boolean;
}): string {
  const filler = "あ".repeat(opts.chars - (opts.dialogueChars ?? 0));
  const dialogue = opts.dialogueChars ? "「" + "い".repeat(opts.dialogueChars - 2) + "」" : "";
  const noun = opts.withProperNoun ? "アリス王国 " : "";
  return noun + filler + dialogue;
}

describe("earlyExitCheck", () => {
  it("3000字未満は弾く", () => {
    const r = earlyExitCheck(makeText({ chars: 2000, dialogueChars: 200, withProperNoun: true }));
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("charCount");
  });

  it("会話比率5%未満は弾く", () => {
    const r = earlyExitCheck(makeText({ chars: 4000, dialogueChars: 50, withProperNoun: true }));
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("dialogueRatio<5%");
  });

  it("会話比率70%超は弾く", () => {
    const r = earlyExitCheck(makeText({ chars: 4000, dialogueChars: 3500, withProperNoun: true }));
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("dialogueRatio>70%");
  });

  it("固有名詞ゼロは弾く", () => {
    const r = earlyExitCheck(makeText({ chars: 4000, dialogueChars: 800, withProperNoun: false }));
    expect(r.pass).toBe(false);
    expect(r.reason).toContain("properNounCount");
  });

  it("条件を満たせばpass", () => {
    const r = earlyExitCheck(makeText({ chars: 4000, dialogueChars: 800, withProperNoun: true }));
    expect(r.pass).toBe(true);
  });
});
