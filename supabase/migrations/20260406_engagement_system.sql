-- =============================================================================
-- Novelis エンゲージメントシステム マイグレーション
-- 1. エピソード時限解放モデル
-- 2. 章単位の離脱分析強化
-- 3. コンテンツ選別ファネル
-- 4. ポイントエコノミー
-- 5. A/Bテスト基盤
-- =============================================================================

-- =============================================================================
-- 1. エピソード時限解放モデル
-- unlock_at: NULLなら即時公開。値があればその時刻まではロック（ポイント解放可）
-- unlock_price: 先読みに必要なポイント数（0 = 無料）
-- =============================================================================
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMPTZ;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS unlock_price INTEGER NOT NULL DEFAULT 0;

-- 公開済みかつ解放済みのエピソードのみ返すビュー
CREATE OR REPLACE VIEW published_episodes AS
SELECT *
FROM episodes
WHERE published_at <= NOW()
  AND (unlock_at IS NULL OR unlock_at <= NOW());

-- =============================================================================
-- 2. 章単位の離脱分析強化
-- reading_eventsにscroll_percentile（10%刻みバケット）を追加
-- daily_statsにスクロール分布JSONBを追加
-- =============================================================================
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS scroll_distribution JSONB;
-- scroll_distribution の形式: {"0":5,"10":8,"20":12,...,"90":3}
-- 各キーはスクロール深度の10%刻みバケット、値はそのバケットの離脱/最終到達数

-- 章→章のリテンション分析ビュー（ファネル分析用）
-- 作品ごとに「第N話を読み始めた人のうち、第N+1話も読み始めた人の割合」を算出
CREATE OR REPLACE VIEW episode_retention_funnel AS
SELECT
  e.novel_id,
  e.episode_number,
  e.title,
  COUNT(DISTINCT re_start.session_id) AS readers,
  -- 次話を読み始めた人数（同一セッション内で次話のstartイベントがある）
  COUNT(DISTINCT re_next_start.session_id) AS continued_to_next,
  -- リテンション率
  CASE
    WHEN COUNT(DISTINCT re_start.session_id) > 0
    THEN COUNT(DISTINCT re_next_start.session_id)::REAL / COUNT(DISTINCT re_start.session_id)
    ELSE NULL
  END AS retention_rate
FROM episodes e
-- この話のstartイベント
LEFT JOIN reading_events re_start
  ON re_start.episode_id = e.id AND re_start.event_type = 'start'
-- 次話のstartイベント（同セッション）
LEFT JOIN episodes e_next
  ON e_next.novel_id = e.novel_id AND e_next.episode_number = e.episode_number + 1
LEFT JOIN reading_events re_next_start
  ON re_next_start.episode_id = e_next.id
  AND re_next_start.event_type = 'start'
  AND re_next_start.session_id = re_start.session_id
GROUP BY e.novel_id, e.episode_number, e.title, e.id
ORDER BY e.novel_id, e.episode_number;

-- スクロール深度ヒートマップビュー（章内のどこで離脱しているか）
CREATE OR REPLACE VIEW episode_scroll_heatmap AS
SELECT
  re.episode_id,
  e.novel_id,
  e.episode_number,
  e.title,
  -- 10%刻みでバケット化（drop/progressイベントのscroll_depth）
  WIDTH_BUCKET(re.scroll_depth, 0, 1.001, 10) AS depth_bucket,
  COUNT(*) AS event_count,
  COUNT(*) FILTER (WHERE re.event_type = 'drop') AS drop_count,
  COUNT(*) FILTER (WHERE re.event_type = 'complete') AS complete_count
FROM reading_events re
JOIN episodes e ON e.id = re.episode_id
WHERE re.scroll_depth IS NOT NULL
  AND re.event_type IN ('drop', 'complete', 'progress')
GROUP BY re.episode_id, e.novel_id, e.episode_number, e.title,
         WIDTH_BUCKET(re.scroll_depth, 0, 1.001, 10)
ORDER BY e.novel_id, e.episode_number, depth_bucket;

-- =============================================================================
-- 3. コンテンツ選別ファネル
-- プロット→パイロット版→連載化の判断フローを管理
-- =============================================================================
CREATE TABLE content_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID REFERENCES novels(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  synopsis TEXT,
  genre TEXT NOT NULL REFERENCES genres(id),
  -- ファネルのフェーズ: plot → pilot → serial → archived
  phase TEXT NOT NULL DEFAULT 'plot'
    CHECK (phase IN ('plot', 'pilot', 'serial', 'archived')),
  pilot_episodes INTEGER DEFAULT 0,
  -- パイロット版の読者データから算出されるスコア
  pilot_completion_rate REAL,
  pilot_next_rate REAL,
  pilot_bookmark_rate REAL,
  pilot_avg_read_sec REAL,
  -- 総合判定スコア（completion × (1 + next_rate) × (1 + bookmark_rate)）
  pilot_score REAL,
  -- 判定
  decision TEXT CHECK (decision IN ('promote', 'revise', 'archive')),
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  -- メタデータ
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_candidates_phase ON content_candidates(phase);
CREATE INDEX idx_content_candidates_score ON content_candidates(pilot_score DESC NULLS LAST);

CREATE TRIGGER content_candidates_updated_at
  BEFORE UPDATE ON content_candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: 管理者のみ（service_role経由）
ALTER TABLE content_candidates ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. ポイントエコノミー
-- 獲得: ログインボーナス / 読了 / コメント
-- 消費: エピソード先読み解放
-- =============================================================================

-- ユーザーポイント残高
CREATE TABLE user_points (
  user_id UUID PRIMARY KEY,  -- auth.users.id
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  last_login_bonus_at DATE,  -- ログインボーナスの重複防止
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ポイント取引履歴
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,  -- 正: 獲得、負: 消費
  type TEXT NOT NULL CHECK (type IN (
    'daily_login',        -- 毎日ログインボーナス（+1）
    'episode_complete',   -- エピソード読了（+1）
    'comment',            -- コメント投稿（+1、1日1回まで）
    'unlock_episode',     -- エピソード先読み解放（-N）
    'purchase',           -- ポイント購入（+N）
    'admin_grant'         -- 管理者付与（+N）
  )),
  reference_id UUID,      -- 関連エピソードIDなど
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_point_transactions_user ON point_transactions(user_id, created_at DESC);
CREATE INDEX idx_point_transactions_type ON point_transactions(user_id, type, created_at DESC);

-- エピソード先読み解放記録
CREATE TABLE point_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  points_spent INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, episode_id)
);

CREATE INDEX idx_point_unlocks_user ON point_unlocks(user_id);

-- RLS
ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_points_own_read" ON user_points FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_points_service_write" ON user_points FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "point_transactions_own_read" ON point_transactions FOR SELECT USING (auth.uid() = user_id);

ALTER TABLE point_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "point_unlocks_own_read" ON point_unlocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "point_unlocks_own_insert" ON point_unlocks FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ポイント付与関数（残高更新 + 取引記録を1トランザクションで）
CREATE OR REPLACE FUNCTION grant_points(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  new_balance INTEGER;
BEGIN
  -- user_pointsがなければ作成
  INSERT INTO user_points (user_id, balance, total_earned, total_spent)
  VALUES (p_user_id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- 残高更新
  IF p_amount > 0 THEN
    UPDATE user_points
    SET balance = balance + p_amount,
        total_earned = total_earned + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO new_balance;
  ELSE
    -- 消費時は残高チェック
    UPDATE user_points
    SET balance = balance + p_amount,  -- p_amountは負の値
        total_spent = total_spent + ABS(p_amount),
        updated_at = NOW()
    WHERE user_id = p_user_id AND balance >= ABS(p_amount)
    RETURNING balance INTO new_balance;

    IF new_balance IS NULL THEN
      RAISE EXCEPTION 'ポイント残高不足';
    END IF;
  END IF;

  -- 取引記録
  INSERT INTO point_transactions (user_id, amount, type, reference_id, description)
  VALUES (p_user_id, p_amount, p_type, p_reference_id, p_description);

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- ログインボーナス付与（1日1回制限付き）
CREATE OR REPLACE FUNCTION claim_login_bonus(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  last_bonus DATE;
  new_balance INTEGER;
BEGIN
  -- user_pointsがなければ作成
  INSERT INTO user_points (user_id, balance, total_earned, total_spent)
  VALUES (p_user_id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_login_bonus_at INTO last_bonus
  FROM user_points WHERE user_id = p_user_id;

  -- 今日すでに受け取り済みなら残高をそのまま返す
  IF last_bonus = CURRENT_DATE THEN
    SELECT balance INTO new_balance FROM user_points WHERE user_id = p_user_id;
    RETURN new_balance;
  END IF;

  -- ボーナス付与
  UPDATE user_points
  SET balance = balance + 1,
      total_earned = total_earned + 1,
      last_login_bonus_at = CURRENT_DATE,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO new_balance;

  INSERT INTO point_transactions (user_id, amount, type, description)
  VALUES (p_user_id, 1, 'daily_login', 'ログインボーナス');

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. A/Bテスト基盤
-- エピソードの展開バリアントを出し分け、読者行動で勝者を判定
-- =============================================================================

-- テスト定義
CREATE TABLE ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'completed')),
  -- バリアント定義（最低2つ）
  -- 例: [{"id":"A","name":"オリジナル"},{"id":"B","name":"展開変更版"}]
  variants JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- トラフィック配分（各バリアントの%、合計100）
  traffic_split JSONB NOT NULL DEFAULT '{"A":50,"B":50}'::JSONB,
  -- 判定指標
  primary_metric TEXT NOT NULL DEFAULT 'next_episode_rate'
    CHECK (primary_metric IN ('completion_rate', 'next_episode_rate', 'avg_read_duration', 'bookmark_rate')),
  -- 結果
  winner_variant TEXT,
  results JSONB,  -- 各バリアントの指標集計結果
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_status ON ab_tests(status);
CREATE INDEX idx_ab_tests_episode ON ab_tests(episode_id);

-- バリアント本文（オリジナルはepisodesテーブルのbody_md、バリアントBはここに格納）
CREATE TABLE episode_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL,  -- "A", "B", etc.
  body_md TEXT NOT NULL,
  body_html TEXT,
  character_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ab_test_id, variant_id)
);

-- ユーザー/セッションのバリアント割り当て（一度割り当てたら固定）
CREATE TABLE ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  user_id UUID,
  variant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ab_test_id, session_id)
);

CREATE INDEX idx_ab_assignments_session ON ab_assignments(session_id);

-- reading_eventsにバリアント追跡カラムを追加
ALTER TABLE reading_events ADD COLUMN IF NOT EXISTS variant_id TEXT;

-- RLS
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_assignments ENABLE ROW LEVEL SECURITY;
-- 割り当ては読者が自分のを読める + insertできる
CREATE POLICY "ab_assignments_read" ON ab_assignments FOR SELECT USING (true);
CREATE POLICY "ab_assignments_insert" ON ab_assignments FOR INSERT WITH CHECK (true);

-- =============================================================================
-- aggregate_daily_stats の更新版（scroll_distribution を含む）
-- =============================================================================
CREATE OR REPLACE FUNCTION aggregate_daily_stats(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
BEGIN
  INSERT INTO daily_stats (date, novel_id, episode_id, pv, unique_users, completion_rate, next_episode_rate, avg_read_duration_sec, avg_scroll_depth, bookmark_rate, drop_rate, scroll_distribution)
  SELECT
    target_date,
    re.novel_id,
    re.episode_id,
    COUNT(*) FILTER (WHERE re.event_type = 'start') AS pv,
    COUNT(DISTINCT re.session_id) AS unique_users,
    CASE
      WHEN COUNT(*) FILTER (WHERE re.event_type = 'start') > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'complete')::REAL / COUNT(*) FILTER (WHERE re.event_type = 'start')
      ELSE NULL
    END AS completion_rate,
    CASE
      WHEN COUNT(*) FILTER (WHERE re.event_type = 'complete') > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'next')::REAL / COUNT(*) FILTER (WHERE re.event_type = 'complete')
      ELSE NULL
    END AS next_episode_rate,
    AVG(re.reading_time_sec) FILTER (WHERE re.event_type = 'complete') AS avg_read_duration_sec,
    AVG(re.scroll_depth) FILTER (WHERE re.event_type IN ('complete', 'drop')) AS avg_scroll_depth,
    CASE
      WHEN COUNT(DISTINCT re.session_id) > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'bookmark')::REAL / COUNT(DISTINCT re.session_id)
      ELSE NULL
    END AS bookmark_rate,
    CASE
      WHEN COUNT(*) FILTER (WHERE re.event_type = 'start') > 0
      THEN COUNT(*) FILTER (WHERE re.event_type = 'drop')::REAL / COUNT(*) FILTER (WHERE re.event_type = 'start')
      ELSE NULL
    END AS drop_rate,
    -- スクロール分布: 10%刻みバケット
    jsonb_build_object(
      '0', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.0 AND re.scroll_depth < 0.1 AND re.event_type IN ('drop', 'complete')),
      '10', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.1 AND re.scroll_depth < 0.2 AND re.event_type IN ('drop', 'complete')),
      '20', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.2 AND re.scroll_depth < 0.3 AND re.event_type IN ('drop', 'complete')),
      '30', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.3 AND re.scroll_depth < 0.4 AND re.event_type IN ('drop', 'complete')),
      '40', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.4 AND re.scroll_depth < 0.5 AND re.event_type IN ('drop', 'complete')),
      '50', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.5 AND re.scroll_depth < 0.6 AND re.event_type IN ('drop', 'complete')),
      '60', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.6 AND re.scroll_depth < 0.7 AND re.event_type IN ('drop', 'complete')),
      '70', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.7 AND re.scroll_depth < 0.8 AND re.event_type IN ('drop', 'complete')),
      '80', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.8 AND re.scroll_depth < 0.9 AND re.event_type IN ('drop', 'complete')),
      '90', COUNT(*) FILTER (WHERE re.scroll_depth >= 0.9 AND re.event_type IN ('drop', 'complete'))
    ) AS scroll_distribution
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
    drop_rate = EXCLUDED.drop_rate,
    scroll_distribution = EXCLUDED.scroll_distribution;
END;
$$ LANGUAGE plpgsql;
