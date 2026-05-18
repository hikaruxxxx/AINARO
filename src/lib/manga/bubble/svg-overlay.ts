/**
 * 吹き出し SVG オーバーレイ生成
 *
 * Phase 1 MVP: クライアント側で <svg viewBox="..."> を画像に重ねる方式。
 * SSR で生成するため、決定的に同じ SVG が出る純関数。
 *
 * Phase 2 で sharp を使ってサーバ側で画像に焼き込み 1 枚化する選択肢もあるが、
 * Phase 1 はオーバーレイで十分（デバッグしやすく差し戻しもしやすい）。
 */

import type { BubbleType } from "../types";
import type { BubblePosition } from "../schemas";

export type SvgBubble = {
  position: BubblePosition;
  text: string;
  bubble_type: BubbleType;
  reading_order: number;
  /**
   * "vertical" (Sprint 23): writing-mode: vertical-rl で縦書き (RTL 列順)。
   * "horizontal" (default): 既存横書き。
   * sfx (is_sfx=true) は writing_mode 関係なく専用 katakana 描画。
   */
  writing_mode?: "vertical" | "horizontal";
  /**
   * SFX (擬音) は shape なし、halo (白縁 + 黒 fill) 付き katakana の単体 text として描画する。
   * memory feedback_manga_overlay_halo_required.md に従い paint-order=stroke の 2 段重ね。
   */
  is_sfx?: boolean;
};

export type SvgOverlayOptions = {
  /** パネル原寸 (画像のピクセル幅/高さ) */
  panelWidth: number;
  panelHeight: number;
  bubbles: SvgBubble[];
  /** 指定時、bubble 描画をこの polygon にクリップする */
  clipPolygon?: [number, number][];
  /** clipPolygon 指定時の clipPath id。呼び出し側でユニークにする。 */
  clipPathId?: string;
  /** 日本語フォントスタック */
  fontFamily?: string;
};

const DEFAULT_FONT_FAMILY =
  '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 1 吹き出しの SVG group を返す
 */
function bubbleGroup(b: SvgBubble, fontFamily: string): string {
  // sfx は shape なし、halo 付き katakana の text-only として描画
  if (b.is_sfx) {
    return sfxGroup(b, fontFamily);
  }

  const { x, y, width, height, tail_x, tail_y } = b.position;
  const cornerRadius = 18;
  const fontSize = b.bubble_type === "shout" ? 36 : 30;

  // bubble_type で見た目分岐
  const fill = (() => {
    switch (b.bubble_type) {
      case "thought":
        return "#f5f5f4";
      case "narration":
        return "#fafaf9";
      case "shout":
        return "#fef2f2";
      case "whisper":
        return "#f4f4f5";
      default:
        return "#ffffff";
    }
  })();
  const stroke = b.bubble_type === "shout" ? "#7f1d1d" : "#0a0a0a";
  const strokeWidth = b.bubble_type === "shout" ? 5 : 3;

  // 吹き出し本体
  const isCloud = b.bubble_type === "thought";
  const isJagged = b.bubble_type === "shout";
  const isNarrationBox = b.bubble_type === "narration";

  let body: string;
  if (isJagged) {
    // ジャギーな叫び形（star-like）
    body = jaggedPath(x, y, width, height);
    body = `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="miter" />`;
  } else if (isCloud) {
    // 雲形
    body = cloudPath(x, y, width, height);
    body = `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  } else if (isNarrationBox) {
    body = `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  } else {
    body = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  // 尻尾
  let tail = "";
  if (
    !isNarrationBox &&
    !isCloud &&
    typeof tail_x === "number" &&
    typeof tail_y === "number"
  ) {
    const baseX = tail_x;
    const baseY = y + height;
    const tipX = tail_x;
    const tipY = tail_y;
    tail = `<polygon points="${baseX - 16},${baseY} ${baseX + 16},${baseY} ${tipX},${tipY}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  const textWeight = b.bubble_type === "shout" ? 800 : 500;
  const textColor = b.bubble_type === "shout" ? "#7f1d1d" : "#111111";

  // 縦書き / 横書きで text 構築を切替
  const textTags = b.writing_mode === "vertical"
    ? buildVerticalText(b.text, x, y, width, height, fontSize, fontFamily, textColor, textWeight)
    : buildHorizontalText(b.text, x, y, width, height, fontSize, fontFamily, textColor, textWeight);

  return `<g data-reading-order="${b.reading_order}" data-bubble-type="${b.bubble_type}">${body}${tail}${textTags}</g>`;
}

/**
 * 横書き text (既存挙動を切り出し)。中央揃えで文字単位に折返す。
 */
function buildHorizontalText(
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fontFamily: string,
  textColor: string,
  textWeight: number
): string {
  const charsPerLine = Math.max(6, Math.floor((width - 32) / fontSize));
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    lines.push(text.slice(cursor, cursor + charsPerLine));
    cursor += charsPerLine;
  }
  const textX = x + Math.round(width / 2);
  const textBaseY = y + 24 + (height - lines.length * (fontSize + 6)) / 2;
  return lines
    .map((ln, i) => {
      const ty = textBaseY + i * (fontSize + 6) + fontSize;
      return `<text x="${textX}" y="${ty}" text-anchor="middle" font-family='${fontFamily}' font-size="${fontSize}" font-weight="${textWeight}" fill="${textColor}">${escapeXml(ln)}</text>`;
    })
    .join("");
}

/**
 * 縦書き text (RTL 列順、商業漫画スタイル)。
 *
 * 2026-05-19 Sprint 23 Commit 5: writing-mode: vertical-rl を librsvg が独自解釈し
 * 二重 RTL → LTR 結果になる現象が確認されたため、CSS writing-mode を削除し、tspan の
 * x (列固定) と dy (charHeight 送り) のみで「視覚的縦書き」を完全に組み立てる。
 * これで librsvg の writing-mode サポート状態に依存せず、決定的に正しい順序で配置される。
 *
 * 列幅と行間の経験則:
 *   - charHeight = fontSize * 1.05 (商業漫画 line-height 中央値)
 *   - colWidth = fontSize * 1.1 (列間ゆとり 10%)
 *   - padding = fontSize * 0.6 (bubble 内側余白)
 *
 * はみ出し対策: 列数 × colWidth が usableW を超えたら adjColWidth で縮める。
 */
function buildVerticalText(
  text: string,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  fontSize: number,
  fontFamily: string,
  textColor: string,
  textWeight: number
): string {
  if (!text) return "";
  const padding = Math.round(fontSize * 0.6);
  const usableW = Math.max(fontSize, bw - padding * 2);
  const usableH = Math.max(fontSize, bh - padding * 2);
  const charHeight = fontSize * 1.05;
  const colWidth = fontSize * 1.1;
  const charsPerCol = Math.max(1, Math.floor(usableH / charHeight));
  const cols = chunkVertical(text, charsPerCol);
  const colCount = cols.length;
  const totalColsW = colCount * colWidth;
  const adjColWidth = totalColsW > usableW && colCount > 1
    ? Math.max(fontSize * 0.7, usableW / colCount)
    : colWidth;

  const firstColRightX = bx + bw - padding - colWidth / 2;
  const colY0 = by + padding + fontSize;

  const out: string[] = [];
  for (let ci = 0; ci < colCount; ci++) {
    const colX = firstColRightX - ci * adjColWidth;
    const tspans = cols[ci]
      .split("")
      .map((c, ri) => `<tspan x="${colX.toFixed(1)}" dy="${ri === 0 ? 0 : charHeight.toFixed(1)}">${escapeXml(c)}</tspan>`)
      .join("");
    out.push(
      `<text x="${colX.toFixed(1)}" y="${colY0.toFixed(1)}" text-anchor="middle" font-family='${fontFamily}' font-size="${fontSize}" font-weight="${textWeight}" fill="${textColor}">${tspans}</text>`
    );
  }
  return out.join("");
}

function chunkVertical(text: string, charsPerCol: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += charsPerCol) {
    out.push(text.slice(i, i + charsPerCol));
  }
  return out;
}

/**
 * SFX (擬音) group — shape なし、halo 付き katakana の text-only。
 *
 * 「白縁背面 (stroke=white, wider) + 黒 fill 前面」の 2 段重ねを paint-order="stroke" で実現。
 * memory feedback_manga_overlay_halo_required.md に従い stroke-width = fontSize * 0.18 を経験則とする。
 * 配置は bubble.position の中央 (placer.ts が panel rect 内に配置済み前提)。
 */
function sfxGroup(b: SvgBubble, fontFamily: string): string {
  const { x, y, width, height } = b.position;
  const fontSize = Math.max(28, Math.min(64, Math.round(Math.min(width, height) * 0.5)));
  const cx = x + width / 2;
  const cy = y + height / 2 + fontSize / 3;
  const haloWidth = Math.max(4, fontSize * 0.18);
  const safeText = escapeXml(b.text);
  return [
    `<g data-reading-order="${b.reading_order}" data-bubble-type="sfx">`,
    // halo (背面、白縁) — paint-order="stroke" で stroke が背面に
    `<text x="${cx}" y="${cy}" text-anchor="middle" font-family='${fontFamily}' font-size="${fontSize}" font-weight="900" stroke="#ffffff" stroke-width="${haloWidth.toFixed(1)}" stroke-linejoin="round" fill="#000000" paint-order="stroke" style="opacity: 0.95;">${safeText}</text>`,
    `</g>`,
  ].join("");
}

/**
 * 雲型 path（thought）
 */
function cloudPath(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  // 8 lobe ellipse cloud
  const lobes = 10;
  const points: string[] = [];
  for (let i = 0; i < lobes; i++) {
    const t = (i / lobes) * Math.PI * 2;
    const wobble = i % 2 === 0 ? 1.0 : 0.85;
    const px = cx + Math.cos(t) * rx * wobble;
    const py = cy + Math.sin(t) * ry * wobble;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return `M ${points[0]} ${points
    .slice(1)
    .map((p) => `L ${p}`)
    .join(" ")} Z`;
}

/**
 * ジャギー path（shout）
 */
function jaggedPath(x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const teeth = 16;
  const points: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const t = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.78;
    const px = cx + Math.cos(t) * rx * r;
    const py = cy + Math.sin(t) * ry * r;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  return `M ${points[0]} ${points
    .slice(1)
    .map((p) => `L ${p}`)
    .join(" ")} Z`;
}

/**
 * パネル全体の SVG 文字列を返す
 */
export function buildBubbleOverlaySvg(opts: SvgOverlayOptions): string {
  const fontFamily = opts.fontFamily ?? DEFAULT_FONT_FAMILY;
  const groups = opts.bubbles
    .slice()
    .sort((a, b) => a.reading_order - b.reading_order)
    .map((b) => bubbleGroup(b, fontFamily))
    .join("");
  const useClip = opts.clipPolygon && opts.clipPolygon.length >= 3;
  const clipPathId = opts.clipPathId ?? "bubble-overlay-clip";
  const defs = useClip
    ? `<defs><clipPath id="${escapeXml(clipPathId)}"><polygon points="${opts.clipPolygon!
        .map(([x, y]) => `${x},${y}`)
        .join(" ")}" /></clipPath></defs>`
    : "";
  const body = useClip ? `<g clip-path="url(#${escapeXml(clipPathId)})">${groups}</g>` : groups;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.panelWidth} ${opts.panelHeight}" preserveAspectRatio="none">`,
    defs,
    body,
    "</svg>",
  ].join("");
}

export const renderBubbleOverlay = buildBubbleOverlaySvg;
