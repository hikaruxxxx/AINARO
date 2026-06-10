/**
 * L12.5 KDP メタデータ自動最適化 (Phase A 3作品向け)
 *
 * 設計根拠 (Plan: wise-exploring-lantern.md B-3 / P0#7):
 *   - meta.json の kdp_metadata ブロックで未入力のフィールドを補完する
 *   - 既存の手動入力は **絶対に上書きしない** (a07 のような実績ある手動運用を尊重)
 *   - 補完対象:
 *     - title_candidates (5案)
 *     - keyword_picks_7 (7枠、validator にかけて NG / 50字 / 重複チェック)
 *     - categories_validated (3カテゴリ標準セット)
 *     - description_seed (hook/turn/synopsis/recommend/cta/related)
 *     - series_name_canonical (meta.title_short or genre + protagonist から)
 *
 * 動作モード:
 *   - dry-run: meta.json は書き換えず、生成案を JSON で別ファイルに出力
 *   - apply  : meta.kdp_metadata を inplace 更新 (未入力フィールドのみ)
 *
 * 実行:
 *   npx tsx scripts/manga/layers/L12-5-kdp-optimize.ts --slug a07-modern-dungeon
 *   npx tsx scripts/manga/layers/L12-5-kdp-optimize.ts --slug a07-modern-dungeon --apply
 */
import "../_env";
import { promises as fs } from "node:fs";
import path from "node:path";

import { workMetaPath, workDir } from "./_paths";
import {
  resolveGenreSignature,
  type GenreSignature,
} from "../../../src/lib/manga/publish-v2/kdp/keyword-pool";
import { generateKeywordPicks } from "../../../src/lib/manga/publish-v2/kdp/keyword-generator";
import {
  mapCategoriesForGenre,
  recommendBisacForGenre,
  isStandardCategorySet,
} from "../../../src/lib/manga/publish-v2/kdp/categories-mapper";
import { buildDescriptionSeed } from "../../../src/lib/manga/publish-v2/kdp/description-seed-builder";
import { generateTitleCandidates } from "../../../src/lib/manga/publish-v2/kdp/title-candidates";
import type { DescriptionSeed } from "../../../src/lib/manga/publish-v2/kdp/description-template";

type Args = {
  slug: string;
  apply: boolean;
  outDir?: string;
};

function parseArgs(argv: string[]): Args {
  let slug: string | undefined;
  let apply = false;
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") slug = argv[++i];
    else if (a === "--apply") apply = true;
    else if (a === "--out-dir") outDir = argv[++i];
  }
  if (!slug) {
    throw new Error("--slug が必要");
  }
  return { slug, apply, outDir };
}

type WorkMeta = {
  slug: string;
  title?: string;
  title_short?: string;
  genre?: string;
  subgenre?: string;
  tags?: Record<string, string>;
  differentiation?: string;
  volume_plan?: {
    estimated_volumes?: number;
    target_pages_per_episode?: number;
    target_episodes_per_volume?: number;
  };
  kdp_metadata?: {
    title_candidates?: string[];
    series_name_canonical?: string;
    keyword_picks_7?: string[];
    categories_validated?: string[];
    description_seed?: DescriptionSeed;
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

async function loadMeta(slug: string): Promise<WorkMeta> {
  const p = workMetaPath(slug);
  const raw = await fs.readFile(p, "utf-8");
  return JSON.parse(raw) as WorkMeta;
}

async function saveMeta(slug: string, meta: WorkMeta): Promise<void> {
  const p = workMetaPath(slug);
  const json = JSON.stringify(meta, null, 2);
  await fs.writeFile(p, json + "\n", "utf-8");
}

/** meta から差別化キーワード (短い名詞句) を抽出 */
function extractDifferentiationTerms(meta: WorkMeta): string[] {
  const out: string[] = [];
  if (meta.differentiation) {
    // ざっくり「、」「。」で分割し、短い句を取り出す (15字以内)
    const segs = meta.differentiation.split(/[、。\n]+/);
    for (const s of segs) {
      const trimmed = s.trim();
      if (trimmed.length > 0 && trimmed.length <= 15) {
        out.push(trimmed);
      }
      if (out.length >= 3) break;
    }
  }
  return out;
}

/**
 * meta から 主人公類型ラベル (description_seed の {protagonist_archetype} 用) を組み立て
 * 例: kyoguu="落ちこぼれ探索者" + tenki="システム音声覚醒" から「Fランク探索者」など。
 * シンプルに kyoguu (境遇) を使い、空なら genre から fallback する
 */
function inferProtagonistArchetype(meta: WorkMeta, genre: GenreSignature): string {
  const tag = meta.tags?.kyoguu;
  if (tag && tag.length > 0) return tag;
  switch (genre) {
    case "modern_dungeon":
      return "Fランク探索者";
    case "isekai_dungeon_exploration":
      return "落ちこぼれ冒険者";
    case "isekai_noble_territory":
      return "辺境追放の三男";
  }
}

function inferGenreContext(genre: GenreSignature): string {
  switch (genre) {
    case "modern_dungeon":
      return "現代ダンジョン";
    case "isekai_dungeon_exploration":
      return "迷宮";
    case "isekai_noble_territory":
      return "領地経営";
  }
}

function inferOutcomeHint(genre: GenreSignature): string {
  switch (genre) {
    case "modern_dungeon":
      return "世界最速でレベルアップした件";
    case "isekai_dungeon_exploration":
      return "最強になった件";
    case "isekai_noble_territory":
      return "領地を立て直す";
  }
}

type OptimizeResult = {
  genre: GenreSignature;
  generated: {
    title_candidates: string[];
    series_name_canonical: string;
    keyword_picks_7: string[];
    categories_validated: string[];
    bisac_recommended: string[];
    description_seed: DescriptionSeed;
  };
  filled: {
    title_candidates: boolean;
    series_name_canonical: boolean;
    keyword_picks_7: boolean;
    categories_validated: boolean;
    description_seed: boolean;
  };
  /** 生成キーワードに対する validator 結果 */
  keyword_validation_summary: {
    ok: boolean;
    errors: number;
    warnings: number;
    unique_word_count: number;
  };
};

function optimize(meta: WorkMeta): OptimizeResult {
  const genre = resolveGenreSignature(meta.genre, meta.subgenre);
  const archetype = inferProtagonistArchetype(meta, genre);
  const context = inferGenreContext(genre);
  const outcome = inferOutcomeHint(genre);

  // 既存値の有無
  const km = meta.kdp_metadata ?? {};
  const has = {
    title_candidates: Array.isArray(km.title_candidates) && km.title_candidates.length > 0,
    series_name_canonical: typeof km.series_name_canonical === "string" && km.series_name_canonical.length > 0,
    keyword_picks_7: Array.isArray(km.keyword_picks_7) && km.keyword_picks_7.length > 0,
    categories_validated: Array.isArray(km.categories_validated) && km.categories_validated.length > 0,
    description_seed: km.description_seed && typeof km.description_seed === "object",
  };

  // 1. title_candidates
  const titleCandidates = generateTitleCandidates({
    genre,
    protagonistArchetype: archetype,
    cheatElement: meta.tags?.tenki,
    genreContext: context,
    outcomeHint: outcome,
    shortSeriesName: meta.title_short,
  });

  // 2. series_name_canonical
  const seriesCanonical = meta.title_short ?? archetype;

  // 3. keyword_picks_7 — 既存があれば validator だけ通す形
  const diffTerms = extractDifferentiationTerms(meta);
  const kwResult = generateKeywordPicks({
    genre,
    tags: meta.tags,
    differentiation_terms: diffTerms,
    existing: has.keyword_picks_7 ? km.keyword_picks_7 : undefined,
  });

  // 4. categories
  const categories = has.categories_validated && km.categories_validated
    ? km.categories_validated
    : mapCategoriesForGenre(genre);
  const bisac = recommendBisacForGenre(genre);

  // 5. description_seed
  const vp = meta.volume_plan ?? {};
  const description_seed: DescriptionSeed = has.description_seed && km.description_seed
    ? km.description_seed
    : buildDescriptionSeed({
        genre,
        protagonistArchetype: archetype,
        protagonistName: undefined,
        trigger: meta.tags?.tenki,
        abilityOrPartner: meta.tags?.tenki,
        secretAdvantage: meta.tags?.fukku,
        totalVolumes: vp.estimated_volumes,
        pagesPerEp: vp.target_pages_per_episode,
        epsPerVolume: vp.target_episodes_per_volume,
        differentiationLine: diffTerms[0],
      });

  return {
    genre,
    generated: {
      title_candidates: titleCandidates,
      series_name_canonical: seriesCanonical,
      keyword_picks_7: kwResult.picks,
      categories_validated: categories,
      bisac_recommended: bisac,
      description_seed,
    },
    filled: {
      title_candidates: !has.title_candidates,
      series_name_canonical: !has.series_name_canonical,
      keyword_picks_7: !has.keyword_picks_7,
      categories_validated: !has.categories_validated,
      description_seed: !has.description_seed,
    },
    keyword_validation_summary: {
      ok: kwResult.validation.ok,
      errors: kwResult.validation.errors.length,
      warnings: kwResult.validation.warnings.length,
      unique_word_count: kwResult.validation.unique_word_count,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[L12.5] slug=${args.slug} apply=${args.apply}`);

  const meta = await loadMeta(args.slug);
  const result = optimize(meta);

  console.log(`[L12.5] genre=${result.genre}`);
  console.log(`[L12.5] keyword validation: ok=${result.keyword_validation_summary.ok} errors=${result.keyword_validation_summary.errors} warnings=${result.keyword_validation_summary.warnings} uniq=${result.keyword_validation_summary.unique_word_count}`);
  for (const [k, v] of Object.entries(result.filled)) {
    console.log(`[L12.5] would fill ${k}: ${v ? "YES (empty)" : "no (already set)"}`);
  }

  // 出力先 (dry-run / 提案レポート)
  const outDir = args.outDir ?? path.join(workDir(args.slug), "kdp", "_l12_5");
  await fs.mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, "kdp-optimize-report.json");
  await fs.writeFile(reportPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  console.log(`[L12.5] report: ${reportPath}`);

  if (args.apply) {
    // 既存値を尊重して merge (空のフィールドのみ埋める)
    const km = { ...(meta.kdp_metadata ?? {}) };
    if (result.filled.title_candidates) km.title_candidates = result.generated.title_candidates;
    if (result.filled.series_name_canonical) km.series_name_canonical = result.generated.series_name_canonical;
    if (result.filled.keyword_picks_7) km.keyword_picks_7 = result.generated.keyword_picks_7;
    if (result.filled.categories_validated) km.categories_validated = result.generated.categories_validated;
    if (result.filled.description_seed) km.description_seed = result.generated.description_seed;
    // bisac は別管理、既存があれば触らない
    if (!km.bisac_recommended) km.bisac_recommended = result.generated.bisac_recommended;
    // _l12_5 補完履歴
    km._l12_5_last_run = new Date().toISOString();
    km._l12_5_filled_keys = Object.entries(result.filled).filter(([, v]) => v).map(([k]) => k);

    const next: WorkMeta = { ...meta, kdp_metadata: km };
    await saveMeta(args.slug, next);
    console.log(`[L12.5] APPLIED. meta.json updated.`);
  } else {
    console.log(`[L12.5] dry-run only. --apply で meta.json に書き戻し。`);
  }

  // categories 警告
  if (!isStandardCategorySet(result.generated.categories_validated)) {
    console.warn(`[L12.5] WARN: categories が標準セットと異なる。kdp_metadata.categories_evidence で根拠を残すこと。`);
  }
}

main().catch((e) => {
  console.error(`[L12.5] FATAL: ${(e as Error).message}`);
  process.exit(1);
});
