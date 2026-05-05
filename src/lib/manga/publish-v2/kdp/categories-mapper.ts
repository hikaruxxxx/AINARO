/**
 * KDP カテゴリ自動マッピング (なろう系コミカライズ 3ジャンル)
 *
 * 設計根拠 (Plan: wise-exploring-lantern.md B-3, a07 categories_evidence 由来):
 *   - KDP 上限 3カテゴリ (2023年中盤改定)
 *   - 「Kindle本 > マンガ > 少年マンガ」「Kindle本 > マンガ > 青年マンガ」「本 > コミック・ラノベ・BL > コミック」が
 *     なろう系コミカライズの上位作品で確認された定番3カテゴリ (a07 categories_evidence 参照)
 *   - 第3カテゴリは商業出版物理書籍寄りのパスを採用 (Kindle単独でも分類される)
 *
 * 注意: BISACコード (kdp_metadata.bisac_categories) はカテゴリパスとは別 (国際規格)。
 *       本モジュールは Amazon.co.jp 表示パスのみ扱う。
 */
import type { GenreSignature } from "./keyword-pool";

/** 標準3カテゴリパス (a07 evidence で実証済) */
const STANDARD_3_CATEGORIES = [
  "Kindleストア > Kindle本 > マンガ > 少年マンガ",
  "Kindleストア > Kindle本 > マンガ > 青年マンガ",
  "本 > コミック・ラノベ・BL > コミック",
] as const;

/**
 * ジャンルから KDP categories 3件を提案。
 * 現状 3ジャンルとも同じ標準セットを返す (a07 evidence を踏襲)。
 * ただし将来 sub-segment ごとに最適化したい場合に拡張可能。
 */
export function mapCategoriesForGenre(_genre: GenreSignature): string[] {
  return [...STANDARD_3_CATEGORIES];
}

/** 既存 categories が標準セットと一致しているか検証 */
export function isStandardCategorySet(categories: string[]): boolean {
  if (categories.length !== STANDARD_3_CATEGORIES.length) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const a = categories.map(norm).sort();
  const b = [...STANDARD_3_CATEGORIES].map(norm).sort();
  return a.every((v, i) => v === b[i]);
}

/** BISAC コード推奨 (なろう系コミカライズはほぼ Comics & Graphic Novels / Manga 系) */
export const RECOMMENDED_BISAC_CODES = [
  "CGN004060", // Comics & Graphic Novels / Manga / Action & Adventure
  "CGN004130", // Comics & Graphic Novels / Manga / Fantasy
  "CGN004110", // Comics & Graphic Novels / Manga / Science Fiction
] as const;

export function recommendBisacForGenre(genre: GenreSignature): string[] {
  switch (genre) {
    case "isekai_dungeon_exploration":
      return [RECOMMENDED_BISAC_CODES[1], RECOMMENDED_BISAC_CODES[0]]; // Fantasy + Action
    case "isekai_noble_territory":
      return [RECOMMENDED_BISAC_CODES[1]]; // Fantasy 単独
    case "modern_dungeon":
      return [RECOMMENDED_BISAC_CODES[2], RECOMMENDED_BISAC_CODES[0]]; // SF + Action
    default:
      return [RECOMMENDED_BISAC_CODES[1]];
  }
}
