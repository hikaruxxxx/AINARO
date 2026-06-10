/**
 * KDP 表紙合成
 *
 * 表+背+裏の3ペーン構造を1枚のキャンバスに合成し、PDF として出力。
 *
 * 入力:
 *   - coverFrontPng: 表紙 (タイトル+メインビジュアル)
 *   - coverBackPng: 裏表紙 (あらすじ+著者紹介)
 *   - 背表紙はテキスト + 帯背景色 (シンプル: 黒地+白タイトル)
 *
 * MVP: 表+背+裏を 1 PDF にまとめ、Amazon KDP のテンプレに直接流せる形に。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { coverDimensions, mmToPx } from "./spine-calc";

const MM_TO_PT = 72 / 25.4;

export type CoverInput = {
  coverFrontPng: string;
  coverBackPng?: string;
  spineTitle: string;
  spineAuthor: string;
  pageCount: number;
  outputPath: string;
};

export async function buildCoverPdf(input: CoverInput): Promise<{ outputPath: string; spine_w_mm: number; spine_text_rendered: boolean }> {
  const dims = coverDimensions(input.pageCount);

  const pdf = await PDFDocument.create();
  pdf.setTitle("AINARO Manga Cover");
  pdf.setProducer("AINARO Pipeline v2");

  const pageW = dims.cover_w_mm * MM_TO_PT;
  const pageH = dims.cover_h_mm * MM_TO_PT;
  const page = pdf.addPage([pageW, pageH]);

  const bleedPt = dims.bleed_mm * MM_TO_PT;
  const halfPaneW = dims.page_w_mm * MM_TO_PT;
  const spinePt = dims.spine_w_mm * MM_TO_PT;

  // 表面 (右側パネル, KDP 内部 = 表面右、外側 = 表紙)
  const frontBytes = await fs.readFile(input.coverFrontPng);
  const frontImg = input.coverFrontPng.toLowerCase().endsWith(".jpg")
    ? await pdf.embedJpg(frontBytes)
    : await pdf.embedPng(frontBytes);
  page.drawImage(frontImg, {
    x: bleedPt + halfPaneW + spinePt,
    y: bleedPt,
    width: halfPaneW,
    height: dims.page_h_mm * MM_TO_PT,
  });

  // 裏表紙
  if (input.coverBackPng) {
    const backBytes = await fs.readFile(input.coverBackPng);
    const backImg = input.coverBackPng.toLowerCase().endsWith(".jpg")
      ? await pdf.embedJpg(backBytes)
      : await pdf.embedPng(backBytes);
    page.drawImage(backImg, {
      x: bleedPt,
      y: bleedPt,
      width: halfPaneW,
      height: dims.page_h_mm * MM_TO_PT,
    });
  } else {
    // 真っ白の裏表紙
    page.drawRectangle({
      x: bleedPt, y: bleedPt,
      width: halfPaneW, height: dims.page_h_mm * MM_TO_PT,
      color: rgb(1, 1, 1),
    });
  }

  // 背表紙 (シンプル: 黒帯+白文字 縦書きタイトル+著者)
  page.drawRectangle({
    x: bleedPt + halfPaneW,
    y: bleedPt,
    width: spinePt,
    height: dims.page_h_mm * MM_TO_PT,
    color: rgb(0.05, 0.05, 0.05),
  });

  // 背表紙テキストは描画しない (KDP規約: 79p未満は背表紙テキスト禁止)。
  // 79p以上で対応する場合の実装は publish-v2/kdp/spine-text.ts を別途追加予定 (B-1計画 Week3+)。
  // 当面は背景の黒帯のみで KDP 入稿可能。

  const bytes = await pdf.save();
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.writeFile(input.outputPath, bytes);

  return {
    outputPath: input.outputPath,
    spine_w_mm: dims.spine_w_mm,
    spine_text_rendered: false,
  };
}
