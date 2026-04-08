-- 完走時のバッジ自動付与
-- record_work_completion() トリガーが work_completions に派生INSERTした直後に
-- grant_reading_badges() を呼び、reader/completion カテゴリのバッジを付与する
--
-- 背景: CompletionModal は「完走バッジを獲得しました」と表示するが、
-- フロント/バックエンドのどこからも grant_reading_badges を呼んでいなかったため
-- バッジが実際にDBに付与されない不整合があった (2026-04-08 検出)

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

  -- バッジ自動付与 (ログイン読者のみ)
  -- grant_reading_badges は reader_* と finisher_* バッジを付与する
  IF NEW.user_id IS NOT NULL THEN
    PERFORM grant_reading_badges(NEW.user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
