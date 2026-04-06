-- 物語状態管理テーブル（数百話スケール対応）
-- 伏線台帳・読者既知情報・ドラマティックアイロニーをDB化
-- Markdownファイル管理からの移行先

-- ============================================================
-- 伏線台帳（foreshadowing_items）
-- ============================================================
CREATE TABLE foreshadowing_items (
  id TEXT NOT NULL,                        -- F001, F002... （作品内で連番）
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  content TEXT NOT NULL,                   -- 伏線内容
  planted_episode INTEGER NOT NULL,        -- 設置話
  planned_payoff_from INTEGER,             -- 回収予定（開始）
  planned_payoff_to INTEGER,               -- 回収予定（終了）
  actual_payoff_episode INTEGER,           -- 実際の回収話
  status TEXT NOT NULL DEFAULT '未回収',    -- 未回収 / 部分回収 / 回収済 / 放棄
  importance TEXT NOT NULL DEFAULT 'B',     -- S / A / B
  memo TEXT,                               -- 備考
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (novel_id, id)
);

-- 生成時のフィルタクエリ用: 未回収 + 回収予定が近い + S重要度
CREATE INDEX idx_foreshadowing_status ON foreshadowing_items(novel_id, status);
CREATE INDEX idx_foreshadowing_payoff ON foreshadowing_items(novel_id, planned_payoff_from, planned_payoff_to);
CREATE INDEX idx_foreshadowing_importance ON foreshadowing_items(novel_id, importance) WHERE importance = 'S';

-- ============================================================
-- 読者既知情報（reader_knowledge_items）
-- ============================================================
CREATE TABLE reader_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,         -- この情報が開示された話数
  category TEXT,                           -- 情報カテゴリ（人物/世界/伏線/設定など）
  info TEXT NOT NULL,                      -- 情報内容
  reader_knows BOOLEAN NOT NULL DEFAULT FALSE,
  protagonist_knows BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 生成時のフィルタクエリ用: 直近N話の情報を取得
CREATE INDEX idx_reader_knowledge_novel_ep ON reader_knowledge_items(novel_id, episode_number DESC);

-- ============================================================
-- ドラマティック・アイロニー（dramatic_irony_items）
-- ============================================================
CREATE TABLE dramatic_irony_items (
  id TEXT NOT NULL,                        -- DI01, DI02... （作品内で連番）
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  info TEXT NOT NULL,                      -- アイロニー内容
  reader_knows BOOLEAN NOT NULL DEFAULT FALSE,
  protagonist_knows BOOLEAN NOT NULL DEFAULT FALSE,
  -- 他キャラの知識状態をJSONBで柔軟に管理
  character_knowledge JSONB DEFAULT '{}',  -- {"claude": true, "leon": false}
  planted_episode INTEGER,                 -- 設置話
  resolution_episode INTEGER,              -- 解決話
  effect TEXT,                             -- 期待する効果
  is_active BOOLEAN DEFAULT TRUE,          -- アクティブかどうか
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (novel_id, id)
);

-- 生成時のフィルタクエリ用: アクティブなアイロニーのみ
CREATE INDEX idx_dramatic_irony_active ON dramatic_irony_items(novel_id) WHERE is_active = TRUE;

-- ============================================================
-- エピソードプロット（episode_plots）
-- プロット管理もDB化し、存在チェックをO(1)にする
-- ============================================================
CREATE TABLE episode_plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  plot_content TEXT NOT NULL,              -- プロット本文（Markdown）
  is_auto_generated BOOLEAN DEFAULT FALSE, -- 自動生成かどうか
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(novel_id, episode_number)
);

-- ============================================================
-- 生成ロック（generation_locks）
-- 同一作品の並行生成を防止する排他制御用
-- ============================================================
CREATE TABLE generation_locks (
  novel_id UUID PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
  locked_by TEXT NOT NULL,                 -- ロック取得者（セッションID等）
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  episode_number INTEGER,                  -- 生成中の話数
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes'  -- 自動解放
);

-- ============================================================
-- RLS設定
-- Phase 0: 管理用。service_roleキーでのみ読み書き
-- ============================================================
ALTER TABLE foreshadowing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reader_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dramatic_irony_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_locks ENABLE ROW LEVEL SECURITY;

-- updated_at 自動更新トリガー（既存の update_updated_at 関数を再利用）
CREATE TRIGGER foreshadowing_items_updated_at
  BEFORE UPDATE ON foreshadowing_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER dramatic_irony_items_updated_at
  BEFORE UPDATE ON dramatic_irony_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER episode_plots_updated_at
  BEFORE UPDATE ON episode_plots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ユーティリティ関数: 生成時に必要な伏線を取得
-- ============================================================
CREATE OR REPLACE FUNCTION get_active_foreshadowing(
  p_novel_id UUID,
  p_current_episode INTEGER,
  p_lookahead INTEGER DEFAULT 15
)
RETURNS TABLE (
  id TEXT,
  content TEXT,
  planted_episode INTEGER,
  planned_payoff_from INTEGER,
  planned_payoff_to INTEGER,
  status TEXT,
  importance TEXT,
  memo TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id, f.content, f.planted_episode,
    f.planned_payoff_from, f.planned_payoff_to,
    f.status, f.importance, f.memo
  FROM foreshadowing_items f
  WHERE f.novel_id = p_novel_id
    AND (
      -- 未回収・部分回収で回収予定が近い
      (f.status IN ('未回収', '部分回収')
       AND (f.planned_payoff_from IS NULL
            OR f.planned_payoff_from <= p_current_episode + p_lookahead))
      -- S重要度は常に返す
      OR f.importance = 'S'
    )
  ORDER BY f.importance DESC, f.planted_episode ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ユーティリティ関数: 直近N話の読者既知情報を取得
-- ============================================================
CREATE OR REPLACE FUNCTION get_recent_knowledge(
  p_novel_id UUID,
  p_current_episode INTEGER,
  p_lookback INTEGER DEFAULT 10
)
RETURNS TABLE (
  episode_number INTEGER,
  category TEXT,
  info TEXT,
  reader_knows BOOLEAN,
  protagonist_knows BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rk.episode_number, rk.category, rk.info,
    rk.reader_knows, rk.protagonist_knows
  FROM reader_knowledge_items rk
  WHERE rk.novel_id = p_novel_id
    AND rk.episode_number > p_current_episode - p_lookback
    AND rk.episode_number < p_current_episode
  ORDER BY rk.episode_number ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ユーティリティ関数: 生成ロックの取得
-- ============================================================
CREATE OR REPLACE FUNCTION acquire_generation_lock(
  p_novel_id UUID,
  p_locked_by TEXT,
  p_episode_number INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_locked BOOLEAN;
BEGIN
  -- 期限切れロックを削除
  DELETE FROM generation_locks
  WHERE novel_id = p_novel_id AND expires_at < NOW();

  -- ロック取得を試みる
  INSERT INTO generation_locks (novel_id, locked_by, episode_number)
  VALUES (p_novel_id, p_locked_by, p_episode_number)
  ON CONFLICT (novel_id) DO NOTHING;

  -- 取得できたか確認
  SELECT locked_by = p_locked_by INTO v_locked
  FROM generation_locks
  WHERE novel_id = p_novel_id;

  RETURN COALESCE(v_locked, FALSE);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ユーティリティ関数: 生成ロックの解放
-- ============================================================
CREATE OR REPLACE FUNCTION release_generation_lock(
  p_novel_id UUID,
  p_locked_by TEXT
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM generation_locks
  WHERE novel_id = p_novel_id AND locked_by = p_locked_by;
END;
$$ LANGUAGE plpgsql;
