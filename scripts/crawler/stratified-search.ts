#!/usr/bin/env npx tsx
// 層別サンプリング検索
// ジャンル × ポピュラリティ階層 でバランス良く作品を収集
//
// 使い方:
//   npx tsx scripts/crawler/stratified-search.ts
//   npx tsx scripts/crawler/stratified-search.ts --dry-run  # 件数確認のみ

import fs from "fs/promises";
import path from "path";

const API_URL = "https://api.syosetu.com/novelapi/api/";

// ─── ジャンル定義 ───
const GENRES: Record<string, { genre?: number; biggenre?: number; word?: string }> = {
  // 恋愛系
  "異世界恋愛":       { genre: 101 },
  "現実世界恋愛":     { genre: 102 },
  // ファンタジー系
  "ハイファンタジー": { genre: 201 },
  "ローファンタジー": { genre: 202 },
  // 文芸系
  "純文学":           { genre: 301 },
  "ヒューマンドラマ": { genre: 302 },
  "歴史":             { genre: 303 },
  "推理":             { genre: 304 },
  "ホラー":           { genre: 305 },
  "アクション":       { genre: 306 },
  "コメディー":       { genre: 307 },
  // SF系
  "VRゲーム":         { genre: 401 },
  "宇宙":             { genre: 402 },
  "空想科学":         { genre: 403 },
  "パニック":         { genre: 404 },
  // キーワード系（ジャンル横断）
  "悪役令嬢":         { biggenre: 2, word: "悪役令嬢" },
  "追放":             { word: "追放" },
  "婚約破棄":         { word: "婚約破棄" },
  "スローライフ":     { word: "スローライフ" },
  "ざまぁ":           { word: "ざまぁ" },
};

// ─── ポピュラリティ階層 ───
// なろうAPIは直接ポイント範囲指定できないので、
// 評価順のオフセットで階層を近似する
interface Tier {
  name: string;
  order: string;
  offset: number;  // st パラメータ（開始位置）
  samples: number; // 取得件数
}

const TIERS: Tier[] = [
  // 上位層: 評価順の上位
  { name: "top",    order: "hyoka",       offset: 1,    samples: 20 },
  // 中上位層: 評価順100〜150位
  { name: "upper",  order: "hyoka",       offset: 100,  samples: 20 },
  // 中位層: 評価順500〜550位
  { name: "mid",    order: "hyoka",       offset: 500,  samples: 20 },
  // 中下位層: 評価順2000〜2050位
  { name: "lower",  order: "hyoka",       offset: 2000, samples: 20 },
  // 下位層: 最新投稿（PVがほぼない新作）
  { name: "bottom", order: "new",         offset: 1,    samples: 20 },
];

interface NarouResult {
  title: string;
  ncode: string;
  writer: string;
  story: string;
  keyword: string;
  genre: number;
  biggenre: number;
  general_all_no: number;
  length: number;
  global_point: number;
  fav_novel_cnt: number;
  impression_cnt: number;
  review_cnt: number;
  all_hyoka_cnt: number;
  general_firstup: string;
  general_lastup: string;
  end: number;
  isstop: number;
}

interface SampledNovel {
  ncode: string;
  title: string;
  writer: string;
  episodes: number;
  length: number;
  globalPoint: number;
  bookmarks: number;
  genre: number;
  status: string;
  // サンプリング情報
  searchGenre: string;
  tier: string;
}

/** APIリクエスト（レート制限考慮） */
async function queryAPI(params: Record<string, string>): Promise<NarouResult[]> {
  const query = new URLSearchParams({
    out: "json",
    of: "t-n-w-s-k-g-bg-ga-l-gp-f-imp-r-ah-gf-gl-e-is",
    ...params,
  });

  const url = `${API_URL}?${query.toString()}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Novelis-Research/1.0" },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${url}`);
  }

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`JSON解析失敗: ${text.slice(0, 100)}`);
  }
  const allcount = data[0]?.allcount || 0;
  const novels: NarouResult[] = data.slice(1);

  return novels;
}

/** ジャンル全体の作品数を確認 */
async function countGenre(genreDef: { genre?: number; biggenre?: number; word?: string }): Promise<number> {
  const params: Record<string, string> = { lim: "1", of: "t" };
  if (genreDef.genre) params.genre = String(genreDef.genre);
  if (genreDef.biggenre) params.biggenre = String(genreDef.biggenre);
  if (genreDef.word) params.word = genreDef.word;

  const query = new URLSearchParams({ out: "json", ...params });
  const url = `${API_URL}?${query.toString()}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Novelis-Research/1.0" },
  });
  const data = await response.json();
  return data[0]?.allcount || 0;
}

/** 層別サンプリング実行 */
async function stratifiedSample(dryRun: boolean): Promise<SampledNovel[]> {
  const allSamples: SampledNovel[] = [];
  const seen = new Set<string>(); // ncode重複排除

  const genreEntries = Object.entries(GENRES);
  console.log(`📊 ${genreEntries.length}ジャンル × ${TIERS.length}階層 = 最大${genreEntries.length * TIERS.length}クエリ\n`);

  for (const [genreName, genreDef] of genreEntries) {
    // ジャンル全体の件数確認
    let totalCount: number;
    try {
      totalCount = await countGenre(genreDef);
    } catch (err) {
      console.log(`\n📁 ${genreName}（件数取得失敗、スキップ）`);
      continue;
    }
    console.log(`\n📁 ${genreName}（${totalCount.toLocaleString()}作品）`);

    if (dryRun) {
      // APIレート制限のため少し待つ
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    for (const tier of TIERS) {
      // オフセットが全件数を超える場合はスキップ
      if (tier.offset > totalCount) {
        console.log(`  ⏭️ ${tier.name}: オフセット${tier.offset}が全${totalCount}件を超えるためスキップ`);
        continue;
      }

      const params: Record<string, string> = {
        order: tier.order,
        st: String(tier.offset),
        lim: String(tier.samples),
      };
      if (genreDef.genre) params.genre = String(genreDef.genre);
      if (genreDef.biggenre) params.biggenre = String(genreDef.biggenre);
      if (genreDef.word) params.word = genreDef.word;

      try {
        const novels = await queryAPI(params);
        let added = 0;

        for (const n of novels) {
          const ncode = n.ncode.toLowerCase();
          if (seen.has(ncode)) continue;
          seen.add(ncode);

          allSamples.push({
            ncode,
            title: n.title,
            writer: n.writer,
            episodes: n.general_all_no,
            length: n.length,
            globalPoint: n.global_point,
            bookmarks: n.fav_novel_cnt,
            genre: n.genre,
            status: n.end === 1 ? "complete" : n.isstop === 1 ? "hiatus" : "ongoing",
            searchGenre: genreName,
            tier: tier.name,
          });
          added++;
        }

        console.log(`  ${tier.name.padEnd(6)}: ${novels.length}件取得 → ${added}件追加（重複除外）`);
      } catch (err) {
        console.error(`  ❌ ${tier.name}: ${err instanceof Error ? err.message : err}`);
      }

      // APIレート制限（1秒間隔）
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return allSamples;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("🔬 層別サンプリング検索");
  if (dryRun) console.log("   （ドライラン: 件数確認のみ）");
  console.log("");

  const samples = await stratifiedSample(dryRun);

  if (dryRun) {
    console.log("\n💡 --dry-run を外すと実際にサンプリングします");
    return;
  }

  // 統計表示
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 サンプリング結果: ${samples.length}作品（重複除外済み）`);
  console.log(`${"═".repeat(60)}`);

  // ジャンル別集計
  const byGenre = new Map<string, number>();
  const byTier = new Map<string, number>();
  for (const s of samples) {
    byGenre.set(s.searchGenre, (byGenre.get(s.searchGenre) || 0) + 1);
    byTier.set(s.tier, (byTier.get(s.tier) || 0) + 1);
  }

  console.log("\n【ジャンル別】");
  for (const [g, c] of [...byGenre.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g.padEnd(16)} ${c}件`);
  }

  console.log("\n【階層別】");
  for (const tier of TIERS) {
    console.log(`  ${tier.name.padEnd(8)} ${byTier.get(tier.name) || 0}件`);
  }

  // ポイント分布
  const points = samples.map((s) => s.globalPoint).sort((a, b) => a - b);
  console.log("\n【ポイント分布】");
  console.log(`  最小: ${points[0]}`);
  console.log(`  25%:  ${points[Math.floor(points.length * 0.25)]}`);
  console.log(`  中央: ${points[Math.floor(points.length * 0.5)]}`);
  console.log(`  75%:  ${points[Math.floor(points.length * 0.75)]}`);
  console.log(`  最大: ${points[points.length - 1]}`);

  // 保存
  const outputPath = "data/targets/stratified_all.json";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(samples, null, 2), "utf-8");
  console.log(`\n💾 保存: ${outputPath}`);

  // 推定クロール時間
  const totalEp = samples.reduce((s, n) => s + Math.min(n.episodes, 50), 0);
  console.log(`\n💡 全作品を各50話ずつクロールする場合:`);
  console.log(`   推定エピソード数: ${totalEp.toLocaleString()}`);
  console.log(`   推定所要時間: 約${Math.ceil((totalEp * 5.5) / 3600)}時間`);
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
