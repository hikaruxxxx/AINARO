/**
 * L13 KDP Package
 *
 * volumes/v{NN}/episodes 全部 → volumes/v{NN}/kdp/{manuscript,cover}.pdf + metadata.json
 *
 * MVP: 単一エピソードでもパッケージできるよう、--episodes <list> でも受ける。
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  workDir,
  workMetaPath,
  bubblesDir,
  kdpDir,
  episodeDir,
} from "./_paths";
import { buildManuscriptPdf, KDP_B6_PAGE_HEIGHT_PT, KDP_B6_PAGE_WIDTH_PT } from "../../../src/lib/manga/publish-v2/kdp/manuscript-pdf";
import { buildCoverPdf } from "../../../src/lib/manga/publish-v2/kdp/cover-composer";
import { buildColophonPng } from "../../../src/lib/manga/publish-v2/kdp/colophon-gen";
import type { KdpMetadata } from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  volume: number;
  episodes: number[];
  authorPenName: string;
  publicationDate: string;
  isbn?: string;
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    publicationDate: new Date().toISOString().split("T")[0],
    authorPenName: "AINARO",
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null; let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else { const flag = arg.match(/^--(.+)$/); if (flag && i + 1 < argv.length) { key = flag[1]; val = argv[++i]; } }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "volume") a.volume = Number(val);
    else if (key === "episodes") a.episodes = val.split(",").map((s) => Number(s));
    else if (key === "author") a.authorPenName = val;
    else if (key === "publication-date") a.publicationDate = val;
    else if (key === "isbn") a.isbn = val;
  }
  if (!a.slug || !a.volume || !a.episodes) throw new Error("--slug, --volume, --episodes required");
  return a as Args;
}

async function listPagesForEpisode(slug: string, ep: number): Promise<string[]> {
  const dir = bubblesDir(slug, ep);
  let entries: string[] = [];
  try { entries = await fs.readdir(dir); } catch { return []; }
  return entries
    .filter((f) => /^p\d{2}\.png$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

async function main() {
  const args = parseArgs();
  const meta = JSON.parse(await fs.readFile(workMetaPath(args.slug), "utf-8"));

  await fs.mkdir(kdpDir(args.slug, args.volume), { recursive: true });

  // 全エピソードのページを収集
  const allPages: string[] = [];
  for (const ep of args.episodes) {
    const pages = await listPagesForEpisode(args.slug, ep);
    if (pages.length === 0) console.warn(`[L13] WARN: ep${ep} bubbles not found`);
    allPages.push(...pages);
  }
  if (allPages.length === 0) throw new Error("[L13] no bubble pages found, cannot build manuscript");

  // 奥付ページ生成
  const colophonPath = path.join(kdpDir(args.slug, args.volume), "_colophon.png");
  await buildColophonPng({
    title: meta.title_short ?? meta.title,
    subtitle: `第${args.volume}巻`,
    authorPenName: args.authorPenName,
    publicationDate: args.publicationDate,
    publisher: args.authorPenName,
    isbn: args.isbn,
    aiDisclosureText: undefined,
    outputPath: colophonPath,
  });
  console.log(`[L13] colophon: ${colophonPath}`);

  // 表紙が無ければ最初のページを暫定表紙に
  const coverFront = allPages[0];

  // 本文 PDF
  const manuscriptPath = path.join(kdpDir(args.slug, args.volume), "manuscript.pdf");
  const ms = await buildManuscriptPdf({
    coverFrontPng: undefined,
    pagesPng: allPages,
    colophonPng: colophonPath,
    outputPath: manuscriptPath,
  });
  console.log(`[L13] manuscript.pdf: ${ms.outputPath} (${ms.pageCount} pages)`);

  // 表紙 PDF
  const coverPath = path.join(kdpDir(args.slug, args.volume), "cover.pdf");
  const cover = await buildCoverPdf({
    coverFrontPng: coverFront,
    coverBackPng: undefined,
    spineTitle: meta.title_short ?? meta.title,
    spineAuthor: args.authorPenName,
    pageCount: ms.pageCount,
    outputPath: coverPath,
  });
  console.log(`[L13] cover.pdf: ${cover.outputPath} (spine ${cover.spine_w_mm.toFixed(2)}mm)`);

  // metadata
  const metadata: KdpMetadata = {
    schema_version: 1,
    slug: args.slug,
    volume_no: args.volume,
    title: meta.title,
    subtitle: `第${args.volume}巻`,
    author_pen_name: args.authorPenName,
    isbn: args.isbn,
    bisac_categories: ["COM004000", "FIC036000"],
    ai_disclosure_text: "本書の作画は OpenAI gpt-image-2 を主モデルとして AI 生成しています。",
    page_count: ms.pageCount,
    spine_width_mm: cover.spine_w_mm,
    publication_date: args.publicationDate,
    manuscript_pdf_path: manuscriptPath,
    cover_pdf_path: coverPath,
  };
  const metadataPath = path.join(kdpDir(args.slug, args.volume), "metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`[L13] metadata.json: ${metadataPath}`);
  console.log(`[L13] DONE: ${kdpDir(args.slug, args.volume)}`);
}

main().catch((e) => { console.error("[L13] FAILED:", e); process.exit(1); });
