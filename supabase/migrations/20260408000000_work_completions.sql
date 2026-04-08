-- 作品完走の派生テーブル
-- 主KPI「完走者数」の一級データ
-- 既存の reading_events.complete (エピソード末尾到達) から
-- 「作品としての完走/追従」を派生INSERTする
--
-- 設計判断 (2026-04-08):
--   - 完結作品(novels.status='complete')の最終話到達 → completion_type='completed_work'
--   - 連載中作品(novels.status='serial')の現時点最新話到達 → completion_type='caught_up'
--   - ログイン/未ログイン両方カウント (is_logged_in で区別)
--   - 完走判定しきい値は scroll_depth >= 0.95 (既存の complete イベント定義に従う)

-- ============================================================
-- work_completions テーブル
-- ============================================================
CREATE TABLE work_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                        -- ログイン時のみ
  session_id TEXT NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  is_logged_in BOOLEAN NOT NULL,
  completion_type TEXT NOT NULL CHECK (completion_type IN ('completed_work', 'caught_up')),
  last_episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ログイン読者は (作品 × タイプ) で一意
CREATE UNIQUE INDEX idx_work_completions_user_unique
  ON work_completions(user_id, novel_id, completion_type)
  WHERE user_id IS NOT NULL;

-- 未ログイン読者は (セッション × 作品 × タイプ) で一意
CREATE UNIQUE INDEX idx_work_completions_session_unique
  ON work_completions(session_id, novel_id, completion_type)
  WHERE user_id IS NULL;

-- ダッシュボード/集計用
CREATE INDEX idx_work_completions_completed_at ON work_completions(completed_at DESC);
CREATE INDEX idx_work_completions_novel ON work_completions(novel_id, completion_type);
CREATE INDEX idx_work_completions_user ON work_completions(user_id, completion_type) WHERE user_id IS NOT NULL;

-- RLS: 自分の完走履歴のみ閲覧可。INSERT はトリガー(SECURITY DEFINER)で行う
ALTER TABLE work_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own completions" ON work_completions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- 派生INSERTトリガー: reading_events.complete → work_completions
-- ============================================================
CREATE OR REPLACE FUNCTION record_work_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_max_episode_number INTEGER;
  v_current_episode_number INTEGER;
  v_novel_status TEXT;
  v_completion_type TEXT;
BEGIN
  -- complete イベントのみ処理
  IF NEW.event_type <> 'complete' THEN
    RETURN NEW;
  END IF;

  -- 当該エピソードの番号と作品ステータスを取得
  SELECT e.episode_number, n.status
    INTO v_current_episode_number, v_novel_status
  FROM episodes e
  JOIN novels n ON n.id = e.novel_id
  WHERE e.id = NEW.episode_id;

  -- 当該作品の最新エピソード番号
  SELECT MAX(episode_number) INTO v_max_episode_number
  FROM episodes
  WHERE novel_id = NEW.novel_id;

  -- 最終話/最新話でなければ何もしない
  IF v_current_episode_number IS NULL
     OR v_max_episode_number IS NULL
     OR v_current_episode_number <> v_max_episode_number THEN
    RETURN NEW;
  END IF;

  -- 完結作品なら completed_work、連載中なら caught_up
  v_completion_type := CASE
    WHEN v_novel_status = 'complete' THEN 'completed_work'
    ELSE 'caught_up'
  END;

  -- 派生INSERT (重複は無視)
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_record_work_completion
  AFTER INSERT ON reading_events
  FOR EACH ROW
  EXECUTE FUNCTION record_work_completion();

-- ============================================================
-- 既存 reading_events からの初回バックフィル
-- 連載中作品はその時点での「最新話到達」として記録される
-- (作品ステータス変化時の遡及補正は行わない。日次運用で十分)
-- ============================================================
INSERT INTO work_completions (
  user_id, session_id, novel_id, is_logged_in,
  completion_type, last_episode_id, completed_at
)
SELECT DISTINCT ON (
  COALESCE(re.user_id::text, 'anon:' || re.session_id),
  re.novel_id,
  CASE WHEN n.status = 'complete' THEN 'completed_work' ELSE 'caught_up' END
)
  re.user_id,
  re.session_id,
  re.novel_id,
  re.user_id IS NOT NULL,
  CASE WHEN n.status = 'complete' THEN 'completed_work' ELSE 'caught_up' END,
  re.episode_id,
  re.created_at
FROM reading_events re
JOIN episodes e ON e.id = re.episode_id
JOIN novels n ON n.id = re.novel_id
JOIN (
  SELECT novel_id, MAX(episode_number) AS max_ep
  FROM episodes
  GROUP BY novel_id
) m ON m.novel_id = re.novel_id
WHERE re.event_type = 'complete'
  AND e.episode_number = m.max_ep
ORDER BY
  COALESCE(re.user_id::text, 'anon:' || re.session_id),
  re.novel_id,
  CASE WHEN n.status = 'complete' THEN 'completed_work' ELSE 'caught_up' END,
  re.created_at ASC
ON CONFLICT DO NOTHING;

-- ============================================================
-- 集計関数: 月次完走者数
-- ダッシュボード表示用
-- ============================================================
CREATE OR REPLACE FUNCTION monthly_completion_stats(
  p_months_back INTEGER DEFAULT 6
)
RETURNS TABLE (
  month DATE,
  completed_work_total BIGINT,         -- 完結作品の延べ完走者数
  completed_work_logged_in BIGINT,     -- うちログイン読者
  caught_up_total BIGINT,              -- 連載作品の延べ追従者数
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
  ORDER BY month DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 作品別完走者数 (上位N件)
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
  ORDER BY completion_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
