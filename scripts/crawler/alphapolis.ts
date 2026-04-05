// アルファポリス スクレイパー（Playwright + Cookie認証）
// 初回: alphapolis-auth.ts でCookieを取得（手動reCAPTCHA）
// 以降: Cookie付きheadlessで自動取得

import { chromium, type Browser, type BrowserContext } from "playwright";
import type { NovelMeta, ChapterInfo, EpisodeContent, CrawlerConfig } from "./types";
import { randomDelay } from "./rate-limiter";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://www.alphapolis.co.jp";
const COOKIE_PATH = "data/crawled/_alphapolis_cookies.json";

const DEFAULT_CONFIG: CrawlerConfig = {
  minDelay: 5000,
  maxDelay: 12000,
  backoffBase: 20000,
  maxRetries: 3,
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

let browser: Browser | null = null;
let sharedContext: BrowserContext | null = null;

/** Cookie読み込み付きブラウザコンテキストを取得（使い回し） */
async function getContext(): Promise<BrowserContext> {
  if (sharedContext) return sharedContext;

  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }

  sharedContext = await browser.newContext({
    userAgent: DEFAULT_CONFIG.userAgent,
    locale: "ja-JP",
  });

  // Cookie読み込み
  try {
    const cookies = JSON.parse(await fs.readFile(COOKIE_PATH, "utf-8"));
    await sharedContext.addCookies(cookies);
    console.log(`🍪 Cookie読み込み済み（${cookies.length}個）`);
  } catch {
    console.warn("⚠️ Cookieファイルなし。alphapolis-auth.ts を先に実行してください。");
  }

  return sharedContext;
}

/** 目次ページから作品情報を取得 */
export async function fetchNovelMeta(
  novelPath: string,
  config: CrawlerConfig = DEFAULT_CONFIG
): Promise<NovelMeta> {
  console.log(`📖 アルファポリス目次取得: ${novelPath}`);

  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/novel/${novelPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForSelector(".episodes", { timeout: 10000 }).catch(() => {});

    const title = await page.locator("h1").first().innerText().catch(() => "");
    const author = await page.locator(".author a").first().innerText().catch(() => "");

    const chapters: ChapterInfo[] = [];
    let currentChapter: ChapterInfo = { title: "(本編)", episodes: [] };

    const episodeLinks = await page.locator(".episodes .episode a[href*='/episode/']").all();

    for (const link of episodeLinks) {
      const href = await link.getAttribute("href") || "";
      const epTitle = await link.innerText().catch(() => "");

      if (href && epTitle.trim()) {
        currentChapter.episodes.push({
          number: currentChapter.episodes.length + 1,
          title: epTitle.trim().split("\n")[0],
          url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
          updatedAt: "",
        });
      }
    }

    if (currentChapter.episodes.length > 0) {
      chapters.push(currentChapter);
    }

    const totalEpisodes = currentChapter.episodes.length;
    console.log(`  ✅ "${title}" by ${author} — ${totalEpisodes}話`);

    return {
      ncode: novelPath.replace("/", "_"),
      title: title || novelPath,
      author,
      totalEpisodes,
      chapters,
    };
  } finally {
    await page.close();
  }
}

/** エピソード本文を取得 */
export async function fetchEpisode(
  novelPath: string,
  episodeUrl: string,
  episodeNumber: number,
  chapterTitle: string,
  config: CrawlerConfig = DEFAULT_CONFIG
): Promise<EpisodeContent> {
  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.goto(episodeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    // Cookie付きなのでreCAPTCHA通過後のJS実行を待つ
    await page.waitForSelector("#novelBody", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(5000);

    const title = await page.locator(".episode-title").first().innerText()
      .catch(() => "");

    const bodyText = await page.locator("#novelBody").first().innerText()
      .catch(() => "");

    // Cookie失効チェック
    if (bodyText.length < 10) {
      const hasRecaptcha = await page.locator("iframe[src*='recaptcha']").count();
      if (hasRecaptcha > 0) {
        console.warn("  ⚠️ Cookie失効の可能性。alphapolis-auth.ts でCookieを再取得してください。");
      }
    }

    return {
      ncode: novelPath.replace("/", "_"),
      episodeNumber,
      title: title.trim(),
      chapterTitle,
      bodyText: bodyText.trim(),
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await page.close();
  }
}

/** 作品を一括クロール */
export async function crawlAlphapolis(
  novelPath: string,
  options: {
    startEp?: number;
    endEp?: number;
    outputDir: string;
    config?: CrawlerConfig;
  }
): Promise<void> {
  const config = options.config || DEFAULT_CONFIG;
  const safeId = novelPath.replace("/", "_");
  const novelDir = path.join(options.outputDir, `alphapolis_${safeId}`);
  await fs.mkdir(novelDir, { recursive: true });

  const meta = await fetchNovelMeta(novelPath, config);
  await fs.writeFile(
    path.join(novelDir, "_meta.json"),
    JSON.stringify(meta, null, 2),
    "utf-8"
  );

  await randomDelay(config.minDelay, config.maxDelay);

  let count = 0;
  let emptyCount = 0;

  for (const chapter of meta.chapters) {
    for (const ep of chapter.episodes) {
      if (options.startEp && ep.number < options.startEp) continue;
      if (options.endEp && ep.number > options.endEp) continue;

      const filePath = path.join(
        novelDir,
        `ep${String(ep.number).padStart(4, "0")}.json`
      );
      try {
        await fs.access(filePath);
        console.log(`  ⏭️ ep${ep.number} スキップ（取得済み）`);
        continue;
      } catch {
        // 取得する
      }

      console.log(`  📝 ep${ep.number}/${meta.totalEpisodes} "${ep.title}"`);

      const content = await fetchEpisode(
        novelPath,
        ep.url,
        ep.number,
        chapter.title,
        config
      );

      // 空の本文が連続したらCookie失効とみなして停止
      if (content.bodyText.length < 10) {
        emptyCount++;
        console.warn(`  ⚠️ 本文が空（${emptyCount}回連続）`);
        if (emptyCount >= 3) {
          console.error("  ❌ Cookie失効の可能性が高いため停止します。");
          console.error("     npx tsx scripts/crawler/alphapolis-auth.ts でCookieを再取得してください。");
          break;
        }
      } else {
        emptyCount = 0;
      }

      await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf-8");

      count++;
      await randomDelay(config.minDelay, config.maxDelay);
    }

    if (emptyCount >= 3) break;
  }

  console.log(`\n✅ 完了: ${meta.title} — ${count}話取得`);
}

/** ブラウザ終了 */
export async function closeBrowser(): Promise<void> {
  if (sharedContext) {
    await sharedContext.close();
    sharedContext = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}
