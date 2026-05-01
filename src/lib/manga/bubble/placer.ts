/**
 * 吹き出し配置の MVP プレースホルダ計算
 *
 * Phase 1 はパネル画像内のオブジェクト検出を行わない。
 * 「話者の spatial_position の反対側 + 上 1/3 を避ける」というヒューリスティックで
 * 候補矩形を作り、reading_order 順に上→下へ並べる。
 *
 * Phase 2 で SAT solver / 顔検出ベースの bubble-placer に差し替える前提。
 *
 * BubblePosition は既存型 (panel 座標系のピクセル) を流用する。
 */

import type {
  BubbleType,
  PanelSpatialPosition,
} from "../types";
import type { BubblePosition } from "../schemas";

export type DialogueInput = {
  speaker_id: string | null;
  text: string;
  bubble_type: BubbleType;
  /** 同パネル内での読み順 1-indexed */
  reading_order: number;
  /** 話者の panel 内位置（あれば） */
  speaker_position?: PanelSpatialPosition;
};

export type PlacedBubble = {
  reading_order: number;
  bubble_type: BubbleType;
  text: string;
  position: BubblePosition;
  /** 話者方向への尻尾オフセット（あれば） */
  tail_x?: number;
  tail_y?: number;
};

/**
 * 1 パネル内の bubbles を上から順に配置する
 */
export function placeBubbles(args: {
  panelWidth: number;
  panelHeight: number;
  dialogues: DialogueInput[];
}): PlacedBubble[] {
  const placed: PlacedBubble[] = [];
  const margin = Math.round(args.panelWidth * 0.06);
  const maxBubbleWidth = Math.round(args.panelWidth * 0.7);

  // 上から順に並べる。各 bubble の高さはテキスト長さで概算
  let cursorY = Math.round(args.panelHeight * 0.04);
  const verticalGap = Math.round(args.panelHeight * 0.015);

  for (const d of args.dialogues) {
    const bubbleHeight = estimateBubbleHeight(d.text, maxBubbleWidth);
    const bubbleWidth = estimateBubbleWidth(d.text, maxBubbleWidth);

    let x: number;
    if (d.speaker_position === "left" || d.speaker_position === "foreground") {
      x = margin;
    } else if (d.speaker_position === "right" || d.speaker_position === "background") {
      x = args.panelWidth - margin - bubbleWidth;
    } else {
      // center / 不明: 交互に左右
      x = d.reading_order % 2 === 1 ? margin : args.panelWidth - margin - bubbleWidth;
    }

    // パネル下端を超える場合は最後の余白に押し戻す
    if (cursorY + bubbleHeight > args.panelHeight - margin) {
      cursorY = Math.max(margin, args.panelHeight - margin - bubbleHeight);
    }

    const position: BubblePosition = {
      x,
      y: cursorY,
      width: bubbleWidth,
      height: bubbleHeight,
    };

    // 尻尾は話者位置から bubble の中央下へ向ける（簡易）
    let tail_x: number | undefined;
    let tail_y: number | undefined;
    if (d.speaker_position === "left" || d.speaker_position === "foreground") {
      tail_x = x + Math.round(bubbleWidth * 0.2);
      tail_y = cursorY + bubbleHeight + Math.round(args.panelHeight * 0.03);
    } else if (d.speaker_position === "right" || d.speaker_position === "background") {
      tail_x = x + Math.round(bubbleWidth * 0.8);
      tail_y = cursorY + bubbleHeight + Math.round(args.panelHeight * 0.03);
    }
    if (tail_x !== undefined) position.tail_x = tail_x;
    if (tail_y !== undefined) position.tail_y = tail_y;

    placed.push({
      reading_order: d.reading_order,
      bubble_type: d.bubble_type,
      text: d.text,
      position,
      tail_x,
      tail_y,
    });

    cursorY += bubbleHeight + verticalGap;
  }

  return placed;
}

/**
 * 日本語縦書き bubble の高さをテキスト文字数から概算（縦読み漫画の慣例で横書き多め）
 */
function estimateBubbleHeight(text: string, maxWidth: number): number {
  const charsPerLine = Math.max(8, Math.floor(maxWidth / 32));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const lineHeight = 56;
  const padding = 32;
  return lines * lineHeight + padding;
}

function estimateBubbleWidth(text: string, maxWidth: number): number {
  const charsPerLine = Math.max(8, Math.floor(maxWidth / 32));
  const widthChars = Math.min(text.length, charsPerLine);
  const fontSize = 32;
  const padding = 48;
  return Math.min(maxWidth, widthChars * fontSize + padding);
}
