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
  const { x, y, width, height, tail_x, tail_y } = b.position;
  const cornerRadius = 18;
  const fontSize = b.bubble_type === "shout" ? 36 : 30;
  const charsPerLine = Math.max(6, Math.floor((width - 32) / fontSize));

  // 簡易ワードラップ（日本語は文字単位で改行可能）
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < b.text.length) {
    const slice = b.text.slice(cursor, cursor + charsPerLine);
    lines.push(slice);
    cursor += charsPerLine;
  }

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

  // テキスト（中央揃え）
  const textX = x + Math.round(width / 2);
  const textBaseY = y + 24 + (height - lines.length * (fontSize + 6)) / 2;
  const textWeight = b.bubble_type === "shout" ? 800 : 500;
  const textColor = b.bubble_type === "shout" ? "#7f1d1d" : "#111111";
  const textTags = lines
    .map((ln, i) => {
      const ty = textBaseY + i * (fontSize + 6) + fontSize;
      return `<text x="${textX}" y="${ty}" text-anchor="middle" font-family='${fontFamily}' font-size="${fontSize}" font-weight="${textWeight}" fill="${textColor}">${escapeXml(ln)}</text>`;
    })
    .join("");

  return `<g data-reading-order="${b.reading_order}" data-bubble-type="${b.bubble_type}">${body}${tail}${textTags}</g>`;
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
