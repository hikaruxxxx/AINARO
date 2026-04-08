# AIネイティブ小説プラットフォーム — Web設計仕様書

**Claude Code実装用 — Phase 0-1 MVP**

---

## 1. プロジェクト概要

### 1.1 コンセプト
AIで制作した小説を配信するWebメディアサイト。Phase 0-1では自社制作コンテンツのみ。Phase 2以降で外部作家の投稿機能を追加する。

### 1.2 技術スタック

| 領域 | 技術 | 理由 |
|------|------|------|
| フレームワーク | Next.js 15 (App Router) | SSG/ISRで高速配信。SEO最適化。Vercelとの親和性 |
| 言語 | TypeScript | 型安全性。1人開発での保守性 |
| スタイリング | Tailwind CSS 4 | ユーティリティファースト。レスポンシブ対応が高速 |
| DB | Supabase (PostgreSQL) | 無料枠あり。認証・Realtime・Storage込み。自前DB運用不要 |
| 認証 | Supabase Auth | メール＋Google OAuth。追加実装不要 |
| 決済 | Stripe（Phase 1後半〜） | Web直接決済。手数料3.6%。アプリストア回避 |
| ホスティング | Vercel | Next.jsとの最適統合。無料枠で開始可能 |
| 広告 | Google AdSense → 将来的にGAM | 初期はAdSense。トラフィック増加後にHeader Biddingへ移行 |
| 分析 | Google Analytics 4 + カスタムイベント | 読者行動データ収集の基盤 |
| CMS（記事管理） | Supabase上に自作 | 外部CMS不要。管理画面を自作し、小説データを直接DB管理 |
| エディタ | 管理画面内にMarkdownエディタ | 小説本文はMarkdown形式で保存。表示時にHTMLレンダリング |

### 1.3 対応デバイス
モバイルファースト設計。ブレークポイントは以下の通り。
- sm: 640px（スマートフォン横向き）
- md: 768px（タブレット）
- lg: 1024px（PC）

---

## 2. データベース設計

### 2.1 テーブル定義

```sql
-- ユーザー（Supabase Authと連携）
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'ゲスト読者',
  avatar_url TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 小説（作品）
CREATE TABLE novels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,                    -- URLスラッグ: "akuyaku-reijou-tensei"
  title TEXT NOT NULL,
  tagline TEXT,                                 -- キャッチコピー（1行）
  synopsis TEXT,                                -- あらすじ（200-400字）
  cover_image_url TEXT,                         -- 表紙画像URL
  author_type TEXT NOT NULL DEFAULT 'self',     -- 'self'（自社制作）/ 'external'（外部作家）
  author_id UUID REFERENCES profiles(id),       -- 外部作家の場合のみ。自社制作はNULL
  author_name TEXT NOT NULL DEFAULT '編集部',   -- 表示用著者名
  genre TEXT NOT NULL,                          -- ジャンル: 'fantasy', 'romance', 'horror', etc.
  tags TEXT[] DEFAULT '{}',                     -- タグ: ['悪役令嬢', '溺愛', '転生']
  status TEXT NOT NULL DEFAULT 'serial',        -- 'serial'（連載中）/ 'complete'（完結）/ 'hiatus'（休止）
  is_r18 BOOLEAN DEFAULT FALSE,
  total_chapters INTEGER DEFAULT 0,
  total_characters INTEGER DEFAULT 0,           -- 総文字数
  total_pv BIGINT DEFAULT 0,
  total_bookmarks INTEGER DEFAULT 0,
  latest_chapter_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- エピソード（話）
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,                          -- "第1話 追放された令嬢の決意"
  body_md TEXT NOT NULL,                        -- 本文（Markdown）
  body_html TEXT,                               -- レンダリング済みHTML（ビルド時生成）
  character_count INTEGER NOT NULL DEFAULT 0,   -- 文字数
  is_free BOOLEAN DEFAULT TRUE,                 -- 無料公開 / 課金限定
  pv BIGINT DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(novel_id, episode_number)
);

-- ブックマーク（お気に入り）
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, novel_id)
);

-- 読書行動イベント（面白さの先行指標を計測）
-- North Star Metric「読者にとっての面白さ最大化」の根幹データ
CREATE TABLE reading_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- 未ログインはNULL
  session_id TEXT NOT NULL,                     -- 未ログインユーザーも追跡
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,                     -- 'start'（読み始め）, 'progress'（スクロール進行）,
                                                -- 'complete'（読了）, 'next'（次話遷移）,
                                                -- 'bookmark'（ブックマーク）, 'drop'（離脱）
  scroll_depth REAL,                            -- スクロール到達率（0.0-1.0）
  reading_time_sec INTEGER,                     -- 滞在時間（秒）
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 日次集計（面白さ先行指標 + PV）
-- reading_eventsから日次バッチで集計
CREATE TABLE daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  -- 結果指標
  pv INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  -- 面白さ先行指標
  completion_rate REAL,                         -- 読了率（complete / start）
  next_episode_rate REAL,                       -- 次話遷移率（next / complete）
  avg_read_duration_sec REAL,                   -- 平均滞在時間
  avg_scroll_depth REAL,                        -- 平均スクロール到達率
  bookmark_rate REAL,                           -- ブックマーク率（bookmark / unique_users）
  drop_rate REAL,                               -- 離脱率（drop / start）
  UNIQUE(date, novel_id, episode_id)
);

-- ジャンルマスタ
CREATE TABLE genres (
  id TEXT PRIMARY KEY,                          -- 'fantasy', 'romance', etc.
  name TEXT NOT NULL,                           -- '異世界ファンタジー'
  sort_order INTEGER DEFAULT 0
);

-- お知らせ
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  is_pinned BOOLEAN DEFAULT FALSE
);

-- インデックス
CREATE INDEX idx_novels_genre ON novels(genre);
CREATE INDEX idx_novels_status ON novels(status);
CREATE INDEX idx_novels_published ON novels(published_at DESC);
CREATE INDEX idx_novels_pv ON novels(total_pv DESC);
CREATE INDEX idx_episodes_novel ON episodes(novel_id, episode_number);
CREATE INDEX idx_episodes_published ON episodes(published_at DESC);
CREATE INDEX idx_reading_events_user ON reading_events(user_id, created_at DESC);
CREATE INDEX idx_reading_events_novel ON reading_events(novel_id, created_at DESC);
CREATE INDEX idx_reading_events_episode ON reading_events(episode_id, event_type);
CREATE INDEX idx_reading_events_session ON reading_events(session_id, created_at);
CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX idx_daily_stats_date ON daily_stats(date, novel_id);
```

### 2.2 Supabase RLS（行レベルセキュリティ）

```sql
-- profiles: 本人のみ更新可。閲覧は全員可
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- novels, episodes: 閲覧は全員可。作成・更新は管理者のみ（Phase 0-1）
ALTER TABLE novels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Novels are viewable by everyone" ON novels FOR SELECT USING (true);
-- Phase 2で外部作家の投稿を許可する際にPOLICYを追加

-- bookmarks: 本人のみCRUD可
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bookmarks" ON bookmarks FOR ALL USING (auth.uid() = user_id);

-- reading_events: 挿入は全員可。閲覧は本人のみ
ALTER TABLE reading_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert reading events" ON reading_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Users view own events" ON reading_events FOR SELECT USING (auth.uid() = user_id);
```

---

## 3. ページ構成とルーティング

```
/                           → トップページ
/novels                     → 小説一覧（ジャンル・タグ絞り込み）
/novels/[slug]              → 小説詳細（あらすじ、目次、ブックマーク）
/novels/[slug]/[episodeNum] → エピソード閲覧（メイン読書画面）
/ranking                    → ランキング（PV順、ブックマーク順）
/new                        → 新着エピソード一覧
/genre/[genreId]            → ジャンル別一覧
/tag/[tagName]              → タグ別一覧
/mypage                     → マイページ（要ログイン。ブックマーク一覧、読書履歴）
/mypage/settings             → アカウント設定
/about                      → サイト概要
/terms                      → 利用規約
/privacy                    → プライバシーポリシー
/admin                      → 管理画面（認証必須。作品・エピソード管理）
/admin/novels               → 作品一覧・新規作成
/admin/novels/[id]/episodes → エピソード管理
/admin/stats                → アクセス統計ダッシュボード
```

---

## 4. 各ページの詳細設計

### 4.1 トップページ（`/`）

#### レイアウト
```
[ヘッダー（共通）]
[ヒーローセクション]
  - サイト名 + キャッチコピー
  - 「今すぐ読む」ボタン → 人気作品の第1話へ
[注目の作品（横スクロールカルーセル）]
  - 表紙画像 + タイトル + ジャンルタグ + 総話数
  - 3〜6作品。手動で「注目」フラグを立てたもの
[新着エピソード]
  - 直近24時間に公開されたエピソードのリスト
  - 作品名 / エピソードタイトル / 公開日時
  - 最大10件表示。「もっと見る」→ /new
[ジャンル別ピックアップ]
  - ジャンルごとに上位3作品を表示
  - ジャンル名をクリック → /genre/[genreId]
[ランキング（サイドバーまたはセクション）]
  - 週間PVランキング 上位10作品
  - タイトル + PV数 + ジャンルタグ
[フッター（共通）]
```

#### データ取得
ISR（Incremental Static Regeneration）で60秒ごとに再生成。DB負荷を最小化。

### 4.2 小説詳細ページ（`/novels/[slug]`）

#### レイアウト
```
[ヘッダー]
[作品ヘッダーセクション]
  - 表紙画像（左 or 上）
  - タイトル（h1）
  - キャッチコピー
  - 著者名 / ジャンル / タグ（クリッカブル）
  - ステータスバッジ（連載中 / 完結）
  - 統計: 総話数 / 総文字数 / 累計PV / ブックマーク数
  - ブックマークボタン（♡ トグル。要ログイン）
  - 「第1話から読む」ボタン / 「続きから読む」ボタン（読書履歴がある場合）
[あらすじセクション]
  - synopsis（折りたたみ可。200字以上は「続きを読む」で展開）
[目次セクション]
  - エピソード一覧（番号 / タイトル / 公開日 / 文字数）
  - 課金限定エピソードには鍵アイコン
  - 現在の読書位置をハイライト
[関連作品]
  - 同ジャンル・同タグの他作品を3件表示
[フッター]
```

#### SEO
title: `{作品タイトル} | サイト名`
description: `{キャッチコピー} {あらすじ冒頭100文字}`
OGP画像: 表紙画像

### 4.3 エピソード閲覧ページ（`/novels/[slug]/[episodeNum]`）

**これがサイトの最重要ページ。読者が最も長い時間を過ごす場所。**

#### レイアウト
```
[ミニマルヘッダー]
  - サイトロゴ（小）
  - 作品タイトル（リンク → 作品詳細）
  - エピソードタイトル
  - 目次ボタン（ドロワー展開）
[広告枠A（エピソード上部）]
  - 横長バナー（728x90 PC / 320x100 モバイル）
[本文エリア]
  - Markdownからレンダリングされた本文HTML
  - フォントサイズ: 16px（モバイル）/ 18px（PC）
  - 行間: 1.9em
  - 最大幅: 720px（中央寄せ）
  - 背景色: 白（ダークモード対応: #1a1a2e）
  - 読書設定ボタン（フォントサイズ変更、背景色変更）
[広告枠B（エピソード下部）]
  - 横長バナー
[ページナビゲーション]
  - 「← 前の話」「次の話 →」ボタン（大きく、タップしやすく）
  - 話数セレクター（ドロップダウン）
[コメント欄（Phase 1後半〜）]
  - 簡易コメント。ログインユーザーのみ投稿可
[フッター]
```

#### 読書体験の設計指針
- ページ遷移なしで「次の話」に進めること（プリフェッチ）
- スクロール位置の記憶（ブラウザバック時に復元）
- 広告は本文の上下のみ。本文途中には絶対に挿入しない
- ダークモード対応（目が疲れない配色）
- 読書中はヘッダーを自動非表示（スクロール下方向で隠す、上方向で表示）

#### 読者行動トラッキング（カスタムイベント）
GA4へのカスタムイベント送信に加え、同一イベントを`reading_events`テーブルにも記録する。
GA4は全体傾向の把握、`reading_events`は面白さ先行指標の作品別・エピソード別集計に使用。

```typescript
// ページ表示時（reading_events: event_type='start'）
trackEvent('episode_view', {
  novel_id, episode_id, episode_number,
  referrer, // どこから来たか
  is_logged_in,
  is_premium
});

// 30秒ごとに滞在時間を記録
trackEvent('reading_progress', {
  novel_id, episode_id,
  duration_sec,       // 累計滞在秒数
  scroll_depth,       // 現在のスクロール位置（0.0-1.0）
  visible_time_sec    // 実際にタブがアクティブだった秒数
});

// 最下部到達時
trackEvent('episode_complete', {
  novel_id, episode_id,
  total_duration_sec,
  scroll_depth: 1.0
});

// 「次の話」クリック時
trackEvent('next_episode_click', {
  novel_id,
  from_episode: episode_number,
  to_episode: episode_number + 1
});
```

### 4.4 ランキングページ（`/ranking`）

#### レイアウト
```
[ヘッダー]
[ランキング切り替えタブ]
  - 日間 / 週間 / 月間 / 累計
  - ジャンルフィルター（全ジャンル / 個別ジャンル）
[ランキングリスト]
  - 順位 / 表紙サムネイル / タイトル / 著者名 / ジャンルタグ
  - PV数 / ブックマーク数
  - 最新話の公開日
  - 50位まで表示。ページネーション

#### ランキングアルゴリズム
PV数だけでなく、面白さ先行指標を加味したスコアで順位付けする。
スコア = PV × 読了率 × (1 + 次話遷移率) × (1 + ブックマーク率)
PVが多くても離脱率が高い作品は上位に来にくい設計。詳細な重み付けはデータ蓄積後に調整。
[フッター]
```

### 4.5 マイページ（`/mypage`）

#### レイアウト
```
[ヘッダー]
[ユーザー情報]
  - 表示名 / アバター
  - プレミアム会員バッジ（該当する場合）
[タブ切り替え]
  - ブックマーク一覧
    - ブックマークした作品リスト
    - 最終読了話数 / 未読話数バッジ
    - 「続きを読む」ボタン
  - 読書履歴
    - 最近読んだエピソードのリスト（新しい順）
    - 作品名 / エピソード名 / 読了日時
[フッター]
```

### 4.6 管理画面（`/admin`）

**Phase 0-1では自分だけが使う。シンプルでよい。**

#### 認証
Supabase Authのメールアドレスで判定。特定のメールアドレス（自分のもの）のみアクセス可。

#### 作品管理（`/admin/novels`）
```
[作品一覧テーブル]
  - タイトル / ジャンル / 話数 / 累計PV / ステータス / 最終更新
  - 「新規作成」ボタン
  - 各行に「編集」「エピソード管理」リンク

[作品編集フォーム]
  - タイトル（テキスト入力）
  - スラッグ（自動生成 + 手動編集可）
  - キャッチコピー（テキスト入力）
  - あらすじ（テキストエリア）
  - ジャンル（セレクトボックス）
  - タグ（カンマ区切りテキスト入力）
  - 表紙画像（Supabase Storageにアップロード）
  - ステータス（連載中 / 完結 / 休止）
  - 著者名（テキスト入力。デフォルト「編集部」）
  - 「保存」「プレビュー」ボタン
```

#### エピソード管理（`/admin/novels/[id]/episodes`）
```
[エピソード一覧テーブル]
  - 話数 / タイトル / 文字数 / PV / 公開日 / 公開/下書きステータス
  - 「新規追加」ボタン
  - ドラッグ&ドロップで並び替え（話数変更）

[エピソード編集フォーム]
  - 話数（数値入力）
  - タイトル（テキスト入力）
  - 本文（Markdownエディタ。プレビュー付き。画面の左右分割）
  - 公開設定（即時公開 / 予約公開 / 下書き保存）
  - 予約公開日時（DateTimePicker）
  - 「保存」「プレビュー」ボタン
  - 文字数カウンター（リアルタイム表示）
```

#### 統計ダッシュボード（`/admin/stats`）
```
[サマリーカード]
  - 本日のPV / 昨日比
  - 今月のPV / 先月比
  - MAU（直近30日間のユニークユーザー）
  - ブックマーク総数

[PV推移グラフ]
  - 日次PVの折れ線グラフ（直近30日間）
  - Chart.js使用

[作品別PVランキング]
  - 直近7日間のPV順
  - 作品名 / PV / UU / 平均滞在時間 / 完読率

[エピソード別離脱率]
  - 各作品の話数ごとの完読率を折れ線グラフで表示
  - どの話で読者が離脱しているかを可視化
```

### 4.7 発見・レコメンドアルゴリズム

#### 設計思想

**「面白さで実証された作品を、適切な読者に届ける」**

PV数やフォロワー数ではなく、読了率・次話遷移率などの「面白さ先行指標」を
ランキング・レコメンドの中核に置く。これはNorth Star Metric「読者にとっての面白さ最大化」の
直接的な実装である。

#### 段階的アプローチ

```
Phase 0（データなし期）: コンテンツ属性ベース
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ・ジャンル・タグの一致度で「関連作品」を表示
  ・ランキングはPV順（面白さスコアはデータ蓄積後に有効化）
  ・トップページは面白さスコア順（フォールバック: PV順）

Phase 1（データ蓄積後）: 行動データベース
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ・ランキングを面白さスコア順に切り替え
  ・「この作品を読んだ人は」（協調フィルタリング）
  ・トップページをパーソナライズ候補に
```

#### 面白さスコア（novel_scores ビュー）

daily_stats の直近30日分から作品単位で集計し、ランキング・トップページに使用する。

```sql
-- 面白さスコアの計算式
score = pv × avg_completion_rate × (1 + avg_next_episode_rate) × (1 + bookmark_rate)
```

| 要素 | 意味 | 重み付けの理由 |
|------|------|----------------|
| PV | 母数（注目度） | スコアの基底値。面白さ率をかけることで質で補正される |
| 読了率 | エピソード末尾まで読んだ割合 | 最も強い面白さシグナル。高いほど読者を惹きつけている |
| 次話遷移率 | 読了後に次話へ進んだ割合 | 「続きが読みたい」= 面白さの持続力 |
| ブックマーク率 | ブックマーク数/ユニーク読者数 | 「人に薦めたい・また読みたい」= 高い満足度 |

**フォールバック**: daily_statsにデータがない作品（新作等）は `total_pv` のみでスコア計算。
これにより、新作もランキングに表示されるが、読了データが蓄積するにつれ面白さで正しく評価される。

#### 関連作品アルゴリズム

小説詳細ページ下部に表示。同ジャンル・タグ重複で類似度を計算する。

```
類似度 = ジャンル一致ボーナス(5) + タグ重複数 × 2
```

- 同一作品は除外
- 類似度が同じ場合はスコア（面白さ）順
- 最大3作品を表示

#### ランキングページの仕様

| 期間 | 集計対象 |
|------|----------|
| 日間 | 当日のdaily_stats |
| 週間 | 直近7日間の合算 |
| 月間 | 直近30日間の合算 |
| 累計 | novel_scoresビュー（直近30日） |

各期間でジャンルフィルター対応。50位まで表示。
daily_statsにデータがない期間はPV順にフォールバック。

#### トップページの表示順

1. **面白さスコア順**（novel_scoresビューから上位作品）
2. フォールバック: データ不足時は `latest_chapter_at` 降順（更新順）

TikTok型フルスクリーンカードUIはそのまま維持。スコア順に並べ替えるのみ。

---

## 5. 共通コンポーネント

### 5.1 ヘッダー
```
[ロゴ（リンク → /）] [検索アイコン] [ジャンルドロップダウン] [ランキング] [ログイン/ユーザーアイコン]
```
モバイルではハンバーガーメニュー。ロゴとユーザーアイコンのみ常時表示。

### 5.2 フッター
```
[サイト名] [サイト概要（1行）]
[リンク: About / Terms / Privacy / お問い合わせ]
[Copyright © 2026]
```

### 5.3 小説カード（一覧表示用）
```
[表紙サムネイル（左）] [右側テキスト]
  - タイトル（太字）
  - キャッチコピー（グレー、1行）
  - ジャンルタグ + その他タグ（小さいバッジ）
  - 統計: ○話 / ○万字 / PV ○
  - ステータスバッジ
```
横幅いっぱいのカード。リスト表示。グリッド表示はPhase 1以降で検討。

### 5.4 広告コンポーネント
```typescript
// 広告スロットのラッパー。AdSenseのコードを挿入
// Phase 0: AdSense自動広告
// Phase 1: 手動配置に切り替え（エピソード上部・下部のみ）
// 課金ユーザーには非表示（is_premiumフラグで制御）
<AdSlot position="episode_top" />
<AdSlot position="episode_bottom" />
<AdSlot position="sidebar" />        // PCのみ
```

---

## 6. API設計（Next.js Route Handlers）

### 6.1 公開API

```
GET  /api/novels                    → 小説一覧（ページネーション、ジャンル・タグフィルタ）
GET  /api/novels/[slug]             → 小説詳細
GET  /api/novels/[slug]/episodes    → エピソード一覧
GET  /api/novels/[slug]/[num]       → エピソード本文
GET  /api/ranking?period=weekly&genre=fantasy  → ランキング
GET  /api/new?limit=20              → 新着エピソード
GET  /api/genres                    → ジャンル一覧
```

### 6.2 認証必須API

```
GET    /api/me/bookmarks            → ブックマーク一覧
POST   /api/me/bookmarks            → ブックマーク追加 { novel_id }
DELETE /api/me/bookmarks/[novel_id] → ブックマーク削除
GET    /api/me/history              → 読書履歴
POST   /api/track                   → 読書行動トラッキング（バルク送信）
```

### 6.3 管理API（管理者認証必須）

```
POST   /api/admin/novels            → 作品作成
PUT    /api/admin/novels/[id]       → 作品更新
DELETE /api/admin/novels/[id]       → 作品削除
POST   /api/admin/novels/[id]/episodes       → エピソード作成
PUT    /api/admin/novels/[id]/episodes/[id]  → エピソード更新
DELETE /api/admin/novels/[id]/episodes/[id]  → エピソード削除
GET    /api/admin/stats             → 統計データ
POST   /api/admin/upload            → 画像アップロード（Supabase Storage）
```

---

## 7. SEO設計

### 7.1 メタタグテンプレート

```
トップページ:
  title: "サイト名 — AIが紡ぐ、あなたのための物語"
  description: "毎日更新のオリジナル小説を無料で。異世界ファンタジー、恋愛、ホラーなど多ジャンル配信中。"

小説詳細:
  title: "{作品タイトル} | サイト名"
  description: "{キャッチコピー}。{あらすじ冒頭100文字}..."
  og:image: 表紙画像URL

エピソード:
  title: "{エピソードタイトル} - {作品タイトル} | サイト名"
  description: "{本文冒頭120文字}..."
  og:image: 表紙画像URL（エピソード固有画像がなければ作品の表紙）
```

### 7.2 構造化データ（JSON-LD）

```json
// 小説詳細ページ
{
  "@context": "https://schema.org",
  "@type": "Book",
  "name": "{作品タイトル}",
  "author": { "@type": "Person", "name": "{著者名}" },
  "genre": "{ジャンル}",
  "description": "{あらすじ}",
  "image": "{表紙URL}",
  "numberOfPages": "{総話数}"
}
```

### 7.3 サイトマップ
`/sitemap.xml` を動的生成。全作品ページ、全エピソードページを含む。更新頻度は毎日。

### 7.4 robots.txt
```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /mypage
Sitemap: https://example.com/sitemap.xml
```

---

## 8. パフォーマンス要件

### 8.1 ページ速度目標
- LCP（Largest Contentful Paint）: 2.5秒以内
- FID（First Input Delay）: 100ms以内
- CLS（Cumulative Layout Shift）: 0.1以内

### 8.2 実装方針
- 小説一覧・詳細ページはISR（60秒）で静的生成
- エピソード本文はSSG＋ISR。新規公開時にon-demand revalidation
- 画像はNext.js Imageコンポーネントでwebp自動変換＋lazy load
- フォントはGoogle Fonts（Noto Sans JP）をsubset読み込み
- 広告スクリプトはlazyロード（IntersectionObserver）

---

## 9. Phase別の実装スコープ

### Phase 0 MVP（2〜3週間で公開）

必須機能は以下の通り。トップページ（作品一覧＋新着）。小説詳細ページ（あらすじ＋目次）。エピソード閲覧ページ（本文表示＋前後ナビ）。管理画面（作品・エピソード CRUD）。レスポンシブ対応。GA4設置。基本的なSEOメタタグ。

後回し機能は以下の通り。ユーザー認証・ログイン。ブックマーク。読書履歴。広告。課金。検索機能。コメント。ダークモード。

### Phase 0 拡張（1〜2ヶ月目）

Supabase Auth（メール＋Google OAuth）。ブックマーク機能。読書履歴。カスタムイベントトラッキング。AdSense広告枠。ダークモード。OGP画像の自動生成。

### Phase 1（3〜12ヶ月目）

ランキング機能。ジャンル・タグ絞り込み。検索機能。統計ダッシュボード。Stripe課金（プレミアム会員）。読書設定（フォントサイズ・背景色）。予約公開機能。RSS配信。

### Phase 2（12ヶ月目〜）

外部作家の投稿機能（投稿フォーム＋審査フロー）。作者向けダッシュボード（PV・収益表示）。作者へのレベニューシェア管理。パーソナライズ機能（LLM連携）。コメント機能。

---

## 10. デザインガイドライン

### 10.1 カラーパレット

```
Primary:    #1a1a2e（ダークネイビー。ヘッダー、アクセント）
Secondary:  #e94560（コーラルレッド。CTA、通知バッジ）
Background: #ffffff（ライト）/ #0f0f1a（ダーク）
Surface:    #f8f9fa（ライト）/ #1a1a2e（ダーク）
Text:       #212529（ライト）/ #e0e0e0（ダーク）
Muted:      #6c757d
Border:     #dee2e6（ライト）/ #2d2d44（ダーク）
```

### 10.2 タイポグラフィ

```
フォント: 'Noto Sans JP', sans-serif
本文:    16px / line-height 1.9 / font-weight 400
見出しh1: 24px / font-weight 700
見出しh2: 20px / font-weight 700
見出しh3: 18px / font-weight 600
キャプション: 13px / color: muted
小説本文: 18px / line-height 2.0 / letter-spacing 0.04em
         （小説本文は読みやすさ最優先。他より行間広め、字間広め）
```

### 10.3 デザイン原則

- 余白を惜しまない。特に小説本文ページは左右の余白をたっぷり取る
- 装飾を最小限に。ボーダー・シャドウは控えめ。コンテンツで語らせる
- カクヨムのクリーンさを参考に。なろうの古臭さは避ける
- 表紙画像がない作品は、ジャンル別のデフォルト画像を表示
- CTAボタンはコーラルレッド。それ以外のボタンはアウトライン

---

## 11. ディレクトリ構成

```
src/
  app/
    layout.tsx                  # ルートレイアウト（ヘッダー・フッター）
    page.tsx                    # トップページ
    novels/
      page.tsx                  # 小説一覧
      [slug]/
        page.tsx                # 小説詳細
        [episodeNum]/
          page.tsx              # エピソード閲覧
    ranking/
      page.tsx
    new/
      page.tsx
    genre/
      [genreId]/
        page.tsx
    tag/
      [tagName]/
        page.tsx
    mypage/
      page.tsx
      settings/
        page.tsx
    about/
      page.tsx
    terms/
      page.tsx
    privacy/
      page.tsx
    admin/
      layout.tsx                # 管理画面レイアウト（認証ガード）
      page.tsx                  # 管理ダッシュボード
      novels/
        page.tsx                # 作品一覧
        [id]/
          page.tsx              # 作品編集
          episodes/
            page.tsx            # エピソード一覧
            [episodeId]/
              page.tsx          # エピソード編集
      stats/
        page.tsx                # 統計ダッシュボード
    api/
      novels/
        route.ts
        [slug]/
          route.ts
          episodes/
            route.ts
      ranking/
        route.ts
      new/
        route.ts
      me/
        bookmarks/
          route.ts
        history/
          route.ts
      track/
        route.ts
      admin/
        novels/
          route.ts
          [id]/
            route.ts
            episodes/
              route.ts
        stats/
          route.ts
        upload/
          route.ts
    sitemap.xml/
      route.ts                  # 動的サイトマップ生成
  components/
    layout/
      Header.tsx
      Footer.tsx
      MobileMenu.tsx
    novel/
      NovelCard.tsx             # 小説カード（一覧用）
      NovelHero.tsx             # 小説詳細ヘッダー
      EpisodeList.tsx           # 目次
      EpisodeReader.tsx         # 本文表示
      EpisodeNav.tsx            # 前後ナビゲーション
      BookmarkButton.tsx
      ReadingSettings.tsx       # フォントサイズ・背景色設定
    ranking/
      RankingList.tsx
    common/
      AdSlot.tsx                # 広告枠
      GenreBadge.tsx
      TagBadge.tsx
      StatusBadge.tsx
      Pagination.tsx
      SearchBar.tsx
    admin/
      NovelForm.tsx
      EpisodeForm.tsx
      MarkdownEditor.tsx
      StatsChart.tsx
      ImageUploader.tsx
  lib/
    supabase/
      client.ts                 # Supabaseクライアント初期化
      server.ts                 # サーバーサイド用クライアント
    api/
      novels.ts                 # DB操作関数
      episodes.ts
      bookmarks.ts
      stats.ts
      tracking.ts
    utils/
      markdown.ts               # Markdown→HTML変換（unified/remark）
      seo.ts                    # メタタグ生成ユーティリティ
      format.ts                 # 数値フォーマット（PV表示など）
      date.ts                   # 日付フォーマット
  types/
    novel.ts                    # Novel, Episode等の型定義
    user.ts
    stats.ts
```

---

## 12. 実装優先順位（Claude Codeへの指示順）

### Step 1: プロジェクト初期化
Next.js 15 + TypeScript + Tailwind CSS 4のプロジェクト作成。Supabase接続設定。上記のDBスキーマをSupabaseに適用。

### Step 2: 管理画面
作品CRUD。エピソードCRUD（Markdownエディタ付き）。画像アップロード。ここを先に作り、コンテンツ投入を開始する。

### Step 3: 読者向けページ（コア）
トップページ。小説詳細ページ。エピソード閲覧ページ。レスポンシブ対応。

### Step 4: SEO・パフォーマンス
メタタグ。構造化データ。サイトマップ。ISR設定。画像最適化。

### Step 5: ユーザー機能
Supabase Auth。ブックマーク。読書履歴。マイページ。

### Step 6: 収益化基盤
AdSense広告枠。読者行動トラッキング。統計ダッシュボード。

### Step 7: 課金（Phase 1）
Stripe連携。プレミアム会員管理。広告非表示制御。

---

---

## 13. エンゲージメントシステム（Phase 1向け。Phase 0ではOFF）

戦略的な導入フェーズと判断基準の詳細は [engagement_strategy.md](engagement_strategy.md) を参照。

### 13.1 追加テーブル

#### episodes テーブル拡張
```sql
ALTER TABLE episodes ADD COLUMN unlock_at TIMESTAMPTZ;       -- NULLなら即時公開
ALTER TABLE episodes ADD COLUMN unlock_price INTEGER DEFAULT 0; -- ポイント先読みコスト
```
Phase 0では全エピソードの`unlock_at = NULL`、`unlock_price = 0`（完全無料）。

#### ポイントエコノミー
```sql
-- ユーザーポイント残高
CREATE TABLE user_points (
  user_id UUID PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  last_login_bonus_at DATE
);

-- ポイント取引履歴
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,       -- 正: 獲得、負: 消費
  type TEXT NOT NULL,             -- daily_login / episode_complete / comment / unlock_episode / purchase
  reference_id UUID,
  description TEXT
);

-- エピソード先読み解放記録
CREATE TABLE point_unlocks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  episode_id UUID NOT NULL REFERENCES episodes(id),
  points_spent INTEGER NOT NULL,
  UNIQUE(user_id, episode_id)
);
```

#### コンテンツ選別ファネル
```sql
CREATE TABLE content_candidates (
  id UUID PRIMARY KEY,
  novel_id UUID REFERENCES novels(id),
  title TEXT NOT NULL,
  synopsis TEXT,
  genre TEXT NOT NULL REFERENCES genres(id),
  phase TEXT NOT NULL DEFAULT 'plot',  -- plot → pilot → serial → archived
  pilot_completion_rate REAL,
  pilot_next_rate REAL,
  pilot_bookmark_rate REAL,
  pilot_score REAL,                     -- completion × (1 + next_rate) × (1 + bookmark_rate)
  decision TEXT,                        -- promote / revise / archive
  decided_at TIMESTAMPTZ,
  decision_reason TEXT
);
```

#### A/Bテスト基盤
```sql
-- テスト定義
CREATE TABLE ab_tests (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  novel_id UUID NOT NULL REFERENCES novels(id),
  episode_id UUID NOT NULL REFERENCES episodes(id),
  status TEXT NOT NULL DEFAULT 'draft',    -- draft / running / completed
  variants JSONB NOT NULL,                  -- [{id:"A",name:"オリジナル"},{id:"B",name:"展開変更版"}]
  traffic_split JSONB DEFAULT '{"A":50,"B":50}',
  primary_metric TEXT DEFAULT 'next_episode_rate',
  winner_variant TEXT,
  results JSONB
);

-- バリアント本文
CREATE TABLE episode_variants (
  id UUID PRIMARY KEY,
  ab_test_id UUID REFERENCES ab_tests(id),
  variant_id TEXT NOT NULL,
  body_md TEXT NOT NULL,
  UNIQUE(ab_test_id, variant_id)
);

-- セッション→バリアント割り当て
CREATE TABLE ab_assignments (
  id UUID PRIMARY KEY,
  ab_test_id UUID REFERENCES ab_tests(id),
  session_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  UNIQUE(ab_test_id, session_id)
);

-- reading_eventsにバリアント追跡カラム追加
ALTER TABLE reading_events ADD COLUMN variant_id TEXT;
```

### 13.2 追加API

```
-- ポイント
GET    /api/points                              → ポイント残高
POST   /api/points/login-bonus                  → ログインボーナス受取
POST   /api/points/earn                         → 読了・コメントボーナス
GET    /api/points/history                      → 取引履歴

-- エピソード解放
POST   /api/episodes/unlock                     → ポイントで先読み解放
GET    /api/episodes/unlock?episode_ids=...      → 解放済みエピソード一覧

-- A/Bテスト
POST   /api/ab-test/assign                      → バリアント割り当て
GET    /api/admin/ab-tests                       → テスト一覧
POST   /api/admin/ab-tests                       → テスト作成
PATCH  /api/admin/ab-tests/[id]                  → テスト状態変更（start/complete）

-- コンテンツファネル
GET    /api/admin/content-funnel                 → 候補一覧
POST   /api/admin/content-funnel                 → 候補登録
PATCH  /api/admin/content-funnel/[id]            → フェーズ変更・判定
POST   /api/admin/content-funnel/[id]/evaluate   → パイロットスコア自動算出
```

### 13.3 追加管理画面

```
/admin/ab-tests          → A/Bテスト管理（作成・開始・終了・結果比較）
/admin/content-funnel    → コンテンツ選別ファネル（フェーズ管理・スコア表示）
/admin/retention         → 章単位離脱分析（リテンションファネル・スクロールヒートマップ）
```

### 13.4 章単位離脱分析の強化

```sql
-- daily_statsにスクロール分布JSONBを追加
ALTER TABLE daily_stats ADD COLUMN scroll_distribution JSONB;

-- 章→章リテンションファネルビュー
CREATE VIEW episode_retention_funnel AS ...

-- スクロール深度ヒートマップビュー
CREATE VIEW episode_scroll_heatmap AS ...
```

---

*本仕様書はPhase 0-1のMVPを対象とする。Phase 2以降の外部投稿機能、パーソナライズ機能、レベニューシェア管理は別途仕様を策定する。*
