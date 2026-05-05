/**
 * KDP キーワード候補プール (なろう系コミカライズ 3ジャンル)
 *
 * 設計根拠 (Plan: wise-exploring-lantern.md F-2/F-3/F-4):
 *   - Phase A 3作品 (ダンジョン探索 / 転生貴族領地経営 / 現代ダンジョン) のロングテール検索流入を最大化
 *   - 「ジャンルの正面ワード」「主人公類型」「読者期待」「メタ訴求 (完結予定/サクサク/Kindle読み放題対象 等)」の4軸
 *   - 7枠は3-5語の組み合わせで使うのが推奨だが、単一語も有効 (keyword-validator A-6 修正参照)
 *
 * 利用先:
 *   - keyword-generator.ts: meta.json から genre + tags を読み、pool から候補を組み立てる
 *
 * 注: Amazon内施策語 (KU/Kindle Unlimited/ベストセラー/セール 等) は keyword-validator の DEFAULT_NG_WORDS で reject される。
 *     Pool には入れない。
 */

export type GenreSignature =
  | "modern_dungeon"
  | "isekai_dungeon_exploration"
  | "isekai_noble_territory";

export type KeywordPoolBucket = {
  /** ジャンル正面ワード (検索のヘッド) */
  genre_head: string[];
  /** 主人公類型 (Fランク / 落ちこぼれ / 追放 / 転生 / 鑑定 / etc) */
  protagonist_archetype: string[];
  /** ヒロイン・関係性 */
  heroine_relation: string[];
  /** 物語ベクトル (主人公最強 / ざまぁ / サクサク無双 / 痛快 / 内政 / etc) */
  story_vector: string[];
  /** ビジュアル記号 (ステータス / スキル / 魔法陣 / 紋章 / 探索者証 / etc) */
  visual_signature: string[];
  /** 世界観・設定 (現代日本 / 異世界 / 王国 / ダンジョン出現 / etc) */
  world_setting: string[];
  /** メタ訴求 (完結予定 / 漫画 / コミカライズ / シリーズ / etc) */
  meta_appeal: string[];
};

/** ダンジョン探索系 (蜘蛛ですが / 転スラ / ヘルモード / 第七王子 系統) */
const POOL_ISEKAI_DUNGEON: KeywordPoolBucket = {
  genre_head: ["異世界", "ダンジョン", "ダンジョン探索", "迷宮", "冒険者"],
  protagonist_archetype: [
    "転生", "落ちこぼれ", "鑑定士", "ハズレスキル", "底辺", "最弱",
    "成り上がり", "覚醒", "やり込み", "ヘルモード",
  ],
  heroine_relation: [
    "ヒロイン", "パーティ", "仲間", "受付嬢", "美少女", "ハーレム",
  ],
  story_vector: [
    "主人公最強", "無双", "サクサク無双", "下剋上", "成り上がり",
    "頭脳戦", "戦略", "完結予定", "ざまぁ", "痛快",
  ],
  visual_signature: [
    "ステータス", "スキル", "魔法陣", "レベルアップ", "魔法",
    "数値バトル", "称号",
  ],
  world_setting: [
    "異世界", "ファンタジー", "RPG", "迷宮", "ギルド", "王国", "魔王",
  ],
  meta_appeal: [
    "なろう系", "漫画", "コミカライズ", "シリーズ", "全話完結予定",
    "ライトノベル",
  ],
};

/** 転生貴族領地経営系 (本好きの下剋上 / 領民0人スタート / 鑑定スキル系統) */
const POOL_ISEKAI_NOBLE: KeywordPoolBucket = {
  genre_head: ["異世界", "転生貴族", "領地経営", "貴族令嬢", "内政"],
  protagonist_archetype: [
    "転生", "三男", "追放", "鑑定スキル", "ハズレスキル",
    "経営コンサル", "前世知識", "凡才", "悪役令嬢",
  ],
  heroine_relation: [
    "ヒロイン", "婚約者", "養女", "騎士", "侍女", "幼馴染", "悪役令嬢",
  ],
  story_vector: [
    "成り上がり", "ざまぁ", "内政チート", "下剋上", "領地復興",
    "改革", "完結予定", "痛快", "領主", "鑑定",
  ],
  visual_signature: [
    "鑑定", "ステータス", "紋章", "領地マップ", "執務", "魔法",
    "称号",
  ],
  world_setting: [
    "異世界", "ファンタジー", "王国", "貴族", "辺境", "領地", "学園",
    "社交界",
  ],
  meta_appeal: [
    "なろう系", "漫画", "コミカライズ", "シリーズ", "ライトノベル",
  ],
};

/** 現代ダンジョン系 (Dジェネシス / 壊れスキル / 凡人探索者 系統) */
const POOL_MODERN_DUNGEON: KeywordPoolBucket = {
  genre_head: [
    "現代ダンジョン", "ダンジョン", "探索者", "現代日本", "異能",
  ],
  protagonist_archetype: [
    "Fランク", "落ちこぼれ", "底辺", "サラリーマン", "リストラ",
    "覚醒", "ハズレスキル", "凡人", "高卒", "無職",
  ],
  heroine_relation: [
    "ヒロイン", "システム音声", "後輩", "女性探索者", "幼馴染",
    "二人三脚",
  ],
  story_vector: [
    "主人公最強", "無双", "サクサク無双", "下剋上", "成り上がり",
    "覚醒", "完結予定", "痛快", "億を稼ぐ", "経済",
  ],
  visual_signature: [
    "ステータス", "スキル", "ステータス可視化", "数値バトル",
    "探索者証", "魔石", "レベルアップ",
  ],
  world_setting: [
    "現代ダンジョン", "ダンジョン出現", "現代日本", "都市",
    "異能覚醒", "ギルド",
  ],
  meta_appeal: [
    "なろう系", "漫画", "コミカライズ", "シリーズ", "ダンジョン漫画",
    "ライトノベル",
  ],
};

const POOLS: Record<GenreSignature, KeywordPoolBucket> = {
  modern_dungeon: POOL_MODERN_DUNGEON,
  isekai_dungeon_exploration: POOL_ISEKAI_DUNGEON,
  isekai_noble_territory: POOL_ISEKAI_NOBLE,
};

export function getKeywordPool(genre: GenreSignature): KeywordPoolBucket {
  return POOLS[genre];
}

/** meta.json の genre 文字列から GenreSignature に正規化 */
export function resolveGenreSignature(genre: string | undefined, subgenre?: string): GenreSignature {
  const g = (genre ?? "").toLowerCase();
  const sg = (subgenre ?? "").toLowerCase();
  if (g.includes("modern_dungeon") || g.includes("modern-dungeon") || sg.includes("modern_dungeon")) {
    return "modern_dungeon";
  }
  if (g.includes("noble") || g.includes("territory") || g.includes("ryouchi") || sg.includes("noble")) {
    return "isekai_noble_territory";
  }
  // デフォは異世界ダンジョン探索 (なろう系の最大ジャンル)
  return "isekai_dungeon_exploration";
}
