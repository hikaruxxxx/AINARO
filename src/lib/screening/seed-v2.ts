// 5次元シード生成: 感情欲求 + ジャンル + 4軸タグ
//
// 設計:
// - 固定軸(機械抽選): 感情欲求(主+副) / ジャンル
// - LLM裁量軸: 境遇/転機の具体化 / 物語の方向性
// - 既存 element-grid.ts の4軸を流用しつつ、感情欲求軸を追加
// - 4-tuple完全一致除外: (感情主, ジャンル, 境遇, 転機) が全て同じ過去シードのみ弾く
// - ε探索: 各層で異なる ε値(階層的バランス)
// - 重複は _used_seeds.json に蓄積

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { loadElementGrid, loadYieldStats, type ElementGrid, type YieldStats } from "./element-grid";
import type { ElementTags } from "./types";

export interface ReaderDesire {
  id: string;
  name: string;
  description: string;
  exampleGenres: string[];
  exampleHooks: string[];
  weight: number;
}

export interface ReaderDesiresFile {
  version: string;
  desires: ReaderDesire[];
}

export interface SeedV2 {
  /** 4-tuple除外用キー */
  fingerprint: string;
  primaryDesire: string; // 主感情欲求 id
  secondaryDesire: string; // 副感情欲求 id
  genre: string;
  tags: ElementTags;
  /** 探索枠かどうか */
  isExploration: boolean;
  createdAt: string;
}

export interface UsedSeedsFile {
  version: string;
  fingerprints: string[]; // (primaryDesire|genre|境遇|転機)
  seeds: SeedV2[];
}

export interface SampleSeedOptions {
  genre?: string; // 指定なければジャンル分布から抽選
  isExploration?: boolean; // 探索枠
  /** 階層別ε値 */
  epsilon?: number;
  /** ジャンル分布 */
  genreDistribution?: Record<string, number>;
}

// genre-taxonomy.json v2 に対応したジャンル分布
// 大ジャンル比率: isekai 30% / otome 25% / battle 15% / modern 15% / mystery 15%
// 各大ジャンル内は均等配分(初期値、Phase 1B 以降に歩留まり学習で調整)
const DEFAULT_GENRE_DISTRIBUTION: Record<string, number> = {
  // isekai 30%
  isekai_tensei_cheat: 0.075,
  isekai_tsuiho_zamaa: 0.075,
  isekai_slowlife: 0.075,
  isekai_high_fantasy: 0.075,
  // otome 25%
  otome_akuyaku_zamaa: 0.0625,
  otome_konyaku_haki: 0.0625,
  otome_isekai_pure: 0.0625,
  otome_villain_fantasy: 0.0625,
  // battle 15%
  battle_vrmmo: 0.0375,
  battle_modern_power: 0.0375,
  battle_war_chronicle: 0.0375,
  battle_dungeon: 0.0375,
  // modern 15%
  modern_romance: 0.0375,
  modern_school: 0.0375,
  modern_human_drama: 0.0375,
  modern_history: 0.0375,
  // mystery 15%
  mystery_detective: 0.0375,
  mystery_horror: 0.0375,
  mystery_sf: 0.0375,
  mystery_action: 0.0375,
};

let cachedDesires: ReaderDesiresFile | null = null;

export function loadReaderDesires(path = "data/generation/reader-desires.json"): ReaderDesiresFile {
  if (cachedDesires) return cachedDesires;
  if (!existsSync(path)) {
    throw new Error(`reader-desires.json not found at ${path}`);
  }
  cachedDesires = JSON.parse(readFileSync(path, "utf-8")) as ReaderDesiresFile;
  return cachedDesires;
}

export function loadUsedSeeds(path = "data/generation/_used_seeds.json"): UsedSeedsFile {
  if (!existsSync(path)) {
    return { version: "v1", fingerprints: [], seeds: [] };
  }
  return JSON.parse(readFileSync(path, "utf-8")) as UsedSeedsFile;
}

export function saveUsedSeeds(file: UsedSeedsFile, path = "data/generation/_used_seeds.json"): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2));
}

/** 4-tuple指紋を生成: (primaryDesire|genre|境遇|転機) */
export function makeFingerprint(
  primaryDesire: string,
  genre: string,
  tags: ElementTags,
): string {
  return `${primaryDesire}|${genre}|${tags.境遇}|${tags.転機}`;
}

/** 重み付き抽選 */
function weightedSample<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** ジャンル分布から1ジャンル抽選 */
function pickGenre(distribution: Record<string, number>): string {
  const genres = Object.keys(distribution);
  const weights = genres.map((g) => distribution[g]);
  return weightedSample(genres, weights);
}

// 新サブジャンル → element-grid.json の旧キーへのマッピング
// element-grid.json は旧7ジャンルしか持たないため、意味的に近い旧キーから借りる
// 完全一致がない新サブジャンルは "isekai_high_fantasy" を介して 転生_ファンタジー にフォールバック
const SUBGENRE_TO_LEGACY: Record<string, string> = {
  // isekai
  isekai_tensei_cheat: "転生_ファンタジー",
  isekai_tsuiho_zamaa: "追放_ファンタジー",
  isekai_slowlife: "スローライフ_ファンタジー",
  isekai_high_fantasy: "転生_ファンタジー",
  // otome
  otome_akuyaku_zamaa: "悪役令嬢_恋愛",
  otome_konyaku_haki: "婚約破棄_恋愛",
  otome_isekai_pure: "異世界恋愛_純粋",
  otome_villain_fantasy: "悪役令嬢_ファンタジー",
  // battle: element-gridに存在しない → 転生_ファンタジー(冒険系として近い)で代替
  battle_vrmmo: "転生_ファンタジー",
  battle_modern_power: "転生_ファンタジー",
  battle_war_chronicle: "転生_ファンタジー",
  battle_dungeon: "転生_ファンタジー",
  // modern: 該当なし → 異世界恋愛_純粋(恋愛要素強め)で暫定
  modern_romance: "異世界恋愛_純粋",
  modern_school: "異世界恋愛_純粋",
  modern_human_drama: "異世界恋愛_純粋",
  modern_history: "転生_ファンタジー",
  // mystery: 該当なし → 悪役令嬢_ファンタジー(策略要素)で暫定
  mystery_detective: "悪役令嬢_ファンタジー",
  mystery_horror: "悪役令嬢_ファンタジー",
  mystery_sf: "転生_ファンタジー",
  mystery_action: "追放_ファンタジー",
};

/** タグを抽選(element-grid + ε探索 + yield-stats重み) */
function pickTags(
  grid: ElementGrid,
  genre: string,
  stats: YieldStats,
  epsilon: number,
): ElementTags {
  // 新サブジャンルキーなら旧キーに変換
  const lookupKey = grid.byGenre[genre] ? genre : (SUBGENRE_TO_LEGACY[genre] ?? genre);
  const g = grid.byGenre[lookupKey];
  if (!g) {
    // 最終フォールバック: 最初のジャンルから借りる
    const firstGenre = Object.keys(grid.byGenre)[0];
    return pickTags(grid, firstGenre, stats, epsilon);
  }

  // ε探索: ε確率で完全ランダム、1-ε確率で yield-stats 重み付き
  const useExploration = Math.random() < epsilon;
  if (useExploration || stats.totalBatches < 30) {
    return {
      境遇: pickRandom(g.境遇),
      転機: pickRandom(g.転機),
      方向: pickRandom(g.方向),
      フック: pickRandom(g.フック),
    };
  }

  // yield-stats重み付き(現状フラットに近いが、将来の拡張用)
  return {
    境遇: pickRandom(g.境遇),
    転機: pickRandom(g.転機),
    方向: pickRandom(g.方向),
    フック: pickRandom(g.フック),
  };
}

/** 5次元シードを1件抽選(重複除外あり) */
export function sampleSeedV2(opts: SampleSeedOptions = {}): SeedV2 | null {
  const desiresFile = loadReaderDesires();
  const grid = loadElementGrid("data/generation/element-grid.json");
  if (!grid) {
    throw new Error("element-grid.json が存在しません。先に scripts/generation/extract-element-grid.ts を実行してください");
  }
  const stats = loadYieldStats("data/generation/yield-stats.json");
  const used = loadUsedSeeds();

  const epsilon = opts.epsilon ?? 0.2;
  const distribution = opts.genreDistribution ?? DEFAULT_GENRE_DISTRIBUTION;

  // 最大100回試行して未使用4-tupleを引く
  for (let attempt = 0; attempt < 100; attempt++) {
    const genre = opts.genre ?? pickGenre(distribution);
    const desires = desiresFile.desires;
    const primary = weightedSample(desires, desires.map((d) => d.weight));
    let secondary = pickRandom(desires);
    while (secondary.id === primary.id && desires.length > 1) {
      secondary = pickRandom(desires);
    }
    const tags = pickTags(grid, genre, stats, epsilon);
    const fingerprint = makeFingerprint(primary.id, genre, tags);

    if (used.fingerprints.includes(fingerprint)) continue;

    const seed: SeedV2 = {
      fingerprint,
      primaryDesire: primary.id,
      secondaryDesire: secondary.id,
      genre,
      tags,
      isExploration: opts.isExploration ?? false,
      createdAt: new Date().toISOString(),
    };
    return seed;
  }
  return null; // 100試行で見つからなければ枯渇
}

/** シードを使用済みとして記録 */
export function commitSeed(seed: SeedV2, path = "data/generation/_used_seeds.json"): void {
  const used = loadUsedSeeds(path);
  if (used.fingerprints.includes(seed.fingerprint)) return;
  used.fingerprints.push(seed.fingerprint);
  used.seeds.push(seed);
  saveUsedSeeds(used, path);
}

/** ログライン生成LLMに渡すプロンプトを構築 */
export function buildLoglinePrompt(seed: SeedV2): string {
  const desires = loadReaderDesires();
  const primary = desires.desires.find((d) => d.id === seed.primaryDesire);
  const secondary = desires.desires.find((d) => d.id === seed.secondaryDesire);
  return `あなたはWeb小説のログライン作家です。以下の素材から、面白い1文のログラインを書いてください。

# 素材
- ジャンル: ${seed.genre}
- 主感情欲求: ${primary?.name}(${primary?.description})
- 副感情欲求: ${secondary?.name}(${secondary?.description})
- 境遇: ${seed.tags.境遇}
- 転機: ${seed.tags.転機}
- 方向: ${seed.tags.方向}
- フック: ${seed.tags.フック}

# 制約
- 1文(80文字以内)
- 既存のヒット作の単なるコピーは禁止
- ただし「読者が好む構造」は積極的に踏襲してよい
- 検索キーワードを含める(なろう読者向け)
- 主人公の境遇 + 転機 + 方向性が伝わるように

# 出力形式
JSON1行:
{"logline": "..."}`;
}
