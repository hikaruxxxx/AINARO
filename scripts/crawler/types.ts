// クローラーの型定義

/** 作品メタデータ */
export interface NovelMeta {
  ncode: string; // 作品コード（例: n9669bk）
  title: string;
  author: string;
  totalEpisodes: number;
  chapters: ChapterInfo[];
}

/** 章情報 */
export interface ChapterInfo {
  title: string;
  episodes: EpisodeInfo[];
}

/** エピソード一覧情報（目次から取得） */
export interface EpisodeInfo {
  number: number;
  title: string;
  url: string;
  updatedAt: string;
}

/** エピソード本文データ */
export interface EpisodeContent {
  ncode: string;
  episodeNumber: number;
  title: string;
  chapterTitle: string;
  bodyText: string; // プレーンテキスト
  scrapedAt: string; // ISO 8601
}

/** クローラー設定 */
export interface CrawlerConfig {
  // リクエスト間の最小待機時間（ミリ秒）
  minDelay: number;
  // リクエスト間の最大待機時間（ミリ秒）
  maxDelay: number;
  // 429/503時のバックオフ初期値（ミリ秒）
  backoffBase: number;
  // 最大リトライ回数
  maxRetries: number;
  // User-Agent
  userAgent: string;
}
