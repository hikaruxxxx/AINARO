-- 縦読み漫画パイプライン Phase 1 再設計: ネーム層 (storyboard) の追加
--
-- 旧設計の欠陥（Codex フィードバック + 実機 ep1 確認 2026-04-30）:
--   "scene-splitter → shot-planner 一発で全コマ確定" だと
--   - コマ間の繋がり/対比/視線誘導が設計されない
--   - 読者の脳内補完を促す「無音コマ」「タメ」「翻し」が消える
--   - パネルが独立イラスト集になり「漫画」として成立しない
--
-- 解決: プロット → ネーム → 作画指示 の 3 層化
--   L0 plot      : episode_plots テーブル（本マイグレーションで新設）
--   L1 storyboard: shotlists.data の panels[] に拡張フィールドを乗せる（JSONB なので DDL 不要）
--   L2 art       : 既存 prompt-composer を ネーム駆動に書き換え（コードのみ）
--   L3 bubble    : Phase 2 → Phase 1 へ繰り上げ（コードのみ）

-- ============================================================
-- episode_plots: エピソードごとのプロット骨格
-- ============================================================
CREATE TABLE episode_plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES manga_episodes(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generation_version TEXT,
  UNIQUE(episode_id)
);

CREATE INDEX idx_episode_plots_ep ON episode_plots(episode_id);

-- ============================================================
-- RLS: service-role のみ（manga_* と同じ運用）
-- ============================================================
ALTER TABLE episode_plots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "episode_plots service-role only"
  ON episode_plots
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- 既存 manga_panels に narrative_function 列を追加（ネーム層が書き込む）
-- ============================================================
ALTER TABLE manga_panels
  ADD COLUMN IF NOT EXISTS narrative_function TEXT
    CHECK (narrative_function IN (
      'inform','emote','pause','contrast','reveal','silence','establishing','beat_button','reaction','cutaway'
    ));

ALTER TABLE manga_panels
  ADD COLUMN IF NOT EXISTS panel_purpose TEXT;

CREATE INDEX IF NOT EXISTS idx_panels_narrative ON manga_panels(narrative_function);

-- ============================================================
-- 既存 character_bibles / location_bibles に refs 完成フラグ
-- （build-bible-images 完了判定用、Phase 1 内で必須化される参照画像のため）
-- ============================================================
ALTER TABLE character_bibles
  ADD COLUMN IF NOT EXISTS refs_status TEXT DEFAULT 'pending'
    CHECK (refs_status IN ('pending','generating','ready','failed'));

ALTER TABLE location_bibles
  ADD COLUMN IF NOT EXISTS refs_status TEXT DEFAULT 'pending'
    CHECK (refs_status IN ('pending','generating','ready','failed'));

-- ============================================================
-- manga_works に style_sheet_asset_id（作品単位の画風基準アセット）
-- ============================================================
ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS style_sheet_asset_id UUID REFERENCES assets(id);
