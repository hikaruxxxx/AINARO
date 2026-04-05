#!/usr/bin/env npx tsx
// なろうAPI検索スクリプト
// 使い方:
//   npx tsx scripts/crawler/narou-search.ts                    # 悪役令嬢系デフォルト検索
//   npx tsx scripts/crawler/narou-search.ts --word "悪役令嬢"  # キーワード指定
//   npx tsx scripts/crawler/narou-search.ts --genre 201        # ジャンル指定
//   npx tsx scripts/crawler/narou-search.ts --list targets.json # 検索結果をファイル保存

import fs from "fs/promises";
import path from "path";

const API_URL = "https://api.syosetu.com/novelapi/api/";

interface NarouNovel {
  title: string;
  ncode: string;
  writer: string;
  story: string;
  keyword: string;
  genre: number;
  general_all_no: number; // 全話数
  length: number; // 総文字数
  global_point: number; // 総合ポイント
  fav_novel_cnt: number; // ブックマーク数
  impression_cnt: number; // 感想数
  review_cnt: number; // レビュー数
  all_hyoka_cnt: number; // 評価数
  general_firstup: string;
  general_lastup: string;
  end: number; // 0:連載中 1:完結
  isstop: number; // 1:長期休止
}

// ジャンル名のマッピング
const GENRE_NAMES: Record<number, string> = {
  101: "異世界〔恋愛〕",
  102: "現実世界〔恋愛〕",
  201: "ハイファンタジー",
  202: "ローファンタジー",
};

interface SearchParams {
  word?: string;
  genre?: number;
  biggenre?: number;
  order?: string;
  limit?: number;
  outputFile?: string;
}

/** なろうAPIで作品検索 */
async function searchNovels(params: SearchParams): Promise<NarouNovel[]> {
  const query = new URLSearchParams({
    out: "json",
    of: "t-n-w-s-k-g-ga-l-gp-f-imp-r-ah-gf-gl-e-is",
    lim: String(params.limit || 100),
    order: params.order || "hyoka", // デフォルト: 総合評価順
  });

  if (params.word) query.set("word", params.word);
  if (params.genre) query.set("genre", String(params.genre));
  if (params.biggenre) query.set("biggenre", String(params.biggenre));

  const url = `${API_URL}?${query.toString()}`;
  console.log(`🔍 検索URL: ${url}\n`);

  const response = await fetch(url, {
    headers: { "User-Agent": "Novelis-Research/1.0" },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  // 最初の要素はメタ情報（allcount）
  const allcount = data[0].allcount;
  const novels: NarouNovel[] = data.slice(1);

  console.log(`📊 該当作品数: ${allcount}件（取得: ${novels.length}件）\n`);

  return novels;
}

/** 検索結果をテーブル表示 */
function displayResults(novels: NarouNovel[]) {
  console.log("順位 | ポイント | ブクマ | 話数 | 文字数 | 状態 | ncode | タイトル");
  console.log("─".repeat(100));

  novels.forEach((n, i) => {
    const status = n.end === 1 ? "完結" : n.isstop === 1 ? "休止" : "連載中";
    const chars = n.length > 10000 ? `${(n.length / 10000).toFixed(0)}万字` : `${n.length}字`;
    console.log(
      `${String(i + 1).padStart(3)} | ${String(n.global_point).padStart(8)} | ${String(n.fav_novel_cnt).padStart(6)} | ${String(n.general_all_no).padStart(4)} | ${chars.padStart(6)} | ${status} | ${n.ncode.toLowerCase()} | ${n.title.slice(0, 40)}`
    );
  });
}

/** クロール対象リストとして保存 */
async function saveTargetList(novels: NarouNovel[], filePath: string) {
  const targets = novels.map((n) => ({
    ncode: n.ncode.toLowerCase(),
    title: n.title,
    writer: n.writer,
    episodes: n.general_all_no,
    globalPoint: n.global_point,
    bookmarks: n.fav_novel_cnt,
    genre: n.genre,
    genreName: GENRE_NAMES[n.genre] || String(n.genre),
    status: n.end === 1 ? "complete" : n.isstop === 1 ? "hiatus" : "ongoing",
    length: n.length,
  }));

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(targets, null, 2), "utf-8");
  console.log(`\n💾 保存: ${filePath}（${targets.length}件）`);
}

function parseArgs(): SearchParams {
  const args = process.argv.slice(2);
  const params: SearchParams = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--word":
        params.word = args[++i];
        break;
      case "--genre":
        params.genre = parseInt(args[++i]);
        break;
      case "--biggenre":
        params.biggenre = parseInt(args[++i]);
        break;
      case "--order":
        params.order = args[++i];
        break;
      case "--limit":
        params.limit = parseInt(args[++i]);
        break;
      case "--list":
        params.outputFile = args[++i];
        break;
    }
  }

  return params;
}

async function main() {
  const params = parseArgs();

  // デフォルト: 悪役令嬢系で検索
  if (!params.word && !params.genre && !params.biggenre) {
    params.word = "悪役令嬢";
    params.biggenre = 2; // ファンタジー
    console.log("📖 デフォルト検索: 悪役令嬢 × ファンタジー × 総合評価順\n");
  }

  const novels = await searchNovels(params);
  displayResults(novels);

  // ファイル保存
  if (params.outputFile) {
    await saveTargetList(novels, params.outputFile);
  } else {
    console.log("\n💡 --list data/targets/villainess.json で保存できます");
  }
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
