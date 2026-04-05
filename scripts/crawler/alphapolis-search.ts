#!/usr/bin/env npx tsx
// アルファポリス作品収集
// 年間ランキング20件をシードとし、各作品ページの「おすすめ作品」から芋づる式に拡張

import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://www.alphapolis.co.jp";
const COOKIE_PATH = "data/crawled/_alphapolis_cookies.json";

interface AlphaWork {
  novelPath: string;
  title: string;
  depth: number; // 0=ランキング, 1=おすすめ1段目, 2=2段目
}

let browser: Browser | null = null;
let sharedContext: BrowserContext | null = null;

async function getContext(): Promise<BrowserContext> {
  if (sharedContext) return sharedContext;
  if (!browser) browser = await chromium.launch({ headless: true });
  sharedContext = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    locale: "ja-JP",
  });

  // Cookie読み込み（あれば）
  try {
    const cookies = JSON.parse(await fs.readFile(COOKIE_PATH, "utf-8"));
    await sharedContext.addCookies(cookies);
  } catch {}

  return sharedContext;
}

/** ページから作品リンクを抽出 */
async function extractNovelLinks(pageUrl: string): Promise<{ novelPath: string; title: string }[]> {
  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    const results: { novelPath: string; title: string }[] = [];
    const links = await page.locator('a[href*="/novel/"]').all();
    const seen = new Set<string>();

    for (const link of links) {
      const href = await link.getAttribute("href") || "";
      const match = href.match(/\/novel\/(\d+)\/(\d+)$/);
      if (!match) continue;

      const title = await link.innerText().catch(() => "");
      if (!title.trim()) continue;

      const novelPath = `${match[1]}/${match[2]}`;
      if (seen.has(novelPath)) continue;
      seen.add(novelPath);

      results.push({ novelPath, title: title.trim().split("\n")[0] });
    }

    return results;
  } finally {
    await page.close();
  }
}

async function main() {
  const maxDepth = 2; // おすすめの深さ
  const targetCount = 200; // 目標作品数

  console.log(`🔬 アルファポリス作品収集（芋づる式）`);
  console.log(`  目標: ${targetCount}作品 / 深さ: ${maxDepth}段\n`);

  const allWorks = new Map<string, AlphaWork>();
  const queue: { url: string; depth: number }[] = [];

  // シード: 年間ランキング
  console.log("📊 シード取得: 年間ランキング");
  const seeds = await extractNovelLinks(`${BASE_URL}/novel/ranking/annual`);
  for (const s of seeds) {
    if (!allWorks.has(s.novelPath)) {
      allWorks.set(s.novelPath, { ...s, depth: 0 });
      queue.push({ url: `${BASE_URL}/novel/${s.novelPath}`, depth: 1 });
    }
  }
  console.log(`  → ${seeds.length}件のシード作品\n`);

  // 芋づる式に拡張
  while (queue.length > 0 && allWorks.size < targetCount) {
    const { url, depth } = queue.shift()!;
    if (depth > maxDepth) continue;

    await new Promise((r) => setTimeout(r, 4000 + Math.random() * 4000));

    try {
      const works = await extractNovelLinks(url);
      let added = 0;
      for (const w of works) {
        if (!allWorks.has(w.novelPath)) {
          allWorks.set(w.novelPath, { ...w, depth });
          if (depth < maxDepth) {
            queue.push({ url: `${BASE_URL}/novel/${w.novelPath}`, depth: depth + 1 });
          }
          added++;
        }
      }
      if (added > 0) {
        console.log(`  深さ${depth}: +${added}件 (合計${allWorks.size}) from ${url.split("/novel/")[1]?.slice(0, 30) || url}`);
      }
    } catch (err) {
      // スキップ
    }

    // 進捗
    if (allWorks.size % 50 === 0) {
      console.log(`  📊 ${allWorks.size}作品収集済み / キュー残${queue.length}`);
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 結果: ${allWorks.size}作品`);

  const byDepth = new Map<number, number>();
  for (const w of allWorks.values()) byDepth.set(w.depth, (byDepth.get(w.depth) || 0) + 1);
  for (const [d, c] of [...byDepth.entries()].sort()) {
    console.log(`  深さ${d}: ${c}件`);
  }

  // 保存
  const output = [...allWorks.values()].map((w) => ({
    ncode: w.novelPath,
    title: w.title,
    writer: "",
    episodes: 0,
    length: 0,
    globalPoint: 0,
    bookmarks: 0,
    genre: 0,
    status: "unknown",
    searchGenre: `depth_${w.depth}`,
    tier: w.depth === 0 ? "top" : w.depth === 1 ? "mid" : "lower",
    site: "alphapolis",
  }));

  const outputPath = "data/targets/alphapolis_stratified.json";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n💾 保存: ${outputPath}`);

  if (sharedContext) await sharedContext.close();
  if (browser) await browser.close();
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
