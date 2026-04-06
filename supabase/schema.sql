-- Novelis DBスキーマ（Supabase SQL Editorで実行）
-- Phase 0 MVP用

-- ジャンルマスタ
CREATE TABLE genres (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- 初期ジャンルデータ
INSERT INTO genres (id, name, sort_order) VALUES
  ('fantasy', '異世界ファンタジー', 1),
  ('romance', '恋愛', 2),
  ('villainess', '悪役令嬢', 3),
  ('horror', 'ホラー', 4),
  ('mystery', 'ミステリー', 5),
  ('scifi', 'SF', 6),
  ('drama', '現代ドラマ', 7),
  ('comedy', 'コメディ', 8),
  ('action', 'アクション', 9),
  ('other', 'その他', 99);

-- 小説（作品）
CREATE TABLE novels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT,
  synopsis TEXT,
  cover_image_url TEXT,
  author_type TEXT NOT NULL DEFAULT 'self',
  author_id UUID,
  author_name TEXT NOT NULL DEFAULT '編集部',
  genre TEXT NOT NULL REFERENCES genres(id),
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'serial',
  is_r18 BOOLEAN DEFAULT FALSE,
  content_warnings TEXT[] DEFAULT '{}',
  total_chapters INTEGER DEFAULT 0,
  total_characters INTEGER DEFAULT 0,
  total_pv BIGINT DEFAULT 0,
  total_bookmarks INTEGER DEFAULT 0,
  latest_chapter_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- エピソード（話）
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  body_html TEXT,
  character_count INTEGER NOT NULL DEFAULT 0,
  is_free BOOLEAN DEFAULT TRUE,
  pv BIGINT DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(novel_id, episode_number)
);

-- ブックマーク（お気に入り）
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- Supabase Auth の auth.users.id を参照
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, novel_id)
);

-- 読書行動イベント（面白さの先行指標を計測）
-- North Star Metric「読者にとっての面白さ最大化」の根幹データ
CREATE TABLE reading_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                                  -- 未ログインはNULL
  session_id TEXT NOT NULL,                      -- 未ログインユーザーも追跡
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                      -- 'start', 'progress', 'complete', 'next', 'bookmark', 'drop'
  scroll_depth REAL,                             -- スクロール到達率（0.0-1.0）
  reading_time_sec INTEGER,                      -- 滞在時間（秒）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 日次集計（面白さ先行指標 + PV）
-- reading_eventsから日次バッチで集計
CREATE TABLE daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  -- 結果指標
  pv INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  -- 面白さ先行指標
  completion_rate REAL,                          -- 読了率（complete / start）
  next_episode_rate REAL,                        -- 次話遷移率（next / complete）
  avg_read_duration_sec REAL,                    -- 平均滞在時間
  avg_scroll_depth REAL,                         -- 平均スクロール到達率
  bookmark_rate REAL,                            -- ブックマーク率（bookmark / unique_users）
  drop_rate REAL,                                -- 離脱率（drop / start）
  UNIQUE(date, novel_id, episode_id)
);

-- お知らせ
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  is_pinned BOOLEAN DEFAULT FALSE
);

-- インデックス
CREATE INDEX idx_novels_genre ON novels(genre);
CREATE INDEX idx_novels_status ON novels(status);
CREATE INDEX idx_novels_published ON novels(published_at DESC);
CREATE INDEX idx_novels_pv ON novels(total_pv DESC);
CREATE INDEX idx_episodes_novel ON episodes(novel_id, episode_number);
CREATE INDEX idx_episodes_published ON episodes(published_at DESC);
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_novel ON bookmarks(novel_id);
CREATE INDEX idx_reading_events_session ON reading_events(session_id, created_at);
CREATE INDEX idx_reading_events_novel ON reading_events(novel_id, created_at DESC);
CREATE INDEX idx_reading_events_episode ON reading_events(episode_id, event_type);
CREATE INDEX idx_daily_stats_date ON daily_stats(date, novel_id);

-- RLS（行レベルセキュリティ）
-- Phase 0: 全テーブル公開読み取り、書き込みはSupabase Dashboard or API Keyで管理
ALTER TABLE novels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "novels_public_read" ON novels FOR SELECT USING (true);

ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "episodes_public_read" ON episodes FOR SELECT USING (true);

ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "genres_public_read" ON genres FOR SELECT USING (true);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_public_read" ON announcements FOR SELECT USING (true);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookmarks_public_insert" ON bookmarks FOR INSERT WITH CHECK (true);
CREATE POLICY "bookmarks_public_select" ON bookmarks FOR SELECT USING (true);
CREATE POLICY "bookmarks_owner_delete" ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- reading_events: 挿入は全員可（未ログインユーザーも記録）。閲覧は管理者のみ（RLS外でservice_roleキーを使用）
ALTER TABLE reading_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reading_events_anyone_insert" ON reading_events FOR INSERT WITH CHECK (true);

ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
-- daily_statsは管理画面からservice_roleキーで読み取る（一般ユーザーには非公開）

-- updated_atを自動更新するトリガー
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER novels_updated_at
  BEFORE UPDATE ON novels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER episodes_updated_at
  BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- reading_eventsのstartイベント挿入時にPVを自動インクリメント
CREATE OR REPLACE FUNCTION increment_pv_on_start()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'start' THEN
    -- エピソードのPVをインクリメント
    UPDATE episodes SET pv = pv + 1 WHERE id = NEW.episode_id;
    -- 作品の累計PVをインクリメント
    UPDATE novels SET total_pv = total_pv + 1 WHERE id = NEW.novel_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reading_events_increment_pv
  AFTER INSERT ON reading_events
  FOR EACH ROW EXECUTE FUNCTION increment_pv_on_start();

-- 面白さスコアビュー（直近30日の集計からランキング・トップページ用スコアを算出）
-- score = pv × avg_completion_rate × (1 + avg_next_episode_rate) × (1 + bookmark_rate)
-- データがない作品は total_pv のみでフォールバック
CREATE OR REPLACE VIEW novel_scores AS
SELECT
  n.*,
  -- 直近30日の集計値
  COALESCE(s.recent_pv, 0) AS recent_pv,
  s.avg_completion_rate,
  s.avg_next_episode_rate,
  s.avg_bookmark_rate,
  -- 面白さスコア（データがある場合は面白さ加味、ない場合はPVのみ）
  CASE
    WHEN s.recent_pv IS NOT NULL AND s.avg_completion_rate IS NOT NULL
    THEN s.recent_pv * s.avg_completion_rate * (1 + COALESCE(s.avg_next_episode_rate, 0)) * (1 + COALESCE(s.avg_bookmark_rate, 0))
    ELSE n.total_pv::REAL
  END AS score
FROM novels n
LEFT JOIN (
  SELECT
    novel_id,
    SUM(pv) AS recent_pv,
    AVG(completion_rate) FILTER (WHERE completion_rate IS NOT NULL) AS avg_completion_rate,
    AVG(next_episode_rate) FILTER (WHERE next_episode_rate IS NOT NULL) AS avg_next_episode_rate,
    AVG(bookmark_rate) FILTER (WHERE bookmark_rate IS NOT NULL) AS avg_bookmark_rate
  FROM daily_stats
  WHERE date >= CURRENT_DATE - 30
  GROUP BY novel_id
) s ON n.id = s.novel_id;

-- daily_stats を reading_events から集計する関数
-- 管理画面から手動実行 or cron で日次実行
CREATE OR REPLACE FUNCTION aggregate_daily_stats(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
BEGIN
  INSERT INTO daily_stats (date, novel_id, episode_id, pv, unique_users, completion_rate, next_episode_rate, avg_read_duration_sec, avg_scroll_depth, bookmark_rate, drop_rate)
  SELECT
    target_date,
    re.novel_id,
    re.episode_id,
    -- PV: startイベント数
    COUNT(*) FILTER (WHERE re.event_type = 'start') AS pv,
    -- ユニークユーザー: session_id ベース
    COUNT(DISTINCT re.session_id) AS unique_users,
    -- 読了率: complete / start
    CASE
      WHEN COUNT(*) FILTER (WHERE re.event_type = 'start') > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'complete')::REAL / COUNT(*) FILTER (WHERE re.event_type = 'start')
      ELSE NULL
    END AS completion_rate,
    -- 次話遷移率: next / complete
    CASE
      WHEN COUNT(*) FILTER (WHERE re.event_type = 'complete') > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'next')::REAL / COUNT(*) FILTER (WHERE re.event_type = 'complete')
      ELSE NULL
    END AS next_episode_rate,
    -- 平均滞在時間: completeイベントの reading_time_sec 平均
    AVG(re.reading_time_sec) FILTER (WHERE re.event_type = 'complete') AS avg_read_duration_sec,
    -- 平均スクロール到達率: 最新progressのscroll_depth平均
    AVG(re.scroll_depth) FILTER (WHERE re.event_type IN ('complete', 'drop')) AS avg_scroll_depth,
    -- ブックマーク率: bookmark / unique_users
    CASE
      WHEN COUNT(DISTINCT re.session_id) > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'bookmark')::REAL / COUNT(DISTINCT re.session_id)
      ELSE NULL
    END AS bookmark_rate,
    -- 離脱率: drop / start
    CASE
      WHEN COUNT(*) FILTER (WHERE re.event_type = 'start') > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'drop')::REAL / COUNT(*) FILTER (WHERE re.event_type = 'start')
      ELSE NULL
    END AS drop_rate
  FROM reading_events re
  WHERE re.created_at >= target_date::TIMESTAMPTZ
    AND re.created_at < (target_date + 1)::TIMESTAMPTZ
  GROUP BY re.novel_id, re.episode_id
  ON CONFLICT (date, novel_id, episode_id)
  DO UPDATE SET
    pv = EXCLUDED.pv,
    unique_users = EXCLUDED.unique_users,
    completion_rate = EXCLUDED.completion_rate,
    next_episode_rate = EXCLUDED.next_episode_rate,
    avg_read_duration_sec = EXCLUDED.avg_read_duration_sec,
    avg_scroll_depth = EXCLUDED.avg_scroll_depth,
    bookmark_rate = EXCLUDED.bookmark_rate,
    drop_rate = EXCLUDED.drop_rate;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 物語状態管理テーブル（数百話スケール対応）
-- 詳細: supabase/migrations/20260406_story_state_tables.sql
-- ============================================================

-- 伏線台帳
CREATE TABLE foreshadowing_items (
  id TEXT NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  planted_episode INTEGER NOT NULL,
  planned_payoff_from INTEGER,
  planned_payoff_to INTEGER,
  actual_payoff_episode INTEGER,
  status TEXT NOT NULL DEFAULT '未回収',
  importance TEXT NOT NULL DEFAULT 'B',
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (novel_id, id)
);

-- 読者既知情報
CREATE TABLE reader_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  category TEXT,
  info TEXT NOT NULL,
  reader_knows BOOLEAN NOT NULL DEFAULT FALSE,
  protagonist_knows BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ドラマティック・アイロニー
CREATE TABLE dramatic_irony_items (
  id TEXT NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  info TEXT NOT NULL,
  reader_knows BOOLEAN NOT NULL DEFAULT FALSE,
  protagonist_knows BOOLEAN NOT NULL DEFAULT FALSE,
  character_knowledge JSONB DEFAULT '{}',
  planted_episode INTEGER,
  resolution_episode INTEGER,
  effect TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (novel_id, id)
);

-- エピソードプロット
CREATE TABLE episode_plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  plot_content TEXT NOT NULL,
  is_auto_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(novel_id, episode_number)
);

-- 生成ロック（排他制御）
CREATE TABLE generation_locks (
  novel_id UUID PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
  locked_by TEXT NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  episode_number INTEGER,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'
);

CREATE INDEX idx_foreshadowing_status ON foreshadowing_items(novel_id, status);
CREATE INDEX idx_foreshadowing_payoff ON foreshadowing_items(novel_id, planned_payoff_from, planned_payoff_to);
CREATE INDEX idx_foreshadowing_importance ON foreshadowing_items(novel_id, importance) WHERE importance = 'S';
CREATE INDEX idx_reader_knowledge_novel_ep ON reader_knowledge_items(novel_id, episode_number DESC);
CREATE INDEX idx_dramatic_irony_active ON dramatic_irony_items(novel_id) WHERE is_active = TRUE;

-- body_md 分離テーブル（数百話スケール時の最適化）
-- 詳細: supabase/migrations/20260406_episode_bodies_separation.sql
CREATE TABLE episode_bodies (
  episode_id UUID PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  body_md TEXT NOT NULL,
  body_md_en TEXT,
  body_html TEXT,
  body_html_en TEXT
);

-- reading_events アーカイブテーブル
-- 詳細: supabase/migrations/20260406_reading_events_archive.sql
CREATE TABLE reading_events_archive (
  id UUID PRIMARY KEY,
  user_id UUID,
  session_id TEXT NOT NULL,
  novel_id UUID NOT NULL,
  episode_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  scroll_depth REAL,
  reading_time_sec INTEGER,
  variant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

-- 集計ログ
CREATE TABLE daily_stats_log (
  target_date DATE PRIMARY KEY,
  aggregated_at TIMESTAMPTZ DEFAULT NOW()
);
