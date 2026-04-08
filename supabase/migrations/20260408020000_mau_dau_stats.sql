-- MAU/DAU 集計関数
-- v2 主KPI (philosophy v2 §1): MAU と DAU/MAU比
-- reading_events から計算 (ログイン読者ベース + 全セッションベースの2系統)
--
-- ログイン読者ベース = v2 主KPI (買い手評価指標)
-- セッションベース = 補助 (未ログイン読者の動向把握)

-- ============================================================
-- 日次 DAU
-- ============================================================
CREATE OR REPLACE FUNCTION dau_daily(p_days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  date DATE,
  dau_users BIGINT,        -- ログイン読者DAU (主KPI)
  dau_sessions BIGINT      -- 全セッションDAU (未ログイン含む)
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

-- ============================================================
-- 期間サマリー (MAU + DAU平均 + DAU/MAU比)
-- p_days_back=30 で過去30日 = MAU相当
-- ============================================================
CREATE OR REPLACE FUNCTION mau_summary(p_days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  mau_users BIGINT,         -- MAU (ログイン読者) — 主KPI
  mau_sessions BIGINT,      -- MAU (全セッション)
  dau_avg_users NUMERIC,    -- DAU平均 (ログイン読者)
  dau_avg_sessions NUMERIC, -- DAU平均 (全セッション)
  dau_mau_ratio NUMERIC     -- DAU/MAU比 (主KPI: ログイン読者ベース)
) AS $$
DECLARE
  v_mau_u BIGINT;
  v_mau_s BIGINT;
  v_dau_u NUMERIC;
  v_dau_s NUMERIC;
BEGIN
  -- MAU
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL),
    COUNT(DISTINCT session_id)
  INTO v_mau_u, v_mau_s
  FROM reading_events
  WHERE created_at >= NOW() - (p_days_back || ' days')::INTERVAL;

  -- DAU平均
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
