-- reading_events アーカイブ戦略
-- daily_stats 集計済みの古いイベントをアーカイブテーブルに移行し、
-- 本テーブルのサイズを抑制する

-- ============================================================
-- アーカイブテーブル（reading_events と同じスキーマ、インデックスなし）
-- ============================================================
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

-- RLS（管理者のみ）
ALTER TABLE reading_events_archive ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- アーカイブ関数: 指定日数より古いイベントをアーカイブに移行
-- daily_stats が集計済みであることを前提とする
-- ============================================================
CREATE OR REPLACE FUNCTION archive_old_reading_events(
  p_days_old INTEGER DEFAULT 30
)
RETURNS TABLE (archived_count BIGINT, remaining_count BIGINT) AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_archived BIGINT;
  v_remaining BIGINT;
BEGIN
  v_cutoff := NOW() - (p_days_old || ' days')::INTERVAL;

  -- アーカイブテーブルにコピー
  INSERT INTO reading_events_archive (id, user_id, session_id, novel_id, episode_id, event_type, scroll_depth, reading_time_sec, variant_id, created_at)
  SELECT id, user_id, session_id, novel_id, episode_id, event_type, scroll_depth, reading_time_sec, variant_id, created_at
  FROM reading_events
  WHERE created_at < v_cutoff
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  -- 元テーブルから削除
  DELETE FROM reading_events
  WHERE created_at < v_cutoff;

  -- 残件数を取得
  SELECT COUNT(*) INTO v_remaining FROM reading_events;

  RETURN QUERY SELECT v_archived, v_remaining;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 古いアーカイブを完全削除する関数（90日超のデータ）
-- ストレージ節約用。必要に応じてCSVエクスポート後に実行
-- ============================================================
CREATE OR REPLACE FUNCTION purge_old_archive(
  p_days_old INTEGER DEFAULT 90
)
RETURNS BIGINT AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM reading_events_archive
  WHERE created_at < NOW() - (p_days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- aggregate_daily_stats の改良版
-- 集計後にアーカイブフラグとして利用できるよう、
-- 集計済み日付を記録するテーブル
-- ============================================================
CREATE TABLE daily_stats_log (
  target_date DATE PRIMARY KEY,
  aggregated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 集計+ログ記録を一括で行う関数
CREATE OR REPLACE FUNCTION aggregate_and_log(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
BEGIN
  -- 既存の集計関数を実行
  PERFORM aggregate_daily_stats(target_date);

  -- 集計済みログに記録
  INSERT INTO daily_stats_log (target_date)
  VALUES (target_date)
  ON CONFLICT (target_date) DO UPDATE SET aggregated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- novel_scores マテリアライズドビュー
-- 元のVIEW(novel_scores)と並行運用し、段階的に移行
-- 日次バッチでリフレッシュすることでクエリ負荷を削減
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS novel_scores_materialized AS
SELECT
  n.*,
  COALESCE(s.recent_pv, 0) AS recent_pv,
  s.avg_completion_rate,
  s.avg_next_episode_rate,
  s.avg_bookmark_rate,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_novel_scores_mat_id ON novel_scores_materialized(id);
CREATE INDEX IF NOT EXISTS idx_novel_scores_mat_score ON novel_scores_materialized(score DESC NULLS LAST);

-- リフレッシュ関数（日次cron or aggregate_and_log の後に実行）
CREATE OR REPLACE FUNCTION refresh_novel_scores()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY novel_scores_materialized;
END;
$$ LANGUAGE plpgsql;
