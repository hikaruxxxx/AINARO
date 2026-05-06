/**
 * F-1 (panel_composite) ページ合成レンダラ
 *
 * 入力:
 *   - 1748×2480 (B6 350dpi) のページ寸法
 *   - 各 panel の slot 矩形 (絶対 px) と生成済 PNG path
 * 処理:
 *   1. 白ページを生成 (1748×2480)
 *   2. 各 panel PNG を slot.rect に「object-fit: cover」相当でリサイズ → 配置
 *   3. 黒コマ枠 (border) を描画
 * 出力:
 *   - 合成済 PNG path
 *
 * 依存: sharp
 *
 * 設計判断:
 *   - Phase 1 MVP は吹き出しなしのページ画像のみ生成。吹き出しは既存 svg-overlay.ts で別途
 *   - panel.rect の余白 (gutter) はテンプレ側で確保済み (layout-templates.ts)
 *   - panel 画像は cover トリム (はみ出し部分は捨てる)。letterbox にすると白縁が出てAI臭の元になる
 */

import sharp from "sharp";
import { promises as fs } from "fs";

import { PAGE_DIMENSIONS } from "../page-director/types";
import type { PanelRect } from "../page-director/types";
import { polygonSvgFrame, polygonToSvgMask } from "./polygon-utils";
import type { Polygon } from "./polygon-utils";

export type PanelCompositeInput = {
  /** ページ内 0-indexed */
  panel_idx: number;
  /** ページ座標での矩形 */
  rect: PanelRect;
  /** 生成済 panel PNG の絶対パス */
  source_image_path: string;
  /** Phase B v3: 実際のコマ枠 polygon */
  polygon?: Polygon;
  /** Phase B3 v3: 枠線描画スキップ */
  is_borderless?: boolean;
  /** Phase B3 v3: ページ縁まで延長する panel */
  bleed_polygon?: boolean;
  /** 読み順 (デバッグ用、合成には不要) */
  reading_order?: number;
};

export type PageCompositeOptions = {
  /** ページ番号 (出力ファイル名・ログ用) */
  page_idx: number;
  /** 合成対象の panel 配列 */
  panels: PanelCompositeInput[];
  /** 出力 PNG パス */
  outputPath: string;
  /** ページ寸法 (省略時は B6 350dpi) */
  pageWidth?: number;
  pageHeight?: number;
  /** コマ枠の太さ px (省略時 8) */
  borderWidth?: number;
  /** コマ枠の色 hex (省略時 #000000) */
  borderColor?: string;
  /** ページ背景色 hex (省略時 #ffffff) */
  backgroundColor?: string;
};

export type PageCompositeResult = {
  outputPath: string;
  width: number;
  height: number;
  panelCount: number;
  durationMs: number;
};

/**
 * 1ページを合成する
 */
export async function composeMangaPage(
  options: PageCompositeOptions
): Promise<PageCompositeResult> {
  const startedAt = Date.now();
  const W = options.pageWidth ?? PAGE_DIMENSIONS.width;
  const H = options.pageHeight ?? PAGE_DIMENSIONS.height;
  const borderWidth = options.borderWidth ?? 8;
  const borderColor = options.borderColor ?? "#000000";
  const backgroundColor = options.backgroundColor ?? "#ffffff";

  // 1. 白ページを生成
  const baseLayer = sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: backgroundColor,
    },
  }).png();

  // 2. 各 panel をリサイズして合成レイヤーを作る
  const overlays: sharp.OverlayOptions[] = [];

  for (const panel of options.panels) {
    const { rect, polygon } = panel;
    const { x, y, w, h } = rect;
    const usePolygon = polygon && polygon.length >= 3;

    // panel 画像を slot 矩形の中身サイズ (border 内側) に cover リサイズ
    const resizeW = usePolygon ? Math.max(1, Math.round(w)) : Math.max(1, Math.round(w - borderWidth * 2));
    const resizeH = usePolygon ? Math.max(1, Math.round(h)) : Math.max(1, Math.round(h - borderWidth * 2));

    const resizedBuffer = await sharp(panel.source_image_path)
      .resize(resizeW, resizeH, {
        fit: "cover",
        position: "center",
      })
      .png()
      .toBuffer();

    if (usePolygon) {
      const mask = polygonToSvgMask(
        polygon,
        Math.round(w),
        Math.round(h),
        -Math.round(x),
        -Math.round(y)
      );
      const clippedBuffer = await sharp(resizedBuffer)
        .ensureAlpha()
        .composite([{ input: Buffer.from(mask), blend: "dest-in" }])
        .png()
        .toBuffer();

      overlays.push({
        input: clippedBuffer,
        top: Math.round(y),
        left: Math.round(x),
      });
    } else {
      overlays.push({
        input: resizedBuffer,
        top: Math.round(y + borderWidth),
        left: Math.round(x + borderWidth),
      });
    }
  }

  // 3. 黒コマ枠を SVG で描画 (各 panel の rect に矩形を描く)
  const borderSvg = buildBorderSvg({
    pageWidth: W,
    pageHeight: H,
    panels: options.panels,
    borderWidth,
    borderColor,
  });

  overlays.push({
    input: Buffer.from(borderSvg),
    top: 0,
    left: 0,
  });

  // 4. 合成して出力
  await fs.mkdir(path_dirname(options.outputPath), { recursive: true });
  await baseLayer.composite(overlays).png().toFile(options.outputPath);

  return {
    outputPath: options.outputPath,
    width: W,
    height: H,
    panelCount: options.panels.length,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * 各 panel の境界 (黒コマ枠) を 1枚の SVG にまとめて返す
 */
function buildBorderSvg(opts: {
  pageWidth: number;
  pageHeight: number;
  panels: PanelCompositeInput[];
  borderWidth: number;
  borderColor: string;
}): string {
  const { pageWidth, pageHeight, panels, borderWidth, borderColor } = opts;

  const rects = panels
    .map((p) => {
      if (p.is_borderless || p.bleed_polygon) return "";
      if (p.polygon && p.polygon.length >= 3) {
        return polygonSvgFrame(p.polygon, { borderWidth, borderColor });
      }

      const { x, y, w, h } = p.rect;
      // stroke は中央基準なので、矩形を borderWidth/2 だけ内側に置く
      const halfBorder = borderWidth / 2;
      return `<rect x="${x + halfBorder}" y="${y + halfBorder}" width="${w - borderWidth}" height="${h - borderWidth}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth}" stroke-linejoin="miter" />`;
    })
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" width="${pageWidth}" height="${pageHeight}">`,
    rects,
    "</svg>",
  ].join("");
}

/**
 * path.dirname の最小実装 (依存追加を避ける)
 */
function path_dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  if (idx < 0) return ".";
  return p.slice(0, idx);
}
