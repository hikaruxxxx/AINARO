import { describe, it, expect } from "vitest";
import {
  minhash,
  jaccardEstimate,
  jaccardExact,
  detectTemplateClusters,
} from "./template-detector";

function bigramSet(text: string): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i <= text.length - 2; i++) s.add(text.slice(i, i + 2));
  return s;
}

describe("jaccardExact", () => {
  it("完全一致は1.0", () => {
    const a = bigramSet("追放された薬師が辺境で薬草園を開く");
    expect(jaccardExact(a, a)).toBe(1);
  });
  it("無関係な文字列は低い", () => {
    const a = bigramSet("追放された薬師が辺境で薬草園を開く");
    const b = bigramSet("宇宙海賊が銀河を駆け巡る冒険譚");
    expect(jaccardExact(a, b)).toBeLessThan(0.1);
  });
});

describe("minhash + jaccardEstimate", () => {
  it("完全一致は推定1.0近く", () => {
    const a = bigramSet("追放された薬師が辺境で薬草園を開く物語");
    const sigA = minhash(a);
    expect(jaccardEstimate(sigA, sigA)).toBe(1);
  });
  it("類似テキストは高い類似度", () => {
    const a = bigramSet(
      "追放された薬師が辺境で薬草園を開いて貴族から引っ張りだこになる",
    );
    const b = bigramSet(
      "追放された薬師が辺境で薬草園を開いて貴族から重宝される",
    );
    const sim = jaccardEstimate(minhash(a), minhash(b));
    expect(sim).toBeGreaterThan(0.4);
  });
  it("無関係なテキストは低い類似度", () => {
    const a = bigramSet("追放された薬師が辺境で薬草園を開く");
    const b = bigramSet("宇宙海賊が銀河を駆け巡る冒険譚");
    const sim = jaccardEstimate(minhash(a), minhash(b));
    expect(sim).toBeLessThan(0.2);
  });
});

describe("detectTemplateClusters", () => {
  it("作品が2件未満なら空", () => {
    const r = detectTemplateClusters([{ slug: "a", text: "テスト本文" }]);
    expect(r.clusters).toEqual([]);
  });

  it("テンプレ群を検出する(冒頭ほぼ同一の3作品)", () => {
    const template = "婚約破棄されたヒロインは静かに会場を後にした。冷たい風が頬を撫でる中、彼女は心の中で誓った。もう、誰にも頼らないと。新たな道を歩むのだ。";
    const works = [
      { slug: "a", text: template + " 続きは異なる展開A" },
      { slug: "b", text: template + " 続きは異なる展開B" },
      { slug: "c", text: template + " 続きは異なる展開C" },
      { slug: "d", text: "全く別の物語。追放された薬師が辺境で薬草園を開く" },
      { slug: "e", text: "宇宙を駆ける海賊が銀河の謎を追う物語" },
    ];
    const r = detectTemplateClusters(works);
    expect(r.clusters.length).toBeGreaterThanOrEqual(1);
    // a/b/c は同一クラスタに入るべき
    const cluster = r.clusters.find((c) => c.members.includes("a"));
    expect(cluster).toBeDefined();
    expect(cluster!.members).toContain("b");
    expect(cluster!.members).toContain("c");
    expect(cluster!.members).not.toContain("d");
    expect(cluster!.members).not.toContain("e");
  });

  it("互いに無関係な作品は1件もフラグされない", () => {
    const works = [
      { slug: "a", text: "追放された薬師が辺境で薬草園を開いて貴族から引っ張りだこになる物語" },
      { slug: "b", text: "宇宙海賊が銀河を駆け巡り未知の星を発見する冒険譚" },
      { slug: "c", text: "現代日本の高校生が異能に目覚めて世界の謎を追う" },
      { slug: "d", text: "悪役令嬢が3周目のループで真犯人を暴き出す復讐譚" },
    ];
    const r = detectTemplateClusters(works);
    expect(r.flaggedSlugs.length).toBe(0);
  });
});
