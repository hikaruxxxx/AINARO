#!/usr/bin/env npx tsx
// ペア比較サンプリング
// 同ジャンル・同時期の人気作 vs 不人気作をペアで収集
// → コンテンツの質・構造の差を分析するためのデータセット
//
// 使い方:
//   npx tsx scripts/crawler/paired-sampling.ts

import fs from "fs/promises";
import path from "path";

const API_URL = "https://api.syosetu.com/novelapi/api/";

// 比較対象のジャンル × キーワード
const CATEGORIES = [
  { name: "悪役令嬢_ファンタジー", genre: 201, word: "悪役令嬢" },
  { name: "悪役令嬢_恋愛", genre: 101, word: "悪役令嬢" },
  { name: "追放_ファンタジー", genre: 201, word: "追放" },
  { name: "婚約破棄_恋愛", genre: 101, word: "婚約破棄" },
  { name: "スローライフ_ファンタジー", genre: 201, word: "スローライフ" },
  { name: "ざまぁ_ファンタジー", genre: 201, word: "ざまぁ" },
  { name: "転生_ファンタジー", genre: 201, word: "転生" },
  { name: "チート_ファンタジー", genre: 201, word: "チート" },
  { name: "異世界恋愛_純粋", genre: 101 },
  { name: "ハイファンタジー_純粋", genre: 201 },
  { name: "ローファンタジー_純粋", genre: 202 },
  { name: "ヒューマンドラマ_純粋", genre: 302 },
  { name: "ホラー_純粋", genre: 305 },
  { name: "推理_純粋", genre: 304 },
  { name: "SF_純粋", genre: 403 },
];

// 時期区分（なろうAPIのmingl/maxglで初回投稿日フィルタ不可のため、
// ncode範囲で近似。ncodeは投稿順なので時期の代理指標になる）
// 代わりに公開年をレスポンスから確認してフィルタする
const YEAR_RANGES = [
  { name: "2019-2020", minYear: 2019, maxYear: 2020 },
  { name: "2021-2022", minYear: 2021, maxYear: 2022 },
  { name: "2023-2024", minYear: 2023, maxYear: 2024 },
];

interface NarouResult {
  title: string;
  ncode: string;
  writer: string;
  genre: number;
  general_all_no: number;
  length: number;
  global_point: number;
  fav_novel_cnt: number;
  general_firstup: string;
  end: number;
  isstop: number;
  keyword: string;
}

interface PairedSample {
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
  category: string;
  yearRange: string;
  popularity: "high" | "low"; // ペアのどちら側か
  searchGenre: string;
  tier: string;
}

async function queryAPI(params: Record<string, string>): Promise<NarouResult[]> {
  const query = new URLSearchParams({
    out: "json",
    of: "t-n-w-k-g-ga-l-gp-f-gf-e-is",
    ...params,
  });
  const url = `${API_URL}?${query.toString()}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Novelis-Research/1.0" },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(`JSON解析失敗`); }
  return data.slice(1) as NarouResult[];
}

/** 指定年範囲の作品を人気順で取得し、上位と下位を返す */
async function getPairForCategory(
  category: { name: string; genre: number; word?: string },
  yearRange: { name: string; minYear: number; maxYear: number }
): Promise<{ high: NarouResult[]; low: NarouResult[] }> {
  const baseParams: Record<string, string> = {
    genre: String(category.genre),
    lim: "500", // 多めに取得して年でフィルタ
  };
  if (category.word) baseParams.word = category.word;

  // 人気順（上位500件から年でフィルタ）
  const topResults = await queryAPI({ ...baseParams, order: "hyoka", st: "1" });

  await new Promise((r) => setTimeout(r, 1000));

  // 不人気（ncode昇順 = 古い投稿順で500件 → 年フィルタで同時期の不人気作を抽出）
  // ncode昇順の上位は2000年代なので、新しめの不人気作にはオフセットが必要
  // st上限2000なので1500から取得
  const bottomResults = await queryAPI({ ...baseParams, order: "ncodedesc", st: "1" });
  // ncodedesc（新しいncode順 = 最近投稿）で取ると人気作が混ざるが、
  // 年フィルタ後にポイントでソートして下位を取ればいい

  // 年でフィルタ
  const filterByYear = (results: NarouResult[]) =>
    results.filter((r) => {
      const year = parseInt(r.general_firstup?.slice(0, 4) || "0");
      return year >= yearRange.minYear && year <= yearRange.maxYear;
    });

  // 人気側: 年フィルタ後のポイント上位
  const highFiltered = filterByYear(topResults)
    .sort((a, b) => b.global_point - a.global_point)
    .slice(0, 30);

  // 不人気側: 年フィルタ後のポイント下位（ただし最低5話以上の作品に限定）
  const lowFiltered = filterByYear(bottomResults)
    .filter((r) => r.general_all_no >= 5) // 書きかけ排除
    .sort((a, b) => a.global_point - b.global_point)
    .slice(0, 30);

  return { high: highFiltered, low: lowFiltered };
}

async function main() {
  console.log("🔬 ペア比較サンプリング");
  console.log(`  ${CATEGORIES.length}カテゴリ × ${YEAR_RANGES.length}時期 = ${CATEGORIES.length * YEAR_RANGES.length}組\n`);

  const seen = new Set<string>();
  const allSamples: PairedSample[] = [];

  for (const category of CATEGORIES) {
    console.log(`\n📁 ${category.name}`);

    for (const yearRange of YEAR_RANGES) {
      try {
        const { high, low } = await getPairForCategory(category, yearRange);

        let addedHigh = 0;
        let addedLow = 0;

        for (const n of high) {
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
            category: category.name,
            yearRange: yearRange.name,
            popularity: "high",
            searchGenre: category.name,
            tier: "paired_high",
          });
          addedHigh++;
        }

        for (const n of low) {
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
            category: category.name,
            yearRange: yearRange.name,
            popularity: "low",
            searchGenre: category.name,
            tier: "paired_low",
          });
          addedLow++;
        }

        const avgHighPt = high.length > 0 ? Math.round(high.reduce((s, n) => s + n.global_point, 0) / high.length) : 0;
        const avgLowPt = low.length > 0 ? Math.round(low.reduce((s, n) => s + n.global_point, 0) / low.length) : 0;

        console.log(
          `  ${yearRange.name}: 人気${addedHigh}件(平均${avgHighPt}pt) vs 不人気${addedLow}件(平均${avgLowPt}pt)`
        );
      } catch (err) {
        console.error(`  ❌ ${yearRange.name}: ${err instanceof Error ? err.message : err}`);
      }

      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  // 統計
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 ペア比較データ: ${allSamples.length}作品`);

  const highSamples = allSamples.filter((s) => s.popularity === "high");
  const lowSamples = allSamples.filter((s) => s.popularity === "low");
  console.log(`  人気側: ${highSamples.length}件（平均${Math.round(highSamples.reduce((s, n) => s + n.globalPoint, 0) / highSamples.length)}pt）`);
  console.log(`  不人気側: ${lowSamples.length}件（平均${Math.round(lowSamples.reduce((s, n) => s + n.globalPoint, 0) / lowSamples.length)}pt）`);

  // 保存
  const outputPath = "data/targets/paired_comparison.json";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(allSamples, null, 2), "utf-8");
  console.log(`\n💾 保存: ${outputPath}`);
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
