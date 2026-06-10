/**
 * KDP 背幅計算
 *
 * Amazon POD 白黒の場合: 背幅mm ≈ ページ数 × 0.0795 (普通紙 60kg)
 * 1mm = 350/25.4 ≈ 13.78 px (350dpi 換算)
 */
export const PAGES_TO_SPINE_MM_PER_PAGE = 0.0795;
export const DPI = 350;

export function spineWidthMm(pageCount: number): number {
  // 最小 5mm (それ以下は無背表紙)
  return Math.max(5, pageCount * PAGES_TO_SPINE_MM_PER_PAGE);
}

export function mmToPx(mm: number, dpi = DPI): number {
  return Math.round(mm * (dpi / 25.4));
}

/** B6 (128×182mm) + 塗り足し3mm + 表紙幅 = 表+背+裏 */
export function coverDimensions(pageCount: number): {
  bleed_mm: number;
  page_w_mm: number;
  page_h_mm: number;
  spine_w_mm: number;
  cover_w_mm: number;
  cover_h_mm: number;
  cover_w_px: number;
  cover_h_px: number;
  spine_w_px: number;
  page_w_px: number;
  page_h_px: number;
} {
  const bleed_mm = 3;
  const page_w_mm = 128;
  const page_h_mm = 182;
  const spine_w_mm = spineWidthMm(pageCount);
  const cover_w_mm = page_w_mm * 2 + spine_w_mm + bleed_mm * 2;
  const cover_h_mm = page_h_mm + bleed_mm * 2;

  return {
    bleed_mm, page_w_mm, page_h_mm, spine_w_mm,
    cover_w_mm, cover_h_mm,
    cover_w_px: mmToPx(cover_w_mm),
    cover_h_px: mmToPx(cover_h_mm),
    spine_w_px: mmToPx(spine_w_mm),
    page_w_px: mmToPx(page_w_mm),
    page_h_px: mmToPx(page_h_mm),
  };
}
