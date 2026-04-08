// Layer 1〜6 の wiring を mock claude-cli で検証する smoke test
//
// 実LLMを呼ばず、各層が前提ファイルを読み・プロンプトを構築し・
// 結果を保存するチェーンが破綻なく動くかを確認する。

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// claude-cli を mock(全層共通)
vi.mock("../claude-cli", () => {
  return {
    callClaudeCli: vi.fn(async (prompt: string) => {
      // 各層プロンプト固有のマーカーで識別
      // Layer 4: 「各話構成」を出力指示に含む
      if (prompt.includes("ep1〜ep15程度")) {
        const eps = Array.from({ length: 12 }, (_, i) => `### ep${i + 1}: タイトル${i + 1}\n- 出来事${i + 1}\n- 引きの方向${i + 1}`).join("\n\n");
        return [
          "## 第1アーク概要",
          "追放から再起までの第1アーク。",
          "## 各話構成",
          eps,
          "## アーク完結後の状態",
          "次アークへの引き。",
        ].join("\n\n");
      }
      // Layer 2: 「プロット骨格を構築」
      if (prompt.includes("第1アークのプロット骨格を構築")) {
        return [
          "## 起点",
          "主人公は王宮薬師として勤めていたが無能扱いされていた。",
          "## 転換点1",
          "ある日、無実の罪で追放される。",
          "## 転換点2",
          "辺境で薬草園を開く決意を固める。",
          "## 第1アーク完結",
          "薬草園が貴族から評価され生活が安定する。",
          "## 全体引き",
          "王宮で薬不足が発生し、主人公の名が再び呼ばれ始める。",
        ].join("\n\n");
      }
      // Layer 3: 「あらすじ作家」
      if (prompt.includes("あらすじ作家")) {
        return "追放された薬師アレンは辺境で新たな生活を始める。" + "彼は薬草の知識を活かして薬草園を開き、地域の人々を癒していく。".repeat(20);
      }
      // Layer 1: 「ログライン作家」
      if (prompt.includes("ログライン作家")) {
        return '{"logline": "追放された薬師が辺境で薬草園を開き貴族から重宝される物語"}';
      }
      // Layer 5/6: ep本文(4500字以上)
      return "本文ダミー。".repeat(800);
    }),
    extractJsonBlock: vi.fn((text: string) => {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }),
    ClaudeCallError: class extends Error {},
  };
});

// throttle.recordUsage を mock(ファイル書き込み回避)
vi.mock("../throttle", () => ({
  recordUsage: vi.fn(),
  estimateTokens: vi.fn(() => 100),
  throttleBeforeCall: vi.fn(async () => ({ slept: 0, reason: "ok" })),
  DEFAULT_THROTTLE_CONFIG: { tokenLimit5h: 1_000_000, logPath: "/tmp/test" },
}));

// 各層を import(mock より後)
import { runLayer1 } from "./layer1-logline";
import { runLayer2 } from "./layer2-plot";
import { runLayer3 } from "./layer3-synopsis";
import { runLayer4 } from "./layer4-arc-plot";
import { runLayer5 } from "./layer5-ep1";
import { runLayer6 } from "./layer6-ep23";

let worksDir: string;
const slug = "smoke-test-001";

beforeEach(() => {
  worksDir = mkdtempSync(join(tmpdir(), "layers-smoke-"));
  const workDir = join(worksDir, slug);
  mkdirSync(workDir, { recursive: true });
  // _meta.json を準備
  const meta = {
    slug,
    seed: {
      fingerprint: "rewarded|isekai_tsuiho_zamaa|追放された|スキル覚醒",
      primaryDesire: "rewarded",
      secondaryDesire: "revenge",
      genre: "isekai_tsuiho_zamaa",
      tags: {
        境遇: "追放された",
        転機: "スキル覚醒",
        方向: "成り上がり",
        フック: "ざまぁ",
      },
      isExploration: false,
      createdAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(workDir, "_meta.json"), JSON.stringify(meta, null, 2));
});

describe("Layer 1〜6 smoke test", () => {
  it("Layer 1: logline生成して layer1_logline.md を作る", async () => {
    const r = await runLayer1(slug, worksDir);
    expect(r.ok).toBe(true);
    expect(r.logline).toBeTruthy();
    expect(existsSync(join(worksDir, slug, "layer1_logline.md"))).toBe(true);
  });

  it("Layer 1〜2 のチェーン", async () => {
    expect((await runLayer1(slug, worksDir)).ok).toBe(true);
    const r2 = await runLayer2(slug, worksDir);
    expect(r2.ok).toBe(true);
    expect(existsSync(join(worksDir, slug, "layer2_plot.md"))).toBe(true);
  });

  it("Layer 1〜3 のチェーン", async () => {
    expect((await runLayer1(slug, worksDir)).ok).toBe(true);
    expect((await runLayer2(slug, worksDir)).ok).toBe(true);
    const r3 = await runLayer3(slug, worksDir);
    expect(r3.ok).toBe(true);
    expect(existsSync(join(worksDir, slug, "layer3_synopsis.md"))).toBe(true);
  });

  it("Layer 1〜4 のチェーン", async () => {
    await runLayer1(slug, worksDir);
    await runLayer2(slug, worksDir);
    await runLayer3(slug, worksDir);
    const r4 = await runLayer4(slug, worksDir);
    expect(r4.ok).toBe(true);
    expect(existsSync(join(worksDir, slug, "layer4_arc1_plot.md"))).toBe(true);
  });

  it("Layer 1〜5 のチェーン", async () => {
    await runLayer1(slug, worksDir);
    await runLayer2(slug, worksDir);
    await runLayer3(slug, worksDir);
    await runLayer4(slug, worksDir);
    const r5 = await runLayer5(slug, worksDir);
    expect(r5.ok).toBe(true);
    expect(r5.charCount).toBeGreaterThanOrEqual(3500);
    expect(existsSync(join(worksDir, slug, "layer5_ep001.md"))).toBe(true);
  });

  it("Layer 1〜6 のフルチェーン(ep2-3まで)", async () => {
    await runLayer1(slug, worksDir);
    await runLayer2(slug, worksDir);
    await runLayer3(slug, worksDir);
    await runLayer4(slug, worksDir);
    await runLayer5(slug, worksDir);
    const r6 = await runLayer6(slug, worksDir);
    expect(r6.ok).toBe(true);
    expect(existsSync(join(worksDir, slug, "layer6_ep002.md"))).toBe(true);
    expect(existsSync(join(worksDir, slug, "layer6_ep003.md"))).toBe(true);
  });

  it("前提ファイル欠落で Layer 2 は失敗する", async () => {
    const r = await runLayer2(slug, worksDir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("prereq_missing");
  });
});
