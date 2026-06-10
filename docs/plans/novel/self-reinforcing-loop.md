# 自己強化学習ループ 全自動実装計画

## Context

AI小説プラットフォームAINAROに「生成→配信→計測→分析→適応→生成」の全自動ループを実装する。読者行動データからパターンを自動発見し、生成パイプラインに自動反映することで、コンテンツ品質が自律的に向上し続けるエコシステムを構築する。

既存基盤は充実している（reading_events計測、A/Bテスト基盤、統計API、特徴量抽出スクリプト、生成パイプライン）。欠けているのは「これらを自動で接続するピース」。

## 実装ステップ

### Step 1: DBマイグレーション（3テーブル追加）

**ファイル**: `supabase/migrations/20260406_self_reinforcing_loop.sql`

```sql
-- 1. episode_signals: エピソード品質シグナル（日次自動算出）
CREATE TABLE episode_signals (
  episode_id UUID PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  novel_id UUID NOT NULL REFERENCES novels(id),
  completion_rate REAL,
  next_transition_rate REAL,
  avg_reading_time_ratio REAL,
  drop_cliff_position REAL,
  engagement_curve REAL[],
  bookmark_rate REAL,
  sample_size INT DEFAULT 0,
  quality_signal REAL,  -- 0-100 加重合成
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. discovered_patterns: 発見パターン
CREATE TABLE discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding TEXT NOT NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('positive','negative','conditional')),
  genre TEXT,
  confidence TEXT DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  sample_size INT NOT NULL,
  actionable_rule TEXT,
  status TEXT DEFAULT 'hypothesis' CHECK (status IN ('hypothesis','testing','confirmed','rejected','retired')),
  ab_test_id UUID,
  promoted_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. episode_generation_meta: 生成トレーサビリティ
CREATE TABLE episode_generation_meta (
  episode_id UUID PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
  model_version TEXT,
  applied_patterns TEXT[] DEFAULT '{}',
  is_exploration BOOLEAN DEFAULT FALSE,
  experiment_id UUID,
  variant TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- quality_signal算出SQL関数
CREATE OR REPLACE FUNCTION compute_episode_signals(min_sample INT DEFAULT 10)
RETURNS void ...
-- reading_eventsから集計 → episode_signalsにUPSERT
-- quality_signal = completion_rate*40 + next_transition_rate*30 + bookmark_rate*15 + reading_time_ratio*10 + (1-early_drop)*5
```

### Step 2: 特徴量抽出のlib化

**ファイル**: `src/lib/features.ts`
- `scripts/self-learning-loop.ts` の `extractExtendedFeatures()` をそのまま移植
- 25種の構造的特徴量（文長CV、対話率、感情密度、冒頭長、引きの強度等）
- 既存の `ExtendedFeatures` 型もここに定義

**ファイル**: `src/lib/statistics.ts`
- `spearmanCorrelation()` を `scripts/self-learning-loop.ts` から移植
- `chiSquareTest()` を新規追加（A/Bテスト判定用）

### Step 3: Cronエンドポイント（5本）

全て `src/app/api/cron/` 配下。CRON_SECRET認証付き。

#### 3a. 日次: `daily-aggregate/route.ts`
- `aggregate_and_log()` SQL関数を呼ぶ（既存）
- 既存の `admin/stats/route.ts` の `aggregateEvents()` ロジックを流用

#### 3b. 日次: `compute-signals/route.ts`
- 全エピソードのreading_eventsを集計
- `episode_signals` にUPSERT
- quality_signal加重合成: completion_rate(40%) + next_rate(30%) + bookmark(15%) + time_ratio(10%) + early_drop(5%)

#### 3c. 週次: `extract-patterns/route.ts`
- `episode_signals` の上位20%/下位20%を取得
- 各エピソード本文の特徴量を `extractExtendedFeatures()` で算出
- 統計的差分（上位群vs下位群）を計算
- Claude APIで構造的パターンをLLM分析（上位5本/下位5本の本文比較）
- `discovered_patterns` にINSERT（status='hypothesis'）

#### 3d. 週次: `judge-ab-tests/route.ts`
- running中の `ab_tests` を取得
- バリアント別のreading_events集計（既存の集計ロジック流用）
- カイ二乗検定で有意差判定（p<0.05）
- 勝者 → `discovered_patterns.status='confirmed'`
- 敗者 → `'rejected'`

#### 3e. 週次: `update-patterns/route.ts`
- `discovered_patterns` から confirmed & 未昇格 を取得
- `content/style/learned_patterns.md` に全ジャンル共通パターン追記
- `content/style/genre_specific/{genre}_patterns.md` にジャンル別追記
- negative → `content/style/anti_patterns.md` に追記
- `promoted_at` を更新

### Step 4: パターン抽出エンジン

**ファイル**: `src/lib/agents/pattern-extraction/analyzer.ts`
- 既存の `popularity-evaluation/analyzer.ts` と同じパターンで実装
- 入力: 高スコアエピソード群 / 低スコアエピソード群
- 処理: 特徴量差分の統計分析 + Claude APIによるLLM構造分析
- 出力: `PatternExtractionResult` （発見パターン配列 + メタデータ）

### Step 5: A/Bテスト自動設計

**ファイル**: `src/lib/agents/ab-test-designer/designer.ts`
- `discovered_patterns` から hypothesis のパターンを取得
- A/Bテスト設計を自動生成（コントロール vs パターン適用）
- 既存の `POST /admin/ab-tests` API を呼んでテスト作成
- パターンの `status` を `'testing'` に更新

### Step 6: generate.md への L6/L7 統合

**変更ファイル**: `.claude/commands/generate.md`

Step 2 のコンテキスト階層に追加:
```
L6: 学習パターン（予備2KBを使用）
  - content/style/learned_patterns.md
  - content/style/genre_specific/{genre}_patterns.md
  - content/style/anti_patterns.md

L7: 実験指示（A/Bテスト参加時のみ）
  - 実験ID、バリアント指定、検証対象パターン

探索枠: 20%の確率でL6をスキップ（anti_patternsは常に適用）
```

Step 6 に追加:
- `episode_generation_meta` への記録（applied_patterns, is_exploration, experiment_id）

### Step 7: 初期パターンファイル作成

- `content/style/learned_patterns.md` — 空テンプレ（ヘッダ + フォーマット説明）
- `content/style/anti_patterns.md` — 空テンプレ
- `content/style/genre_specific/` — ディレクトリ作成

### Step 8: 管理画面拡張

#### 8a. `src/app/admin/learning-loop/page.tsx`
- quality_signal推移グラフ（週次平均）
- 探索枠 vs 通常枠の比較
- ループ状態サマリー（最終実行日時、発見パターン数、テスト中数）

#### 8b. `src/app/admin/patterns/page.tsx`
- discovered_patterns 一覧（ステータスフィルタ）
- パターン詳細表示
- 手動ステータス変更ボタン

#### 8c. API: `src/app/api/admin/learning-loop/route.ts`, `src/app/api/admin/patterns/route.ts`, `src/app/api/admin/patterns/[id]/route.ts`

#### 8d. admin/layout.tsx にナビ追加（「学習ループ」「パターン」）

### Step 9: vercel.json Cron設定

```json
{
  "crons": [
    { "path": "/api/cron/daily-aggregate", "schedule": "0 3 * * *" },
    { "path": "/api/cron/compute-signals", "schedule": "0 4 * * *" },
    { "path": "/api/cron/extract-patterns", "schedule": "0 5 * * 0" },
    { "path": "/api/cron/judge-ab-tests", "schedule": "0 6 * * 0" },
    { "path": "/api/cron/update-patterns", "schedule": "0 7 * * 0" }
  ]
}
```

### Step 10: 型定義・共通ユーティリティ

**変更ファイル**: `src/types/agents.ts` — PatternExtractionResult, ABTestDesign 等の型追加
**新規ファイル**: `src/types/learning-loop.ts` — EpisodeSignal, DiscoveredPattern, EpisodeGenerationMeta 型

## 重要ファイル一覧

| ファイル | 操作 | 用途 |
|---|---|---|
| `supabase/migrations/20260406_self_reinforcing_loop.sql` | 新規 | 3テーブル + 算出関数 |
| `src/lib/features.ts` | 新規 | extractExtendedFeatures() 移植 |
| `src/lib/statistics.ts` | 新規 | spearman, chiSquare |
| `src/types/learning-loop.ts` | 新規 | ループ関連型定義 |
| `src/app/api/cron/daily-aggregate/route.ts` | 新規 | 日次集計 |
| `src/app/api/cron/compute-signals/route.ts` | 新規 | 品質シグナル算出 |
| `src/app/api/cron/extract-patterns/route.ts` | 新規 | パターン抽出 |
| `src/app/api/cron/judge-ab-tests/route.ts` | 新規 | A/Bテスト判定 |
| `src/app/api/cron/update-patterns/route.ts` | 新規 | パターンファイル更新 |
| `src/lib/agents/pattern-extraction/analyzer.ts` | 新規 | 抽出ロジック |
| `src/lib/agents/ab-test-designer/designer.ts` | 新規 | テスト自動設計 |
| `src/app/admin/learning-loop/page.tsx` | 新規 | ダッシュボード |
| `src/app/admin/patterns/page.tsx` | 新規 | パターン管理 |
| `src/app/api/admin/learning-loop/route.ts` | 新規 | ループ統計API |
| `src/app/api/admin/patterns/route.ts` | 新規 | パターンCRUD |
| `content/style/learned_patterns.md` | 新規 | 自動更新パターン |
| `content/style/anti_patterns.md` | 新規 | 自動更新NGパターン |
| `src/vercel.json` | 新規 | Cron設定 |
| `.claude/commands/generate.md` | 変更 | L6/L7追加 |
| `src/app/admin/layout.tsx` | 変更 | ナビ追加 |

## 検証方法

1. マイグレーションを Supabase に適用し、テーブル作成を確認
2. 各Cronエンドポイントを `curl` で手動実行（CRON_SECRET付き）
3. compute-signals → episode_signals にデータが入ることを確認
4. extract-patterns → discovered_patterns にパターンが生成されることを確認
5. update-patterns → learned_patterns.md が更新されることを確認
6. `npx next build` でビルドが通ることを確認
7. 管理画面で学習ループダッシュボード・パターン一覧が表示されることを確認
