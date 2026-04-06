-- 自己強化学習ループ用テーブル
-- 生成→配信→計測→分析→適応→生成 の全自動ループを支える3テーブル

-- ============================================================
-- 1. episode_signals: エピソード品質シグナル（日次自動算出）
-- reading_eventsから算出した読者行動指標の集約テーブル
-- ============================================================

CREATE TABLE IF NOT EXISTS episode_signals (
  episode_id UUID PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,

  -- 個別シグナル
  completion_rate REAL,              -- 読了率 (complete / start)
  next_transition_rate REAL,         -- 次話遷移率 (next / complete)
  avg_reading_time_ratio REAL,       -- 実読了時間 / 想定読了時間
  drop_cliff_position REAL,          -- 最大離脱集中ポイント (0.0-1.0)
  engagement_curve REAL[],           -- 10バケットのエンゲージメント値
  bookmark_rate REAL,                -- ブックマーク率

  -- サンプル数
  sample_size INT DEFAULT 0,

  -- 合成スコア: 0-100
  -- completion_rate(40%) + next_transition_rate(30%) + bookmark_rate(15%)
  -- + avg_reading_time_ratio(10%) + (1 - early_drop_penalty)(5%)
  quality_signal REAL,

  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_signals_quality
  ON episode_signals(quality_signal DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_episode_signals_novel
  ON episode_signals(novel_id);

-- ============================================================
-- 2. discovered_patterns: 分析で発見したパターン
-- 週次のパターン抽出バッチが自動INSERTし、
-- A/Bテスト→確認→learned_patterns.mdへ昇格 のライフサイクルを管理
-- ============================================================

CREATE TABLE IF NOT EXISTS discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- パターン内容
  finding TEXT NOT NULL,              -- 発見内容（日本語）
  pattern_type TEXT NOT NULL          -- positive: 効くパターン, negative: 避けるべき, conditional: 条件付き
    CHECK (pattern_type IN ('positive', 'negative', 'conditional')),
  genre TEXT,                         -- NULLなら全ジャンル共通

  -- 根拠
  confidence TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low', 'medium', 'high')),
  sample_size INT NOT NULL,

  -- 生成指示として使える形
  actionable_rule TEXT,

  -- ライフサイクル
  -- hypothesis → testing → confirmed/rejected → retired
  status TEXT NOT NULL DEFAULT 'hypothesis'
    CHECK (status IN ('hypothesis', 'testing', 'confirmed', 'rejected', 'retired')),
  ab_test_id UUID,                   -- 検証中のA/BテストID
  promoted_at TIMESTAMPTZ,           -- learned_patterns.mdに昇格した日時

  discovered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovered_patterns_status
  ON discovered_patterns(status);
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_genre
  ON discovered_patterns(genre) WHERE genre IS NOT NULL;

-- ============================================================
-- 3. episode_generation_meta: 生成トレーサビリティ
-- 「どの条件で生成されたエピソードが良い結果を出したか」を追跡
-- ============================================================

CREATE TABLE IF NOT EXISTS episode_generation_meta (
  episode_id UUID PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  model_version TEXT,                  -- 'claude-opus-4-6' など
  applied_patterns TEXT[] DEFAULT '{}', -- 適用した学習パターンID
  is_exploration BOOLEAN DEFAULT FALSE, -- 探索枠（L6スキップ）か
  experiment_id UUID,                  -- A/Bテスト参加時
  variant TEXT,                        -- バリアント名
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_meta_exploration
  ON episode_generation_meta(is_exploration) WHERE is_exploration = TRUE;
CREATE INDEX IF NOT EXISTS idx_gen_meta_experiment
  ON episode_generation_meta(experiment_id) WHERE experiment_id IS NOT NULL;

-- ============================================================
-- 品質シグナル算出関数
-- 日次Cronから呼ばれ、reading_eventsを集計してepisode_signalsを更新
-- ============================================================

CREATE OR REPLACE FUNCTION compute_episode_signals(min_sample INT DEFAULT 10)
RETURNS TABLE(episodes_updated INT, episodes_skipped INT) AS $$
DECLARE
  v_updated INT := 0;
  v_skipped INT := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      e.id AS episode_id,
      e.novel_id,
      e.character_count,
      -- 基本カウント
      COUNT(*) FILTER (WHERE re.event_type = 'start') AS starts,
      COUNT(*) FILTER (WHERE re.event_type = 'complete') AS completes,
      COUNT(*) FILTER (WHERE re.event_type = 'next') AS nexts,
      COUNT(*) FILTER (WHERE re.event_type = 'drop') AS drops,
      COUNT(*) FILTER (WHERE re.event_type = 'bookmark') AS bookmarks,
      COUNT(DISTINCT re.session_id) AS unique_sessions,
      -- 読了時間（completeイベントのみ）
      AVG(re.reading_time_sec) FILTER (WHERE re.event_type = 'complete') AS avg_complete_time,
      -- スクロール深度の分布（drop/progressイベント）
      -- 10バケットに分けてカウント
      ARRAY[
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.0 AND re.scroll_depth < 0.1 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.1 AND re.scroll_depth < 0.2 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.2 AND re.scroll_depth < 0.3 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.3 AND re.scroll_depth < 0.4 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.4 AND re.scroll_depth < 0.5 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.5 AND re.scroll_depth < 0.6 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.6 AND re.scroll_depth < 0.7 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.7 AND re.scroll_depth < 0.8 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.8 AND re.scroll_depth < 0.9 AND re.event_type IN ('drop', 'progress'))::REAL,
        COUNT(*) FILTER (WHERE re.scroll_depth >= 0.9 AND re.event_type IN ('drop', 'progress'))::REAL
      ] AS scroll_buckets,
      -- 離脱位置の特定（dropイベントのスクロール深度中央値）
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY re.scroll_depth)
        FILTER (WHERE re.event_type = 'drop' AND re.scroll_depth IS NOT NULL) AS median_drop_position
    FROM episodes e
    LEFT JOIN reading_events re ON re.episode_id = e.id
    GROUP BY e.id, e.novel_id, e.character_count
    HAVING COUNT(*) FILTER (WHERE re.event_type = 'start') > 0
  LOOP
    IF rec.starts < min_sample THEN
      v_skipped := v_skipped + 1;
      -- サンプル不足でもデータは保存（quality_signalはNULL）
      INSERT INTO episode_signals (
        episode_id, novel_id, completion_rate, next_transition_rate,
        avg_reading_time_ratio, drop_cliff_position, engagement_curve,
        bookmark_rate, sample_size, quality_signal, calculated_at
      ) VALUES (
        rec.episode_id, rec.novel_id,
        rec.completes::REAL / NULLIF(rec.starts, 0),
        rec.nexts::REAL / NULLIF(rec.completes, 0),
        CASE WHEN rec.character_count > 0 AND rec.avg_complete_time IS NOT NULL
          THEN rec.avg_complete_time / (rec.character_count::REAL / 600.0 * 60.0)
          ELSE NULL END,
        rec.median_drop_position,
        rec.scroll_buckets,
        rec.bookmarks::REAL / NULLIF(rec.unique_sessions, 0),
        rec.starts,
        NULL, -- サンプル不足のためquality_signalはNULL
        NOW()
      )
      ON CONFLICT (episode_id) DO UPDATE SET
        completion_rate = EXCLUDED.completion_rate,
        next_transition_rate = EXCLUDED.next_transition_rate,
        avg_reading_time_ratio = EXCLUDED.avg_reading_time_ratio,
        drop_cliff_position = EXCLUDED.drop_cliff_position,
        engagement_curve = EXCLUDED.engagement_curve,
        bookmark_rate = EXCLUDED.bookmark_rate,
        sample_size = EXCLUDED.sample_size,
        quality_signal = EXCLUDED.quality_signal,
        calculated_at = NOW();
      CONTINUE;
    END IF;

    DECLARE
      v_completion REAL := rec.completes::REAL / NULLIF(rec.starts, 0);
      v_next REAL := rec.nexts::REAL / NULLIF(rec.completes, 0);
      v_bookmark REAL := rec.bookmarks::REAL / NULLIF(rec.unique_sessions, 0);
      -- 想定読了時間: 文字数 / 600文字/分 * 60秒
      v_expected_time REAL := CASE WHEN rec.character_count > 0
        THEN rec.character_count::REAL / 600.0 * 60.0 ELSE NULL END;
      v_time_ratio REAL := CASE WHEN v_expected_time IS NOT NULL AND v_expected_time > 0 AND rec.avg_complete_time IS NOT NULL
        THEN LEAST(rec.avg_complete_time / v_expected_time, 3.0) / 3.0 -- 0-1に正規化（3倍以上はキャップ）
        ELSE 0.5 END; -- デフォルト中間値
      -- 早期離脱ペナルティ: 離脱中央値が0.3未満なら高ペナルティ
      v_early_drop REAL := CASE
        WHEN rec.median_drop_position IS NULL THEN 0.0
        WHEN rec.median_drop_position < 0.3 THEN 0.7
        WHEN rec.median_drop_position < 0.5 THEN 0.3
        ELSE 0.0 END;
      -- 合成スコア
      v_quality REAL;
    BEGIN
      v_quality := (
        COALESCE(v_completion, 0) * 40.0 +
        COALESCE(v_next, 0) * 30.0 +
        COALESCE(v_bookmark, 0) * 15.0 +
        v_time_ratio * 10.0 +
        (1.0 - v_early_drop) * 5.0
      );

      INSERT INTO episode_signals (
        episode_id, novel_id, completion_rate, next_transition_rate,
        avg_reading_time_ratio, drop_cliff_position, engagement_curve,
        bookmark_rate, sample_size, quality_signal, calculated_at
      ) VALUES (
        rec.episode_id, rec.novel_id,
        v_completion, v_next,
        CASE WHEN v_expected_time IS NOT NULL AND v_expected_time > 0 AND rec.avg_complete_time IS NOT NULL
          THEN rec.avg_complete_time / v_expected_time ELSE NULL END,
        rec.median_drop_position,
        rec.scroll_buckets,
        v_bookmark,
        rec.starts,
        v_quality,
        NOW()
      )
      ON CONFLICT (episode_id) DO UPDATE SET
        completion_rate = EXCLUDED.completion_rate,
        next_transition_rate = EXCLUDED.next_transition_rate,
        avg_reading_time_ratio = EXCLUDED.avg_reading_time_ratio,
        drop_cliff_position = EXCLUDED.drop_cliff_position,
        engagement_curve = EXCLUDED.engagement_curve,
        bookmark_rate = EXCLUDED.bookmark_rate,
        sample_size = EXCLUDED.sample_size,
        quality_signal = EXCLUDED.quality_signal,
        calculated_at = NOW();

      v_updated := v_updated + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_updated, v_skipped;
END;
$$ LANGUAGE plpgsql;
