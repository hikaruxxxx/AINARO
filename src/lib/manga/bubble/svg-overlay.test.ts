import { describe, expect, it } from "vitest";
import { renderBubbleOverlay, type SvgBubble } from "./svg-overlay";

function mkBubble(overrides: Partial<SvgBubble> & { text: string }): SvgBubble {
  return {
    position: { x: 100, y: 100, width: 200, height: 240 },
    text: overrides.text,
    bubble_type: overrides.bubble_type ?? "normal",
    reading_order: overrides.reading_order ?? 1,
    writing_mode: overrides.writing_mode,
    is_sfx: overrides.is_sfx,
  };
}

describe("renderBubbleOverlay — 横書き (既存挙動 regression guard)", () => {
  it("writing_mode 未指定は <text> を行ごとに出力し、tspan は使わない", () => {
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text: "Hello world" })],
    });
    expect(svg).toContain("<text");
    expect(svg).not.toContain("<tspan");
    expect(svg).not.toContain("writing-mode");
  });

  it("writing_mode=horizontal も明示で既存横書き path を通る", () => {
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text: "明示横書き", writing_mode: "horizontal" })],
    });
    expect(svg).not.toContain("<tspan");
  });
});

describe("renderBubbleOverlay — 縦書き (shells_only)", () => {
  it("writing_mode=vertical は <tspan> ベースの縦書き擬似実装を使う (CSS writing-mode 非依存)", () => {
    // 2026-05-19 Sprint 23 Commit 5: librsvg の writing-mode 解釈が二重 RTL となる現象を
    // 回避するため、CSS writing-mode は削除済み。tspan の x/dy のみで縦書きを組む。
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text: "先制で頭部、お願いします。", writing_mode: "vertical" })],
    });
    expect(svg).toContain("<tspan");
    expect(svg).not.toContain("writing-mode: vertical");
  });

  it("縦書き text は <tspan> を文字数分含む (毎文字 x/dy 明示で順序を確定)", () => {
    const text = "先制で頭部、お願いします。";
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text, writing_mode: "vertical" })],
    });
    const tspanCount = (svg.match(/<tspan\b/g) ?? []).length;
    expect(tspanCount).toBe(text.length);
  });

  it("列数は usableH / charHeight から算出され、列ごとに <text> が分割される", () => {
    // bubble height=240, padding=fontSize*0.6, fontSize=30 → usableH=240-36=204
    // charHeight=30*1.05=31.5 → charsPerCol=floor(204/31.5)=6 → text 13文字 / 6 = ceil(13/6)=3 列
    const text = "一二三四五六七八九十壱弐参";
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text, writing_mode: "vertical" })],
    });
    const textCount = (svg.match(/<text\b/g) ?? []).length;
    expect(textCount).toBe(3);
  });

  it("非常に長いテキストは adjColWidth fallback で usableW 内に収める", () => {
    // bubble width=200, padding=18 → usableW=164
    // 30文字 / charsPerCol=6 → 5 列、totalColsW=5*33=165 → わずかに超過 → adjColWidth 適用
    const text = "あ".repeat(30);
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text, writing_mode: "vertical" })],
    });
    // 列数 5 が出力されていること
    const textCount = (svg.match(/<text\b/g) ?? []).length;
    expect(textCount).toBe(5);
    // adjColWidth 適用後も全文字 tspan が出る
    expect((svg.match(/<tspan\b/g) ?? []).length).toBe(30);
  });
});

describe("renderBubbleOverlay — SFX (is_sfx=true)", () => {
  it("is_sfx=true は shape なしで data-bubble-type='sfx' の text-only group を出す", () => {
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text: "ガッ", is_sfx: true, bubble_type: "normal" })],
    });
    expect(svg).toContain('data-bubble-type="sfx"');
    // shape (rect / path) が出ないことを確認
    expect(svg).not.toContain("<rect");
    expect(svg).not.toContain("<path");
  });

  it("SFX text は paint-order='stroke' で halo (白縁 + 黒 fill) の 2 段重ねを出す", () => {
    const svg = renderBubbleOverlay({
      panelWidth: 500,
      panelHeight: 500,
      bubbles: [mkBubble({ text: "ドサ", is_sfx: true })],
    });
    expect(svg).toContain('paint-order="stroke"');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });
});
