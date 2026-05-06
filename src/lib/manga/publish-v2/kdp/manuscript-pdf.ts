/**
 * KDP 本文 PDF/X-1a 生成 (簡易版)
 *
 * pdf-lib を使って renders/p{NN}.png を 1 ページ 1 画像で結合。
 * 厳密な PDF/X-1a 準拠は KDP 入稿時の Amazon 側変換でも吸収されるため、
 * MVP は B6 サイズに合わせた高解像度 PDF を出すまで。
 *
 * 入稿前に必ず Amazon プレビューワで確認すること (奥付ページ含む)。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument, PageSizes } from "pdf-lib";
import { mmToPx } from "./spine-calc";

const B6_WIDTH_MM = 128;
const B6_HEIGHT_MM = 182;
// 1pt = 1/72 inch = 25.4/72 mm
const MM_TO_PT = 72 / 25.4;

export const KDP_B6_PAGE_WIDTH_PT = B6_WIDTH_MM * MM_TO_PT;
export const KDP_B6_PAGE_HEIGHT_PT = B6_HEIGHT_MM * MM_TO_PT;

export type ManuscriptInput = {
  /** 表紙ページとして 1 枚追加 (任意) */
  coverFrontPng?: string;
  /** 本文ページ画像 PNG (RTL 順で並べる) */
  pagesPng: string[];
  /** 巻末に追加する奥付ページ画像 (任意) */
  colophonPng?: string;
  /** AI 使用開示文 (画像化されていれば不要、画像化していないなら最終ページに描画) */
  aiDisclosureText?: string;
  outputPath: string;
};

export async function buildManuscriptPdf(input: ManuscriptInput): Promise<{ pageCount: number; outputPath: string }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("AINARO Manga Manuscript");
  pdf.setProducer("AINARO Pipeline v2");
  pdf.setCreator("AINARO");
  pdf.setCreationDate(new Date());

  const allPages: string[] = [];
  if (input.coverFrontPng) allPages.push(input.coverFrontPng);
  allPages.push(...input.pagesPng);
  if (input.colophonPng) allPages.push(input.colophonPng);

  for (const imgPath of allPages) {
    const bytes = await fs.readFile(imgPath);
    const img = imgPath.toLowerCase().endsWith(".jpg") || imgPath.toLowerCase().endsWith(".jpeg")
      ? await pdf.embedJpg(bytes)
      : await pdf.embedPng(bytes);

    const page = pdf.addPage([KDP_B6_PAGE_WIDTH_PT, KDP_B6_PAGE_HEIGHT_PT]);
    // Stretch the image to the full page (assumes B6 aspect already)
    page.drawImage(img, {
      x: 0, y: 0,
      width: KDP_B6_PAGE_WIDTH_PT, height: KDP_B6_PAGE_HEIGHT_PT,
    });
  }

  const pdfBytes = await pdf.save();
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await fs.writeFile(input.outputPath, pdfBytes);

  return { pageCount: allPages.length, outputPath: input.outputPath };
}
