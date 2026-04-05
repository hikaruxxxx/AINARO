#!/usr/bin/env npx tsx
// DOM構造デバッグ用

import { chromium } from "playwright";

async function main() {
  const url = process.argv[2] || "https://kakuyomu.jp/works/16816927860265927929";
  console.log(`🔍 ${url}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000); // SPAレンダリング待ち

  // ページタイトル
  console.log("【title】", await page.title());

  // h1, h2要素
  const headings = await page.locator("h1, h2").allInnerTexts();
  console.log("【h1/h2】", headings.slice(0, 5));

  // エピソードリンク
  const epLinks = await page.locator('a[href*="episode"]').all();
  console.log(`【episode links】 ${epLinks.length}件`);
  for (const link of epLinks.slice(0, 3)) {
    const href = await link.getAttribute("href");
    const text = await link.innerText();
    console.log(`  ${href} → "${text.trim().slice(0, 40)}"`);
  }

  // 主要なid/class
  const html = await page.content();
  const classMatches = html.match(/class="[^"]*"/g) || [];
  const uniqueClasses = [...new Set(classMatches)].filter(c =>
    /work|title|toc|episode|novel|content|body|author|chapter/i.test(c)
  );
  console.log("【関連class】", uniqueClasses.slice(0, 20));

  await browser.close();
}

main().catch(console.error);
