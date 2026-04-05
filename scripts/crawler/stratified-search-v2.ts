#!/usr/bin/env npx tsx
// 層別サンプリング v2 — 拡大版（目標: なろう7,000作品）
// 変更点:
// - 各層のサンプル数を増加（20→100）
// - bottom層を「古い作品 × ncode昇順」に変更（長期公開なのにPV少ない＝真の不人気）
// - 追加階層を導入

import fs from "fs/promises";
import path from "path";

const API_URL = "https://api.syosetu.com/novelapi/api/";

// ジャンル定義（前回と同じ15ジャンル + 5キーワード）
const GENRES: Record<string, { genre?: number; biggenre?: number; word?: string }> = {
  "異世界恋愛":       { genre: 101 },
  "現実世界恋愛":     { genre: 102 },
  "ハイファンタジー": { genre: 201 },
  "ローファンタジー": { genre: 202 },
  "純文学":           { genre: 301 },
  "ヒューマンドラマ": { genre: 302 },
  "歴史":             { genre: 303 },
  "推理":             { genre: 304 },
  "ホラー":           { genre: 305 },
  "アクション":       { genre: 306 },
  "コメディー":       { genre: 307 },
  "VRゲーム":         { genre: 401 },
  "宇宙":             { genre: 402 },
  "空想科学":         { genre: 403 },
  "パニック":         { genre: 404 },
  "悪役令嬢":         { biggenre: 2, word: "悪役令嬢" },
  "追放":             { word: "追放" },
  "婚約破棄":         { word: "婚約破棄" },
  "スローライフ":     { word: "スローライフ" },
  "ざまぁ":           { word: "ざまぁ" },
};

interface Tier {
  name: string;
  order: string;
  offset: number;
  samples: number;
}

const TIERS: Tier[] = [
  // 上位: 総合評価トップ
  { name: "top",       order: "hyoka",    offset: 1,     samples: 50 },
  // 中上位: 評価順100〜
  { name: "upper",     order: "hyoka",    offset: 100,   samples: 50 },
  // 中位: 評価順500〜
  { name: "mid",       order: "hyoka",    offset: 500,   samples: 50 },
  // 中下位: 評価順2000〜
  { name: "lower",     order: "hyoka",    offset: 2000,  samples: 50 },
  // 下位: 評価順5000〜
  { name: "low",       order: "hyoka",    offset: 5000,  samples: 50 },
  // 不人気: ncode昇順（古い作品）= 長期公開なのに評価が低い
  { name: "unpopular", order: "ncodeasc", offset: 1,     samples: 50 },
  // 不人気2: ncode昇順のオフセット
  { name: "unpopular2", order: "ncodeasc", offset: 500,  samples: 50 },
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
  firstPublished: string;
  searchGenre: string;
  tier: string;
}

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
  if (!response.ok) throw new Error(`API ${response.status}: ${url}`);
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`JSON解析失敗: ${text.slice(0, 100)}`); }
  return data.slice(1) as NarouResult[];
}

async function countGenre(genreDef: { genre?: number; biggenre?: number; word?: string }): Promise<number> {
  const params: Record<string, string> = { lim: "1", of: "t" };
  if (genreDef.genre) params.genre = String(genreDef.genre);
  if (genreDef.biggenre) params.biggenre = String(genreDef.biggenre);
  if (genreDef.word) params.word = genreDef.word;
  const query = new URLSearchParams({ out: "json", ...params });
  const response = await fetch(`${API_URL}?${query.toString()}`, {
    headers: { "User-Agent": "Novelis-Research/1.0" },
  });
  const data = await response.json();
  return data[0]?.allcount || 0;
}

async function main() {
  // 前回のデータを読み込んで重複排除に使う
  const seen = new Set<string>();
  try {
    const prev = JSON.parse(await fs.readFile("data/targets/stratified_all.json", "utf-8"));
    for (const p of prev) seen.add(p.ncode.toLowerCase());
    console.log(`📂 既存${seen.size}作品を重複排除対象に\n`);
  } catch {}

  const allSamples: SampledNovel[] = [];
  const genreEntries = Object.entries(GENRES);

  console.log(`🔬 なろう層別サンプリング v2`);
  console.log(`  ${genreEntries.length}ジャンル × ${TIERS.length}階層 × 各${TIERS[0].samples}件\n`);

  for (const [genreName, genreDef] of genreEntries) {
    let totalCount: number;
    try { totalCount = await countGenre(genreDef); } catch { continue; }
    console.log(`\n📁 ${genreName}（${totalCount.toLocaleString()}作品）`);

    for (const tier of TIERS) {
      if (tier.offset > totalCount) {
        console.log(`  ⏭️ ${tier.name}: オフセット超過`);
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
            firstPublished: n.general_firstup,
            searchGenre: genreName,
            tier: tier.name,
          });
          added++;
        }
        console.log(`  ${tier.name.padEnd(10)}: ${novels.length}件取得 → ${added}件追加`);
      } catch (err) {
        console.error(`  ❌ ${tier.name}: ${err instanceof Error ? err.message : err}`);
      }

      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 統計
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 新規サンプリング: ${allSamples.length}作品`);

  const byTier = new Map<string, number>();
  for (const s of allSamples) byTier.set(s.tier, (byTier.get(s.tier) || 0) + 1);
  console.log("\n【階層別】");
  for (const tier of TIERS) console.log(`  ${tier.name.padEnd(12)} ${byTier.get(tier.name) || 0}件`);

  // ポイント分布
  const points = allSamples.map((s) => s.globalPoint).sort((a, b) => a - b);
  if (points.length > 0) {
    console.log("\n【ポイント分布】");
    console.log(`  最小: ${points[0]}`);
    console.log(`  25%:  ${points[Math.floor(points.length * 0.25)]}`);
    console.log(`  中央: ${points[Math.floor(points.length * 0.5)]}`);
    console.log(`  75%:  ${points[Math.floor(points.length * 0.75)]}`);
    console.log(`  最大: ${points[points.length - 1]}`);
  }

  // 不人気層の公開日確認
  const unpopular = allSamples.filter((s) => s.tier.startsWith("unpopular"));
  if (unpopular.length > 0) {
    const dates = unpopular.map((s) => s.firstPublished).sort();
    console.log("\n【不人気層の公開日範囲】");
    console.log(`  最古: ${dates[0]}`);
    console.log(`  最新: ${dates[dates.length - 1]}`);
    console.log(`  平均ポイント: ${Math.round(unpopular.reduce((s, n) => s + n.globalPoint, 0) / unpopular.length)}`);
  }

  // 保存
  const outputPath = "data/targets/stratified_v2.json";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(allSamples, null, 2), "utf-8");
  console.log(`\n💾 保存: ${outputPath}（${allSamples.length}件）`);
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
