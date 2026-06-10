/**
 * KDP 7 キーワード自動生成 (なろう系コミカライズ)
 *
 * 設計根拠 (Plan: wise-exploring-lantern.md B-3):
 *   - meta.json の genre / tags / kdp_metadata.differentiation_keywords を読み、
 *     keyword-pool から 7枠の組み合わせを生成
 *   - 各枠 50字以内、合計7枠以内、Amazon内施策語(NG語) を含まない
 *   - 7枠の役割分担を意図的に振る:
 *      枠1: ジャンル正面 + 主人公類型 + ビジュアル記号
 *      枠2: 主人公最強系 + ジャンル
 *      枠3: ヒロイン関係 + 物語ベクトル
 *      枠4: 物語ベクトル + メタ訴求
 *      枠5: 主人公類型 + 物語ベクトル + 痛快系
 *      枠6: ビジュアル記号 + ジャンル + メタ
 *      枠7: 世界観 + 主人公類型 (差別化)
 *   - keyword-validator で検証してから返す。errors があれば throw
 */
import {
  type KeywordPoolBucket,
  type GenreSignature,
  getKeywordPool,
} from "./keyword-pool";
import {
  validateKdpKeywords,
  DEFAULT_NG_WORDS,
  type KeywordValidationResult,
} from "./keyword-validator";

export type GenerateKeywordsArgs = {
  genre: GenreSignature;
  /** meta.json の tags ブロック (kyoguu/tenki/houkou/fukku 等の自由文) */
  tags?: Record<string, string>;
  /** 差別化キーワード (meta.json の differentiation 由来の重要語、優先で混ぜる) */
  differentiation_terms?: string[];
  /** 既存のキーワード (上書きしたくないとき。null なら自動生成) */
  existing?: string[];
  /** 追加 NG 語 (作品固有 / 著者固有 / 競合著者) */
  extra_ng_words?: string[];
  /** 各枠の最大字数 (デフォは 50, KDP仕様) */
  maxCharsPerField?: number;
};

export type GenerateKeywordsResult = {
  picks: string[];
  validation: KeywordValidationResult;
  source: "existing" | "generated";
};

const MAX_CHARS = 50;

/** 1枠を組み立て: terms をスペース結合。空白除外 + 字数オーバーで末尾削除 */
function composeField(terms: string[], max: number): string {
  const filtered = terms
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  // 重複除去 (順序保持)
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const t of filtered) {
    if (!seen.has(t)) {
      seen.add(t);
      dedup.push(t);
    }
  }
  // 字数オーバーしないように末尾から削る (スペース1字分も計算)
  let result = dedup.join(" ");
  while (result.length > max && dedup.length > 1) {
    dedup.pop();
    result = dedup.join(" ");
  }
  return result;
}

/** pool から idx 番目を安全取得 (なければ undefined) */
function pick<T>(arr: T[], idx: number): T | undefined {
  return arr.length > idx ? arr[idx] : undefined;
}

function compactTerms(terms: Array<string | undefined>): string[] {
  return terms.filter((t): t is string => typeof t === "string" && t.length > 0);
}

/**
 * 7枠を機械的に組み立てる。
 * pool 内の語を idx ベースで配分し、tag/differentiation を必要に応じて優先注入。
 */
function buildSevenFields(
  pool: KeywordPoolBucket,
  args: GenerateKeywordsArgs,
  max: number
): string[] {
  const diff = args.differentiation_terms ?? [];
  const tagValues = Object.values(args.tags ?? {});

  // 役割分担した7枠
  const slots: string[][] = [];

  // 枠1: ジャンル正面 + 主人公類型 + ビジュアル記号
  slots.push(
    compactTerms([
      pick(pool.genre_head, 0),
      pick(pool.protagonist_archetype, 0),
      pick(pool.visual_signature, 0),
    ])
  );

  // 枠2: 主人公類型 + 物語ベクトル + メタ
  slots.push(
    compactTerms([
      pick(pool.protagonist_archetype, 1),
      pick(pool.story_vector, 0),
      pick(pool.meta_appeal, 0),
    ])
  );

  // 枠3: ヒロイン関係 + 物語ベクトル (二人三脚 / 関係性訴求)
  slots.push(
    compactTerms([
      pick(pool.heroine_relation, 0),
      pick(pool.heroine_relation, 1),
      pick(pool.story_vector, 1),
    ])
  );

  // 枠4: 物語ベクトル + ジャンル + メタ (サクサク + ジャンル漫画 + 完結予定)
  slots.push(
    compactTerms([
      pick(pool.story_vector, 2),
      pick(pool.genre_head, 1),
      pick(pool.meta_appeal, 1),
    ])
  );

  // 枠5: 主人公類型 + 物語ベクトル + 痛快系 (ざまぁ / 下剋上)
  slots.push(
    compactTerms([
      pick(pool.protagonist_archetype, 2),
      pick(pool.story_vector, 3),
      pick(pool.story_vector, 4),
    ])
  );

  // 枠6: ビジュアル記号 + ジャンル + 漫画 (ステータス可視化 / 数値バトル系)
  slots.push(
    compactTerms([
      pick(pool.visual_signature, 1),
      pick(pool.visual_signature, 2),
      pick(pool.meta_appeal, 0),
    ])
  );

  // 枠7: 世界観 + 主人公類型 (差別化用、tag/differentiation を優先)
  const slot7Terms = compactTerms([
    pick(pool.world_setting, 0),
    pool.world_setting[1] ?? pool.world_setting[0],
    pick(pool.protagonist_archetype, 3),
  ]);
  if (diff.length > 0) {
    // 差別化語があれば slot7 の頭に置く
    slot7Terms.unshift(...diff.slice(0, 2));
  } else if (tagValues.length > 0) {
    // tag を補助的に
    slot7Terms.unshift(tagValues[0]);
  }
  slots.push(slot7Terms);

  return slots.map((s) => composeField(s, max));
}

export function generateKeywordPicks(args: GenerateKeywordsArgs): GenerateKeywordsResult {
  const max = args.maxCharsPerField ?? MAX_CHARS;
  const ngWords = [...DEFAULT_NG_WORDS, ...(args.extra_ng_words ?? [])];

  // 既存があればそれを尊重 (上書きしない方針)
  if (args.existing && args.existing.length > 0) {
    const validation = validateKdpKeywords({ picks: args.existing, ngWords });
    return { picks: args.existing, validation, source: "existing" };
  }

  const pool = getKeywordPool(args.genre);
  const picks = buildSevenFields(pool, args, max);
  const validation = validateKdpKeywords({ picks, ngWords });

  if (!validation.ok) {
    // errors があれば内容と理由を投げる (運用判断)
    const reasons = validation.errors.map((e) => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`[generateKeywordPicks] 自動生成キーワードが validator に通らない: ${reasons}`);
  }

  return { picks, validation, source: "generated" };
}
