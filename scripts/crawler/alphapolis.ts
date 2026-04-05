// アルファポリス スクレイパー（Playwright使用）

import { chromium, type Browser, type Page } from "playwright";
import type { NovelMeta, ChapterInfo, EpisodeContent, CrawlerConfig } from "./types";
import { randomDelay } from "./rate-limiter";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://www.alphapolis.co.jp";

const DEFAULT_CONFIG: CrawlerConfig = {
  minDelay: 4000,
  maxDelay: 10000,
  backoffBase: 20000,
  maxRetries: 3,
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

async function getPage(): Promise<Page> {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: DEFAULT_CONFIG.userAgent,
    locale: "ja-JP",
  });
  return context.newPage();
}

/** 目次ページから作品情報を取得 */
export async function fetchNovelMeta(
  novelPath: string, // 例: "836425194/156aborist"
  config: CrawlerConfig = DEFAULT_CONFIG
): Promise<NovelMeta> {
  console.log(`📖 アルファポリス目次取得: ${novelPath}`);

  const page = await getPage();
  try {
    await page.goto(`${BASE_URL}/novel/${novelPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    // SPA レンダリング待ち
    await page.waitForSelector(".episodes", { timeout: 10000 }).catch(() => {});

    // 作品タイトル
    const title = await page.locator("h1").first().innerText().catch(() => "");

    // 作者名
    const author = await page.locator(".author a").first().innerText().catch(() => "");

    // エピソードリスト
    const chapters: ChapterInfo[] = [];
    let currentChapter: ChapterInfo = { title: "(本編)", episodes: [] };

    const episodeLinks = await page.locator('.episodes a[href*="/episode/"], .episode-unit a').all();

    for (const link of episodeLinks) {
      const href = await link.getAttribute("href") || "";
      const epTitle = await link.innerText().catch(() => "");

      if (href && epTitle.trim()) {
        currentChapter.episodes.push({
          number: currentChapter.episodes.length + 1,
          title: epTitle.trim().split("\n")[0], // 改行以降はカット
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
    await page.context().close();
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
  const page = await getPage();
  try {
    await page.goto(episodeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForSelector(".novel-body", { timeout: 10000 }).catch(() => {});

    // エピソードタイトル
    const title = await page.locator(".episode-title").first().innerText()
      .catch(() => "");

    // 本文取得
    const bodyText = await page.locator(".novel-body").first().innerText()
      .catch(async () => {
        return await page.locator(".episode-text p").allInnerTexts().then((texts) => texts.join("\n"));
      });

    return {
      ncode: novelPath.replace("/", "_"),
      episodeNumber,
      title: title.trim(),
      chapterTitle,
      bodyText: bodyText.trim(),
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await page.context().close();
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
      await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf-8");

      count++;
      await randomDelay(config.minDelay, config.maxDelay);
    }
  }

  console.log(`\n✅ 完了: ${meta.title} — ${count}話取得`);
}

/** ブラウザ終了 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
