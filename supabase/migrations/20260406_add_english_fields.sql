-- 小説・エピソードの英語フィールドを追加
-- 英語版が未設定の場合はNULL（日本語にフォールバック）

-- novels テーブル
ALTER TABLE novels ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE novels ADD COLUMN IF NOT EXISTS tagline_en TEXT;
ALTER TABLE novels ADD COLUMN IF NOT EXISTS synopsis_en TEXT;

-- episodes テーブル
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS title_en TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS body_md_en TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS body_html_en TEXT;

-- コメント
COMMENT ON COLUMN novels.title_en IS '英語タイトル（NULLの場合は日本語にフォールバック）';
COMMENT ON COLUMN novels.tagline_en IS '英語キャッチコピー';
COMMENT ON COLUMN novels.synopsis_en IS '英語あらすじ';
COMMENT ON COLUMN episodes.title_en IS '英語エピソードタイトル';
COMMENT ON COLUMN episodes.body_md_en IS '英語本文（Markdown）';
COMMENT ON COLUMN episodes.body_html_en IS '英語本文（HTML）';
