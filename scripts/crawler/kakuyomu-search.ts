#!/usr/bin/env npx tsx
// カクヨム層別サンプリング v2 — 拡大版（目標: 2,000作品）
// ジャンル × ソート順 × 複数ページ

import { chromium, type Browser } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://kakuyomu.jp";

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

// ソート順 × ページで階層を実現
const SORT_PAGES = [
  // 人気順の上位
  { tier: "top",    sort: "weekly",                    pages: [1, 2, 3] },
  // 累計上位（中堅）
  { tier: "upper",  sort: "total",                     pages: [1, 2, 3] },
  // フォロワー数順
  { tier: "mid",    sort: "follower",                  pages: [1, 2, 3] },
  // 最新更新（新しい作品、PV未知数）
  { tier: "new",    sort: "last_episode_published_at", pages: [1, 2, 3, 5, 10] },
  // 公開日が古い順（長期公開 × 低人気 = 真の不人気）
  { tier: "unpopular", sort: "published_at",           pages: [1, 2, 3, 5, 10] },
];

interface KakuyomuWork {
  workId: string;
  title: string;
  searchGenre: string;
  tier: string;
}

let browser: Browser | null = null;

async function scrapePage(
  genreSlug: string,
  sortValue: string,
  pageNum: number
): Promise<{ workId: string; title: string }[]> {
  if (!browser) browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    locale: "ja-JP",
  });
  const page = await context.newPage();

  try {
    const url = `${BASE_URL}/search?genre_name=${genreSlug}&order=${sortValue}&page=${pageNum}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const works: { workId: string; title: string }[] = [];
    const links = await page.locator('a[href^="/works/"]').all();
    const seen = new Set<string>();

    for (const link of links) {
      const href = await link.getAttribute("href") || "";
      const match = href.match(/^\/works\/(\d+)$/);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);

      const title = await link.innerText().catch(() => "");
      if (!title.trim()) continue;

      works.push({
        workId: match[1],
        title: title.trim().split("\n")[0],
      });
    }

    return works;
  } finally {
    await context.close();
  }
}

async function main() {
  // 既存データの重複排除
  const seen = new Set<string>();
  try {
    const prev = JSON.parse(await fs.readFile("data/targets/kakuyomu_stratified.json", "utf-8"));
    for (const p of prev) seen.add(p.ncode);
    console.log(`📂 既存${seen.size}作品を重複排除対象に\n`);
  } catch {}

  const allWorks: KakuyomuWork[] = [];
  const genreEntries = Object.entries(GENRES);

  console.log(`🔬 カクヨム層別サンプリング v2`);
  console.log(`  ${genreEntries.length}ジャンル × ${SORT_PAGES.length}ソート\n`);

  for (const [genreName, genreSlug] of genreEntries) {
    console.log(`\n📁 ${genreName}`);

    for (const sp of SORT_PAGES) {
      for (const pageNum of sp.pages) {
        try {
          const works = await scrapePage(genreSlug, sp.sort, pageNum);
          let added = 0;
          for (const w of works) {
            if (!seen.has(w.workId)) {
              seen.add(w.workId);
              allWorks.push({
                ...w,
                searchGenre: genreName,
                tier: sp.tier,
              });
              added++;
            }
          }
          if (added > 0) {
            console.log(`  ${sp.tier.padEnd(10)} p${pageNum}: ${works.length}件 → ${added}件追加`);
          }
        } catch (err) {
          console.error(`  ❌ ${sp.tier} p${pageNum}: ${err instanceof Error ? err.message : err}`);
        }

        await new Promise((r) => setTimeout(r, 3000 + Math.random() * 3000));
      }
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 結果: ${allWorks.length}作品（重複除外済み）`);

  const byGenre = new Map<string, number>();
  const byTier = new Map<string, number>();
  for (const w of allWorks) {
    byGenre.set(w.searchGenre, (byGenre.get(w.searchGenre) || 0) + 1);
    byTier.set(w.tier, (byTier.get(w.tier) || 0) + 1);
  }
  console.log("\n【ジャンル別】");
  for (const [g, c] of [...byGenre.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${g.padEnd(20)} ${c}件`);
  }
  console.log("\n【階層別】");
  for (const [t, c] of byTier) console.log(`  ${t.padEnd(12)} ${c}件`);

  // 保存
  const output = allWorks.map((w) => ({
    ncode: w.workId,
    title: w.title,
    writer: "",
    episodes: 0,
    length: 0,
    globalPoint: 0,
    bookmarks: 0,
    genre: 0,
    status: "unknown",
    searchGenre: w.searchGenre,
    tier: w.tier,
    site: "kakuyomu",
  }));

  const outputPath = "data/targets/kakuyomu_stratified_v2.json";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n💾 保存: ${outputPath}`);

  if (browser) await browser.close();
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
