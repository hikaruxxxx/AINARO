#!/usr/bin/env npx tsx
// 層別サンプリング v3 — 8,000作品目標
// 変更点:
// - 階層を12段階に拡充（より深いオフセット）
// - 各層サンプル数を80件に増加
// - 既存ターゲット（narou_with_synopsis.json）を重複排除に使用
// - 追加ジャンルキーワード

import fs from "fs/promises";
import path from "path";

const API_URL = "https://api.syosetu.com/novelapi/api/";
const TARGET_COUNT = 8000;

// ジャンル定義（15ジャンル + 10キーワード = 25カテゴリ）
const GENRES: Record<string, { genre?: number; biggenre?: number; word?: string }> = {
  // --- 大ジャンル ---
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
  // --- キーワード横断 ---
  "悪役令嬢":         { biggenre: 2, word: "悪役令嬢" },
  "追放":             { word: "追放" },
  "婚約破棄":         { word: "婚約破棄" },
  "スローライフ":     { word: "スローライフ" },
  "ざまぁ":           { word: "ざまぁ" },
  // --- 追加キーワード ---
  "転生":             { word: "転生" },
  "チート":           { word: "チート" },
  "最強":             { word: "最強" },
  "ダンジョン":       { word: "ダンジョン" },
  "聖女":             { word: "聖女" },
};

interface Tier {
  name: string;
  order: string;
  offset: number;
  samples: number;
}

// 12階層: 評価順の深いオフセット + ncode昇順（古い作品）+ 最新作
const TIERS: Tier[] = [
  { name: "top",        order: "hyoka",      offset: 1,      samples: 80 },
  { name: "upper",      order: "hyoka",      offset: 100,    samples: 80 },
  { name: "mid-high",   order: "hyoka",      offset: 300,    samples: 80 },
  { name: "mid",        order: "hyoka",      offset: 700,    samples: 80 },
  { name: "mid-low",    order: "hyoka",      offset: 1500,   samples: 80 },
  { name: "lower",      order: "hyoka",      offset: 3000,   samples: 80 },
  { name: "low",        order: "hyoka",      offset: 6000,   samples: 80 },
  { name: "bottom",     order: "hyoka",      offset: 10000,  samples: 80 },
  { name: "deep",       order: "hyoka",      offset: 20000,  samples: 80 },
  { name: "oldest",     order: "ncodeasc",   offset: 1,      samples: 80 },
  { name: "oldest2",    order: "ncodeasc",   offset: 500,    samples: 80 },
  { name: "newest",     order: "ncodedesc",  offset: 1,      samples: 80 },
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
  story: string;
  keyword: string;
  globalPoint: number;
  tier: string;
  genre: string;
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
  // 既存ターゲットを読み込んで重複排除
  const seen = new Set<string>();
  const existingFiles = [
    "data/targets/narou_with_synopsis.json",
    "data/targets/stratified_v2.json",
    "data/targets/stratified_all.json",
  ];
  let existingNovels: SampledNovel[] = [];

  for (const filePath of existingFiles) {
    try {
      const prev = JSON.parse(await fs.readFile(filePath, "utf-8"));
      for (const p of prev) {
        const ncode = (p.ncode || "").toLowerCase();
        if (!seen.has(ncode)) {
          seen.add(ncode);
          existingNovels.push({
            ncode,
            title: p.title || "",
            story: p.story || "",
            keyword: p.keyword || "",
            globalPoint: p.globalPoint || p.global_point || 0,
            tier: p.tier || "existing",
            genre: p.genre || p.searchGenre || "",
          });
        }
      }
    } catch {}
  }
  console.log(`📂 既存: ${seen.size}作品を重複排除対象に読み込み`);

  const newSamples: SampledNovel[] = [];
  const genreEntries = Object.entries(GENRES);

  console.log(`\n🔬 なろう層別サンプリング v3（目標: ${TARGET_COUNT}作品）`);
  console.log(`  ${genreEntries.length}ジャンル × ${TIERS.length}階層 × 各${TIERS[0].samples}件`);
  console.log(`  理論最大: ${genreEntries.length * TIERS.length * TIERS[0].samples}件\n`);

  for (const [genreName, genreDef] of genreEntries) {
    let totalCount: number;
    try { totalCount = await countGenre(genreDef); } catch { continue; }
    console.log(`\n📁 ${genreName}（${totalCount.toLocaleString()}作品）`);

    for (const tier of TIERS) {
      if (tier.offset > totalCount) {
        console.log(`  ⏭️  ${tier.name}: オフセット超過`);
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
          newSamples.push({
            ncode,
            title: n.title,
            story: n.story,
            keyword: n.keyword,
            globalPoint: n.global_point,
            tier: tier.name,
            genre: genreName,
          });
          added++;
        }
        console.log(`  ${tier.name.padEnd(10)}: ${novels.length}件取得 → ${added}件追加（累計: ${seen.size}）`);
      } catch (err) {
        console.error(`  ❌ ${tier.name}: ${err instanceof Error ? err.message : err}`);
      }

      // 目標到達チェック
      if (seen.size >= TARGET_COUNT) {
        console.log(`\n🎯 目標${TARGET_COUNT}件到達！`);
        break;
      }

      // なろうAPIレート制限対策
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (seen.size >= TARGET_COUNT) break;
  }

  // 全作品を結合（既存 + 新規）
  const allNovels = [...existingNovels, ...newSamples];

  // 統計
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 結果:`);
  console.log(`  既存: ${existingNovels.length}作品`);
  console.log(`  新規: ${newSamples.length}作品`);
  console.log(`  合計: ${allNovels.length}作品`);

  const byTier = new Map<string, number>();
  for (const s of allNovels) byTier.set(s.tier, (byTier.get(s.tier) || 0) + 1);
  console.log("\n【階層別】");
  for (const [tier, count] of [...byTier.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tier.padEnd(12)} ${count}件`);
  }

  // ポイント分布
  const points = allNovels.map((s) => s.globalPoint).sort((a, b) => a - b);
  if (points.length > 0) {
    console.log("\n【ポイント分布】");
    console.log(`  最小: ${points[0]}`);
    console.log(`  25%:  ${points[Math.floor(points.length * 0.25)]}`);
    console.log(`  中央: ${points[Math.floor(points.length * 0.5)]}`);
    console.log(`  75%:  ${points[Math.floor(points.length * 0.75)]}`);
    console.log(`  最大: ${points[points.length - 1]}`);
  }

  // 保存
  const outputPath = "data/targets/narou_8k.json";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(allNovels, null, 2), "utf-8");
  console.log(`\n💾 保存: ${outputPath}（${allNovels.length}件）`);
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
