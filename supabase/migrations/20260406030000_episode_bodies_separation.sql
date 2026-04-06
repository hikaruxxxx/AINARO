-- body_md を episodes テーブルから分離
-- 目次取得やエピソード一覧取得時に不要な本文データを転送しないようにする

-- ============================================================
-- episode_bodies テーブル（本文データ専用）
-- ============================================================
CREATE TABLE episode_bodies (
  episode_id UUID PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  body_md TEXT NOT NULL,
  body_md_en TEXT,
  body_html TEXT,
  body_html_en TEXT
);

-- RLS
ALTER TABLE episode_bodies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "episode_bodies_public_read" ON episode_bodies FOR SELECT USING (true);

-- ============================================================
-- データ移行: episodes の body カラムを episode_bodies にコピー
-- 本番環境では以下を手動実行
-- ============================================================
-- INSERT INTO episode_bodies (episode_id, body_md, body_md_en, body_html, body_html_en)
-- SELECT id, body_md, body_md_en, body_html, body_html_en FROM episodes;

-- 移行完了後、episodes から body カラムを削除:
-- ALTER TABLE episodes DROP COLUMN body_md;
-- ALTER TABLE episodes DROP COLUMN body_md_en;
-- ALTER TABLE episodes DROP COLUMN body_html;
-- ALTER TABLE episodes DROP COLUMN body_html_en;

-- ============================================================
-- 移行期間中のビュー: 旧APIとの後方互換性を維持
-- episodes_with_body ビューで body を含む従来のクエリを維持
-- ============================================================
CREATE OR REPLACE VIEW episodes_with_body AS
SELECT
  e.*,
  eb.body_md AS body_md_separated,
  eb.body_md_en AS body_md_en_separated,
  eb.body_html AS body_html_separated,
  eb.body_html_en AS body_html_en_separated
FROM episodes e
LEFT JOIN episode_bodies eb ON e.id = eb.episode_id;
