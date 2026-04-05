// 小説家になろう スクレイパー
// robots.txt: Crawl-delay: 1 → 安全マージンで3〜8秒間隔

import * as cheerio from "cheerio";
import type {
  NovelMeta,
  ChapterInfo,
  EpisodeContent,
  CrawlerConfig,
} from "./types";
import { randomDelay, fetchWithRetry } from "./rate-limiter";

const BASE_URL = "https://ncode.syosetu.com";

const DEFAULT_CONFIG: CrawlerConfig = {
  minDelay: 3000, // 3秒（robots.txt の3倍）
  maxDelay: 8000, // 8秒
  backoffBase: 15000, // バックオフ初期15秒
  maxRetries: 3,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/** HTMLを取得 */
async function fetchPage(
  url: string,
  config: CrawlerConfig
): Promise<string> {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": config.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
      },
    },
    config.maxRetries,
    config.backoffBase
  );
  return response.text();
}

/** 目次ページから作品情報を取得 */
export async function fetchNovelMeta(
  ncode: string,
  config: CrawlerConfig = DEFAULT_CONFIG
): Promise<NovelMeta> {
  console.log(`📖 目次取得: ${ncode}`);

  // 目次は複数ページの場合がある
  let allChapters: ChapterInfo[] = [];
  let page = 1;
  let title = "";
  let author = "";

  while (true) {
    const url =
      page === 1
        ? `${BASE_URL}/${ncode}/`
        : `${BASE_URL}/${ncode}/?p=${page}`;

    const html = await fetchPage(url, config);
    const $ = cheerio.load(html);

    // 作品タイトル・作者（最初のページのみ）
    if (page === 1) {
      title = $(".p-novel__title").text().trim();
      author = $(".p-novel__author a").text().trim();
      if (!title) {
        // 短編の場合は構造が違う
        title = $("title").text().replace("- 小説家になろう", "").trim();
      }
    }

    // エピソードリスト解析
    const chapters = parseEpisodeList($, ncode);
    allChapters = allChapters.concat(chapters);

    // 次ページがあるか確認
    const nextPage = $(`.c-pager__item a[href*="?p=${page + 1}"]`).length > 0;
    if (!nextPage) break;

    page++;
    await randomDelay(config.minDelay, config.maxDelay);
  }

  const totalEpisodes = allChapters.reduce(
    (sum, ch) => sum + ch.episodes.length,
    0
  );

  console.log(
    `  ✅ "${title}" by ${author} — ${totalEpisodes}話 / ${allChapters.length}章`
  );

  return { ncode, title, author, totalEpisodes, chapters: allChapters };
}

/** 目次HTMLからエピソードリストを解析 */
function parseEpisodeList(
  $: cheerio.CheerioAPI,
  ncode: string
): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  let currentChapter: ChapterInfo = { title: "(序章)", episodes: [] };

  $(".p-eplist").children().each((_, el) => {
    const $el = $(el);

    // 章タイトル
    if ($el.hasClass("p-eplist__chapter-title")) {
      if (currentChapter.episodes.length > 0) {
        chapters.push(currentChapter);
      }
      currentChapter = { title: $el.text().trim(), episodes: [] };
      return;
    }

    // エピソード
    if ($el.hasClass("p-eplist__sublist")) {
      const $link = $el.find("a.p-eplist__subtitle");
      const href = $link.attr("href") || "";
      const epTitle = $link.text().trim();
      const updatedAt = $el.find(".p-eplist__update").text().trim();

      // URLからエピソード番号を抽出
      const match = href.match(/\/(\d+)\/$/);
      if (match) {
        currentChapter.episodes.push({
          number: parseInt(match[1]),
          title: epTitle,
          url: `${BASE_URL}${href}`,
          updatedAt,
        });
      }
    }
  });

  // 最後の章を追加
  if (currentChapter.episodes.length > 0) {
    chapters.push(currentChapter);
  }

  return chapters;
}

/** エピソード本文を取得 */
export async function fetchEpisode(
  ncode: string,
  episodeNumber: number,
  chapterTitle: string,
  config: CrawlerConfig = DEFAULT_CONFIG
): Promise<EpisodeContent> {
  const url = `${BASE_URL}/${ncode}/${episodeNumber}/`;
  const html = await fetchPage(url, config);
  const $ = cheerio.load(html);

  // エピソードタイトル
  const title = $(".p-novel__subtitle").text().trim() ||
    $(".p-novel__title").text().trim();

  // 本文取得（前書き + 本文 + 後書き）
  const parts: string[] = [];

  // 前書き
  const preface = $(".p-novel__text--preface .js-novel-text").text().trim();
  if (preface) parts.push(preface);

  // 本文
  const body = $(".js-novel-text.p-novel__text")
    .first()
    .find("p")
    .map((_, p) => $(p).text())
    .get()
    .join("\n");
  parts.push(body);

  // 後書き
  const afterword = $(".p-novel__text--afterword .js-novel-text").text().trim();
  if (afterword) parts.push(afterword);

  const bodyText = parts.join("\n\n---\n\n");

  return {
    ncode,
    episodeNumber,
    title,
    chapterTitle,
    bodyText,
    scrapedAt: new Date().toISOString(),
  };
}

/** 作品を一括クロール */
export async function crawlNovel(
  ncode: string,
  options: {
    startEp?: number; // 開始エピソード（中断再開用）
    endEp?: number; // 終了エピソード（部分取得用）
    outputDir: string;
    config?: CrawlerConfig;
  }
): Promise<void> {
  const config = options.config || DEFAULT_CONFIG;
  const fs = await import("fs/promises");
  const path = await import("path");

  // 出力ディレクトリ作成
  const novelDir = path.join(options.outputDir, ncode);
  await fs.mkdir(novelDir, { recursive: true });

  // 目次取得
  const meta = await fetchNovelMeta(ncode, config);
  await fs.writeFile(
    path.join(novelDir, "_meta.json"),
    JSON.stringify(meta, null, 2),
    "utf-8"
  );

  await randomDelay(config.minDelay, config.maxDelay);

  // エピソード取得
  let count = 0;
  for (const chapter of meta.chapters) {
    for (const ep of chapter.episodes) {
      if (options.startEp && ep.number < options.startEp) continue;
      if (options.endEp && ep.number > options.endEp) continue;

      // 既に取得済みならスキップ
      const filePath = path.join(
        novelDir,
        `ep${String(ep.number).padStart(4, "0")}.json`
      );
      try {
        await fs.access(filePath);
        console.log(`  ⏭️ ep${ep.number} スキップ（取得済み）`);
        continue;
      } catch {
        // ファイルなし → 取得する
      }

      console.log(
        `  📝 ep${ep.number}/${meta.totalEpisodes} "${ep.title}"`
      );

      const content = await fetchEpisode(
        ncode,
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
