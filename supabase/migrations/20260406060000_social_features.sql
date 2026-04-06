-- ソーシャル機能テーブル（いいね・コメント・フォロー・コンテンツ警告・Push通知）

-- novelsテーブルにcontent_warningsカラム追加
ALTER TABLE novels ADD COLUMN IF NOT EXISTS content_warnings TEXT[] DEFAULT '{}';

-- いいね（エピソード単位）
CREATE TABLE IF NOT EXISTS episode_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                          -- 未ログインはNULL
  session_id TEXT NOT NULL,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- 同一セッションからの重複いいねを防止
  UNIQUE(session_id, episode_id)
);

CREATE INDEX idx_episode_likes_episode ON episode_likes(episode_id);
CREATE INDEX idx_episode_likes_session ON episode_likes(session_id);

-- コメント（エピソード末尾）
CREATE TABLE IF NOT EXISTS episode_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT NOT NULL,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '名無しの読者',
  body TEXT NOT NULL,
  is_hidden BOOLEAN DEFAULT FALSE,        -- 管理者が非表示にする場合
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episode_comments_episode ON episode_comments(episode_id, created_at DESC);
CREATE INDEX idx_episode_comments_novel ON episode_comments(novel_id);

-- フォロー（作品単位の更新通知登録）
CREATE TABLE IF NOT EXISTS novel_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, novel_id)
);

CREATE INDEX idx_novel_follows_novel ON novel_follows(novel_id);
CREATE INDEX idx_novel_follows_session ON novel_follows(session_id);

-- Push通知サブスクリプション
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_session ON push_subscriptions(session_id);

-- RLS
ALTER TABLE episode_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "episode_likes_anyone_insert" ON episode_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "episode_likes_public_select" ON episode_likes FOR SELECT USING (true);
CREATE POLICY "episode_likes_owner_delete" ON episode_likes FOR DELETE USING (
  session_id = current_setting('request.headers', true)::json->>'x-session-id'
  OR auth.uid() = user_id
);

ALTER TABLE episode_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "episode_comments_anyone_insert" ON episode_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "episode_comments_public_select" ON episode_comments FOR SELECT USING (is_hidden = FALSE);

ALTER TABLE novel_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "novel_follows_anyone_insert" ON novel_follows FOR INSERT WITH CHECK (true);
CREATE POLICY "novel_follows_public_select" ON novel_follows FOR SELECT USING (true);
CREATE POLICY "novel_follows_owner_delete" ON novel_follows FOR DELETE USING (
  session_id = current_setting('request.headers', true)::json->>'x-session-id'
  OR auth.uid() = user_id
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subscriptions_anyone_insert" ON push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "push_subscriptions_owner_select" ON push_subscriptions FOR SELECT USING (
  session_id = current_setting('request.headers', true)::json->>'x-session-id'
  OR auth.uid() = user_id
);

-- いいね数をエピソードテーブルに集計するビュー
CREATE OR REPLACE VIEW episode_like_counts AS
SELECT
  episode_id,
  COUNT(*) AS like_count
FROM episode_likes
GROUP BY episode_id;

-- コメント数をエピソードテーブルに集計するビュー
CREATE OR REPLACE VIEW episode_comment_counts AS
SELECT
  episode_id,
  COUNT(*) AS comment_count
FROM episode_comments
WHERE is_hidden = FALSE
GROUP BY episode_id;

-- フォロー数を作品テーブルに集計するビュー
CREATE OR REPLACE VIEW novel_follow_counts AS
SELECT
  novel_id,
  COUNT(*) AS follow_count
FROM novel_follows
GROUP BY novel_id;
