# 表紙画像自動生成機能

## Context
管理画面の小説編集ページに「表紙画像を生成」ボタンを追加する。小説のメタデータ（タイトル・あらすじ・ジャンル・タグ）からClaude APIで画像生成プロンプトを作成し、OpenAI gpt-image-1で画像を生成、Supabase Storageに保存する。

## フロー
```
[生成ボタン] → POST /api/admin/novels/[id]/cover
  → DBからnovelメタデータ取得
  → Claude API: メタデータ → 英語画像プロンプト生成
  → OpenAI gpt-image-1: プロンプト → 画像生成 (1024x1536)
  → Supabase Storage (novel-covers バケット) にアップロード
  → novels.cover_image_url を更新
  → { cover_image_url } を返却
```

## 実装ステップ

### 1. パッケージ追加
```bash
npm install @anthropic-ai/sdk openai
```

### 2. 環境変数追加（.env.local.example）
```
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
```

### 3. Supabase Storage バケット作成
- ユーザーにダッシュボードで `novel-covers` バケット（public）を作成してもらう

### 4. API Route 新規作成
**ファイル**: `src/app/api/admin/novels/[id]/cover/route.ts`

- `POST` ハンドラー
- 既存の `src/app/api/admin/novels/[id]/route.ts` のパターンに従う（params: Promise, createAdminClient, try/catch）
- Claude Sonnet でプロンプト生成 → OpenAI gpt-image-1 で画像生成 → Storage upload → DB更新
- `export const maxDuration = 60;` でタイムアウト延長

### 5. フロントエンド変更
**ファイル**: `src/app/admin/novels/[id]/NovelEditForm.tsx`

- state追加: `coverImageUrl`, `generating`
- あらすじ（173行）とジャンル（175行）の間に表紙画像セクション追加
  - 画像プレビュー（cover_image_urlがあれば表示）
  - 「表紙画像を生成」ボタン（生成中は「生成中...」表示）

## 変更ファイル一覧
| ファイル | 操作 |
|---------|------|
| `src/app/api/admin/novels/[id]/cover/route.ts` | 新規作成 |
| `src/app/admin/novels/[id]/NovelEditForm.tsx` | 変更 |
| `.env.local.example` | 変更 |
| `package.json` | 変更（npm install） |

## 検証方法
1. `npm run build` でビルド確認
2. 管理画面で小説編集ページを開き、「表紙画像を生成」ボタンを押す
3. 画像が生成されプレビューに表示されることを確認
4. ページをリロードして画像が永続化されていることを確認
