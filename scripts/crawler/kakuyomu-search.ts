#!/usr/bin/env npx tsx
// カクヨム層別サンプリング（Playwright使用）
// 検索ページからジャンル×ソート順で作品リストを収集
//
// 使い方:
//   npx tsx scripts/crawler/kakuyomu-search.ts
//   npx tsx scripts/crawler/kakuyomu-search.ts --dry-run

import { chromium, type Browser, type Page } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://kakuyomu.jp";

// カクヨムのジャンル名（URLパラメータ）
const GENRES: Record<string, string> = {
  "異世界ファンタジー": "fantasy",
  "現代ファンタジー": "action",
  "SF": "sci-fi",
  "恋愛": "love_story",
  "ラブコメ": "romance",
  "現代ドラマ": "drama",
  "ホラー": "horror",
  "ミステリー": "mystery",
  "エッセイ・ノンフィクション": "nonfiction",
  "歴史・時代・伝奇": "history",
  "創作論・評論": "criticism",
  "詩・童話・その他": "others",
};

// ソート順（ポピュラリティ層の代替）
const SORT_ORDERS: Record<string, string> = {
  "top":    "weekly",                    // 週間ランキング上位
  "mid":    "total",                     // 累計上位（中堅寄り）
  "new":    "last_episode_published_at", // 最新更新（PV少ないものも含む）
};

interface KakuyomuWork {
  workId: string;
  title: string;
  author: string;
  searchGenre: string;
  tier: string;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

/** 検索ページから作品リストを取得 */
async function scrapeSearchPage(
  genreName: string,
  genreSlug: string,
  sortName: string,
  sortValue: string,
  pageNum: number = 1
): Promise<KakuyomuWork[]> {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    const url = `${BASE_URL}/search?genre_name=${genreSlug}&order=${sortValue}&page=${pageNum}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000); // SPAレンダリング待ち

    const works: KakuyomuWork[] = [];

    // 作品リンクを取得（/works/{id} パターン）
    const workLinks = await page.locator('a[href^="/works/"]').all();
    const seen = new Set<string>();

    for (const link of workLinks) {
      const href = await link.getAttribute("href") || "";
      const match = href.match(/^\/works\/(\d+)$/);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);

      const title = await link.innerText().catch(() => "");
      if (!title.trim()) continue;

      works.push({
        workId: match[1],
        title: title.trim().split("\n")[0],
        author: "", // 検索結果からは取りにくいので空
        searchGenre: genreName,
        tier: sortName,
      });
    }

    return works;
  } finally {
    await context.close();
  }
}

/** 層別サンプリング */
async function stratifiedSample(dryRun: boolean) {
  const allWorks: KakuyomuWork[] = [];
  const seen = new Set<string>();
  const genreEntries = Object.entries(GENRES);
  const sortEntries = Object.entries(SORT_ORDERS);

  console.log(`📊 ${genreEntries.length}ジャンル × ${sortEntries.length}ソート × 2ページ\n`);

  for (const [genreName, genreSlug] of genreEntries) {
    console.log(`\n📁 ${genreName}`);

    if (dryRun) continue;

    for (const [sortName, sortValue] of sortEntries) {
      // 2ページ分取得（各ページ約20件）
      for (let pageNum = 1; pageNum <= 2; pageNum++) {
        try {
          const works = await scrapeSearchPage(genreName, genreSlug, sortName, sortValue, pageNum);
          let added = 0;
          for (const w of works) {
            if (!seen.has(w.workId)) {
              seen.add(w.workId);
              allWorks.push(w);
              added++;
            }
          }
          console.log(`  ${sortName.padEnd(5)} p${pageNum}: ${works.length}件 → ${added}件追加`);
        } catch (err) {
          console.error(`  ❌ ${sortName} p${pageNum}: ${err instanceof Error ? err.message : err}`);
        }

        // レート制限（3〜6秒）
        const delay = 3000 + Math.random() * 3000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return allWorks;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("🔬 カクヨム層別サンプリング");
  if (dryRun) console.log("   （ドライラン）");

  try {
    const works = await stratifiedSample(dryRun);

    if (dryRun) {
      console.log("\n💡 --dry-run を外して実行してください");
      return;
    }

    // 統計
    console.log(`\n${"═".repeat(60)}`);
    console.log(`📊 結果: ${works.length}作品（重複除外済み）`);

    const byGenre = new Map<string, number>();
    const byTier = new Map<string, number>();
    for (const w of works) {
      byGenre.set(w.searchGenre, (byGenre.get(w.searchGenre) || 0) + 1);
      byTier.set(w.tier, (byTier.get(w.tier) || 0) + 1);
    }

    console.log("\n【ジャンル別】");
    for (const [g, c] of [...byGenre.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${g.padEnd(20)} ${c}件`);
    }

    console.log("\n【ソート別】");
    for (const [t, c] of byTier) {
      console.log(`  ${t.padEnd(8)} ${c}件`);
    }

    // 保存（なろうと同じ形式に合わせる）
    const output = works.map((w) => ({
      ncode: w.workId,
      title: w.title,
      writer: w.author,
      episodes: 0, // 不明
      length: 0,
      globalPoint: 0,
      bookmarks: 0,
      genre: 0,
      status: "unknown",
      searchGenre: w.searchGenre,
      tier: w.tier,
      site: "kakuyomu",
    }));

    const outputPath = "data/targets/kakuyomu_stratified.json";
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`\n💾 保存: ${outputPath}`);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
