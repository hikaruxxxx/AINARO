-- =============================================================================
-- 本番Supabase修復用SQL
-- =============================================================================
-- 適用方法: Supabase Dashboard → SQL Editor に全文貼り付けて実行
--
-- 背景: 本番Supabaseはマイグレーションが部分適用された状態。テーブルは
--   存在するが集計関数 / トリガー関数 が定義されていなかった。
--   このSQLは既存スキーマを壊さず、不足分だけを CREATE OR REPLACE で補う。
--
-- 検証: 適用後に `npx tsx scripts/utils/check-migration-status.ts` を実行
-- =============================================================================

-- =============================================================================
-- 1. monthly_completion_stats (20260408000000_work_completions.sql から)
-- =============================================================================
CREATE OR REPLACE FUNCTION monthly_completion_stats(
  p_months_back INTEGER DEFAULT 6
)
RETURNS TABLE (
  month DATE,
  completed_work_total BIGINT,
  completed_work_logged_in BIGINT,
  caught_up_total BIGINT,
  caught_up_logged_in BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('month', completed_at)::DATE AS month,
    COUNT(*) FILTER (WHERE completion_type = 'completed_work')::BIGINT,
    COUNT(*) FILTER (WHERE completion_type = 'completed_work' AND is_logged_in)::BIGINT,
    COUNT(*) FILTER (WHERE completion_type = 'caught_up')::BIGINT,
    COUNT(*) FILTER (WHERE completion_type = 'caught_up' AND is_logged_in)::BIGINT
  FROM work_completions
  WHERE completed_at >= DATE_TRUNC('month', NOW()) - (p_months_back || ' months')::INTERVAL
  GROUP BY DATE_TRUNC('month', completed_at)
  ORDER BY DATE_TRUNC('month', completed_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 2. top_completed_works (同上)
-- =============================================================================
CREATE OR REPLACE FUNCTION top_completed_works(
  p_limit INTEGER DEFAULT 20,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  novel_id UUID,
  novel_title TEXT,
  novel_status TEXT,
  completion_type TEXT,
  completion_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.status,
    wc.completion_type,
    COUNT(*)::BIGINT AS completion_count
  FROM work_completions wc
  JOIN novels n ON n.id = wc.novel_id
  WHERE wc.completed_at >= NOW() - (p_days_back || ' days')::INTERVAL
  GROUP BY n.id, n.title, n.status, wc.completion_type
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 3. dau_daily (20260408020000_mau_dau_stats.sql から)
-- =============================================================================
CREATE OR REPLACE FUNCTION dau_daily(p_days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  date DATE,
  dau_users BIGINT,
  dau_sessions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(created_at) AS date,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)::BIGINT AS dau_users,
    COUNT(DISTINCT session_id)::BIGINT AS dau_sessions
  FROM reading_events
  WHERE created_at >= NOW() - (p_days_back || ' days')::INTERVAL
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 4. mau_summary (同上)
-- =============================================================================
CREATE OR REPLACE FUNCTION mau_summary(p_days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  mau_users BIGINT,
  mau_sessions BIGINT,
  dau_avg_users NUMERIC,
  dau_avg_sessions NUMERIC,
  dau_mau_ratio NUMERIC
) AS $$
DECLARE
  v_mau_u BIGINT;
  v_mau_s BIGINT;
  v_dau_u NUMERIC;
  v_dau_s NUMERIC;
BEGIN
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL),
    COUNT(DISTINCT session_id)
  INTO v_mau_u, v_mau_s
  FROM reading_events
  WHERE created_at >= NOW() - (p_days_back || ' days')::INTERVAL;

  SELECT
    COALESCE(AVG(d_users), 0),
    COALESCE(AVG(d_sessions), 0)
  INTO v_dau_u, v_dau_s
  FROM (
    SELECT
      COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS d_users,
      COUNT(DISTINCT session_id) AS d_sessions
    FROM reading_events
    WHERE created_at >= NOW() - (p_days_back || ' days')::INTERVAL
    GROUP BY DATE(created_at)
  ) sub;

  RETURN QUERY SELECT
    v_mau_u,
    v_mau_s,
    v_dau_u,
    v_dau_s,
    CASE WHEN v_mau_u > 0 THEN ROUND(v_dau_u / v_mau_u, 4) ELSE 0::NUMERIC END;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 5. grant_reading_badges (20260408010000_streaks_and_badges.sql から再定義)
-- 既存版が work_completions を参照できない状態の可能性があるため上書きする
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

-- =============================================================================
-- 6. record_work_completion トリガー関数 (20260408040000 の最終版)
-- 完走時に work_completions に派生INSERT + grant_reading_badges を呼ぶ
-- =============================================================================
CREATE OR REPLACE FUNCTION record_work_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_max_episode_number INTEGER;
  v_current_episode_number INTEGER;
  v_novel_status TEXT;
  v_completion_type TEXT;
BEGIN
  IF NEW.event_type <> 'complete' THEN
    RETURN NEW;
  END IF;

  SELECT e.episode_number, n.status
    INTO v_current_episode_number, v_novel_status
  FROM episodes e
  JOIN novels n ON n.id = e.novel_id
  WHERE e.id = NEW.episode_id;

  SELECT MAX(episode_number) INTO v_max_episode_number
  FROM episodes
  WHERE novel_id = NEW.novel_id;

  IF v_current_episode_number IS NULL
     OR v_max_episode_number IS NULL
     OR v_current_episode_number <> v_max_episode_number THEN
    RETURN NEW;
  END IF;

  v_completion_type := CASE
    WHEN v_novel_status = 'complete' THEN 'completed_work'
    ELSE 'caught_up'
  END;

  INSERT INTO work_completions (
    user_id, session_id, novel_id, is_logged_in,
    completion_type, last_episode_id
  )
  VALUES (
    NEW.user_id,
    NEW.session_id,
    NEW.novel_id,
    NEW.user_id IS NOT NULL,
    v_completion_type,
    NEW.episode_id
  )
  ON CONFLICT DO NOTHING;

  -- バッジ自動付与 (ログイン読者のみ)
  IF NEW.user_id IS NOT NULL THEN
    PERFORM grant_reading_badges(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. トリガーの再作成 (DROP + CREATE で冪等に)
-- =============================================================================
DROP TRIGGER IF EXISTS trg_record_work_completion ON reading_events;

CREATE TRIGGER trg_record_work_completion
  AFTER INSERT ON reading_events
  FOR EACH ROW
  EXECUTE FUNCTION record_work_completion();

-- =============================================================================
-- 完了
-- =============================================================================
-- 検証コマンド: npx tsx scripts/utils/check-migration-status.ts
