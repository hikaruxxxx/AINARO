/**
 * L13 KDP Package
 *
 * volumes/v{NN}/episodes 全部 → volumes/v{NN}/kdp/{manuscript,cover}.pdf + metadata.json
 *                            + kdp-release.json (入稿台帳, B-1計画 Track A1-1)
 *                            + kdp-input.md     (管理画面コピペ用, A1-5)
 *
 * 設計根拠: ~/.claude/plans/b-1-codex-gentle-bengio.md (Codexレビュー反映版)
 *   - A1-2: preflight で 79p未満背表紙テキスト禁止を強制
 *   - A1-3: 表紙画像を外部入力必須化 (本文1ページ目流用を禁止)
 *   - A1-4: AI開示を KDP公式5区分で構造化
 *
 * MVP: 単一エピソードでもパッケージできるよう、--episodes <list> でも受ける。
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  workMetaPath,
  bubblesDir,
  kdpDir,
} from "./_paths";
import {
  buildManuscriptPdf,
} from "../../../src/lib/manga/publish-v2/kdp/manuscript-pdf";
import { buildCoverPdf } from "../../../src/lib/manga/publish-v2/kdp/cover-composer";
import { buildColophonPng } from "../../../src/lib/manga/publish-v2/kdp/colophon-gen";
import {
  ensureRelease,
  saveRelease,
  applyUpdates,
  setStatus,
} from "../../../src/lib/manga/publish-v2/kdp/release-ledger";
import { runPreflight, formatPreflightReport } from "../../../src/lib/manga/publish-v2/kdp/preflight";
import { buildKdpInputMd } from "../../../src/lib/manga/publish-v2/kdp/kdp-input-md";
import {
  DEFAULT_AI_DISCLOSURE_FLAGS,
  DEFAULT_AI_TOOLS_USED,
  DEFAULT_AI_USAGE_LEVEL,
  renderDisclosureText,
  type AiUsageLevel,
} from "../../../src/lib/manga/disclosure";
import type {
  KdpMetadata,
  AiDisclosureFlags,
} from "../../../src/lib/manga/schemas-v2";

type Args = {
  slug: string;
  volume: number;
  episodes: number[];
  authorPenName: string;
  publicationDate: string;
  isbn?: string;
  /** 表紙PNGの明示指定 (省略時は volumes/v{NN}/kdp/inputs/cover-front.png) */
  coverFront?: string;
  /** 裏表紙 (任意) */
  coverBack?: string;
  /** Day1-5 リハーサル用 — KDP最小ページ数 (24p) 未満を許容 */
  allowShortVolume: boolean;
  /** AI usage level — 既定 full_ai */
  aiUsageLevel: AiUsageLevel;
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    publicationDate: new Date().toISOString().split("T")[0],
    authorPenName: "AINARO",
    allowShortVolume: false,
    aiUsageLevel: DEFAULT_AI_USAGE_LEVEL,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let key: string | null = null;
    let val: string | null = null;
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    if (eq) [, key, val] = eq;
    else if (arg === "--allow-short-volume") {
      a.allowShortVolume = true;
      continue;
    } else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "volume") a.volume = Number(val);
    else if (key === "episodes") a.episodes = val.split(",").map((s) => Number(s));
    else if (key === "author") a.authorPenName = val;
    else if (key === "publication-date") a.publicationDate = val;
    else if (key === "isbn") a.isbn = val;
    else if (key === "cover-front") a.coverFront = val;
    else if (key === "cover-back") a.coverBack = val;
    else if (key === "ai-usage-level") a.aiUsageLevel = val as AiUsageLevel;
  }
  if (!a.slug || !a.volume || !a.episodes) throw new Error("--slug, --volume, --episodes required");
  return a as Args;
}

async function listPagesForEpisode(slug: string, ep: number): Promise<string[]> {
  const dir = bubblesDir(slug, ep);
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => /^p\d{2}\.png$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

/**
 * A1-3: 表紙画像を外部入力必須化。
 * 1) --cover-front で渡された場合はそれを使う
 * 2) volumes/v{NN}/kdp/inputs/cover-front.png があれば使う
 * 3) いずれもなければ throw (本文1ページ目への暫定流用は廃止)
 */
async function loadRequiredCoverFrontPng(slug: string, vol: number, override?: string): Promise<string> {
  if (override) {
    await fs.access(override).catch(() => {
      throw new Error(`[L13] 指定された --cover-front が存在しない: ${override}`);
    });
    return override;
  }
  const candidate = path.join(kdpDir(slug, vol), "inputs", "cover-front.png");
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    throw new Error(
      `[L13] 表紙画像が必要です。以下のいずれかを実施してください:\n` +
      `  1) ${candidate} に表紙PNGを配置\n` +
      `  2) --cover-front <path> で表紙PNGを指定\n` +
      `  (本文1ページ目を暫定表紙にする旧挙動は KDP不可のため廃止しました)`,
    );
  }
}

async function loadOptionalCoverBackPng(slug: string, vol: number, override?: string): Promise<string | undefined> {
  if (override) {
    await fs.access(override).catch(() => {
      throw new Error(`[L13] 指定された --cover-back が存在しない: ${override}`);
    });
    return override;
  }
  const candidate = path.join(kdpDir(slug, vol), "inputs", "cover-back.png");
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
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

  // A1-3: 表紙画像を外部入力必須化
  const coverFrontPath = await loadRequiredCoverFrontPng(args.slug, args.volume, args.coverFront);
  const coverBackPath = await loadOptionalCoverBackPng(args.slug, args.volume, args.coverBack);
  console.log(`[L13] cover front: ${coverFrontPath}`);
  if (coverBackPath) console.log(`[L13] cover back: ${coverBackPath}`);

  // AI 開示 (A1-4: 構造化)
  const aiDisclosure: AiDisclosureFlags = { ...DEFAULT_AI_DISCLOSURE_FLAGS };
  const aiToolsUsed = [...DEFAULT_AI_TOOLS_USED];
  const humanReviewPerformed = true;
  const disclosureText = renderDisclosureText(aiDisclosure, args.aiUsageLevel, aiToolsUsed);

  // 奥付ページ生成 (構造化された開示文を渡す)
  const colophonPath = path.join(kdpDir(args.slug, args.volume), "_colophon.png");
  await buildColophonPng({
    title: meta.title_short ?? meta.title,
    subtitle: `第${args.volume}巻`,
    authorPenName: args.authorPenName,
    publicationDate: args.publicationDate,
    publisher: args.authorPenName,
    isbn: args.isbn,
    aiDisclosureText: disclosureText,
    outputPath: colophonPath,
  });
  console.log(`[L13] colophon: ${colophonPath}`);

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
    coverFrontPng: coverFrontPath,
    coverBackPng: coverBackPath,
    spineTitle: meta.title_short ?? meta.title,
    spineAuthor: args.authorPenName,
    pageCount: ms.pageCount,
    outputPath: coverPath,
  });
  console.log(`[L13] cover.pdf: ${cover.outputPath} (spine ${cover.spine_w_mm.toFixed(2)}mm)`);

  // metadata (schema_version=2, AI開示構造化)
  const metadata: KdpMetadata = {
    schema_version: 2,
    slug: args.slug,
    volume_no: args.volume,
    title: meta.title,
    subtitle: `第${args.volume}巻`,
    author_pen_name: args.authorPenName,
    isbn: args.isbn,
    bisac_categories: ["COM004000", "FIC036000"], // TODO(A2-3): bisac-map.json から動的取得
    ai_disclosure: aiDisclosure,
    ai_tools_used: aiToolsUsed,
    human_review_performed: humanReviewPerformed,
    ai_disclosure_text: disclosureText, // 後方互換
    page_count: ms.pageCount,
    spine_width_mm: cover.spine_w_mm,
    publication_date: args.publicationDate,
    manuscript_pdf_path: manuscriptPath,
    cover_pdf_path: coverPath,
  };
  const metadataPath = path.join(kdpDir(args.slug, args.volume), "metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`[L13] metadata.json: ${metadataPath}`);

  // A1-1: kdp-release.json (入稿台帳) — 既存があれば PDF パスのみ更新、無ければ初期化
  const releasePath = path.join(kdpDir(args.slug, args.volume), "kdp-release.json");
  let release = await ensureRelease(releasePath, {
    slug: args.slug,
    volumeNo: args.volume,
    manuscriptPdfPath: manuscriptPath,
    coverPdfPath: coverPath,
    inputs: {
      title: meta.title,
      subtitle: `第${args.volume}巻`,
      isbn: args.isbn,
    },
    aiDisclosure,
    aiToolsUsed,
    humanReviewPerformed,
  });

  // A1-2: preflight 実行
  const pf = await runPreflight({
    manuscriptPdfPath: manuscriptPath,
    coverPdfPath: coverPath,
    coverFrontPng: coverFrontPath,
    pageCount: ms.pageCount,
    spineWidthMm: cover.spine_w_mm,
    metadata,
    release,
    aiUsageLevel: args.aiUsageLevel,
    spineTextRendered: cover.spine_text_rendered,
    allowShortVolume: args.allowShortVolume,
  });
  console.log(formatPreflightReport(pf));

  // preflight 結果を kdp-release.json に反映
  if (pf.ok) {
    release = setStatus(release, "preflight_ok", "L13 preflight pass");
  } else {
    release = applyUpdates(release, {
      preview_log: [
        ...release.preview_log,
        {
          reviewed_at: new Date().toISOString(),
          issues: pf.issues
            .filter((i) => i.severity === "error")
            .map((i) => `${i.code}: ${i.message}`),
          resolved: false,
        },
      ],
    }, "L13 preflight FAILED");
  }
  await saveRelease(releasePath, release);
  console.log(`[L13] kdp-release.json: ${releasePath} (status=${release.status})`);

  // A1-5: kdp-input.md (管理画面コピペ用)
  const inputMdPath = path.join(kdpDir(args.slug, args.volume), "kdp-input.md");
  await buildKdpInputMd({
    release,
    metadata,
    aiUsageLevel: args.aiUsageLevel,
    outputPath: inputMdPath,
  });
  console.log(`[L13] kdp-input.md: ${inputMdPath}`);

  if (!pf.ok) {
    console.error(`[L13] preflight FAILED — KDP入稿不可。kdp-release.json の preview_log を確認し、エラーを解消してから再実行してください。`);
    process.exit(2);
  }

  console.log(`[L13] DONE: ${kdpDir(args.slug, args.volume)}`);
}

main().catch((e) => {
  console.error("[L13] FAILED:", e);
  process.exit(1);
});
