/**
 * KDP 奥付/版権ページ生成
 *
 * B6 1ページサイズの PNG を sharp+SVG で出力。
 * 内容: タイトル / 著者 / 初版発行日 / 発行所 / AI使用開示文 / ISBN (任意)
 */
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { mmToPx } from "./spine-calc";

const PAGE_W_PX = mmToPx(128); // B6 width
const PAGE_H_PX = mmToPx(182);

export type ColophonInput = {
  title: string;
  subtitle?: string;
  authorPenName: string;
  publicationDate: string;
  publisher?: string; // 個人 KDP は著者名で OK
  isbn?: string;
  asin?: string;
  aiDisclosureText?: string;
  outputPath: string;
};

const DEFAULT_AI_DISCLOSURE =
  "本書の作画・原稿は人工知能 (AI) を用いて生成しています。AI 生成にあたっては OpenAI の gpt-image-2 を主モデルとして使用し、著者が企画・構成・最終的な編集を行いました。AIが既存の著作物を直接複製することのないよう設計上配慮していますが、構図・画風の影響については常に検証を続けています。お気づきの点がありましたらご連絡ください。";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    cur += ch;
    if (cur.length >= maxCharsPerLine) {
      lines.push(cur);
      cur = "";
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

export async function buildColophonPng(input: ColophonInput): Promise<{ outputPath: string }> {
  const margin = 60;
  const lineHeight = 28;
  const titleSize = 36;
  const bodySize = 18;
  const captionSize = 14;

  const aiDisclosure = input.aiDisclosureText ?? DEFAULT_AI_DISCLOSURE;
  const aiLines = wrapText(aiDisclosure, 22);

  // 内容行を組み立て
  let y = margin + titleSize;
  const items: { text: string; size: number; bold?: boolean }[] = [
    { text: input.title, size: titleSize, bold: true },
  ];
  if (input.subtitle) items.push({ text: input.subtitle, size: bodySize });
  items.push({ text: "", size: lineHeight });
  items.push({ text: `初版発行日: ${input.publicationDate}`, size: bodySize });
  items.push({ text: `著者・発行: ${input.authorPenName}`, size: bodySize });
  if (input.publisher) items.push({ text: `発行所: ${input.publisher}`, size: bodySize });
  if (input.isbn) items.push({ text: `ISBN: ${input.isbn}`, size: bodySize });
  if (input.asin) items.push({ text: `ASIN: ${input.asin}`, size: bodySize });
  items.push({ text: "", size: lineHeight });
  items.push({ text: "── AI 使用開示 ──", size: bodySize, bold: true });
  for (const line of aiLines) items.push({ text: line, size: captionSize });

  const fontFamily = "'Hiragino Mincho ProN', 'YuMincho', 'Noto Serif JP', serif";

  const textElements: string[] = [];
  let cy = margin + titleSize;
  for (const it of items) {
    if (it.text === "") { cy += it.size; continue; }
    textElements.push(
      `<text x="${margin}" y="${cy}" font-family="${fontFamily}" font-size="${it.size}" font-weight="${it.bold ? "bold" : "normal"}" fill="black">${escapeXml(it.text)}</text>`
    );
    cy += it.size + 8;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W_PX}" height="${PAGE_H_PX}">
    <rect width="${PAGE_W_PX}" height="${PAGE_H_PX}" fill="white"/>
    ${textElements.join("\n")}
  </svg>`;

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(input.outputPath);
  return { outputPath: input.outputPath };
}
