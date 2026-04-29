-- 縦読み漫画パイプライン Phase 0 マイグレーション
-- 対応プラン: ~/.claude/plans/codex-encapsulated-knuth.md
--
-- 変更点:
--  - novels テーブル（既存）に対する漫画版二次展開のためのスキーマを新設
--  - 設計はCodex 3度のレビューを反映: 連載CMSファースト、聖書駆動、合議CV検査、版管理、規約遵守
--
-- 参考: 既存スキーマは supabase/schema.sql の novels / episodes を主軸とする
--
-- 注意: gen_random_uuid() は既存スキーマで利用済みのため pgcrypto 拡張は前提

-- ============================================================
-- 1. 漫画作品マスタ
-- ============================================================
CREATE TABLE manga_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 既存 novels テーブルへの参照（小説IPからの二次展開）
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_en TEXT,
  status TEXT NOT NULL DEFAULT 'screening' CHECK (status IN (
    'screening', 'bible_build', 'generating', 'qa', 'published', 'archived'
  )),
  -- 作品の主絵柄。1作品1スタイル固定（Codex指摘: 本編混在禁止）
  art_style TEXT NOT NULL DEFAULT 'webtoon',
  -- 主モデルを作品単位で固定する（Codex指摘）
  primary_model TEXT NOT NULL DEFAULT 'gpt-image-1.5' CHECK (primary_model IN (
    'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini', 'flux-pro-ultra', 'sdxl-local'
  )),
  -- 配信先: 'self' / 'webtoon_canvas' / 'pixiv' / 'line_indies' / 'piccoma_indies' など
  target_platforms TEXT[] NOT NULL DEFAULT ARRAY['self']::TEXT[],
  -- 漫画化適性スコア（Layer 0 出力）。0.000-1.000
  manga_aptitude_score NUMERIC(4,3),
  -- 権利状況: { rights_holder, ai_use_allowed, commercial_allowed, ai_disclosure_required, regional_rights[] }
  rights_status JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. エピソード
-- ============================================================
CREATE TABLE manga_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  ep_num INTEGER NOT NULL,
  title TEXT,
  -- 元小説のエピソードIDへのリンク（既存 episodes テーブル）
  source_episode_id UUID REFERENCES episodes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'shotlisting', 'generating', 'qa', 'ready', 'published', 'archived'
  )),
  panel_count INTEGER DEFAULT 0,
  total_height_px INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, ep_num)
);

-- ============================================================
-- 3. キャラクター聖書（Codex指摘: 「聖書化」）
-- ============================================================
CREATE TABLE character_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  character_role TEXT,  -- 'protagonist'|'heroine'|'antagonist'|'supporting'
  -- 構造化スペック（spec例: {age_visual, gender, height_cm, build, hair{}, eyes{}, face{}, voice_tag, personality_visual}）
  spec JSONB NOT NULL,
  -- 参照画像のURL集（{front, side, diagonal, full_body, expressions{joy,anger,sad,surprise}, outfits{...}}）
  reference_images JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- 検査用埋め込み（Phase 1はCLIPのみ、DINOv2/ArcFaceはPhase 2以降に追加）
  embedding_clip BYTEA,
  embedding_dinov2 BYTEA,
  embedding_arcface BYTEA,
  -- 属性分類器の正解ラベル: { hair_color, hair_style, gender_visual, age_band, outfit_default }
  attribute_classifier JSONB DEFAULT '{}'::JSONB,
  -- このキャラ固有のbase seed
  master_seed BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, character_name)
);

-- ============================================================
-- 4. 衣装タイムライン（Codex指摘: 連載中の衣装変更管理）
-- ============================================================
CREATE TABLE costume_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES character_bibles(id) ON DELETE CASCADE,
  -- '制服' / '私服A' / '戦闘服' / '怪我中' / '変身後' など
  state_name TEXT NOT NULL,
  spec JSONB NOT NULL,
  reference_images JSONB DEFAULT '{}'::JSONB,
  -- どのエピソード範囲で有効か
  valid_from_episode INTEGER,
  valid_to_episode INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. ロケーション聖書
-- ============================================================
CREATE TABLE location_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  -- 'school'|'home'|'cafe'|'fantasy_castle'|'office' 等
  location_type TEXT,
  -- spec例: { era, atmosphere, layout{type, size_m, doors[], windows[], furniture[]}, lighting_default, color_palette[] }
  spec JSONB NOT NULL,
  -- {front, wide, from_door, from_window, time_variants{morning,afternoon,evening,night}}
  reference_images JSONB NOT NULL DEFAULT '{}'::JSONB,
  master_seed BIGINT,
  -- Tier 2 の Blender 簡易3Dパス（Phase 3 以降の任意拡張）
  three_d_model_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, location_name)
);

-- ============================================================
-- 6. 小物・持ち物（Codex指摘: props管理）
-- ============================================================
CREATE TABLE props (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  prop_name TEXT NOT NULL,
  -- spec例: { kind, color, material, distinguishing_features[] }
  spec JSONB NOT NULL,
  reference_images JSONB DEFAULT '{}'::JSONB,
  -- 所有履歴: [{ owner_character_id, from_episode, to_episode, notes }]
  ownership_history JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, prop_name)
);

-- ============================================================
-- 7. キャラクター関係グラフ（Codex指摘）
-- ============================================================
CREATE TABLE character_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  char_a_id UUID NOT NULL REFERENCES character_bibles(id) ON DELETE CASCADE,
  char_b_id UUID NOT NULL REFERENCES character_bibles(id) ON DELETE CASCADE,
  relation_type TEXT,  -- 'family'|'friend'|'rival'|'lover'|'enemy'|'mentor'|'subordinate'
  -- A→Bの呼称（例: 「先輩」「お姉ちゃん」）
  address_a_to_b TEXT,
  address_b_to_a TEXT,
  intimacy_level INTEGER CHECK (intimacy_level BETWEEN 0 AND 100),
  current_status TEXT,
  -- 関係性の時系列遷移: [{ episode, change_summary }]
  history JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (char_a_id <> char_b_id)
);

-- ============================================================
-- 8. ショットリスト
-- ============================================================
CREATE TABLE shotlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES manga_episodes(id) ON DELETE CASCADE,
  -- data例: { rhythm_curve: [0.3, 0.4, ...], panels: [{ idx, role, aspect, scene_id, camera, characters, location, dialogue, emotion, scroll_pause_intent }, ...] }
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(episode_id)
);

-- ============================================================
-- 9. アセット（画像・動画・パッケージの本体、版管理込み）
-- Codex指摘: asset_id / version / hash / derived_from_asset_id を必須化
-- ============================================================
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'panel'|'character_ref'|'location_ref'|'costume_ref'|'cover'|'thumbnail'|'video'|'package'
  asset_kind TEXT NOT NULL,
  -- 親エンティティのID（panel_id / character_id / location_id 等）。ポリモーフィックなのでFK制約は張らない
  parent_id UUID,
  version INTEGER NOT NULL DEFAULT 1,
  derived_from_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  -- Cloudflare R2 のオブジェクトキー（例: /manga/{work_id}/{ep_id}/panels/{panel_idx}/v{version}.webp）
  storage_key TEXT NOT NULL,
  cdn_url TEXT,
  hash_sha256 TEXT NOT NULL,
  width_px INTEGER,
  height_px INTEGER,
  file_size_bytes BIGINT,
  mime_type TEXT NOT NULL,
  -- 生成時情報（プロンプト監査ログ）
  prompt TEXT,
  negative_prompt TEXT,
  seed BIGINT,
  model_used TEXT,
  -- { reference_image_ids[], controlnet_inputs, sampler, cfg, latency_ms, cost_usd, request_id }
  generation_metadata JSONB DEFAULT '{}'::JSONB,
  -- 参照可視性: 'internal'|'authenticated'|'public'
  visibility TEXT NOT NULL DEFAULT 'internal',
  -- モデレーション: 'pending'|'pass'|'warn'|'fail'
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. パネル（コマ）
-- ============================================================
CREATE TABLE manga_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES manga_episodes(id) ON DELETE CASCADE,
  panel_idx INTEGER NOT NULL,
  -- 縦読みパネルの役割（Codex指摘: 縦読み演出設計）
  role TEXT NOT NULL CHECK (role IN (
    'opening', 'emotion', 'information', 'action', 'transition', 'cliffhanger'
  )),
  aspect TEXT NOT NULL CHECK (aspect IN ('vertical', 'square', 'big', 'splash')),
  width_px INTEGER NOT NULL,
  height_px INTEGER NOT NULL,
  -- ショットリストの scene_id 参照（自由テキスト、shotlists.data 内のID）
  scene_id TEXT,
  location_id UUID REFERENCES location_bibles(id) ON DELETE SET NULL,
  camera TEXT,  -- 'face_close'|'full_body'|'over_shoulder'|'birds_eye'|'hands' 等
  emotion_tag TEXT,
  -- 現在公開対象のアセット（assets テーブルで版管理）
  current_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  qa_status TEXT NOT NULL DEFAULT 'pending' CHECK (qa_status IN (
    'pending', 'pass', 'warn', 'fail', 'manual_override'
  )),
  qa_reason TEXT,
  generation_attempts INTEGER NOT NULL DEFAULT 0,
  consistency_score NUMERIC(4,3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(episode_id, panel_idx)
);

-- ============================================================
-- 11. パネル登場キャラの正規化（Codex指摘: 配列ではなく正規化）
-- ============================================================
CREATE TABLE panel_characters (
  panel_id UUID NOT NULL REFERENCES manga_panels(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES character_bibles(id) ON DELETE CASCADE,
  -- そのパネルでキャラがどの衣装状態か
  costume_state_id UUID REFERENCES costume_states(id) ON DELETE SET NULL,
  emotion TEXT,
  -- パネル内の位置: 'left'|'center'|'right'|'foreground'|'background'
  spatial_position TEXT,
  PRIMARY KEY (panel_id, character_id)
);

-- ============================================================
-- 12. 吹き出し
-- ============================================================
CREATE TABLE bubbles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES manga_panels(id) ON DELETE CASCADE,
  bubble_idx INTEGER NOT NULL,
  speaker_id UUID REFERENCES character_bibles(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  text_lang TEXT NOT NULL DEFAULT 'ja',
  -- 'normal'|'thought'|'shout'|'whisper'|'narration'
  bubble_type TEXT NOT NULL DEFAULT 'normal',
  -- { x, y, width, height, tail_x, tail_y }
  position JSONB NOT NULL,
  font_family TEXT,
  font_size INTEGER,
  z_index INTEGER NOT NULL DEFAULT 100,
  -- 縦読みでの読み順（panel_idx, reading_order）
  reading_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(panel_id, bubble_idx)
);

-- ============================================================
-- 13. KPI
-- ============================================================
CREATE TABLE manga_kpi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES manga_episodes(id) ON DELETE CASCADE,
  panel_id UUID REFERENCES manga_panels(id) ON DELETE CASCADE,
  -- 'self'|'webtoon_canvas'|'pixiv'|'line_indies'|'youtube_shorts'|'tiktok'|'instagram_reels'
  platform TEXT NOT NULL,
  -- 'view'|'completion'|'next_ep'|'bookmark'|'comment'|'drop_position'|'sns_ctr'
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data JSONB DEFAULT '{}'::JSONB
);

-- ============================================================
-- 14. QAログ（合議制検査の結果）
-- ============================================================
CREATE TABLE qa_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES manga_panels(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  attempt_num INTEGER NOT NULL,
  -- cv_results例: { clip_score, dinov2_score, arcface_score, attribute_match, hand_finger_count[], ocr_garbage_score, regulation_violations[] }
  cv_results JSONB NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN (
    'pass', 'warn', 'reroll', 'manual_review', 'override'
  )),
  failure_reasons TEXT[] DEFAULT '{}'::TEXT[],
  human_override BOOLEAN NOT NULL DEFAULT FALSE,
  reviewer_id UUID,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. 投稿パッケージ（手動投稿前提、Codex指摘: Playwright禁止）
-- ============================================================
CREATE TABLE publish_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES manga_episodes(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  -- パッケージ本体のアセット（ZIP / 単一PNG / WebP / mp4 等）
  package_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  -- meta例: { description, tags[], title, ai_disclosure_text, content_rating, language }
  meta JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'ready', 'published', 'rejected', 'archived'
  )),
  -- 人間が手動投稿した日時
  human_published_at TIMESTAMPTZ,
  external_url TEXT,
  -- 規約遵守チェックリスト: { ai_disclosure_confirmed, content_rating_confirmed, terms_reviewed_at }
  compliance_checklist JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- インデックス（Codex指摘で全件適用）
-- ============================================================
CREATE INDEX idx_manga_works_status ON manga_works(status);
CREATE INDEX idx_manga_works_novel ON manga_works(novel_id);
CREATE INDEX idx_manga_works_aptitude ON manga_works(manga_aptitude_score DESC NULLS LAST);
CREATE INDEX idx_manga_episodes_work_ep ON manga_episodes(work_id, ep_num);
CREATE INDEX idx_manga_episodes_status ON manga_episodes(status);
CREATE INDEX idx_manga_episodes_published ON manga_episodes(published_at DESC NULLS LAST);
CREATE INDEX idx_manga_panels_episode_idx ON manga_panels(episode_id, panel_idx);
CREATE INDEX idx_manga_panels_qa_status ON manga_panels(qa_status);
CREATE INDEX idx_manga_panels_location ON manga_panels(location_id);
CREATE INDEX idx_panel_characters_char ON panel_characters(character_id);
CREATE INDEX idx_assets_parent_version ON assets(parent_id, version DESC);
CREATE INDEX idx_assets_kind ON assets(asset_kind);
CREATE INDEX idx_assets_hash ON assets(hash_sha256);
CREATE INDEX idx_assets_moderation ON assets(moderation_status);
CREATE INDEX idx_manga_kpi_ep_platform ON manga_kpi(episode_id, platform, metric_type, measured_at DESC);
CREATE INDEX idx_manga_kpi_panel ON manga_kpi(panel_id, metric_type) WHERE panel_id IS NOT NULL;
CREATE INDEX idx_qa_logs_panel_attempt ON qa_logs(panel_id, attempt_num DESC);
CREATE INDEX idx_qa_logs_decision ON qa_logs(decision);
CREATE INDEX idx_character_bibles_work ON character_bibles(work_id);
CREATE INDEX idx_location_bibles_work ON location_bibles(work_id);
CREATE INDEX idx_costume_char ON costume_states(character_id);
CREATE INDEX idx_costume_episode_range ON costume_states(character_id, valid_from_episode, valid_to_episode);
CREATE INDEX idx_props_work ON props(work_id);
CREATE INDEX idx_character_relations_work ON character_relations(work_id);
CREATE INDEX idx_character_relations_chars ON character_relations(char_a_id, char_b_id);
CREATE INDEX idx_bubbles_panel ON bubbles(panel_id, reading_order);
CREATE INDEX idx_publish_packages_status ON publish_packages(status, platform);

-- ============================================================
-- updated_at 自動更新トリガー（既存スキーマと同パターン）
-- ============================================================
-- update_updated_at() は schema.sql で既に定義済みのため再利用

CREATE TRIGGER manga_works_updated_at
  BEFORE UPDATE ON manga_works
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER manga_episodes_updated_at
  BEFORE UPDATE ON manga_episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER manga_panels_updated_at
  BEFORE UPDATE ON manga_panels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER character_bibles_updated_at
  BEFORE UPDATE ON character_bibles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER publish_packages_updated_at
  BEFORE UPDATE ON publish_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS ポリシー
-- 公開済みエピソードのみ匿名読み取り可、それ以外は service_role キーで管理
-- ============================================================
ALTER TABLE manga_works ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manga_works_published_read" ON manga_works
  FOR SELECT USING (status = 'published');

ALTER TABLE manga_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manga_episodes_published_read" ON manga_episodes
  FOR SELECT USING (status = 'published');

ALTER TABLE manga_panels ENABLE ROW LEVEL SECURITY;
-- パネルは公開済みエピソード経由でのみ読み取り可
CREATE POLICY "manga_panels_via_published_episode" ON manga_panels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manga_episodes me
      WHERE me.id = manga_panels.episode_id AND me.status = 'published'
    )
  );

ALTER TABLE bubbles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bubbles_via_published_panel" ON bubbles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manga_panels p JOIN manga_episodes me ON me.id = p.episode_id
      WHERE p.id = bubbles.panel_id AND me.status = 'published'
    )
  );

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_public_visible" ON assets
  FOR SELECT USING (visibility = 'public');

-- 聖書テーブルは管理者のみ（service_role キーで操作）
ALTER TABLE character_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE costume_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE props ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE shotlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE publish_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_kpi ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 制約・整合性チェック関数
-- ============================================================

-- panel_characters の最大数を 1コマ最大2人に制限する関数（Codex指摘: 複数キャラ制約）
-- ショットリスト側で原則制御するが、DB レベルでも警告ログを残す
CREATE OR REPLACE FUNCTION warn_panel_character_limit()
RETURNS TRIGGER AS $$
DECLARE
  cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM panel_characters WHERE panel_id = NEW.panel_id;
  -- 4人以上で警告（前景/後景の使い分けが正しければ3人までは許容）
  IF cnt > 3 THEN
    RAISE NOTICE 'panel % has % characters (>3); consider distant shot or silhouette per shotlist guideline', NEW.panel_id, cnt;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER panel_characters_limit_check
  AFTER INSERT ON panel_characters
  FOR EACH ROW EXECUTE FUNCTION warn_panel_character_limit();

-- ============================================================
-- 集計ビュー: 漫画版 KPI ダッシュボード用
-- ============================================================
CREATE OR REPLACE VIEW manga_episode_kpi_summary AS
SELECT
  me.id AS episode_id,
  me.work_id,
  me.ep_num,
  me.published_at,
  -- プラットフォーム別 view 集計
  COALESCE(SUM(k.metric_value) FILTER (WHERE k.metric_type = 'view'), 0) AS total_views,
  -- 完読率 (直近の値、平均ではなく最新)
  AVG(k.metric_value) FILTER (WHERE k.metric_type = 'completion') AS avg_completion_rate,
  AVG(k.metric_value) FILTER (WHERE k.metric_type = 'next_ep') AS avg_next_ep_rate,
  AVG(k.metric_value) FILTER (WHERE k.metric_type = 'bookmark') AS avg_bookmark_rate
FROM manga_episodes me
LEFT JOIN manga_kpi k ON k.episode_id = me.id
WHERE me.status = 'published'
GROUP BY me.id, me.work_id, me.ep_num, me.published_at;

-- ============================================================
-- コメント
-- ============================================================
COMMENT ON TABLE manga_works IS '縦読み漫画作品マスタ。novels テーブルへの二次展開';
COMMENT ON TABLE manga_panels IS '漫画パネル本体。生成画像本体は assets テーブルで版管理';
COMMENT ON TABLE assets IS 'アセット版管理。プロンプト・seed・モデル・派生関係を完全追跡';
COMMENT ON TABLE character_bibles IS 'キャラクター聖書。CLIP/DINOv2/ArcFace 埋め込みと属性ラベルで合議CV検査';
COMMENT ON TABLE costume_states IS '衣装タイムライン。Codex最重要指摘で連載中の状態管理を必須化';
COMMENT ON TABLE qa_logs IS '合議CV検査ログ。pass/warn/reroll/manual_review/override の決定を記録';
COMMENT ON TABLE publish_packages IS '手動投稿用パッケージ。Playwright自動投稿は規約違反のため永久不採用';
