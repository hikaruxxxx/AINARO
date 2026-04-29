/**
 * アルファポリス表紙画像コーパス収集スクリプト
 *
 * ファンタジー24時間ランキング Top50 の表紙画像とメタを取得する。
 * 表紙はランキングページに直接埋め込まれているため、個別ページ訪問不要。
 *
 * 使い方:
 *   npx tsx scripts/crawler/alphapolis-covers.ts            # Top50取得
 *   npx tsx scripts/crawler/alphapolis-covers.ts --probe    # 上位5件で接続テストのみ
 *   npx tsx scripts/crawler/alphapolis-covers.ts --limit=20 # Top20取得
 */

import { chromium, type Browser } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://www.alphapolis.co.jp";
const RANKING_URL = `${BASE_URL}/novel/index/110400?sort=24hpt`; // ファンタジー / 24時間ポイント
const OUTPUT_DIR = "data/cover-corpus/alphapolis/fantasy";
const COOKIE_PATH = "data/crawled/_alphapolis_cookies.json";

const args = process.argv.slice(2);
const isProbe = args.includes("--probe");
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const TARGET_LIMIT = isProbe ? 5 : limitArg ? parseInt(limitArg) : 50;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type RankingItem = {
  rank: number;
  novelPath: string; // 例: /novel/435308740/328048364
  coverUrl: string;
  title?: string;
};

/**
 * 1ページ分のランキングを抽出する。
 * アルファポリスは <a> タグの直下に <img> がない構造のため、
 * cover画像URLに含まれる numeric novel_id と <a href> の novel_id を突き合わせる方式が確実。
 */
async function fetchRankingPage(
  browser: Browser,
  pageUrl: string
): Promise<{ novelPath: string; coverUrl: string; title: string }[]> {
  const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "ja-JP" });
  try {
    const cookies = JSON.parse(await fs.readFile(COOKIE_PATH, "utf-8"));
    await ctx.addCookies(cookies);
  } catch {}

  const page = await ctx.newPage();
  console.log(`📊 ランキング取得: ${pageUrl}`);
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const result = await page.evaluate(() => {
    // 全ての novel リンクを順序保持で抽出
    const linkOrder: { novelPath: string; novelId: string; title: string }[] = [];
    const seenLink = new Set<string>();
    for (const a of Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/novel/"]')
    )) {
      const href = a.getAttribute("href");
      if (!href) continue;
      const m = href.match(/^\/novel\/\d+\/(\d+)/);
      if (!m) continue;
      const novelPath = href.match(/^\/novel\/\d+\/\d+/)![0];
      const novelId = m[1];
      const text = a.textContent?.trim() || "";
      if (seenLink.has(novelPath)) {
        // タイトルがまだ未取得なら更新
        const existing = linkOrder.find((l) => l.novelPath === novelPath);
        if (existing && (!existing.title || existing.title.length < 3) && text.length > 2) {
          existing.title = text;
        }
        continue;
      }
      seenLink.add(novelPath);
      linkOrder.push({ novelPath, novelId, title: text });
    }

    // 全 cover 画像 URL を抽出し、URLパスから novel_id を取り出す
    // 例: https://cdn-image.alphapolis.co.jp/cover/328048364/500x711/uuid
    const coverByNovelId = new Map<string, string>();
    for (const img of Array.from(
      document.querySelectorAll<HTMLImageElement>(
        'img[src*="cdn-image.alphapolis.co.jp/cover"]'
      )
    )) {
      const src = img.src;
      const m = src.match(/\/cover\/(\d+)\//);
      if (m && !coverByNovelId.has(m[1])) {
        coverByNovelId.set(m[1], src);
      }
    }

    // novelId で突き合わせ
    return linkOrder.map((l) => ({
      novelPath: l.novelPath,
      coverUrl: coverByNovelId.get(l.novelId) || "",
      title: l.title,
    }));
  });

  await ctx.close();
  return result;
}

async function fetchRanking(browser: Browser): Promise<RankingItem[]> {
  // 1ページ目 + 2ページ目（page=2）で50件目標
  const pages = [
    RANKING_URL,
    `${RANKING_URL}&page=2`,
  ];

  const all: { novelPath: string; coverUrl: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    const items = await fetchRankingPage(browser, p);
    let added = 0;
    for (const it of items) {
      if (seen.has(it.novelPath)) continue;
      seen.add(it.novelPath);
      all.push(it);
      added++;
    }
    console.log(`  → 累計 ${all.length} (このページで +${added})`);
    if (all.length >= 80) break; // 余裕を持たせて80超えたら停止
  }

  const valid = all.filter((it) => it.coverUrl);
  console.log(
    `  → 全ページ合計: ${all.length} / 表紙URL取得済み: ${valid.length}`
  );

  return valid.map((it, i) => ({ rank: i + 1, ...it }));
}

async function downloadImage(url: string, dest: string): Promise<number> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Referer: BASE_URL },
  });
  if (!res.ok) throw new Error(`画像取得失敗: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log(
    `=== アルファポリス表紙コーパス収集 (target=${TARGET_LIMIT}, probe=${isProbe}) ===\n`
  );

  const browser = await chromium.launch({ headless: true });

  try {
    const ranking = await fetchRanking(browser);
    const targets = ranking.slice(0, TARGET_LIMIT);

    console.log(`\n📥 表紙ダウンロード: ${targets.length} 件\n`);

    type WorkMeta = RankingItem & { localPath: string; sizeKB: number };
    const results: WorkMeta[] = [];
    const failed: { novelPath: string; reason: string }[] = [];

    for (let i = 0; i < targets.length; i++) {
      const it = targets[i];
      try {
        // novelPath から novelIdを抽出（ファイル名用）
        const novelId = it.novelPath.split("/").filter(Boolean).pop()!;
        const ext = it.coverUrl.match(/\.(jpe?g|png|webp)/i)?.[1] ?? "jpg";
        const localPath = path.join(OUTPUT_DIR, `${novelId}.${ext}`);

        const size = await downloadImage(it.coverUrl, localPath);
        results.push({ ...it, localPath, sizeKB: Math.round(size / 1024) });

        console.log(
          `[${i + 1}/${targets.length}] rank=${it.rank} ${novelId} ✓ ${Math.round(size / 1024)}KB — ${(it.title || "").slice(0, 30)}`
        );
      } catch (e) {
        const reason = (e as Error).message;
        failed.push({ novelPath: it.novelPath, reason });
        console.log(`[${i + 1}/${targets.length}] ✗ ${reason}`);
      }

      // 画像CDN直叩きはレートを軽め（1〜2秒）にする
      if (i < targets.length - 1) await sleep(1000 + Math.random() * 1000);
    }

    const metaPath = path.join(OUTPUT_DIR, "_meta.json");
    await fs.writeFile(
      metaPath,
      JSON.stringify(
        {
          source: "alphapolis",
          genre: "ファンタジー",
          ranking: "24hpt",
          rankingUrl: RANKING_URL,
          collectedAt: new Date().toISOString(),
          totalCollected: results.length,
          totalTarget: targets.length,
          works: results,
          failed,
        },
        null,
        2
      ),
      "utf-8"
    );

    console.log(`\n=== 完了 ===`);
    console.log(`成功: ${results.length} / ${targets.length}`);
    console.log(`失敗: ${failed.length}`);
    console.log(`メタ: ${metaPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
