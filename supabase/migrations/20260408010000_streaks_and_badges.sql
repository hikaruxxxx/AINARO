-- =============================================================================
-- Novelis ストリーク + バッジシステム
-- EXIT前提戦略v5 / 依存設計解禁の一環として
-- 継続率(D1/D7/M3)を伸ばすためのエンゲージメント装置
-- =============================================================================

-- =============================================================================
-- 1. ストリーク (連続ログイン日数)
-- user_points に streak フィールドを追加
-- =============================================================================
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;

-- =============================================================================
-- 2. バッジ定義
-- 達成条件はアプリ層で判定し、ここはマスタとユーザー獲得記録のみ
-- =============================================================================
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,                       -- 'streak_3', 'streak_7', 'reader_10ep', など
  name TEXT NOT NULL,                        -- 表示名
  description TEXT NOT NULL,                 -- 説明
  category TEXT NOT NULL                     -- 'streak', 'reading', 'completion', 'social'
    CHECK (category IN ('streak', 'reading', 'completion', 'social', 'special')),
  icon TEXT,                                 -- アイコン名 or 絵文字
  tier INTEGER NOT NULL DEFAULT 1            -- 1=銅, 2=銀, 3=金
    CHECK (tier BETWEEN 1 AND 3),
  threshold INTEGER,                         -- 達成しきい値 (3日, 10話 等)
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id UUID NOT NULL,
  badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, earned_at DESC);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "badges_public_read" ON badges FOR SELECT USING (true);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_badges_own_read" ON user_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_badges_service_write" ON user_badges FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- 3. ストリーク対応版 ログインボーナス関数
-- 既存 claim_login_bonus を上書き。返り値を JSONB に変更してストリーク情報も返す
-- 戻り値型変更のため一旦 DROP する
-- =============================================================================
DROP FUNCTION IF EXISTS claim_login_bonus(UUID);

CREATE OR REPLACE FUNCTION claim_login_bonus(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  last_bonus DATE;
  cur_streak INTEGER;
  long_streak INTEGER;
  new_balance INTEGER;
  bonus_amount INTEGER := 1;
  already_today BOOLEAN := FALSE;
BEGIN
  -- user_points がなければ作成
  INSERT INTO user_points (user_id, balance, total_earned, total_spent)
  VALUES (p_user_id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_login_bonus_at, current_streak, longest_streak
  INTO last_bonus, cur_streak, long_streak
  FROM user_points WHERE user_id = p_user_id;

  -- 今日すでに受け取り済みなら現状値を返す
  IF last_bonus = CURRENT_DATE THEN
    SELECT balance INTO new_balance FROM user_points WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'balance', new_balance,
      'bonus', 0,
      'current_streak', cur_streak,
      'longest_streak', long_streak,
      'already_claimed', TRUE
    );
  END IF;

  -- ストリーク計算
  IF last_bonus = CURRENT_DATE - INTERVAL '1 day' THEN
    -- 連続継続
    cur_streak := cur_streak + 1;
  ELSE
    -- 新規 or リセット
    cur_streak := 1;
  END IF;

  IF cur_streak > long_streak THEN
    long_streak := cur_streak;
  END IF;

  -- ストリークに応じたボーナス倍率 (依存設計: 続けるほど報酬が増える)
  IF cur_streak >= 30 THEN
    bonus_amount := 5;
  ELSIF cur_streak >= 14 THEN
    bonus_amount := 3;
  ELSIF cur_streak >= 7 THEN
    bonus_amount := 2;
  END IF;

  -- 残高更新
  UPDATE user_points
  SET balance = balance + bonus_amount,
      total_earned = total_earned + bonus_amount,
      last_login_bonus_at = CURRENT_DATE,
      current_streak = cur_streak,
      longest_streak = long_streak,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO new_balance;

  INSERT INTO point_transactions (user_id, amount, type, description)
  VALUES (p_user_id, bonus_amount, 'daily_login',
          'ログインボーナス (' || cur_streak || '日連続)');

  -- ストリーク系バッジ自動付与
  INSERT INTO user_badges (user_id, badge_id)
  SELECT p_user_id, b.id
  FROM badges b
  WHERE b.category = 'streak'
    AND b.threshold IS NOT NULL
    AND cur_streak >= b.threshold
    AND NOT EXISTS (
      SELECT 1 FROM user_badges ub
      WHERE ub.user_id = p_user_id AND ub.badge_id = b.id
    );

  RETURN jsonb_build_object(
    'balance', new_balance,
    'bonus', bonus_amount,
    'current_streak', cur_streak,
    'longest_streak', long_streak,
    'already_claimed', FALSE
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. 初期バッジマスタ
-- =============================================================================
INSERT INTO badges (id, name, description, category, icon, tier, threshold, display_order) VALUES
  ('streak_3',   '3日連続',    '3日連続でログイン',    'streak', '🔥', 1, 3,   10),
  ('streak_7',   '1週間継続',  '7日連続でログイン',    'streak', '🔥', 2, 7,   20),
  ('streak_14',  '2週間継続',  '14日連続でログイン',   'streak', '🔥', 2, 14,  30),
  ('streak_30',  '1ヶ月継続',  '30日連続でログイン',   'streak', '🏆', 3, 30,  40),
  ('streak_100', '100日継続',  '100日連続でログイン',  'streak', '👑', 3, 100, 50),
  ('reader_1',   '初読了',     '初めてエピソードを読了', 'reading', '📖', 1, 1,    100),
  ('reader_10',  '10話読了',   '10話のエピソードを読了', 'reading', '📚', 1, 10,   110),
  ('reader_50',  '50話読了',   '50話のエピソードを読了', 'reading', '📚', 2, 50,   120),
  ('reader_200', '200話読了',  '200話のエピソードを読了','reading', '📚', 3, 200,  130),
  ('finisher_1', '初完走',     '初めて作品を最後まで読了','completion','🎉',1, 1,   200),
  ('finisher_5', '5作完走',    '5作品を完走',          'completion','🏅',2, 5,    210),
  ('finisher_20','20作完走',   '20作品を完走',         'completion','🏅',3, 20,   220)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. 読了/完走バッジの自動付与関数
-- アプリ層から episode_complete / work_completion 後に呼ぶ
-- =============================================================================
CREATE OR REPLACE FUNCTION grant_reading_badges(p_user_id UUID)
RETURNS void AS $$
DECLARE
  ep_count INTEGER;
  finish_count INTEGER;
BEGIN
  -- 読了話数 (episode_complete トランザクションをカウント)
  SELECT COUNT(*) INTO ep_count
  FROM point_transactions
  WHERE user_id = p_user_id AND type = 'episode_complete';

  INSERT INTO user_badges (user_id, badge_id)
  SELECT p_user_id, b.id
  FROM badges b
  WHERE b.category = 'reading'
    AND b.threshold IS NOT NULL
    AND ep_count >= b.threshold
    AND NOT EXISTS (
      SELECT 1 FROM user_badges ub
      WHERE ub.user_id = p_user_id AND ub.badge_id = b.id
    );

  -- 完走作品数 (work_completions テーブル)
  SELECT COUNT(*) INTO finish_count
  FROM work_completions
  WHERE user_id = p_user_id AND completion_type = 'completed_work';

  INSERT INTO user_badges (user_id, badge_id)
  SELECT p_user_id, b.id
  FROM badges b
  WHERE b.category = 'completion'
    AND b.threshold IS NOT NULL
    AND finish_count >= b.threshold
    AND NOT EXISTS (
      SELECT 1 FROM user_badges ub
      WHERE ub.user_id = p_user_id AND ub.badge_id = b.id
    );
END;
$$ LANGUAGE plpgsql;
