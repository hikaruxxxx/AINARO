/**
 * L13 KDP Package
 *
 * volumes/v{NN}/episodes 全部 → volumes/v{NN}/kdp/{manuscript,cover}.pdf + metadata.json
 *                            + kdp-release.json (入稿台帳, B-1計画 Track A1-1)
 *                            + kdp-input.md     (管理画面コピペ用, A1-5)
 *
 * 設計根拠: docs/plans/manga/kdp.md (Codexレビュー反映版)
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
  rendersDir,
  kdpDir,
  workDir,
} from "./_paths";
import { resolveRenderedPagesForEpisode } from "../../../src/lib/manga/publish-v2/kdp/adopted-resolver";
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
  buildKdpDescriptionHtml,
  descriptionSeedToInput,
  type DescriptionSeed,
} from "../../../src/lib/manga/publish-v2/kdp/description-template";
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

/** meta.json kdp_metadata ブロック (kdp-modular-plum.md 検索最適化拡張) */
type WorkKdpMetadataBlock = {
  /** Phase Y WY-7 で導入: Codex 統一案採用後の確定タイトル (main + subtitle) */
  title_decision?: { main: string; subtitle?: string };
  title_candidates?: string[];
  series_name_canonical?: string;
  keyword_picks_7?: string[];
  categories_validated?: string[];
  description_seed?: DescriptionSeed;
};
import {
  KdpMetadataSchema,
  WorkMetaJsonSchema,
  parseOrThrow,
} from "../../../src/lib/manga/schemas-v2.zod";

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
  /** Phase X WX-5 — rights_check (商標/IP類似) 未通過を warn 降格 (リハーサル出版/vol_0 用) */
  allowMissingRightsCheck: boolean;
  /** AI usage level — 既定 full_ai */
  aiUsageLevel: AiUsageLevel;
};

function parseArgs(): Args {
  const a: Partial<Args> = {
    publicationDate: new Date().toISOString().split("T")[0],
    authorPenName: "AINARO",
    allowShortVolume: false,
    allowMissingRightsCheck: false,
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
    } else if (arg === "--allow-missing-rights-check") {
      a.allowMissingRightsCheck = true;
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

/**
 * adopted_versions.json があれば採用版 image_path を、なければ renders/p{NN}.png を返す。
 * Phase D で page-level の採用反映を実現するヘルパー (panel-level は L9.5 後に拡張)。
 */
async function listPagesForEpisode(slug: string, ep: number): Promise<string[]> {
  const resolved = await resolveRenderedPagesForEpisode({
    slug,
    episode: ep,
    rendersDir: rendersDir(slug, ep),
    workRoot: workDir(slug),
  });
  if (resolved.length === 0) return [];
  // ログで採用状況を可視化
  const adoptedCount = resolved.filter((r) => r.source === "adopted").length;
  if (adoptedCount > 0) {
    console.log(`[L13] ep${ep}: ${adoptedCount}/${resolved.length} pages use adopted versions`);
    for (const r of resolved.filter((x) => x.source === "adopted")) {
      console.log(`  - p${String(r.page_no).padStart(2, "0")}: ${r.chosen_version} (${r.image_path})`);
    }
  }
  return resolved.map((r) => r.image_path);
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
  // C-1: meta.json を Zod で検証 (入力 fail-fast)
  const metaRaw: unknown = JSON.parse(await fs.readFile(workMetaPath(args.slug), "utf-8"));
  const meta = parseOrThrow(WorkMetaJsonSchema, metaRaw, `meta.json (${args.slug})`);

  // Phase Y WY-8: title_decision (Codex 統一案) を main() の冒頭で解決
  // (subtitle は line 232 の colophon でも参照されるため、関数冒頭で確定が必要)
  const earlyKdpMeta: WorkKdpMetadataBlock | undefined =
    (meta as unknown as { kdp_metadata?: WorkKdpMetadataBlock }).kdp_metadata;
  const finalTitle =
    earlyKdpMeta?.title_decision?.main ||
    (earlyKdpMeta?.title_candidates && earlyKdpMeta.title_candidates.length > 0
      ? earlyKdpMeta.title_candidates[0]
      : meta.title);
  const finalSubtitle = earlyKdpMeta?.title_decision?.subtitle;
  if (earlyKdpMeta?.title_decision) {
    console.log(`[L13] title_decision (Codex統一案): ${finalTitle}`);
    if (finalSubtitle) console.log(`[L13] subtitle (Codex統一案): ${finalSubtitle}`);
  } else if (earlyKdpMeta?.title_candidates && earlyKdpMeta.title_candidates.length > 1) {
    console.log(`[L13] title_candidates: ${earlyKdpMeta.title_candidates.length}案あり、先頭を採用 → ${finalTitle.substring(0, 40)}...`);
  }

  await fs.mkdir(kdpDir(args.slug, args.volume), { recursive: true });

  // 全エピソードのページを収集
  const allPages: string[] = [];
  for (const ep of args.episodes) {
    const pages = await listPagesForEpisode(args.slug, ep);
    if (pages.length === 0) console.warn(`[L13] WARN: ep${ep} renders not found`);
    allPages.push(...pages);
  }
  if (allPages.length === 0) throw new Error("[L13] no render pages found, cannot build manuscript");

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
    subtitle: finalSubtitle ?? `第${args.volume}巻`,
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

  // kdp-modular-plum.md (検索最適化拡張): meta.json の kdp_metadata ブロックを読む
  // Phase Y WY-8: finalTitle / finalSubtitle は main() 冒頭で earlyKdpMeta から解決済 (colophon で先に参照)
  const kdpMeta: WorkKdpMetadataBlock | undefined =
    (meta as unknown as { kdp_metadata?: WorkKdpMetadataBlock }).kdp_metadata;

  // metadata (schema_version=2, AI開示構造化 + 検索最適化拡張)
  const metadata: KdpMetadata = {
    schema_version: 2,
    slug: args.slug,
    volume_no: args.volume,
    title: finalTitle,
    subtitle: finalSubtitle ?? `第${args.volume}巻`,
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
    // ── kdp-modular-plum.md 検索最適化拡張 (全 optional) ──
    title_candidates: kdpMeta?.title_candidates,
    series_name_canonical: kdpMeta?.series_name_canonical,
    keyword_picks_7: kdpMeta?.keyword_picks_7,
    categories_validated: kdpMeta?.categories_validated,
  };
  // C-1: metadata.json を Zod で fail-fast 検証してから書き出す
  parseOrThrow(KdpMetadataSchema, metadata, `KdpMetadata (${args.slug} v${args.volume})`);
  const metadataPath = path.join(kdpDir(args.slug, args.volume), "metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`[L13] metadata.json: ${metadataPath}`);

  // kdp-modular-plum.md: meta.kdp_metadata.description_seed があれば Description HTML 自動生成
  let descriptionHtml = "";
  if (kdpMeta?.description_seed) {
    try {
      descriptionHtml = buildKdpDescriptionHtml(
        descriptionSeedToInput({
          seed: kdpMeta.description_seed,
          title: finalTitle,
          subtitle: finalSubtitle ?? `第${args.volume}巻`,
          seriesName: kdpMeta.series_name_canonical,
          volumeNo: args.volume,
          authorPenName: args.authorPenName,
          genre: (meta as unknown as { genre?: string }).genre,
        }),
      );
      console.log(`[L13] description_html: 自動生成 (${descriptionHtml.length}字)`);
    } catch (e) {
      console.warn(`[L13] WARN: description_seed から HTML 生成失敗 → 空のままにします: ${e}`);
    }
  }

  // A1-1: kdp-release.json (入稿台帳) — 既存があれば PDF パスのみ更新、無ければ初期化
  const releasePath = path.join(kdpDir(args.slug, args.volume), "kdp-release.json");
  let release = await ensureRelease(releasePath, {
    slug: args.slug,
    volumeNo: args.volume,
    manuscriptPdfPath: manuscriptPath,
    coverPdfPath: coverPath,
    inputs: {
      title: finalTitle,
      subtitle: finalSubtitle ?? `第${args.volume}巻`,
      isbn: args.isbn,
      // 検索最適化拡張: meta.kdp_metadata から自動populate (空なら空のまま)
      description_html: descriptionHtml || undefined,
      keywords: kdpMeta?.keyword_picks_7 ?? [],
      categories: kdpMeta?.categories_validated ?? [],
    },
    aiDisclosure,
    aiToolsUsed,
    humanReviewPerformed,
  });

  // 既存 release があってもkdp_inputsの空フィールドだけは meta から補完する
  const inputUpdates: Partial<typeof release.kdp_inputs> = {};
  if (!release.kdp_inputs.description_html && descriptionHtml) {
    inputUpdates.description_html = descriptionHtml;
  }
  if (release.kdp_inputs.keywords.length === 0 && kdpMeta?.keyword_picks_7 && kdpMeta.keyword_picks_7.length > 0) {
    inputUpdates.keywords = kdpMeta.keyword_picks_7;
  }
  if (release.kdp_inputs.categories.length === 0 && kdpMeta?.categories_validated && kdpMeta.categories_validated.length > 0) {
    inputUpdates.categories = kdpMeta.categories_validated;
  }
  if (Object.keys(inputUpdates).length > 0) {
    release = applyUpdates(release, {
      kdp_inputs: { ...release.kdp_inputs, ...inputUpdates },
    }, "L13 検索最適化拡張: meta.kdp_metadata から空フィールドを補完");
  }

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
    allowMissingRightsCheck: args.allowMissingRightsCheck,
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
