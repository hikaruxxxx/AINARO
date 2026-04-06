-- body_md 外部化マイグレーション
-- episodes テーブルから本文カラムを分離し、
-- 目次・一覧クエリの高速化を実現する
--
-- 移行手順:
-- 1. episode_bodies テーブルを作成
-- 2. 既存データを移行
-- 3. episodes テーブルから body カラムを削除（別マイグレーションで実施）
--
-- 注意: body カラムの削除は、アプリ側の全クエリが episode_bodies を
-- 参照するように変更完了後に行うこと（段階的移行）

-- ========== episode_bodies テーブル ==========
CREATE TABLE episode_bodies (
  episode_id UUID PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  body_md TEXT NOT NULL,
  body_md_en TEXT,
  body_html TEXT,
  body_html_en TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE episode_bodies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "episode_bodies_public_read" ON episode_bodies FOR SELECT USING (true);

-- updated_at トリガー
CREATE TRIGGER episode_bodies_updated_at
  BEFORE UPDATE ON episode_bodies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========== 既存データ移行 ==========
-- episodes テーブルの body_md/body_html を episode_bodies にコピー
INSERT INTO episode_bodies (episode_id, body_md, body_md_en, body_html, body_html_en)
SELECT id, body_md, body_md_en, body_html, body_html_en
FROM episodes
WHERE body_md IS NOT NULL
ON CONFLICT (episode_id) DO NOTHING;

-- ========== エピソード取得用ビュー ==========
-- 既存コードとの互換性のため、JOINビューを用意
-- data.ts の fetchEpisode/fetchEpisodeRange で利用
CREATE OR REPLACE VIEW episodes_with_body AS
SELECT
  e.id, e.novel_id, e.episode_number, e.title, e.title_en,
  COALESCE(eb.body_md, e.body_md) AS body_md,
  COALESCE(eb.body_md_en, e.body_md_en) AS body_md_en,
  COALESCE(eb.body_html, e.body_html) AS body_html,
  COALESCE(eb.body_html_en, e.body_html_en) AS body_html_en,
  e.character_count, e.is_free, e.unlock_at, e.unlock_price,
  e.pv, e.published_at, e.created_at, e.updated_at
FROM episodes e
LEFT JOIN episode_bodies eb ON e.id = eb.episode_id;
