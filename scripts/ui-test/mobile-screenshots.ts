/**
 * モバイルUIテスト: 各画面のスクショを撮影
 *
 * 使い方: npx tsx scripts/ui-test/mobile-screenshots.ts
 *
 * Cookie注入: 既存ChromeのCookieをpycookiecheat経由で取得し、ログイン状態を再現する
 */
import { chromium, devices } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = path.resolve('scripts/ui-test/screenshots');

// 撮影対象ページ（パス, 出力ファイル名）
const PAGES: Array<{ path: string; name: string; waitFor?: string }> = [
  { path: '/ja', name: '01-home' },
  { path: '/ja/discover', name: '02-discover' },
  { path: '/ja/swipe', name: '03-swipe' },
  { path: '/ja/ranking', name: '04-ranking' },
  { path: '/ja/novels', name: '05-novels' },
  { path: '/ja/search', name: '06-search' },
  { path: '/ja/new', name: '07-new' },
  { path: '/ja/mypage', name: '08-mypage' },
  { path: '/ja/write', name: '09-write' },
  { path: '/ja/about', name: '10-about' },
];

/** pycookiecheatでlocalhost用Cookieを取得（dev環境のSupabaseセッションがあれば再現） */
function getCookies(url: string) {
  try {
    const json = execSync(
      `python3 -c "import json,pycookiecheat;print(json.dumps(pycookiecheat.chrome_cookies('${url}')))"`,
      { encoding: 'utf-8' }
    );
    const dict = JSON.parse(json) as Record<string, string>;
    const u = new URL(url);
    return Object.entries(dict).map(([name, value]) => ({
      name,
      value,
      domain: u.hostname,
      path: '/',
    }));
  } catch (e) {
    console.warn('[cookie] 取得失敗:', (e as Error).message);
    return [];
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
  });

  // Cookie注入
  const cookies = getCookies(BASE);
  if (cookies.length) {
    await ctx.addCookies(cookies);
    console.log(`[cookie] ${cookies.length}件 注入`);
  }

  const page = await ctx.newPage();

  for (const p of PAGES) {
    const url = BASE + p.path;
    process.stdout.write(`[${p.name}] ${url} ... `);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(800);
      const file = path.join(OUT_DIR, `${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log('OK');
    } catch (e) {
      console.log('FAIL:', (e as Error).message);
    }
  }

  await browser.close();
  console.log(`\n出力先: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
