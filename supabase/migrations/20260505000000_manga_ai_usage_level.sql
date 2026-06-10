-- 2026-05-05: KDP AI 開示の正規化
-- 設計根拠: ~/.claude/plans/b-1-codex-gentle-bengio.md (Track C-1)
--
-- 背景:
--   - 2026-04-30 ピボット (KDP/KU 専業) に伴い、AI 生成の開示が KDP 規約準拠の
--     最重要要件になった。これまで manga_works.metadata JSONB に runtime 格納
--     していた AI 区分を正規列に昇格させる。
--   - Codex レビュー (2026-05-04) 指摘: 自由文 ai_disclosure_text は不十分。
--     KDP 公式 5 区分 (text / images / translation / cover / interior) に bool 列を
--     1 対 1 対応させて管理画面のチェックボックスと整合させる。
--   - カクヨム 3 段階 AI タグ義務化 (memory: project_kakuyomu_ai_tag_mandate.md) も
--     同時対応。kakuyomu_ai_tag は KDP 区分とは意味が一致しないため別列で管理。
--
-- 設計:
--   - ai_usage_level: AINARO 内部 source of truth (full_ai / ai_assisted / human)
--   - kdp_ai_disclosure_*: KDP 管理画面の 5 チェックボックスに 1 対 1 対応
--   - kakuyomu_ai_tag: カクヨム同期投稿用 (full / partial / none)
--   - DEFAULT は AINARO 標準 (full_ai + 全 5 区分 true) に合わせる
--   - kdp_ai_disclosure_translation のみ既定 false (日本語版を先に出すため)

ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS ai_usage_level TEXT NOT NULL DEFAULT 'full_ai'
    CHECK (ai_usage_level IN ('full_ai','ai_assisted','human'));

ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS kdp_ai_disclosure_text BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS kdp_ai_disclosure_images BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS kdp_ai_disclosure_translation BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS kdp_ai_disclosure_cover BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS kdp_ai_disclosure_interior BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS kakuyomu_ai_tag TEXT
    CHECK (kakuyomu_ai_tag IN ('full','partial','none'));

ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS ai_tools_used TEXT[]
    NOT NULL DEFAULT ARRAY['gpt-image-2','claude-opus-4-7']::TEXT[];

ALTER TABLE manga_works
  ADD COLUMN IF NOT EXISTS human_review_performed BOOLEAN NOT NULL DEFAULT TRUE;

-- 整合性: ai_usage_level=human のときは AI 申告 5 区分が全て false でなければならない。
-- kdp_ai_disclosure_translation は日本語原作のときに false が自然なので、
-- human のときに NOT TRUE であることだけ強制する。
ALTER TABLE manga_works
  ADD CONSTRAINT manga_works_ai_disclosure_consistent CHECK (
    ai_usage_level <> 'human' OR (
      kdp_ai_disclosure_text = FALSE AND
      kdp_ai_disclosure_images = FALSE AND
      kdp_ai_disclosure_translation = FALSE AND
      kdp_ai_disclosure_cover = FALSE AND
      kdp_ai_disclosure_interior = FALSE
    )
  );

COMMENT ON COLUMN manga_works.ai_usage_level IS
  'AINARO 内部 source of truth。full_ai: AI 出力をそのまま使用、ai_assisted: 人手で大幅編集、human: AI 不使用。KDP/カクヨム 申告はここから派生する。';
COMMENT ON COLUMN manga_works.kdp_ai_disclosure_text IS
  'KDP 管理画面 AI 申告 5 区分のうち本文テキスト。bool で管理画面のチェックボックスに 1:1 対応。';
COMMENT ON COLUMN manga_works.kdp_ai_disclosure_images IS
  'KDP 管理画面 AI 申告 5 区分のうち内側の画像 (コマ・イラスト)。';
COMMENT ON COLUMN manga_works.kdp_ai_disclosure_translation IS
  'KDP 管理画面 AI 申告 5 区分のうち翻訳。日本語原作で英語版未出時は FALSE。';
COMMENT ON COLUMN manga_works.kdp_ai_disclosure_cover IS
  'KDP 管理画面 AI 申告 5 区分のうち表紙画像。';
COMMENT ON COLUMN manga_works.kdp_ai_disclosure_interior IS
  'KDP 管理画面 AI 申告 5 区分のうちページレイアウト全体 (KDP 用語: interior)。';
COMMENT ON COLUMN manga_works.kakuyomu_ai_tag IS
  'カクヨム同期投稿用の 3 段階タグ (full / partial / none)。KDP 区分と意味が一致しないため別管理。';
COMMENT ON COLUMN manga_works.ai_tools_used IS
  'AI 生成に使用したモデル名一覧 (例: gpt-image-2 / claude-opus-4-7)。';
COMMENT ON COLUMN manga_works.human_review_performed IS
  'AI 出力に対して著者による人手レビューを実施したか。';
