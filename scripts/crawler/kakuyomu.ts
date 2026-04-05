// カクヨム スクレイパー（Playwright使用）
// SPAのため、ブラウザレンダリングが必要

import { chromium, type Browser, type Page } from "playwright";
import type { NovelMeta, ChapterInfo, EpisodeContent, CrawlerConfig } from "./types";
import { randomDelay } from "./rate-limiter";
import fs from "fs/promises";
import path from "path";

const BASE_URL = "https://kakuyomu.jp";

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
  workId: string,
  config: CrawlerConfig = DEFAULT_CONFIG
): Promise<NovelMeta> {
  console.log(`📖 カクヨム目次取得: ${workId}`);

  const page = await getPage();
  try {
    await page.goto(`${BASE_URL}/works/${workId}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // 作品タイトル
    const title = await page.locator('[id="workTitle"] a, h1 a').first().innerText().catch(() => "");

    // 作者名
    const author = await page.locator('[id="workAuthor-activityName"] a').first().innerText().catch(() => "");

    // 目次からエピソードリスト取得
    const chapters: ChapterInfo[] = [];
    let currentChapter: ChapterInfo = { title: "(序章)", episodes: [] };

    // 目次の章とエピソードを取得
    const tocItems = await page.locator('.widget-toc-main .widget-toc-chapter, .widget-toc-main .widget-toc-episode').all()
      .catch(() => [] as any[]);

    // 目次が新UIの場合
    if (tocItems.length === 0) {
      // 新UIの目次構造を試す
      const episodes = await page.locator('a[href*="/episodes/"]').all();
      for (const ep of episodes) {
        const href = await ep.getAttribute("href") || "";
        const epTitle = await ep.innerText().catch(() => "");
        const match = href.match(/episodes\/(\d+)/);
        if (match && epTitle.trim()) {
          currentChapter.episodes.push({
            number: currentChapter.episodes.length + 1,
            title: epTitle.trim(),
            url: `${BASE_URL}${href}`,
            updatedAt: "",
          });
        }
      }
    } else {
      for (const item of tocItems) {
        const className = await item.getAttribute("class") || "";
        if (className.includes("chapter")) {
          if (currentChapter.episodes.length > 0) {
            chapters.push(currentChapter);
          }
          const chTitle = await item.innerText().catch(() => "");
          currentChapter = { title: chTitle.trim(), episodes: [] };
        } else {
          const link = await item.locator("a").first();
          const href = await link.getAttribute("href").catch(() => "") || "";
          const epTitle = await link.innerText().catch(() => "");
          const match = href.match(/episodes\/(\d+)/);
          if (match) {
            currentChapter.episodes.push({
              number: currentChapter.episodes.length + 1,
              title: epTitle.trim(),
              url: `${BASE_URL}${href}`,
              updatedAt: "",
            });
          }
        }
      }
    }

    if (currentChapter.episodes.length > 0) {
      chapters.push(currentChapter);
    }

    // エピソード番号を通し番号に修正
    let globalNum = 0;
    for (const ch of chapters) {
      for (const ep of ch.episodes) {
        globalNum++;
        ep.number = globalNum;
      }
    }

    const totalEpisodes = globalNum;
    console.log(`  ✅ "${title}" by ${author} — ${totalEpisodes}話 / ${chapters.length}章`);

    return {
      ncode: workId,
      title: title || workId,
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
  workId: string,
  episodeId: string,
  episodeNumber: number,
  chapterTitle: string,
  config: CrawlerConfig = DEFAULT_CONFIG
): Promise<EpisodeContent> {
  const page = await getPage();
  try {
    await page.goto(`${BASE_URL}/works/${workId}/episodes/${episodeId}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // エピソードタイトル
    const title = await page.locator('.widget-episodeTitle, [class*="EpisodeTitle"]').first().innerText()
      .catch(() => "");

    // 本文取得
    const bodyText = await page.locator('.widget-episodeBody, [class*="EpisodeBody"]').first().innerText()
      .catch(async () => {
        // フォールバック: 本文っぽいコンテナを探す
        return await page.locator('main p').allInnerTexts().then(texts => texts.join("\n"));
      });

    return {
      ncode: workId,
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
export async function crawlKakuyomu(
  workId: string,
  options: {
    startEp?: number;
    endEp?: number;
    outputDir: string;
    config?: CrawlerConfig;
  }
): Promise<void> {
  const config = options.config || DEFAULT_CONFIG;

  const novelDir = path.join(options.outputDir, `kakuyomu_${workId}`);
  await fs.mkdir(novelDir, { recursive: true });

  const meta = await fetchNovelMeta(workId, config);
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

      // URLからエピソードIDを抽出
      const epIdMatch = ep.url.match(/episodes\/(\d+)/);
      if (!epIdMatch) continue;

      console.log(`  📝 ep${ep.number}/${meta.totalEpisodes} "${ep.title}"`);

      const content = await fetchEpisode(
        workId,
        epIdMatch[1],
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
