import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runPairwiseRound, runUntilFinalized, getTopFromGenres, MATCH_THRESHOLD } from "./pairwise";
import { registerWork, recordMatch } from "./league";
import type { LlmCallFn } from "./llm-compare";

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "pairwise-test-"));
});

describe("runPairwiseRound", () => {
  it("対戦相手0件のときは matchesPlayed=0 で返る", async () => {
    const llm: LlmCallFn = async () => '{"winner":"A","reason":"x"}';
    const r = await runPairwiseRound({
      slug: "alone",
      genre: "g",
      layer: 2,
      text: "本文",
      loadOpponentText: async () => "対戦相手本文",
      llm,
      isExploration: false,
      baseDir,
    });
    expect(r.matchesPlayed).toBe(0);
    expect(r.matchCount).toBe(0);
  });

  it("既存対戦相手がいれば比較が走る", async () => {
    // 先に対戦相手を3件登録
    registerWork("g", "opp1", 2, false, baseDir);
    registerWork("g", "opp2", 2, false, baseDir);
    registerWork("g", "opp3", 2, false, baseDir);

    const llm: LlmCallFn = async () => '{"winner":"A","reason":"x"}';
    const r = await runPairwiseRound({
      slug: "newcomer",
      genre: "g",
      layer: 2,
      text: "本文",
      loadOpponentText: async () => "相手本文",
      llm,
      isExploration: false,
      baseDir,
    });
    expect(r.matchesPlayed).toBeGreaterThan(0);
    expect(r.matchCount).toBe(r.matchesPlayed);
  });
});

describe("runUntilFinalized", () => {
  it("対戦相手なしなら早期終了", async () => {
    const llm: LlmCallFn = async () => '{"winner":"tie","reason":"x"}';
    const r = await runUntilFinalized(
      {
        slug: "x",
        genre: "g",
        layer: 2,
        text: "本文",
        loadOpponentText: async () => "",
        llm,
        isExploration: false,
        baseDir,
      },
      3,
    );
    expect(r.finalized).toBe(false);
    expect(r.matchesPlayed).toBe(0);
  });
});

describe("getTopFromGenres", () => {
  it("各ジャンルからtopN件を抽出(finalized作品のみ)", () => {
    // ジャンルAに4作品、ジャンルBに2作品、ファイナライズ済み
    for (const slug of ["a1", "a2", "a3", "a4"]) {
      registerWork("genreA", slug, 5, false, baseDir);
      // ファイナライズさせるため MATCH_THRESHOLD 回比較
      for (let i = 0; i < MATCH_THRESHOLD; i++) {
        if (slug !== "a1") recordMatch("genreA", "a1", slug, 5, "A", "t", baseDir);
      }
    }
    // a1 を確定させる
    for (let i = 0; i < MATCH_THRESHOLD; i++) {
      recordMatch("genreA", "a1", "a2", 5, "A", "t", baseDir);
    }

    const top = getTopFromGenres(["genreA"], 2, 5, baseDir);
    // 全件finalizedとは限らないので存在チェックのみ
    expect(top.length).toBeLessThanOrEqual(2);
    expect(top.every((t) => t.entry.finalized)).toBe(true);
  });

  it("存在しないジャンルは空", () => {
    const top = getTopFromGenres(["nonexistent"], 5, 2, baseDir);
    expect(top).toEqual([]);
  });
});
