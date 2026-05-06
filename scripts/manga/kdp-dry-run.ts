/**
 * KDP 検索最適化拡張 dry-run
 *
 * 目的: a07-modern-dungeon の meta.kdp_metadata から
 *   - description-template.ts (Description HTML)
 *   - keyword-validator.ts (7キーワードのNG/重複/単一語チェック)
 *   - kdp-input-md.ts (管理画面コピペ用Markdown)
 * の連携が壊れていないか、本番L13 (本文ページが必要) を経由せずに検証する。
 *
 * 実行: npx tsx scripts/manga/kdp-dry-run.ts --slug a07-modern-dungeon --volume 1
 * 出力: data/manga/works/{slug}/volumes/v{NN}/kdp/_dry-run/{description.html, keyword-report.json, kdp-input.md}
 */
import "./_env";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  buildKdpDescriptionHtml,
  descriptionSeedToInput,
  type DescriptionSeed,
} from "../../src/lib/manga/publish-v2/kdp/description-template";
import {
  validateKdpKeywords,
  DEFAULT_NG_WORDS,
} from "../../src/lib/manga/publish-v2/kdp/keyword-validator";
import { buildKdpInputMd } from "../../src/lib/manga/publish-v2/kdp/kdp-input-md";
import type {
  KdpRelease,
  KdpMetadata,
} from "../../src/lib/manga/schemas-v2";
import { DEFAULT_AI_DISCLOSURE_FLAGS, DEFAULT_AI_TOOLS_USED, DEFAULT_AI_USAGE_LEVEL } from "../../src/lib/manga/disclosure";

type WorkKdpMetadataBlock = {
  /** Phase Y WY-7 で導入: Codex 統一案採用後の確定タイトル (main + subtitle) */
  title_decision?: { main: string; subtitle?: string };
  title_candidates?: string[];
  series_name_canonical?: string;
  keyword_picks_7?: string[];
  categories_validated?: string[];
  description_seed?: DescriptionSeed;
};

type Args = { slug: string; volume: number };

function parseArgs(): Args {
  const a: Partial<Args> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.match(/^--([^=]+)=(.*)$/);
    let key: string | null = null;
    let val: string | null = null;
    if (eq) [, key, val] = eq;
    else {
      const flag = arg.match(/^--(.+)$/);
      if (flag && i + 1 < argv.length) {
        key = flag[1];
        val = argv[++i];
      }
    }
    if (!key || val === null) continue;
    if (key === "slug") a.slug = val;
    else if (key === "volume") a.volume = Number(val);
  }
  if (!a.slug || !a.volume) throw new Error("--slug, --volume required");
  return a as Args;
}

async function main() {
  const args = parseArgs();
  const repoRoot = path.resolve(__dirname, "..", "..");
  const workMetaPath = path.join(repoRoot, "data", "manga", "works", args.slug, "meta.json");
  const outDir = path.join(repoRoot, "data", "manga", "works", args.slug, "volumes", `v${String(args.volume).padStart(2, "0")}`, "kdp", "_dry-run");

  console.log(`[dry-run] meta.json: ${workMetaPath}`);
  const meta = JSON.parse(await fs.readFile(workMetaPath, "utf-8")) as Record<string, unknown>;
  const kdpMeta = meta.kdp_metadata as WorkKdpMetadataBlock | undefined;
  if (!kdpMeta) throw new Error(`meta.json に kdp_metadata ブロックがない (slug=${args.slug})`);

  // Phase Y WY-8: title_decision (Codex 統一案) > title_candidates[0] > meta.title の優先順位
  const finalTitle =
    kdpMeta.title_decision?.main ||
    (kdpMeta.title_candidates && kdpMeta.title_candidates.length > 0
      ? kdpMeta.title_candidates[0]
      : (meta.title as string));
  const finalSubtitle = kdpMeta.title_decision?.subtitle;

  console.log(`[dry-run] title (採用): ${finalTitle}`);
  if (finalSubtitle) console.log(`[dry-run] subtitle (採用): ${finalSubtitle}`);
  console.log(`[dry-run] title_decision: ${kdpMeta.title_decision ? "確定済 (Codex統一案)" : "未確定"}`);
  console.log(`[dry-run] title_candidates: ${kdpMeta.title_candidates?.length ?? 0}案`);
  console.log(`[dry-run] series_name_canonical: ${kdpMeta.series_name_canonical ?? "(未設定)"}`);
  console.log(`[dry-run] keyword_picks_7: ${kdpMeta.keyword_picks_7?.length ?? 0}枠`);
  console.log(`[dry-run] categories_validated: ${kdpMeta.categories_validated?.length ?? 0}件`);

  await fs.mkdir(outDir, { recursive: true });

  // 1. Description HTML 生成
  if (!kdpMeta.description_seed) throw new Error("description_seed が無い");
  const descriptionHtml = buildKdpDescriptionHtml(
    descriptionSeedToInput({
      seed: kdpMeta.description_seed,
      title: finalTitle,
      seriesName: kdpMeta.series_name_canonical,
      volumeNo: args.volume,
      authorPenName: "AINARO",
      genre: meta.genre as string | undefined,
    }),
  );
  const descriptionPath = path.join(outDir, "description.html");
  await fs.writeFile(descriptionPath, descriptionHtml);
  console.log(`[dry-run] description.html: ${descriptionPath} (${descriptionHtml.length}字)`);

  // 2. Keyword バリデーション
  const kvResult = validateKdpKeywords({
    picks: kdpMeta.keyword_picks_7 ?? [],
    ngWords: DEFAULT_NG_WORDS,
  });
  const keywordReportPath = path.join(outDir, "keyword-report.json");
  await fs.writeFile(keywordReportPath, JSON.stringify(kvResult, null, 2));
  console.log(`[dry-run] keyword-report.json: ${keywordReportPath}`);
  console.log(`  → ok=${kvResult.ok}, errors=${kvResult.errors.length}, warnings=${kvResult.warnings.length}, unique_words=${kvResult.unique_word_count}`);
  for (const e of kvResult.errors) console.log(`    ❌ ${e.code}: ${e.message}`);
  for (const w of kvResult.warnings) console.log(`    ⚠️ ${w.code}: ${w.message}`);

  // 3. ダミー release/metadata を構築して buildKdpInputMd 実行
  // Phase Y WY-8: subtitle は title_decision.subtitle (Codex 統一案) を優先、fallback で「第N巻」
  const finalSubtitleForKdp = finalSubtitle ?? `第${args.volume}巻`;
  const dummyMetadata: KdpMetadata = {
    schema_version: 2,
    slug: args.slug,
    volume_no: args.volume,
    title: finalTitle,
    subtitle: finalSubtitleForKdp,
    author_pen_name: "AINARO",
    bisac_categories: ["COM004000", "FIC036000"],
    ai_disclosure: { ...DEFAULT_AI_DISCLOSURE_FLAGS },
    ai_tools_used: [...DEFAULT_AI_TOOLS_USED],
    human_review_performed: true,
    page_count: 200,
    spine_width_mm: 12.5,
    publication_date: new Date().toISOString().split("T")[0],
    manuscript_pdf_path: "(dry-run: 未生成)",
    cover_pdf_path: "(dry-run: 未生成)",
    title_candidates: kdpMeta.title_candidates,
    series_name_canonical: kdpMeta.series_name_canonical,
    keyword_picks_7: kdpMeta.keyword_picks_7,
    categories_validated: kdpMeta.categories_validated,
  };

  const dummyRelease: KdpRelease = {
    schema_version: 1,
    slug: args.slug,
    volume_no: args.volume,
    status: "draft",
    manuscript_pdf_path: "(dry-run)",
    cover_pdf_path: "(dry-run)",
    ai_disclosure: { ...DEFAULT_AI_DISCLOSURE_FLAGS },
    ai_tools_used: [...DEFAULT_AI_TOOLS_USED],
    human_review_performed: true,
    rights_check: {
      trademark_passed: false,
      ip_similarity_passed: false,
      checked_at: new Date().toISOString(),
      notes: "dry-run: 未実施",
    },
    kdp_inputs: {
      title: finalTitle,
      subtitle: finalSubtitleForKdp,
      description_html: descriptionHtml,
      keywords: kdpMeta.keyword_picks_7 ?? [],
      categories: kdpMeta.categories_validated ?? [],
    },
    pricing: {
      price_jpy: (meta.kdp_target as { ebook_price_yen?: number } | undefined)?.ebook_price_yen ?? 0,
      ku_enrolled: true,
      royalty_plan: "70",
    },
    schedule: {},
    preview_log: [],
    edit_history: [],
  };

  const inputMdPath = path.join(outDir, "kdp-input.md");
  await buildKdpInputMd({
    release: dummyRelease,
    metadata: dummyMetadata,
    aiUsageLevel: DEFAULT_AI_USAGE_LEVEL,
    outputPath: inputMdPath,
  });
  console.log(`[dry-run] kdp-input.md: ${inputMdPath}`);

  console.log(`\n[dry-run] DONE. 出力一覧:`);
  console.log(`  - ${descriptionPath}`);
  console.log(`  - ${keywordReportPath}`);
  console.log(`  - ${inputMdPath}`);
}

main().catch((e) => {
  console.error("[dry-run] FAILED:", e);
  process.exit(1);
});
