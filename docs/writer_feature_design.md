# 作家投稿機能 機能設計書

## Context

Novelisは現在Phase 0（自社AI制作コンテンツのみ）。Phase 1から作家投稿UIを先行準備し、Phase 2で外部作家に開放する方針に変更された。既存DBには `author_type`, `author_id` カラムが準備済み。admin画面の作品・エピソードCRUDが稼働中。

**最上位原則**: 読者にとっての面白さ最大化。無審査での大量投稿禁止。面白さは審査しない（読者データが判定）。審査は品質最低ラインのみ。

---

## 1. 作家アカウント・認証

### テーブル: `user_profiles`
```sql
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY,           -- auth.users.id
  display_name TEXT NOT NULL,          -- ペンネーム
  bio TEXT,                             -- 自己紹介
  avatar_url TEXT,                      -- プロフィール画像
  role TEXT NOT NULL DEFAULT 'reader'   -- 'reader' / 'writer' / 'admin'
    CHECK (role IN ('reader', 'writer', 'admin')),
  writer_status TEXT DEFAULT 'none'     -- 'none' / 'applied' / 'approved' / 'suspended'
    CHECK (writer_status IN ('none', 'applied', 'approved', 'suspended')),
  writer_applied_at TIMESTAMPTZ,
  writer_approved_at TIMESTAMPTZ,
  stripe_connect_id TEXT,               -- Phase 2
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 作家昇格フロー
- **Phase 1から**: セルフサービス。条件（メール認証済み+利用規約同意）で即日writer昇格
- Phase 1は審査なし（draft→published直接遷移）なので、登録のハードルを下げて作家プールを早期に構築

### 認証拡張（auth.ts）
- `getUserProfile()`, `isWriter()`, `requireWriter()`, `requireWriterApi()` を追加
- middleware: `/dashboard` 配下は writer or admin のみ

### 画面
| URL | 内容 |
|-----|------|
| `/write/apply` | 作家登録（ペンネーム入力、利用規約同意→即昇格） |
| `/mypage/profile` | プロフィール編集 |
| `/admin/writers` | 作家一覧・管理（停止等） |

---

## 2. 作品・エピソード管理

### DB変更: episodes.status 追加
```sql
ALTER TABLE episodes ADD COLUMN status TEXT NOT NULL DEFAULT 'published'
  CHECK (status IN ('draft', 'pending_review', 'revision_requested', 'scheduled', 'published'));
ALTER TABLE episodes ADD COLUMN scheduled_at TIMESTAMPTZ;
```

### ステータス遷移

```
draft → pending_review → published          (承認)
                       → revision_requested  (改善示唆) → pending_review (再提出)
draft → scheduled → published (自動)
draft → published (自社制作は審査スキップ)
```

### 作家ダッシュボード `/dashboard`
- マイ作品一覧（ステータス、最新話数、読了率、PV）
- 「新しい作品を作る」ボタン

### 作品作成・編集 `/dashboard/novels/new`, `/dashboard/novels/[id]`
- 既存 `NovelEditForm.tsx` を流用
- `author_type` = `'external'` 固定, `author_id` = `auth.uid()` 自動セット
- `slug` は自動生成（作家は変更不可）

### エピソード執筆 `/dashboard/novels/[id]/episodes/new`, `…/[episodeId]`
- 既存 `EpisodeEditForm.tsx` を流用
- Markdownエディタ + プレビュー（右ペイン）
- 自動保存（30秒、draft）
- ボタン: 「下書き保存」「審査に提出」「予約公開設定」

### admin画面との棲み分け
- admin: 全作品操作可、審査操作可、サイト設定
- 作家: 自分の作品のみ、提出・再提出のみ

### API設計（/api/writer/）
| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/writer/apply` | 作家申請 |
| GET/PUT | `/api/writer/profile` | プロフィール |
| GET/POST | `/api/writer/novels` | 作品一覧/作成 |
| PUT/DELETE | `/api/writer/novels/[id]` | 作品更新/削除 |
| GET/POST | `/api/writer/novels/[id]/episodes` | エピソード一覧/作成 |
| PUT | `/api/writer/novels/[id]/episodes/[episodeId]` | エピソード更新 |
| POST | `/api/writer/novels/[id]/episodes/[episodeId]/submit` | 審査提出 |

全APIは `requireWriterApi()` + `author_id === auth.uid()` でガード。

---

## 3. 審査・品質管理フロー

### テーブル: `episode_reviews`
```sql
CREATE TABLE episode_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'revision_requested')),
  feedback_summary TEXT,
  feedback_details JSONB,    -- { categories: [{ type, severity, description, line_range? }], overall_comment }
  auto_check_results JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 自動チェック（提出時）

**ブロッキング（提出不可）**:
- 文字数: 1,000〜50,000文字
- 禁止表現（差別的表現、個人情報、犯罪教唆）
- 同一文の過剰繰り返し

**参考情報（審査者に提供）**:
- 類似度チェック（既存作品との比較）
- AI検出（既存 `/api/agents/ai-detection` 流用、ブロックしない）
- 校正（既存 `/api/agents/proofreading` 流用）
- 可読性スコア

### 人間審査の基準
- 日本語として読める最低ライン
- 前話との整合性
- レーティングの正確性
- **面白いかどうかは審査しない。面白さは読者データが判定する**

### 改善示唆
- カテゴリ別（grammar / consistency / readability / guideline）
- 重要度（must_fix / suggestion）
- 該当箇所のインライン表示

### admin審査画面 `/admin/reviews`
- 審査キュー（提出順）
- 左: 本文、右: 自動チェック結果
- 「承認」「改善示唆を付けて返却」

---

## 4. 作家向けデータダッシュボード

### `/dashboard/analytics` — サマリー
| 指標 | データソース |
|------|------------|
| PV | `daily_stats.pv` SUM |
| ユニーク読者 | `daily_stats.unique_users` SUM |
| 平均読了率（最重要、大きく表示） | `episode_signals.completion_rate` AVG |
| 平均次話遷移率 | `daily_stats.next_episode_rate` AVG |
| フォロワー数 | `novel_follow_counts` ビュー |

### `/dashboard/novels/[id]/analytics` — 作品別
- エピソード別読了率の推移グラフ
- 章→章リテンションファネル（`episode_retention_funnel` ビュー）
- スクロール離脱ヒートマップ（`episode_scroll_heatmap` ビュー）
- いいね・コメント推移

生データ（reading_events）は非公開。集計値のみ提供。

---

## 5. 収益・還元システム

### テーブル: `writer_earnings`（月次）, `daily_revenue_attribution`（日次）

### 90%還元の按分ロジック
1. **広告収入**: 月間広告総額 × (作品PV / 全作品PV) × 0.9
2. **サブスク収入**: 月間サブスク総額 × (作品読了時間 / 全作品読了時間) × 0.9
3. **ポイント消費**: 該当エピソードへのポイント消費額 × 0.9

### 振込
- 月末締め → 翌月10日確定 → 翌月末振込
- 最低振込額: 1,000円（未満繰越）
- Stripe Connect経由

### 画面 `/dashboard/earnings`
- 月次収益リスト、内訳グラフ、振込ステータス、累計収益

---

## 6. Phase分割

### Phase 1（先行準備）— 優先度順

**A: 必須**
1. `user_profiles` テーブル + ロール管理基盤
2. 認証拡張（isWriter, requireWriter）
3. middleware: /dashboard ガード
4. 作家セルフサービス登録（条件: メール認証+規約同意→即日昇格）
5. 作家ダッシュボード骨格
6. 作品作成・編集（writer向けAPI・フォーム）
7. エピソード執筆（draft→published直接、審査なし）
8. episodes.status カラム追加

**B: Phase 1後半**
9. 作家向けデータダッシュボード（読了率・PV）
10. admin: 作家一覧・管理画面
11. 作家公開プロフィール `/author/[userId]`

### Phase 2（本実装）— 優先度順

**A: Phase 2初期**
1. 審査ワークフロー全体（pending_review, revision_requested）
2. admin審査画面
3. 自動品質チェック
4. 改善示唆返却UI
5. 予約公開機能

**B: Phase 2中期**
7. 収益計算バッチ
8. Stripe Connect連携
9. 収益ダッシュボード
10. データダッシュボード拡充（ファネル、ヒートマップ）

**C: Phase 2後期**
11. AI支援ツール（エディタ内プロット提案・校正）
12. 作家間コミュニティ
13. 収益公開レポート自動生成

---

## ビジネスルール

1. 1アカウント1ペンネーム（Phase 3で複数検討）
2. 作家は自分の作品のみ操作可能
3. 公開済みエピソードの削除不可（非公開変更のみ）
4. ペンネーム変更は既存作品のauthor_nameに反映しない
5. 自社制作 vs 外部作品でランキング・レコメンドの差別なし
6. 面白さは審査しない（品質最低ラインのみ）

---

## 主要ファイル

| ファイル | 変更内容 |
|---------|---------|
| `supabase/schema.sql` | user_profiles, episode_reviews, writer_earnings テーブル追加 |
| `src/lib/supabase/auth.ts` | isWriter(), requireWriter() 追加 |
| `src/middleware.ts` | /dashboard ガード追加 |
| `src/app/[locale]/dashboard/` | 作家ダッシュボード（新規） |
| `src/app/api/writer/` | 作家向けAPI群（新規） |
| `src/app/admin/novels/[id]/NovelEditForm.tsx` | 作家向けフォームのベース |
| `src/types/novel.ts` | Episode.status, UserProfile型 追加 |
