# 縦読み漫画パイプライン アーキテクチャ

> 対応プラン: `~/.claude/plans/codex-encapsulated-knuth.md`
> 対応マイグレーション: `supabase/migrations/20260501000000_manga_pipeline.sql`
> 対応型定義: `src/lib/manga/types.ts`, `src/lib/manga/schemas.ts`

## 1. 位置づけ

AINARO の小説IPを縦読み漫画として二次展開するためのパイプライン。EXIT戦略上、Year2 に予定していた漫画ピボットを **2026年内に最小パイプラインを稼働** させる方針に転換した結果。

このドキュメントは Phase 0 アーキテクチャを定義する正典。Phase 1 の実装はこの設計に従う。

## 2. 設計原則（Codex 3度のレビューを反映）

1. **連載CMSファースト** — 生成パイプラインは1コンポーネント。中核は権利/規約/編集ワークフロー/版管理/KPI
2. **聖書（Bible）駆動** — キャラ・ロケ・衣装・小物・関係を構造化資産として最初に固める
3. **画像モデルは作品単位で主モデル固定** — 本編混在禁止、サブはref画像生成と背景素材のみ
4. **検査は合議制** — ArcFace単独禁止、CLIP+属性のMVP→Phase 2でDINOv2/ArcFace追加→Phase 3でLoRA
5. **投稿は規約遵守** — Playwright自動投稿は永久不採用、手動投稿用パッケージを自動生成
6. **段階スケール** — 各Phase出口条件をKPIで明示、満たなければ次Phaseに進まない
7. **既存資産流用** — Phase1パイプライン/ヒット予測v12/anchor pool v1を最大活用

## 3. 11層アーキテクチャ

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 0: 漫画化適性スクリーニング                                │
│   既存 predictions_v12 + 漫画特化特徴量 → manga_aptitude_score │
│   入力: 小説IP / 出力: 優先順位付きキャンディデート               │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 1: 構造化層                                              │
│   scene-splitter / shotlist-generator                          │
│   character-bible-builder / location-bible-builder             │
│   costume-timeline / props-tracker / character-graph           │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 2: 権利・規約層                                          │
│   AI利用可否 / 商用可否 / プラットフォーム別NG表現               │
│   レーティングエンジン / 権利帰属台帳 / プロンプト監査ログ        │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 3: 生成層                                                │
│   panel-generator (gpt-image-1.5 主、Flux Pro 写実サブ)         │
│   reroll-orchestrator / asset-version-manager                  │
│   ※ LoRA/SDXL自前は Phase 3 以降の併用オプション                 │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 4: 検証層                                                │
│   cv-inspector (CLIP + 属性のMVP、Phase 2でDINOv2/ArcFace追加)  │
│   consistency-checker / regulation-checker                     │
│   hand-finger-checker / text-garbage-detector                  │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: 合成層                                                │
│   bubble-placer (MVPは候補矩形+スコアリング、SAT solverは将来)   │
│   typesetter / panel-assembler / format-adapter                │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 6: 編集運用層                                            │
│   qa-console (人間レビュー/差し戻し/承認)                        │
│   publish-scheduler / version-history / revision-management    │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 7: ローカライズ層 (Phase 4)                              │
│   translation / typesetting-replacement / bubble-relayout      │
│   glossary / character-tone / cultural-hook-adapter            │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 8: 配信層                                                │
│   self-host-publisher (Phase 1 のみ自社限定)                    │
│   manual-publish-package-generator (Phase 2 で WEBTOON/pixiv)   │
│   sns-shorts-generator (Phase 2 で ffmpeg)                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 9: 実験管理層 (Phase 3)                                  │
│   cover-ab / title-ab / opening-ab / sns-thumbnail-ab           │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 10: 計測層                                               │
│   kpi-collector / hit-predictor-v2 (漫画版)                     │
│   data-warehouse / dashboard                                   │
└──────────────────────────────────────────────────────────────┘
```

## 4. データフロー（Phase 1 MVP）

```
┌────────────────────┐
│ novels (既存)        │ ─── Layer 0 漫画化適性 ──▶ manga_works.manga_aptitude_score
│ episodes (既存)      │
└────────────────────┘
          ↓
┌────────────────────┐
│ Layer 1 構造化       │
│  ・extract-world-facts (既存スキル流用)
│  ・scene-splitter
│  ・shotlist-generator
│  ・character-bible-builder
│  ・location-bible-builder
│  ・costume-timeline
│  ・props-tracker
│  ・character-graph
└────────────────────┘
          ↓ DB
character_bibles / costume_states / location_bibles / props /
character_relations / shotlists
          ↓
┌────────────────────┐
│ Layer 3 生成        │
│  ・gpt-image-1.5 主モデル
│  ・reference image を聖書から注入
│  ・1コマ最大2キャラ制約
│  ・assets テーブルで版管理
└────────────────────┘
          ↓ DB
manga_panels / panel_characters / assets
          ↓
┌────────────────────┐
│ Layer 4 検査        │
│  ・CLIP 類似度 (主)
│  ・属性分類器
│  ・手指 (Mediapipe Hands)
│  ・OCR文字化け検査
└────────────────────┘
          ↓ DB
qa_logs (decision: pass/warn/reroll/manual_review)
          ↓
┌────────────────────┐
│ Layer 6 編集運用     │
│  ・qa-console
│  ・ワンクリックリロール
│  ・人間承認/差し戻し
└────────────────────┘
          ↓ DB
manga_panels.qa_status (pass)
          ↓
┌────────────────────┐
│ Layer 5 合成        │
│  ・bubbles 配置
│  ・縦結合 WebP 出力
└────────────────────┘
          ↓ DB
bubbles / publish_packages (platform=self)
          ↓
┌────────────────────┐
│ Layer 8 配信 (自社のみ)
│  ・WebPストリーミング
│  ・PostHog 計測埋込
└────────────────────┘
          ↓
┌────────────────────┐
│ Layer 10 計測       │
│  ・完読率/離脱位置/2話遷移率
└────────────────────┘
          ↓ DB
manga_kpi
          ↓
[漫画化適性モデル v1 の訓練データに供給]
```

## 5. データモデル概観

主要テーブル（詳細は SQL マイグレーション参照）:

| テーブル | 役割 | Phase |
|---------|------|-------|
| `manga_works` | 作品マスタ。novels への二次展開 | Phase 0 |
| `manga_episodes` | エピソード。既存 episodes へ任意リンク | Phase 0 |
| `manga_panels` | パネル本体。生成画像本体は assets へ分離 | Phase 0 |
| `panel_characters` | パネル登場キャラの正規化（多対多） | Phase 0 |
| `assets` | 画像/動画/パッケージの版管理 | Phase 0 |
| `character_bibles` | キャラ聖書（CV検査用埋め込み込み） | Phase 0 |
| `costume_states` | 衣装タイムライン | Phase 0 |
| `location_bibles` | ロケーション聖書 | Phase 0 |
| `props` | 小物・持ち物の所有履歴 | Phase 0 |
| `character_relations` | キャラ関係グラフ | Phase 0 |
| `shotlists` | ショットリスト | Phase 0 |
| `bubbles` | 吹き出し | Phase 0 |
| `manga_kpi` | KPI 集計 | Phase 0 |
| `qa_logs` | 合議CV検査ログ | Phase 0 |
| `publish_packages` | 手動投稿パッケージ | Phase 0 |

## 6. 主モデル戦略（Codex 最終指摘）

### Phase 1 MVP
- **主モデル: `gpt-image-1.5`** (OpenAI公式 docs で 2026年4月時点に提供されているモデル名)
- 主モデルは **作品単位で固定**、本編混在は禁止
- reference image は character_bibles / location_bibles から注入
- **1コマ最大2キャラ制約** (3人以上は遠景/シルエット/分割コマ)

### Phase 3 以降
- Flux Pro Ultra: 写実シーン・複雑構図のサブ
- SDXL自前ホスト + IP-Adapter + アニメ特化LoRA: 月100話超のスケール期コスト圧縮
- 主要キャラ LoRA 訓練: 一貫性の最終手段

### 永久不採用
- NovelAI サブスク並列運用 (規約上グレー)
- Playwright 自動投稿 (規約違反)
- スクレイピングによる外部KPI取得 (規約違反)

## 7. CV検査合議制の段階展開

```
Phase 1 MVP:
  CLIP 類似度 ───────┐
  属性分類器 ────────┼──▶ pass / warn / fail (3段階)
  手指検出 ──────────┤
  OCR文字化け ───────┘

Phase 2:
  + DINOv2 類似度
  + ArcFace 顔同定 (warn 補助扱い、漫画顔では弱いため最後)

Phase 3 以降:
  + キャラ別小型分類器 (人間QAラベルから訓練)
  + 衣装・髪色・髪型属性分類器
  + 構図品質・カメラ整合性チェック
```

閾値はキャラごとの分布から動的決定。固定閾値は使わない（Codex指摘）。

## 8. 配信プラットフォーム戦略

| プラットフォーム | Phase | 投稿方式 |
|--------------|------|---------|
| 自社サイト (novelis.tokyo) | Phase 1 | Supabase + R2 直接 |
| WEBTOON CANVAS | Phase 2 | パッケージ自動生成 + 手動投稿 |
| pixiv コミック | Phase 2 | 公式API + AI明示 |
| LINE マンガ インディーズ | Phase 2 | 手動投稿 |
| YouTube Shorts / TikTok / Reels | Phase 2 | ffmpeg + 手動投稿 |
| ピッコマ INDIES / comico PLUS / ジャンプルーキー | Phase 3 | 手動投稿 |

**重要**: 外部プラットフォームは「収益化先」ではなく「**発見チャネル**」。収益とデータは自社側に寄せる。

## 9. KPI と North Star

### Phase 1 (自社のみ)
- 1話完読率
- 離脱位置（パネル単位）
- 2話遷移率
- お気に入り率

### Phase 2 (外部も)
- + 各プラットフォーム別 view / completion / next_ep / bookmark
- + SNS動画CTR
- + 原作小説への逆流入率

### Phase 3 以降
- + 漫画化適性スコア vs 実測KPIの相関
- + 1有望IP発見コスト
- + ジャンル別ヒット率

主KPI（既存 CLAUDE.md に従う）: **月間完走者数** を漫画版 work_completions として実装する。

## 10. 既存資産との連携

| 既存資産 | 連携箇所 |
|---------|----------|
| novels / episodes (既存スキーマ) | manga_works.novel_id / manga_episodes.source_episode_id |
| Phase1パイプライン | 漫画化候補の優先選別 |
| ヒット予測v12 (`scripts/predict/predict-hit-v12.py`) | manga_aptitude_score の入力特徴量 |
| anchor pool v1 (`data/generation/anchors/`) | 漫画化適性の品質基準 |
| `extract-world-facts` スキル | location-bible-builder の前段 |
| `generate-cover` スキル | character-bible-builder の参考実装 |
| `validate-foreshadowing` スキル | shotlist のエピソード構成検証 |
| `audit-voices` スキル | bubbles のセリフ振り分け検証 |
| `pairwise-judge` スキル | 漫画版品質ペアワイズ評価 |
| `src/lib/cover/codex-image.ts` | gpt-image-1.5 アダプタの参考実装 |
| `src/lib/cover/prompt-builder.ts` | プロンプト組み立て構造の流用 |
| `update_updated_at()` 関数 (既存) | manga_works/episodes/panels の updated_at trigger に再利用 |

## 11. 後回しと永久不採用

### Phase 2 へ延期
- WEBTOON CANVAS / pixiv 投稿パッケージ正式版
- SNS動画化（ffmpeg）
- DINOv2 / ArcFace 追加合議
- 外部プラットフォームKPI収集（CSV/許可された範囲のみ）

### Phase 3 以降
- 主要キャラ LoRA 訓練
- 実験管理層 A/B 基盤
- 顔差し替え inpaint/edit フロー

### Phase 4 以降
- ローカライズ層
- 完全自動規約判定（人間レビューで補完）

### 永久不採用
- Playwright 自動投稿（規約違反・BANリスク）
- スクレイピングによる外部KPI取得

### 将来検討（要件成熟次第）
- SAT solver 吹き出し配置
- World Model 統合（2027年以降）
- 複数モデル高度fallback

## 12. リスクと対策

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

## 13. Verification

### Phase 0 完了確認

```bash
# 1. DBマイグレーション適用（本番反映前にローカル/preview で確認）
psql $DATABASE_URL -f supabase/migrations/20260501000000_manga_pipeline.sql

# 2. テーブル作成確認
psql $DATABASE_URL -c "\dt manga_*"
psql $DATABASE_URL -c "\dt character_bibles"
psql $DATABASE_URL -c "\dt location_bibles"
psql $DATABASE_URL -c "\dt costume_states"
psql $DATABASE_URL -c "\dt props"
psql $DATABASE_URL -c "\dt assets"

# 3. 型定義のtsc通過
npx tsc --noEmit
```

### Phase 1 完了確認

`~/.claude/plans/codex-encapsulated-knuth.md` の Verification セクション参照。
