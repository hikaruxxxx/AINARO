#!/usr/bin/env npx tsx
// なろう5万作品ターゲット生成
// 戦略: 全ジャンル × 複数ソート順 × ページネーション（各2000件上限）
// 直近3-5年の連載作品を中心に取得

import fs from "fs/promises";
import path from "path";

const API_URL = "https://api.syosetu.com/novelapi/api/";
const TARGET_COUNT = 50000;

// 小説ジャンル（詩・エッセイ・リプレイは除外）
const GENRES: Record<number, string> = {
  101: "異世界恋愛",
  102: "現実世界恋愛",
  201: "ハイファンタジー",
  202: "ローファンタジー",
  301: "純文学",
  302: "ヒューマンドラマ",
  303: "歴史",
  304: "推理",
  305: "ホラー",
  306: "アクション",
  307: "コメディー",
  401: "VRゲーム",
  402: "宇宙",
  403: "空想科学",
  404: "パニック",
  9901: "童話",
  9999: "その他",
};

// ソート順（重複が少ない順に並べ、多角的にカバー）
const ORDERS = [
  "hyoka",         // 総合評価順
  "weekly",        // 週間ユニークユーザ順
  "ncodedesc",     // 新しい順（直近の作品をカバー）
  "favnovelcnt",   // ブックマーク数順
  "impressioncnt", // 感想数順
  "lengthdesc",    // 文字数多い順
  "ncodeasc",      // 古い順
  "old",           // 最終更新古い順
];

interface NarouResult {
  title: string;
  ncode: string;
  story: string;
  keyword: string;
  genre: number;
  global_point: number;
  general_all_no: number;
  general_firstup: string;
  general_lastup: string;
  end: number;
  isstop: number;
}

interface TargetNovel {
  ncode: string;
  title: string;
  story: string;
  keyword: string;
  globalPoint: number;
  genre: number;
  genreName: string;
  episodes: number;
  firstPublished: string;
  lastUpdated: string;
  status: string;
  source: string; // "genre:201/order:hyoka/st:1"
}

async function queryAPI(params: Record<string, string>): Promise<NarouResult[]> {
  const query = new URLSearchParams({
    out: "json",
    of: "t-n-s-k-g-gp-ga-gf-gl-e-is",
    ...params,
  });
  const url = `${API_URL}?${query.toString()}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Novelis-Research/1.0" },
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  const text = await response.text();
  if (text.includes("ERROR")) throw new Error(`API Error: ${text.slice(0, 100)}`);
  const data = JSON.parse(text);
  return data.slice(1) as NarouResult[];
}

// 直近5年（2021年4月以降）の作品かチェック
function isRecent(firstup: string): boolean {
  const cutoff = new Date("2021-04-01");
  const date = new Date(firstup);
  return date >= cutoff;
}

async function main() {
  // 既存ターゲットを読み込んで重複排除
  const seen = new Set<string>();
  const existingFiles = [
    "data/targets/narou_8k.json",
    "data/targets/narou_with_synopsis.json",
    "data/targets/stratified_v2.json",
    "data/targets/stratified_all.json",
  ];

  for (const filePath of existingFiles) {
    try {
      const prev = JSON.parse(await fs.readFile(filePath, "utf-8"));
      for (const p of prev) {
        const ncode = (p.ncode || "").toLowerCase();
        seen.add(ncode);
      }
    } catch {}
  }
  console.log(`📂 既存: ${seen.size}件を重複排除対象に読み込み\n`);

  const allTargets: TargetNovel[] = [];
  let recentCount = 0;
  let oldSkipped = 0;
  let apiCalls = 0;

  console.log(`🎯 なろう5万作品ターゲット生成`);
  console.log(`  ${Object.keys(GENRES).length}ジャンル × ${ORDERS.length}ソート順 × 最大2,000件/ソート`);
  console.log(`  対象: 直近5年（2021-04以降）の作品\n`);

  for (const [genreId, genreName] of Object.entries(GENRES)) {
    console.log(`\n📁 ${genreName}（genre=${genreId}）`);

    for (const order of ORDERS) {
      let orderAdded = 0;
      let consecutiveOld = 0; // 連続して古い作品が来たらそのソート順をスキップ

      for (let st = 1; st <= 2000; st += 500) {
        try {
          const novels = await queryAPI({
            genre: genreId,
            order,
            st: String(st),
            lim: "500",
          });
          apiCalls++;

          if (novels.length === 0) break;

          let added = 0;
          let oldInBatch = 0;
          for (const n of novels) {
            const ncode = n.ncode.toLowerCase();
            if (seen.has(ncode)) continue;

            // 直近5年フィルタ
            if (!isRecent(n.general_firstup)) {
              oldInBatch++;
              continue;
            }

            seen.add(ncode);
            allTargets.push({
              ncode,
              title: n.title,
              story: n.story,
              keyword: n.keyword,
              globalPoint: n.global_point,
              genre: n.genre,
              genreName,
              episodes: n.general_all_no,
              firstPublished: n.general_firstup,
              lastUpdated: n.general_lastup,
              status: n.end === 1 ? "complete" : n.isstop === 1 ? "hiatus" : "ongoing",
              source: `genre:${genreId}/order:${order}/st:${st}`,
            });
            added++;
            recentCount++;
          }
          oldSkipped += oldInBatch;
          orderAdded += added;

          // 古い作品ばかりならこのソート順を打ち切り
          if (oldInBatch > novels.length * 0.8 && added < 10) {
            consecutiveOld++;
            if (consecutiveOld >= 2) break;
          } else {
            consecutiveOld = 0;
          }
        } catch (err) {
          console.error(`  ❌ order=${order} st=${st}: ${err instanceof Error ? err.message : err}`);
        }

        // レート制限対策
        await new Promise((r) => setTimeout(r, 800));
      }

      if (orderAdded > 0) {
        console.log(`  ${order.padEnd(15)}: +${orderAdded}件（累計: ${allTargets.length}）`);
      }

      // 目標到達チェック
      if (allTargets.length >= TARGET_COUNT) {
        console.log(`\n🎯 目標${TARGET_COUNT}件到達！`);
        break;
      }
    }

    if (allTargets.length >= TARGET_COUNT) break;

    // 中間進捗
    if (allTargets.length > 0 && allTargets.length % 5000 < 1000) {
      console.log(`\n📊 中間進捗: ${allTargets.length}件 (API ${apiCalls}回, 古い作品スキップ ${oldSkipped}件)`);
    }
  }

  // 統計
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 結果:`);
  console.log(`  新規ターゲット: ${allTargets.length}件`);
  console.log(`  API呼び出し: ${apiCalls}回`);
  console.log(`  古い作品スキップ: ${oldSkipped}件`);

  // ジャンル別
  const byGenre = new Map<string, number>();
  for (const t of allTargets) byGenre.set(t.genreName, (byGenre.get(t.genreName) || 0) + 1);
  console.log("\n【ジャンル別】");
  for (const [g, c] of [...byGenre.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g.padEnd(15)} ${c.toLocaleString()}件`);
  }

  // ステータス別
  const byStatus = new Map<string, number>();
  for (const t of allTargets) byStatus.set(t.status, (byStatus.get(t.status) || 0) + 1);
  console.log("\n【ステータス別】");
  for (const [s, c] of byStatus.entries()) {
    console.log(`  ${s.padEnd(10)} ${c.toLocaleString()}件`);
  }

  // ポイント分布
  const points = allTargets.map((t) => t.globalPoint).sort((a, b) => a - b);
  if (points.length > 0) {
    console.log("\n【ポイント分布】");
    console.log(`  最小: ${points[0]}`);
    console.log(`  25%:  ${points[Math.floor(points.length * 0.25)]}`);
    console.log(`  中央: ${points[Math.floor(points.length * 0.5)]}`);
    console.log(`  75%:  ${points[Math.floor(points.length * 0.75)]}`);
    console.log(`  最大: ${points[points.length - 1]}`);
  }

  // 保存
  const outputPath = "data/targets/narou_50k.json";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(allTargets, null, 2), "utf-8");
  console.log(`\n💾 保存: ${outputPath}（${allTargets.length}件）`);
}

main().catch((err) => {
  console.error("❌ 致命的エラー:", err.message);
  process.exit(1);
});
