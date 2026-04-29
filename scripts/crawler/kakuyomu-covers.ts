/**
 * カクヨム表紙画像コーパス収集スクリプト
 *
 * 異世界ファンタジー週間ランキング Top50 の表紙画像とメタを取得する。
 * 表紙画像は data/cover-corpus/kakuyomu/isekai/{workId}.jpg に保存。
 * メタは _meta.json にまとめる。
 *
 * 使い方:
 *   npx tsx scripts/crawler/kakuyomu-covers.ts            # Top50取得
 *   npx tsx scripts/crawler/kakuyomu-covers.ts --probe    # 上位5件で接続テストのみ
 *   npx tsx scripts/crawler/kakuyomu-covers.ts --limit=20 # Top20取得
 */

import { chromium, type Browser } from "playwright";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://kakuyomu.jp";
const OUTPUT_DIR = "data/cover-corpus/kakuyomu/isekai";

const args = process.argv.slice(2);
const isProbe = args.includes("--probe");
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const TARGET_LIMIT = isProbe ? 5 : limitArg ? parseInt(limitArg) : 50;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// rate-limit用ディレイ（カクヨム既存設定: 4〜10秒）
async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function randomDelay() {
  const ms = 4000 + Math.random() * 6000;
  await sleep(ms);
}

type WorkMeta = {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  imgPath: string;
  // 追加メタ（取れる範囲で）
  catchphrase?: string;
  reviewCount?: string;
  followerCount?: string;
  pvCount?: string;
};

async function fetchRankingWorkIds(browser: Browser): Promise<string[]> {
  const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "ja-JP" });
  const page = await ctx.newPage();
  const url = `${BASE_URL}/rankings/fantasy/weekly`;
  console.log(`📊 ランキング取得: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // ランキング順を維持するため Set ではなく配列＋既出マップ
  const workIds = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/works/"]')
    );
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const a of links) {
      // /works/123/ のような末尾スラッシュ含む or 末尾なし、サブパス（reviews等）は除外
      const m = a.getAttribute("href")?.match(/^\/works\/(\d+)\/?$/);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        ordered.push(m[1]);
      }
    }
    return ordered;
  });

  await ctx.close();
  console.log(`  → ユニーク作品ID: ${workIds.length} 件`);
  return workIds;
}

async function fetchWorkCoverAndMeta(
  browser: Browser,
  workId: string
): Promise<{ coverUrl: string | null; meta: Partial<WorkMeta> }> {
  const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "ja-JP" });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/works/${workId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // セレクタ調査: og:imageに表紙が入っていることが多い（SPAでも初期HTMLに含まれる）
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute("content")
      .catch(() => null);

    // ヘッダーにある作品cover（imgタグ）
    let coverUrl: string | null = ogImage ?? null;

    // og:image が未取得 or プレースホルダーぽい場合、imgから探す
    if (!coverUrl || coverUrl.includes("noimage") || coverUrl.includes("default")) {
      const imgSrc = await page.evaluate(() => {
        // カクヨム: 作品ページの cover 領域の画像
        const candidates = Array.from(
          document.querySelectorAll<HTMLImageElement>("img")
        );
        for (const img of candidates) {
          const src = img.src || img.getAttribute("data-src") || "";
          if (
            src &&
            (src.includes("cover") ||
              src.includes("kakuyomu") ||
              src.match(/\.(jpe?g|png|webp)/i))
          ) {
            // og:imageと違うものを優先（ロゴなどではないものを拾うため）
            return src;
          }
        }
        return null;
      });
      if (imgSrc) coverUrl = imgSrc;
    }

    // メタ情報
    const title = await page.locator("h1").first().innerText().catch(() => "");
    const author = await page
      .locator('a[href*="/users/"]')
      .first()
      .innerText()
      .catch(() => "");
    const catchphrase = await page
      .locator(".widget-catchphrase, [class*='catchphrase']")
      .first()
      .innerText()
      .catch(() => "");

    return {
      coverUrl: coverUrl || null,
      meta: {
        title: title.trim(),
        author: author.trim(),
        catchphrase: catchphrase?.trim() || undefined,
      },
    };
  } finally {
    await ctx.close();
  }
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

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log(
    `=== カクヨム表紙コーパス収集 (target=${TARGET_LIMIT}, probe=${isProbe}) ===\n`
  );

  const browser = await chromium.launch({ headless: true });

  try {
    const allIds = await fetchRankingWorkIds(browser);
    const targetIds = allIds.slice(0, TARGET_LIMIT);

    console.log(`\n📥 表紙取得開始: ${targetIds.length} 作品\n`);

    const results: WorkMeta[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (let i = 0; i < targetIds.length; i++) {
      const id = targetIds[i];
      try {
        const { coverUrl, meta } = await fetchWorkCoverAndMeta(browser, id);

        if (!coverUrl) {
          console.log(`[${i + 1}/${targetIds.length}] ${id} ⚠️ 表紙URL取得不可`);
          failed.push({ id, reason: "no cover url" });
          await randomDelay();
          continue;
        }

        // 拡張子判定
        const extMatch = coverUrl.match(/\.(jpe?g|png|webp)(\?|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
        const imgPath = path.join(OUTPUT_DIR, `${id}.${ext}`);

        const size = await downloadImage(coverUrl, imgPath);

        const m: WorkMeta = {
          id,
          title: meta.title || "(タイトル取得不可)",
          author: meta.author || "(作者取得不可)",
          coverUrl,
          imgPath,
          catchphrase: meta.catchphrase,
        };
        results.push(m);

        console.log(
          `[${i + 1}/${targetIds.length}] ${id} ✓ ${(size / 1024).toFixed(1)}KB — ${m.title.slice(0, 30)}`
        );
      } catch (e) {
        const reason = (e as Error).message;
        console.log(`[${i + 1}/${targetIds.length}] ${id} ✗ ${reason}`);
        failed.push({ id, reason });
      }

      // 最後の1件以外はディレイ
      if (i < targetIds.length - 1) await randomDelay();
    }

    // メタ保存
    const metaPath = path.join(OUTPUT_DIR, "_meta.json");
    await fs.writeFile(
      metaPath,
      JSON.stringify(
        {
          source: "kakuyomu",
          genre: "異世界ファンタジー",
          ranking: "weekly",
          collectedAt: new Date().toISOString(),
          totalCollected: results.length,
          totalTarget: targetIds.length,
          works: results,
          failed,
        },
        null,
        2
      ),
      "utf-8"
    );

    console.log(`\n=== 完了 ===`);
    console.log(`成功: ${results.length} / ${targetIds.length}`);
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
