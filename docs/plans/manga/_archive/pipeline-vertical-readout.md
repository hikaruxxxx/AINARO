# AINARO 縦読み漫画パイプライン 技術設計プラン

## Context

AINAROは小説IPを生成する基盤を持つが、EXIT戦略上「縦読み漫画への二次展開」をYear2に予定していた。市場特性（縦読み=消費財カテゴリ）と技術成熟度を再評価した結果、**2026年内に最小パイプラインを稼働**し、IP発掘装置とスケール事業を並走させる方針に転換する。

ただしCodexの2度のレビューで明らかになった重要な事実:

1. 当初の「完全自動生成機」設計は連載運用に不向き。本当に必要なのは**AI生成 + 人間編集 + 権利/規約/配信管理が一体化した連載CMS**である
2. NovelAIサブスク並列運用は規約上グレー、Flux/NovelAI混在は本編で画風崩壊を起こす
3. WEBTOON CANVASのPlaywright自動投稿は規約違反でBANリスク
4. ArcFace単独の顔一貫性検査は漫画顔・横顔・表情差分で偽陰性多発
5. 月12万円のコスト試算は事業運用費を抜いた机上値、現実は月30-100万円

このプランは3回のCodexレビュー指摘を全面取り込んだ最終設計。**画像モデルは `gpt-image-1.5`（OpenAI公式 docs で2026年4月時点に提供されているモデル名）を主軸**（規約明確・一貫性強・立ち上げ最速）、**Flux Proを写実サブ**、月100話超のスケール期に**SDXL自前ホストを併用**する3段階戦略。

注: 当初想定していた "GPT Image 2" は公式名称ではなく、OpenAI公式 docs 上は `gpt-image-1.5` / `gpt-image-1` / `gpt-image-1-mini` が案内されている。本プランでは `gpt-image-1.5` を主軸として記述する。

意図する成果:
- 2026年5月末に「1作品×3話完成、自社サイト限定で公開」までを到達
- 2026年内に「自社+pixiv+WEBTOON CANVAS手動投稿」で月10-20作品の検証稼働
- 2027年に漫画化適性スコアモデルv1を運用、勝ちジャンルへ集中投資
- 2028年以降のEXIT準備に必要な「IPカタログ + AI漫画化能力 + 海外配信実績 + 権利クリーンなIP台帳」を蓄積

---

## 設計原則（Codex指摘の取り込み後）

1. **連載CMSファースト** — 生成パイプラインは1コンポーネント。中核は権利/規約/編集ワークフロー/版管理/KPI
2. **聖書（Bible）駆動** — キャラ・ロケ・衣装・時間軸・禁止事項を構造化資産として最初に固める
3. **画像モデルは作品単位で主モデル固定** — 本編混在禁止、サブはref画像生成と背景素材のみ
4. **検査は合議制** — ArcFace単独禁止、CLIP+DINOv2+属性分類器+人間QAで多層検証
5. **投稿は規約遵守** — 自動投稿せず、手動投稿用パッケージを自動生成
6. **段階スケール** — 各Phase出口条件をKPIで明示、満たなければ次Phaseに進まない
7. **既存資産流用** — Phase1パイプライン/ヒット予測v12/anchor pool v1を最大活用、重複実装しない

---

## 11層アーキテクチャ（Codex指摘で4層追加）

```
[Layer 0: 漫画化適性スクリーニング層]
  既存 predictions_v12 + 漫画特化特徴量 → manga_aptitude_score
  入力: 小説IP / 出力: 優先順位付きキャンディデート

[Layer 1: 構造化層]
  scene-splitter / shotlist-generator
  character-bible-builder / location-bible-builder
  costume-timeline / props-tracker / character-graph (新)

[Layer 2: 権利・規約層 (新)]
  AI利用可否 / 商用可否 / プラットフォーム別NG表現
  レーティングエンジン / 権利帰属台帳 / プロンプト監査ログ

[Layer 3: 生成層]
  panel-generator (GPT Image 2 主、Flux Pro 写実サブ)
  reroll-orchestrator / asset-version-manager
  ※ LoRA/SDXL自前は Phase 3 以降の併用オプション

[Layer 4: 検証層]
  cv-inspector (CLIP + DINOv2 + ArcFace + 属性分類器の合議)
  consistency-checker / regulation-checker / hand-finger-checker
  text-garbage-detector

[Layer 5: 合成層]
  bubble-placer (MVPは候補矩形+スコアリング、SATソルバーは将来)
  typesetter / panel-assembler / format-adapter

[Layer 6: 編集運用層 (新)]
  qa-console (人間レビュー/差し戻し/承認)
  publish-scheduler / version-history / revision-management

[Layer 7: ローカライズ層 (新)]
  translation / typesetting-replacement / bubble-relayout
  glossary / character-tone / cultural-hook-adapter

[Layer 8: 配信層]
  self-host-publisher / manual-publish-package-generator
  sns-shorts-generator (ffmpeg)

[Layer 9: 実験管理層 (新)]
  cover-ab / title-ab / opening-ab / sns-thumbnail-ab

[Layer 10: 計測層]
  kpi-collector / hit-predictor-v2 (漫画版)
  data-warehouse / dashboard
```

---

## データモデル（Codex指摘でインデックス・正規化・versioning追加）

修正対象ファイル: 新規作成（Phase 0 実装済み）
- `supabase/migrations/20260501000000_manga_pipeline.sql` (既存命名規則に合わせて修正)
- `src/lib/manga/types.ts` (実装済み)
- `src/lib/manga/schemas.ts` (実装済み、Zodは未導入のため素のTSで)
- `docs/architecture/manga_pipeline.md` (実装済み)

注: 当初プランで `db/migrations/` を想定していたが、既存リポジトリの命名規則 `supabase/migrations/YYYYMMDDHHMMSS_*.sql` に合わせる。`novel_works` テーブルは存在しないため、既存 `novels` (UUID PK) へFKを張る形に修正。

### 主要テーブル

```sql
-- 作品マスタ
CREATE TABLE manga_works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_work_id TEXT NOT NULL REFERENCES novel_works(id),
  title TEXT NOT NULL,
  title_en TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'screening','bible_build','generating','qa','published','archived'
  )),
  art_style TEXT NOT NULL,
  primary_model TEXT NOT NULL,  -- 'gpt_image_2' | 'flux_pro_ultra' | 'sdxl_local'
  target_platforms TEXT[] NOT NULL DEFAULT ARRAY['self','webtoon_canvas','pixiv'],
  manga_aptitude_score NUMERIC(4,3),
  rights_status JSONB NOT NULL,  -- 権利帰属/商用可否/AI明示要否
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE TABLE manga_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  ep_num INTEGER NOT NULL,
  title TEXT,
  novel_chapter_id TEXT,
  status TEXT NOT NULL,
  panel_count INTEGER,
  total_height_px INTEGER,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, ep_num)
);

-- パネル本体（生成物本体は assets テーブルへ分離）
CREATE TABLE manga_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES manga_episodes(id) ON DELETE CASCADE,
  panel_idx INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'opening','emotion','information','action','transition','cliffhanger'
  )),
  aspect TEXT NOT NULL CHECK (aspect IN ('vertical','square','big','splash')),
  width_px INTEGER NOT NULL,
  height_px INTEGER NOT NULL,
  scene_id UUID,
  location_id UUID REFERENCES location_bibles(id),
  camera TEXT,
  emotion_tag TEXT,
  current_asset_id UUID REFERENCES assets(id),
  qa_status TEXT NOT NULL DEFAULT 'pending',
  qa_reason TEXT,
  generation_attempts INTEGER DEFAULT 1,
  consistency_score NUMERIC(4,3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(episode_id, panel_idx)
);

-- 登場キャラの正規化（多対多）
CREATE TABLE panel_characters (
  panel_id UUID NOT NULL REFERENCES manga_panels(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES character_bibles(id),
  costume_state_id UUID REFERENCES costume_states(id),  -- どの衣装状態か
  emotion TEXT,
  PRIMARY KEY (panel_id, character_id)
);

-- アセット（画像/動画/PDF等の本体、version管理）
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_kind TEXT NOT NULL,  -- 'panel'|'cover'|'thumbnail'|'video'|'package'
  parent_id UUID,  -- panel_id 等
  version INTEGER NOT NULL DEFAULT 1,
  derived_from_asset_id UUID REFERENCES assets(id),
  storage_key TEXT NOT NULL,  -- R2 path
  cdn_url TEXT,
  hash_sha256 TEXT NOT NULL,
  width_px INTEGER,
  height_px INTEGER,
  file_size_bytes BIGINT,
  mime_type TEXT NOT NULL,
  prompt TEXT,
  negative_prompt TEXT,
  seed BIGINT,
  model_used TEXT,
  generation_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- キャラ聖書
CREATE TABLE character_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  character_role TEXT,
  spec JSONB NOT NULL,
  reference_images JSONB NOT NULL,
  embedding_clip BYTEA,
  embedding_dinov2 BYTEA,
  embedding_arcface BYTEA,
  attribute_classifier JSONB,  -- 髪色/髪型/服装の正解ラベル
  master_seed BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(work_id, character_name)
);

-- 衣装タイムライン（Codex最重要指摘）
CREATE TABLE costume_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES character_bibles(id) ON DELETE CASCADE,
  state_name TEXT NOT NULL,  -- '制服', '私服A', '戦闘服', '怪我中', '変身後'
  spec JSONB NOT NULL,
  reference_images JSONB,
  valid_from_episode INTEGER,
  valid_to_episode INTEGER,
  notes TEXT
);

-- ロケーション聖書
CREATE TABLE location_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  location_name TEXT NOT NULL,
  location_type TEXT,
  spec JSONB NOT NULL,
  reference_images JSONB NOT NULL,
  master_seed BIGINT,
  three_d_model_path TEXT,  -- Tier 2の Blender パス（任意）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 小物・持ち物（Codex指摘）
CREATE TABLE props (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  prop_name TEXT NOT NULL,
  spec JSONB NOT NULL,
  reference_images JSONB,
  ownership_history JSONB  -- 誰がいつ持っているか
);

-- キャラ関係グラフ（Codex指摘）
CREATE TABLE character_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id UUID NOT NULL REFERENCES manga_works(id) ON DELETE CASCADE,
  char_a_id UUID NOT NULL REFERENCES character_bibles(id),
  char_b_id UUID NOT NULL REFERENCES character_bibles(id),
  relation_type TEXT,
  address_a_to_b TEXT,  -- 呼称
  address_b_to_a TEXT,
  intimacy_level INTEGER,
  current_status TEXT,
  history JSONB
);

-- ショットリスト
CREATE TABLE shotlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES manga_episodes(id),
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 吹き出し
CREATE TABLE bubbles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES manga_panels(id) ON DELETE CASCADE,
  bubble_idx INTEGER NOT NULL,
  speaker_id UUID REFERENCES character_bibles(id),
  text TEXT NOT NULL,
  text_lang TEXT NOT NULL DEFAULT 'ja',
  bubble_type TEXT NOT NULL,
  position JSONB NOT NULL,
  font_family TEXT,
  font_size INTEGER,
  z_index INTEGER DEFAULT 100,
  reading_order INTEGER NOT NULL
);

-- KPI
CREATE TABLE manga_kpi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES manga_episodes(id),
  panel_id UUID REFERENCES manga_panels(id),
  platform TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  raw_data JSONB
);

-- QAログ
CREATE TABLE qa_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  panel_id UUID NOT NULL REFERENCES manga_panels(id),
  asset_id UUID REFERENCES assets(id),
  attempt_num INTEGER NOT NULL,
  cv_results JSONB NOT NULL,
  decision TEXT NOT NULL,  -- 'pass'|'warn'|'reroll'|'manual_review'
  failure_reasons TEXT[],
  human_override BOOLEAN DEFAULT FALSE,
  reviewer_id UUID,
  reviewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投稿パッケージ
CREATE TABLE publish_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES manga_episodes(id),
  platform TEXT NOT NULL,
  package_asset_id UUID REFERENCES assets(id),  -- ZIP/分割JPG等
  meta JSONB NOT NULL,  -- 説明文/タグ/タイトル/AI明示文言
  human_published_at TIMESTAMPTZ,
  external_url TEXT,
  status TEXT NOT NULL  -- 'pending'|'ready'|'published'|'rejected'
);
```

### インデックス（Codex指摘の全件適用）

```sql
CREATE INDEX idx_works_status ON manga_works(status);
CREATE INDEX idx_works_novel ON manga_works(novel_work_id);
CREATE INDEX idx_episodes_work_ep ON manga_episodes(work_id, ep_num);
CREATE INDEX idx_episodes_status ON manga_episodes(status);
CREATE INDEX idx_panels_episode_idx ON manga_panels(episode_id, panel_idx);
CREATE INDEX idx_panels_status ON manga_panels(qa_status);
CREATE INDEX idx_panels_scene ON manga_panels(scene_id);
CREATE INDEX idx_panels_location ON manga_panels(location_id);
CREATE INDEX idx_panel_characters_char ON panel_characters(character_id);
CREATE INDEX idx_assets_parent ON assets(parent_id, version);
CREATE INDEX idx_assets_kind ON assets(asset_kind);
CREATE INDEX idx_assets_hash ON assets(hash_sha256);
CREATE INDEX idx_kpi_ep_platform_metric ON manga_kpi(episode_id, platform, metric_type, measured_at);
CREATE INDEX idx_qa_panel_attempt ON qa_logs(panel_id, attempt_num);
CREATE INDEX idx_character_bibles_work ON character_bibles(work_id);
CREATE INDEX idx_location_bibles_work ON location_bibles(work_id);
CREATE INDEX idx_costume_char ON costume_states(character_id);
CREATE INDEX idx_publish_packages_status ON publish_packages(status);
```

---

## MVP スコープ（Phase 1 = 2026年5月末）

Codex最終レビューで「8コンポーネント全部は1人開発で詰まる」と指摘。Phase 1 を **必須6点 + 簡易検査** に絞り、外部投稿パッケージ・SNS動画・DINOv2/ArcFace・外部KPIをPhase 2へ延期する。**1作品×3話を自社サイト限定で完成**を出口条件とする。

### Phase 1 必須コンポーネント

1. work bible
2. shotlist-generator
3. panel-generator (`gpt-image-1.5` 主)
4. asset/version 管理
5. qa-console 最小版
6. 自社サイト公開（PostHogで完読率/離脱位置を自前計測）

### Phase 1 簡易コンポーネント

7. 簡易CV検査（**CLIP類似度 + 属性分類器のみ**、ArcFace/DINOv2は後回し）

### Phase 2 延期

- WEBTOON CANVAS / pixiv 投稿パッケージ正式版
- SNS動画化（ffmpeg 60秒スクロール）
- DINOv2 / ArcFace 追加合議
- 外部プラットフォームKPI収集
- 実験管理 A/B 基盤

### 1. work bible

修正対象ファイル: 新規作成
- `src/lib/manga/bible/character-builder.ts`
- `src/lib/manga/bible/location-builder.ts`
- `src/lib/manga/bible/costume-timeline.ts`
- `src/lib/manga/bible/character-graph.ts`
- `src/lib/manga/bible/props-tracker.ts`
- `scripts/manga/build-bible.ts`

機能:
- 小説IP（既存 `content/works/{work_id}/`）から spec JSON 抽出
- GPT Image 2 でキャラ参照画像（正面/横/斜め/全身/表情5種）を `master_seed` 固定で生成
- ロケーション参照画像（正面/全景/角度別/時間帯別）生成
- 衣装状態タイムライン（valid_from_episode / valid_to_episode）の構造化
- キャラ関係グラフ（呼称/距離/恋愛進行）の構造化
- 小物の所有履歴（誰がいつ持つか）

既存資産の再利用:
- `src/lib/cover/codex-image.ts` のGPT Image 2呼び出しパターン
- `src/lib/cover/prompt-builder.ts` のプロンプト組み立て構造
- 既存 `extract-world-facts` スキルの世界観抽出ロジック

### 2. shotlist-generator

修正対象ファイル: 新規作成
- `src/lib/manga/shotlist/scene-splitter.ts`
- `src/lib/manga/shotlist/shot-planner.ts`
- `src/lib/manga/shotlist/rhythm-curve.ts`
- `scripts/manga/generate-shotlist.ts`

機能:
- 章本文 → シーン分割（30-50パネル/エピソード目安）
- 各シーンを 1.5-3コマに展開
- リズム曲線生成（導入低 → 中盤起伏 → クライマックス → 引き急上昇）
- 各パネルの role/aspect/camera/emotion/dialogue を確定
- 縦読み特化ルール: 連続顔アップ2コマ上限、引き=大ゴマ+余白、ページ末前にタメ

既存資産の再利用:
- 既存 `generate-plot` / `analyze-pacing` スキルのリズム設計知見
- `validate-foreshadowing` のエピソード整合性チェック

### 3. panel-generator (`gpt-image-1.5` 主)

修正対象ファイル: 新規作成
- `src/lib/manga/generate/orchestrator.ts`
- `src/lib/manga/generate/gpt-image-adapter.ts`
- `src/lib/manga/generate/flux-adapter.ts`
- `src/lib/manga/generate/prompt-composer.ts`
- `scripts/manga/generate-panels.ts`

機能:
- shotlist + キャラ聖書 + ロケ聖書 → プロンプト組み立て
- `gpt-image-1.5` を主モデル、reference image を聖書から注入
- 写実シーン・複雑構図のみ Flux Pro Ultra へフォールバック（本編は同一モデルに寄せる原則を遵守）
- Asset versioning で全リロール履歴を保持
- 並列度: MVPは10、Phase 3で50へ

複数キャラ同時登場の制約（Codex指摘対応）:
- 1コマに主要キャラは最大2人まで
- 3人以上は遠景・後ろ姿・シルエット・分割コマで逃がす
- ショットリスト側で難しいコマを作らないルールを組み込む
- プロンプトで位置固定（left/right/foreground/background）
- 顔差し替え用 inpaint/edit フローは Phase 2 以降に追加

既存資産の再利用:
- `src/lib/cover/codex-image.ts` をベースに拡張
- 既存 `generate-cover` スキルのプロンプト設計

### 4. qa-console

修正対象ファイル: 新規作成
- `src/app/admin/manga/qa/page.tsx`
- `src/app/admin/manga/qa/[panelId]/page.tsx`
- `src/components/manga/QaPanel.tsx`
- `src/components/manga/RerollControls.tsx`
- `src/lib/manga/qa/decision-engine.ts`

機能:
- 全パネルの一覧（ステータス/スコア/リロール回数）
- 個別パネル詳細（CV検査結果/類似度/失敗理由）
- ワンクリックでリロール（seed変更/プロンプト微調整）
- 人間承認/差し戻し/手動修正
- 修正履歴の自動学習データ化

依存: Next.js 15 App Router 既存構成、Supabase Auth既存セットアップ

### 5. asset/version 管理

修正対象ファイル: 新規作成
- `src/lib/manga/assets/storage.ts`
- `src/lib/manga/assets/versioning.ts`
- `src/lib/manga/assets/r2-client.ts`

機能:
- Cloudflare R2 への保存（ストレージキー設計: `/manga/{work_id}/{ep_id}/panels/{panel_idx}/v{version}.webp`）
- SHA256ハッシュで重複検知
- derived_from_asset_id で派生関係追跡
- プロンプト/seed/model/参照画像IDをすべて記録（プロンプト監査）

### 6. 簡易CV検査（MVPはCLIP+属性のみ、Codex最終指摘）

修正対象ファイル: 新規作成
- `src/lib/manga/inspect/clip-similarity.ts`
- `src/lib/manga/inspect/attribute-classifier.ts`
- `src/lib/manga/inspect/hand-finger.ts`
- `src/lib/manga/inspect/ocr-garbage.ts`
- `src/lib/manga/inspect/decision-aggregator.ts`
- `scripts/manga/inspect-panels.ts`

MVPの優先順（Codex指摘）:
1. CLIP類似度（粗いズレ検出）
2. 属性分類（髪色/髪型/服/性別/年齢感）
3. 手指 (Mediapipe Hands)
4. OCR文字化け検査
- DINOv2 / ArcFace は Phase 2 以降に追加合議

機能:
- CLIP+属性で `pass / warn / fail` の3段階判定
- 閾値はキャラごとの分布から動的決定（初期は warn 多めで人間QAに流す）
- 失敗時最大3回リロール

実行環境: RunPod GPU pod（CLIPモデル常駐）

新規追加ファイル（Phase 2以降）:
- `src/lib/manga/inspect/dinov2-similarity.ts`
- `src/lib/manga/inspect/arcface-face.ts`

### 7. 自社サイト公開 + KPI 自前計測（MVPは自社のみ）

修正対象ファイル: 新規作成
- `src/lib/manga/publish/self-hosted-format.ts`
- `src/lib/manga/kpi/self-host-collector.ts`
- `src/app/manga/[workSlug]/[ep]/page.tsx`（自社配信ページ、PostHog計測埋め込み）
- `scripts/manga/build-self-package.ts`

機能（MVP範囲）:
- 自社サイト用: WebPストリーミング配信ファイル
- 完読率/離脱位置/2話遷移率/お気に入り率を PostHog で自前計測
- `manga_kpi` テーブルに統合

新規追加ファイル（Phase 2 で実装）:
- `src/lib/manga/publish/webtoon-canvas-format.ts` (800px幅・1280px超分割JPG・ZIP)
- `src/lib/manga/publish/pixiv-format.ts` (1200px幅・単一PNG・AI明示メタ)
- `src/lib/manga/publish/sns-shorts-builder.ts` (ffmpeg 30-60秒スクロール動画)
- `src/lib/manga/kpi/external-collector.ts` (Creator Dashboard CSV取り込み or 手動入力フォーム)

WEBTOON仕様の管理（Codex指摘）:
- 仕様値は DB/設定ファイル化、コード直書き禁止
- 投稿前に Creator/Uploading Guidelines を確認するチェックリストを運用
- 外部 KPI 取得はスクレイピング禁止、Creator Dashboard CSV / 許可された範囲に限定

既存資産の再利用:
- 既存 `scripts/utils/` の画像処理ユーティリティ

---

## 後回しコンポーネント

Codex最終指摘で明確化:

**Phase 2 へ延期**:
- WEBTOON CANVAS / pixiv 投稿パッケージ正式版
- SNS動画化（ffmpeg）
- DINOv2 / ArcFace 追加合議
- 外部プラットフォームKPI収集（CSV/許可された範囲のみ）

**Phase 3 以降**:
- 主要キャラ LoRA 訓練
- 実験管理層 A/B 基盤
- 顔差し替え inpaint/edit フロー（複数キャラ重要コマ用）

**Phase 4 以降**:
- ローカライズ層（翻訳/吹き出し再配置/用語集）
- 完全自動規約判定（人間レビューで補完）

**永久に採用しない**:
- Playwright 自動投稿（規約違反・BANリスク）
- スクレイピングによる外部KPI取得

**将来検討**:
- SAT solver 吹き出し配置（候補矩形+スコアリングで失敗例が蓄積してから）
- World Model 統合（2027年以降の技術成熟次第）
- 複数モデル高度fallback（主モデル固定原則を優先）

---

## タイムライン

| Phase | 期間 | 出口条件 |
|-------|------|----------|
| Phase 0 | 2026/05 第1-2週 | DBマイグレーション・型定義・アーキ確定 |
| Phase 1 (MVP) | 2026/05 第3-4週 | 1作品×3話、自社限定公開、内部レビュー合格 |
| Phase 2 | 2026/06-07 | 2-3作品×3プラットフォーム手動投稿、KPI測定（完読率40%以上） |
| Phase 3 | 2026/08-10 | 月50話量産、漫画化適性モデルv1、MAU 1000+作品3本 |
| Phase 4 | 2026/11-2027/Q2 | 月100話、海外展開、MAU 10万、P/L仮説検証 |
| Phase 5 | 2027/Q3-Q4 | 人間作画長編化、MAU 30-50万 |
| Phase 6 | 2028-2030 | EXIT準備（MAU 30-100万、月商500-2000万、海外比率30%以上） |

各Phase出口条件未達なら次に進まない。

---

## コスト・P/L 仮説（Codex指摘の修正後）

### Phase 1 (5月)
- API: $50（`gpt-image-1.5` 試作分）
- インフラ: $30（R2/RunPod初期）
- 人間QA: 30時間 × 3000円 = 9万円
- **合計: 約12万円**

注: 試作期はプロンプト試行・聖書作成・リロールが多く、1話あたりコストは1万-3万円が現実値。「1話<5000円」は量産期KPIとして Phase 3 以降に適用する（Codex指摘）。

### Phase 3（月50エピソード安定運用）
- GPT Image 2: 1500パネル × $0.10 = $150
- Flux Pro 写実フォールバック10%: $7.5
- LLM: $30
- RunPod GPU（CV検査+SDXL併用準備）: $80
- R2/Vercel/Supabase: $30
- 人間QA: 1ep 1-2時間 × 50ep × 3000円 = 15-30万円
- 投稿/SNS編集: 月20-40時間 × 3000円 = 6-12万円
- 監視・運用ツール保守: 月10時間 × 3000円 = 3万円
- **合計: 月30-50万円**

### Phase 4（月200エピソード）
- API+インフラ: 月20-40万円（SDXL自前併用でコスト圧縮）
- 人間QA: 月60-120万円
- マーケ・広告: 月20-50万円
- **合計: 月100-200万円**

### P/L 仮説（Phase 4 黒字化判定の前提）

**保守ケース（Codex指摘の現実値）**:
- 自社課金 ARPPU: 月500-1,000円、課金率0.3-1.0% → MAU10万で月15-100万円
- 広告売上: 月数万-数十万円（漫画閲覧の広告RPMは保証しにくい）
- **月売上仮説: 30-100万円、月運用費100-200万円 → MAU10万では赤字継続**

**楽観ケース**:
- 課金率2% / ARPPU 500円 / 広告RPM 100円 → 月売上130-150万円

**判定方針**:
- 月間黒字化はMAUではなくP/L実績で判定
- MAU30万以上、または少数の強い課金作品が出てから本格黒字化
- それまでは Growth投資フェーズとして赤字許容（WEBTOONモデル）

### EXIT 5-10億円の必要条件（Codex指摘の現実値）
- 自社MAU 30万-100万
- 月商500万-2000万円
- 粗利率50%以上
- 12ヶ月以上の継続成長
- 漫画カタログ100本以上 / 明確なヒットIP 3-5本
- 海外読者比率30%以上
- 漫画化前後で原作KPI上昇の証拠
- 権利クリーンなIP台帳

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| `gpt-image-1.5` 仕様/価格/規約変動 | Phase 3でSDXL自前併用、設定ファイルで切替容易化、月次で公式docs確認 |
| 複数キャラ同時登場で一貫性破綻 | ショットリスト側で1コマ最大2人ルール、3人以上は遠景/シルエット |
| WEBTOON BAN | 手動投稿厳守、Playwright禁止、外部KPIもスクレイピング禁止 |
| キャラ一貫性破綻 | CLIP+属性のMVP→Phase 2でDINOv2/ArcFace追加、Phase 3で主要キャラLoRA |
| 衣装/状態管理破綻 | costume_states テーブルで時間軸管理、QA console で警告表示 |
| 規約違反コンテンツ | Layer 2 規約層 + Layer 4 検査層 + 人間QA の三重 |
| 著作権紛争 | Layer 2 で人間関与記録、商用ライセンスモデルのみ使用 |
| AI忌避による読者離反 | SNSブランディング、自社サイトを主、外部は発見チャネル |
| WEBTOON本体赤字 = 黒字化困難 | MAUではなくP/L実績で判定、Phase 5長編化で粗利改善 |
| 1人開発で全部抱えて止まる | 人間QA / 翻訳 / SNS運用 / 法務 / 会計を最初から外注前提に |

---

## 既存資産との連携マップ

| 既存資産 | 連携箇所 |
|---------|----------|
| Phase1パイプライン | 漫画化候補の優先選別 |
| ヒット予測v12 (`scripts/predict/predict-hit-v12.py`) | manga_aptitude_score の入力特徴量 |
| anchor pool v1 (`data/generation/anchors/`) | 漫画化適性の品質基準 |
| `extract-world-facts` スキル | location-bible-builder の前段 |
| `generate-cover` スキル | character-bible-builder の参考実装 |
| `validate-foreshadowing` スキル | shotlist のエピソード構成検証 |
| `audit-voices` スキル | bubbles のセリフ振り分け検証 |
| `pairwise-judge` スキル | 漫画版品質ペアワイズ評価 |
| `src/lib/cover/codex-image.ts` | GPT Image 2 アダプタの参考実装 |
| `src/lib/cover/prompt-builder.ts` | プロンプト組み立て構造の流用 |
| `content/works/INDEX.md` 仕組み | 漫画版インデックスの設計参考 |

新規追加するスキル:
- `manga-screen` (漫画化適性スクリーニング)
- `manga-shotlist` (ショットリスト生成)
- `manga-bible` (聖書ビルダー)
- `manga-generate` (パネル生成オーケストレータ)
- `manga-inspect` (CV検査合議)
- `manga-package` (投稿パッケージ生成)
- `manga-kpi` (KPI集計)

---

## Verification（end-to-end 検証手順）

### Phase 0 完了確認

```bash
# DBマイグレーション適用
psql $DATABASE_URL -f db/migrations/2026_05_manga_pipeline.sql

# テーブル作成確認
psql $DATABASE_URL -c "\dt manga_*"
psql $DATABASE_URL -c "\dt character_bibles"
psql $DATABASE_URL -c "\dt location_bibles"
psql $DATABASE_URL -c "\dt costume_states"
psql $DATABASE_URL -c "\dt props"
psql $DATABASE_URL -c "\dt assets"

# 型定義のtsc通過
npx tsc --noEmit -p tsconfig.json
```

### Phase 1 (MVP) 完了確認

```bash
# 1. 既存IPから1作品選んで聖書ビルド
npx tsx scripts/manga/build-bible.ts --work-id=<選定IP>
# 期待: character_bibles 3-5件、location_bibles 5-10件、costume_states 5件以上が生成される

# 2. ショットリスト生成（章1-3）
npx tsx scripts/manga/generate-shotlist.ts --work-id=<選定IP> --episodes=1,2,3
# 期待: shotlists テーブルに3件、各エピソード30-50パネル分のJSON
# 検証: 1コマ最大2キャラルールが反映されているか

# 3. パネル生成（並列度10、gpt-image-1.5）
npx tsx scripts/manga/generate-panels.ts --episode-ids=<3エピソードのID>
# 期待: assets テーブルに約100件、manga_panels に紐付けされた状態

# 4. 簡易CV検査（CLIP+属性のみ）
npx tsx scripts/manga/inspect-panels.ts --episode-ids=<同上>
# 期待: qa_logs に各パネルの検査結果、pass/warn/failの分布が出る

# 5. QA console で人間レビュー
# ブラウザで http://localhost:3000/admin/manga/qa を開き、warn/fail を全て pass か reroll で処理
# 計測: QA差し戻し率、平均レビュー時間/パネル

# 6. 自社サイト用WebP生成
npx tsx scripts/manga/build-self-package.ts --episode-ids=<同上>
# 期待: publish_packages テーブルに3件、R2にWebPストリーミング用ファイル

# 7. 自社サイトで動作確認
npm run dev
# ブラウザで http://localhost:3000/manga/<work_slug>/1 を開き、縦スクロールで読めることを確認
# 完読率/離脱位置の自前計測が PostHog に記録されることを確認

# 8. 出口条件チェックリスト（Codex指摘で改訂）
# □ 1作品×3話が自社サイトで読める
# □ 全パネルで「同一人物として識別可能」（人間レビュー）
# □ 全パネルで「読めるセリフ」（OCR検査pass）
# □ 第3話末で「次が読みたい引き」（内部レビュー）
# □ 制作時間が記録されている（1話あたり工数の実測値）
# □ リロール率が計測されている
# □ QA差し戻し率が計測されている
# □ PostHog に完読率/離脱位置データが記録されている
```

### Phase 2 完了確認（参考）

```bash
# 手動投稿パッケージ生成（Phase 2で実装）
npx tsx scripts/manga/build-publish-package.ts --platform=webtoon_canvas
npx tsx scripts/manga/build-publish-package.ts --platform=pixiv
# 生成されたZIP/単一PNG/説明文を人間が手動投稿
# 規約遵守チェック: AI明示文言、利用ガイドライン適合

# 14日後 KPI 集計（Creator Dashboard CSV取り込み）
npx tsx scripts/manga/collect-kpi.ts --episode-ids=<対象>
# 期待: manga_kpi に各プラットフォームの views/completion/next_ep が記録

# 出口条件
# □ 完読率 > 40%
# □ 2話遷移率 > 25%
# □ お気に入り率 > 3%
```

