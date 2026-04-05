// 小説（作品）
export type Novel = {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  tagline: string | null;
  tagline_en: string | null;
  synopsis: string | null;
  synopsis_en: string | null;
  cover_image_url: string | null;
  author_type: "self" | "external";
  author_id: string | null;
  author_name: string;
  genre: string;
  tags: string[];
  status: "serial" | "complete" | "hiatus";
  is_r18: boolean;
  total_chapters: number;
  total_characters: number;
  total_pv: number;
  total_bookmarks: number;
  latest_chapter_at: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
};

// エピソード（話）
export type Episode = {
  id: string;
  novel_id: string;
  episode_number: number;
  title: string;
  title_en: string | null;
  body_md: string;
  body_md_en: string | null;
  body_html: string | null;
  body_html_en: string | null;
  character_count: number;
  is_free: boolean;
  pv: number;
  published_at: string;
  created_at: string;
  updated_at: string;
};

// ジャンルマスタ
export type Genre = {
  id: string;
  name: string;
  sort_order: number;
};

// お知らせ
export type Announcement = {
  id: string;
  title: string;
  body_md: string;
  published_at: string;
  is_pinned: boolean;
};

// 面白さスコア付き小説（novel_scoresビューの型）
// Novelの全フィールド + 直近30日の集計値 + 面白さスコア
export type NovelScore = Novel & {
  recent_pv: number;
  avg_completion_rate: number | null;
  avg_next_episode_rate: number | null;
  avg_bookmark_rate: number | null;
  score: number;
};

// 読書行動イベント
export type ReadingEventType = "start" | "progress" | "complete" | "next" | "bookmark" | "drop";

export type ReadingEvent = {
  id: string;
  user_id: string | null;
  session_id: string;
  novel_id: string;
  episode_id: string;
  event_type: ReadingEventType;
  scroll_depth: number | null;
  reading_time_sec: number | null;
  created_at: string;
};

// 日次集計
export type DailyStats = {
  id: string;
  date: string;
  novel_id: string;
  episode_id: string | null;
  pv: number;
  unique_users: number;
  completion_rate: number | null;
  next_episode_rate: number | null;
  avg_read_duration_sec: number | null;
  avg_scroll_depth: number | null;
  bookmark_rate: number | null;
  drop_rate: number | null;
};
