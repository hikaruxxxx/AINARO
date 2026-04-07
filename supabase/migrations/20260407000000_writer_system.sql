-- =============================================
-- 作家投稿システム: Phase 1 基盤
-- =============================================

-- 1. user_profiles テーブル
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'reader'
    CHECK (role IN ('reader', 'writer', 'admin')),
  writer_status TEXT NOT NULL DEFAULT 'none'
    CHECK (writer_status IN ('none', 'approved', 'suspended')),
  writer_approved_at TIMESTAMPTZ,
  stripe_connect_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_writer_status ON user_profiles(writer_status)
  WHERE writer_status != 'none';

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (true);

CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- 2. episodes テーブルに status カラム追加
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'pending_review', 'revision_requested', 'scheduled', 'published'));

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 3. novels テーブルの RLS 拡張
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'novels_writer_insert' AND tablename = 'novels') THEN
    CREATE POLICY "novels_writer_insert" ON novels
      FOR INSERT WITH CHECK (auth.uid() = author_id AND author_type = 'external');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'novels_writer_update' AND tablename = 'novels') THEN
    CREATE POLICY "novels_writer_update" ON novels
      FOR UPDATE USING (auth.uid() = author_id AND author_type = 'external');
  END IF;
END $$;

-- 4. episodes テーブルの RLS 拡張
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'episodes_writer_insert' AND tablename = 'episodes') THEN
    CREATE POLICY "episodes_writer_insert" ON episodes
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM novels WHERE id = novel_id AND author_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'episodes_writer_update' AND tablename = 'episodes') THEN
    CREATE POLICY "episodes_writer_update" ON episodes
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM novels WHERE id = novel_id AND author_id = auth.uid())
      );
  END IF;
END $$;
