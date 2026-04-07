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
  content_warnings: ContentWarningType[];
  total_chapters: number;
  total_characters: number;
  total_pv: number;
  total_bookmarks: number;
  latest_chapter_at: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
};

// エピソードのステータス
export type EpisodeStatus = "draft" | "pending_review" | "revision_requested" | "scheduled" | "published";

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
  status?: EpisodeStatus;         // Phase 1で追加。未マイグレーション環境では省略可
  is_free: boolean;
  unlock_at: string | null;     // NULLなら即時解放、値があればその時刻まではロック
  unlock_price: number;          // 先読みに必要なポイント数（0 = 無料）
  scheduled_at?: string | null;  // 予約公開日時
  pv: number;
  published_at: string;
  created_at: string;
  updated_at: string;
};

// 目次用の軽量エピソード型（body_mdを含まない）
export type EpisodeTocItem = {
  episode_number: number;
  title: string;
  title_en: string | null;
  character_count: number;
  is_free: boolean;
  published_at: string;
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

// 読書行動イベント（variant_id: A/Bテスト時のバリアントID）
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
  variant_id: string | null;
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
  scroll_distribution: Record<string, number> | null;  // {"0":5,"10":8,...} 10%刻みの分布
};

// ===== ポイントエコノミー =====

export type UserPoints = {
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  last_login_bonus_at: string | null;
  updated_at: string;
};

export type PointTransactionType =
  | "daily_login"
  | "episode_complete"
  | "comment"
  | "unlock_episode"
  | "purchase"
  | "admin_grant";

export type PointTransaction = {
  id: string;
  user_id: string;
  amount: number;
  type: PointTransactionType;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

export type PointUnlock = {
  id: string;
  user_id: string;
  episode_id: string;
  points_spent: number;
  created_at: string;
};

// ===== コンテンツ選別ファネル =====

export type ContentCandidatePhase = "plot" | "pilot" | "serial" | "archived";
export type ContentDecision = "promote" | "revise" | "archive";

export type ContentCandidate = {
  id: string;
  novel_id: string | null;
  title: string;
  synopsis: string | null;
  genre: string;
  phase: ContentCandidatePhase;
  pilot_episodes: number;
  pilot_completion_rate: number | null;
  pilot_next_rate: number | null;
  pilot_bookmark_rate: number | null;
  pilot_avg_read_sec: number | null;
  pilot_score: number | null;
  decision: ContentDecision | null;
  decided_at: string | null;
  decision_reason: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ===== A/Bテスト =====

export type ABTestStatus = "draft" | "running" | "completed";
export type ABTestMetric = "completion_rate" | "next_episode_rate" | "avg_read_duration" | "bookmark_rate";

export type ABTestVariant = {
  id: string;  // "A", "B", etc.
  name: string;
};

export type ABTest = {
  id: string;
  name: string;
  description: string | null;
  novel_id: string;
  episode_id: string;
  status: ABTestStatus;
  variants: ABTestVariant[];
  traffic_split: Record<string, number>;
  primary_metric: ABTestMetric;
  winner_variant: string | null;
  results: Record<string, Record<string, number>> | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type EpisodeVariant = {
  id: string;
  ab_test_id: string;
  variant_id: string;
  body_md: string;
  body_html: string | null;
  character_count: number;
  created_at: string;
};

export type ABAssignment = {
  id: string;
  ab_test_id: string;
  session_id: string;
  user_id: string | null;
  variant_id: string;
  created_at: string;
};

// ===== ソーシャル機能 =====

// いいね（エピソード単位）
export type EpisodeLike = {
  id: string;
  user_id: string | null;
  session_id: string;
  episode_id: string;
  created_at: string;
};

// コメント（エピソード末尾）
export type EpisodeComment = {
  id: string;
  user_id: string | null;
  session_id: string;
  episode_id: string;
  novel_id: string;
  display_name: string;
  body: string;
  created_at: string;
};

// フォロー（作品単位）
export type NovelFollow = {
  id: string;
  user_id: string | null;
  session_id: string;
  novel_id: string;
  created_at: string;
};

// コンテンツ警告タグ
export type ContentWarningType =
  | "violence"    // 暴力
  | "gore"        // グロテスク
  | "sexual"      // 性的表現
  | "death"       // 死亡描写
  | "abuse"       // 虐待
  | "suicide"     // 自殺
  | "horror"      // ホラー表現
  | "drug";       // 薬物

// Push通知サブスクリプション
export type PushSubscription = {
  id: string;
  user_id: string | null;
  session_id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  created_at: string;
};

// ===== 章→章リテンションファネル =====

export type EpisodeRetention = {
  novel_id: string;
  episode_number: number;
  title: string;
  readers: number;
  continued_to_next: number;
  retention_rate: number | null;
};

// ユーザープロフィール
export type UserProfile = {
  id: string;
  user_id: string;
  display_name: string | null;
  role: "reader" | "writer" | "admin";
  writer_status: "none" | "approved" | "suspended";
  bio: string | null;
  created_at: string;
  updated_at: string;
  writer_approved_at?: string | null;
};
