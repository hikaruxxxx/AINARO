import { describe, expect, it } from "vitest";
import { normalizeMotifAnchors } from "./scoring-loop";

describe("normalizeMotifAnchors", () => {
  const a07Motifs = [
    { id: null, name: "黒のフードジャケット" },
    { id: null, name: "ヒビ入りのスマートフォン" },
    { id: null, name: "ひび割れた画面越しの世界" },
    { id: null, name: "朱色の公的光" },
    { id: null, name: "沈黙の白コマ" },
    { id: null, name: "ナビ青光" },
    { id: null, name: "数値オーバーレイの空枠" },
  ];

  it("exact match: 正しい motif name はそのまま", () => {
    const { anchors, stats } = normalizeMotifAnchors(
      [{ motif_id: "黒のフードジャケット", intensity: "clear" }],
      a07Motifs
    );
    expect(anchors).toEqual([{ motif_id: "黒のフードジャケット", intensity: "clear" }]);
    expect(stats.exact).toBe(1);
    expect(stats.substring).toBe(0);
    expect(stats.dropped).toBe(0);
  });

  it("substring match: description 文に含まれる motif name を canonical 化", () => {
    const wrong = "「朱色の公的光」は、白瀬灯里と探索者ユニット「朱」が背負わされている公認性、制度";
    const { anchors, stats } = normalizeMotifAnchors(
      [{ motif_id: wrong, intensity: "dominant" }],
      a07Motifs
    );
    expect(anchors).toEqual([{ motif_id: "朱色の公的光", intensity: "dominant" }]);
    expect(stats.substring).toBe(1);
    expect(stats.dropped).toBe(0);
  });

  it("substring match: 複数候補があれば最長 name を優先", () => {
    const wrong = "ひび割れた画面越しの世界と朱色の公的光が交差する";
    const { anchors } = normalizeMotifAnchors([{ motif_id: wrong }], a07Motifs);
    // 「ひび割れた画面越しの世界」が「朱色の公的光」より長いので優先する。
    expect(anchors[0].motif_id).toBe("ひび割れた画面越しの世界");
  });

  it("no match: drop して stats に積む", () => {
    const garbage = "顔を常に完全な影で隠し、感情が読めない謎キャラにするのは不可。";
    const { anchors, stats } = normalizeMotifAnchors(
      [{ motif_id: garbage }, { motif_id: "黒のフードジャケット" }],
      a07Motifs
    );
    expect(anchors).toHaveLength(1);
    expect(anchors[0].motif_id).toBe("黒のフードジャケット");
    expect(stats.dropped).toBe(1);
    expect(stats.exact).toBe(1);
  });

  it("id が指定されている motif は id 側を canonical key に使う", () => {
    const motifs = [{ id: "motif_blue", name: "ナビ青光" }];
    const { anchors } = normalizeMotifAnchors(
      [{ motif_id: "「ナビ青光」は不可視の情報" }],
      motifs
    );
    expect(anchors[0].motif_id).toBe("motif_blue");
  });

  it("空配列入力で空配列を返す", () => {
    const { anchors, stats } = normalizeMotifAnchors([], a07Motifs);
    expect(anchors).toEqual([]);
    expect(stats.exact).toBe(0);
    expect(stats.substring).toBe(0);
    expect(stats.dropped).toBe(0);
  });

  it("1 文字 motif name は substring 候補から除外", () => {
    const motifs = [{ id: null, name: "光" }, { id: null, name: "朱色の公的光" }];
    const { anchors } = normalizeMotifAnchors(
      [{ motif_id: "「朱色の公的光」が差す" }],
      motifs
    );
    // 1 文字 "光" は substring 候補にならず、6 文字 "朱色の公的光" が match する。
    expect(anchors[0].motif_id).toBe("朱色の公的光");
  });
});
