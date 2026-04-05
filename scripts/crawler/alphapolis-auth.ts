#!/usr/bin/env npx tsx
// アルファポリス reCAPTCHA突破テスト
// 1. ブラウザが開く → 手動でreCAPTCHAをクリック
// 2. Cookieを保存
// 3. 保存されたCookieで自動取得を試行
//
// 使い方:
//   npx tsx scripts/crawler/alphapolis-auth.ts          # Cookie取得（ブラウザが開く）
//   npx tsx scripts/crawler/alphapolis-auth.ts --test    # 保存済みCookieでテスト

import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const COOKIE_PATH = "data/crawled/_alphapolis_cookies.json";
const TEST_URL = "https://www.alphapolis.co.jp/novel/500033287/271935870/episode/9266947";

async function acquireCookies() {
  console.log("🔓 ブラウザを開きます。reCAPTCHAをクリックしてください。");
  console.log("   本文が表示されたらターミナルに戻ってEnterを押してください。\n");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });

  const page = await context.newPage();
  await page.goto(TEST_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // ユーザーが手動操作するのを待つ
  console.log("⏳ ブラウザで操作してください...");
  console.log("   （本文が表示されたらEnterキーを押す）");

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  // Cookie保存
  const cookies = await context.cookies();
  await fs.mkdir(path.dirname(COOKIE_PATH), { recursive: true });
  await fs.writeFile(COOKIE_PATH, JSON.stringify(cookies, null, 2), "utf-8");
  console.log(`\n💾 Cookie保存: ${COOKIE_PATH}（${cookies.length}個）`);

  // 本文が取れるか確認
  const bodyText = await page.locator("#novelBody").innerText().catch(() => "");
  if (bodyText.length > 50) {
    console.log(`✅ 本文取得成功（${bodyText.length}文字）`);
    console.log(`   先頭: ${bodyText.slice(0, 100)}...`);
  } else {
    console.log(`⚠️ 本文が短い/空（${bodyText.length}文字）。reCAPTCHAを通過できていない可能性`);
  }

  await browser.close();
}

async function testWithCookies() {
  console.log("🧪 保存済みCookieで自動取得テスト\n");

  let cookies;
  try {
    cookies = JSON.parse(await fs.readFile(COOKIE_PATH, "utf-8"));
  } catch {
    console.error("❌ Cookieファイルがありません。先に引数なしで実行してください。");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "ja-JP",
  });

  await context.addCookies(cookies);

  // テスト: 3ページ連続で取得してみる
  const testUrls = [
    "https://www.alphapolis.co.jp/novel/500033287/271935870/episode/9266947",
    "https://www.alphapolis.co.jp/novel/500033287/271935870/episode/9266964",
    "https://www.alphapolis.co.jp/novel/500033287/271935870/episode/9281253",
  ];

  for (const url of testUrls) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector("#novelBody", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000); // JS実行待ち

    const title = await page.locator(".episode-title").first().innerText().catch(() => "(タイトル取得失敗)");
    const bodyText = await page.locator("#novelBody").innerText().catch(() => "");

    if (bodyText.length > 50) {
      console.log(`✅ ${title} — ${bodyText.length}文字取得`);
    } else {
      console.log(`❌ ${title} — 本文取得失敗（${bodyText.length}文字）`);
      // reCAPTCHA再出現チェック
      const hasRecaptcha = await page.locator("iframe[src*='recaptcha']").count();
      if (hasRecaptcha > 0) {
        console.log("   → reCAPTCHAが再出現。Cookie方式では突破不可。");
        break;
      }
    }

    await page.close();

    // レート制限
    await new Promise((r) => setTimeout(r, 5000));
  }

  await browser.close();
}

async function main() {
  if (process.argv.includes("--test")) {
    await testWithCookies();
  } else {
    await acquireCookies();
  }
}

main().catch((err) => {
  console.error("❌ エラー:", err.message);
  process.exit(1);
});
