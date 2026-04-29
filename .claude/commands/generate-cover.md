あなたはAINAROの表紙画像生成エージェントです。
gpt-image (Codex CLI 経由) で商業ラノベ表紙レベルの画像を生成し、Supabase Storage に保存します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `[--all | --novel-id=ID | --missing] [--limit=N] [--upload] [--dry-run] [--legacy]`
- 例: `generate-cover --missing --upload` → `cover_image_url IS NULL` の作品をデフォ3件まで生成 + 反映
- 例: `generate-cover --novel-id=xxx --upload` → 特定IDで生成 + 反映
- 例: `generate-cover --missing --limit=10 --dry-run` → 対象表示のみ
- 例: `generate-cover --novel-id=xxx --legacy` → 旧 Pollinations 経路（高速プレビュー用）

デフォルト動作: モック6サブジャンルでテスト出力（DB操作なし）。本番反映には `--upload` 必須。

## 前提

- **新パイプライン (v2 / 推奨)**: `scripts/generation/test-cover-v2.ts`
  - Codex CLI exec モードで `image_gen` を呼び出し、商業ラノベ表紙レベルの画像を1024x1536 PNG で生成
  - `--upload` で sharp WebP 変換 → Supabase Storage `novel-covers/{id}.webp` → `novels.cover_image_url` 更新
  - 1作品あたり 3〜5分（gpt-image 1リクエストあたり）
- **旧パイプライン (v1 / レガシー)**: `scripts/generation/test-cover-generation.ts`
  - Pollinations.ai + sharp + SVG合成。1作品30秒、無料
  - 商業表紙レベルには届かない（風景のみ、長文タイトル崩れあり）
  - 高速プレビューや fire-and-forget 用途で残置
- 共通プロンプト構築: `src/lib/cover/prompt-builder.ts`、サブジャンル別タイポ: `src/lib/cover/genre-typography.ts`

## 手順

### Step 1: 対象作品の特定 (dry-run)

引数を解析して、まず `--dry-run` で対象を確認する。

```bash
npx tsx scripts/generation/test-cover-v2.ts --missing --limit=10 --dry-run
```

これで `cover_image_url IS NULL` の novels が表示される。

### Step 2: ユーザーへ確認メッセージ

```
## 表紙画像生成 (gpt-image v2)

対象: 5作品（cover_image_url が null）
1. 翼なき妃と双翼の契約 (id=xxx, fantasy)
2. 暁の弓は王太子を射抜く (id=xxx, villainess)
...

推定時間: 約20分（1作品 4分 × 5）
このまま生成しますか？（--upload で Storage / DB 反映）
```

### Step 3: 生成実行

ユーザー承認後、`--upload` 付きで実行。

```bash
# 一括生成（cover_image_url IS NULL）
npx tsx scripts/generation/test-cover-v2.ts --missing --limit=10 --upload

# 特定ID
npx tsx scripts/generation/test-cover-v2.ts --novel-id=xxx --upload
```

並列実行は **しない**（Codex CLI を 1 sandbox ずつ起動するため、並列はサブスクリプション側のレート制限に当たる可能性あり）。

実行ログ例:
```
=== gpt-image v2 (Codex経由, 5件, タイトルあり, upload=true) ===

[1/5] vill-fan-spirit-girl (subgenre=villainess) → vill-fan-spirit-girl-with-title.png
  ✓ 3215KB / 198s / 1回試行
  📤 Storage / DB 反映: https://.../novel-covers/xxx.webp?t=...
[2/5] ...
```

### Step 4: 結果サマリ

成功・失敗件数と、各作品の Storage URL を表示。Adminから `/admin/novels` で表示確認できる。

## 重要事項

- **既存の `cover_image_url` がある作品はスキップしない**（v2 は v1 を上書き前提で品質向上を目的にする）
  - 上書きを止めたい場合は実行前に `--dry-run` で対象確認
- gpt-image は subscription 経由（OPENAI_API_KEY 不要）。Codex CLI が PATH に必要
- 1作品 3〜5分かかるため、夜間バッチ運用が現実的
- 失敗時は Codex CLI subprocess の stderr を確認。タイムアウトは 6分

## レガシー (`--legacy`) の使いどころ

`POST /api/admin/novels` の fire-and-forget 初回生成は引き続き Pollinations 経由が望ましい（応答速度のため）。`--legacy` 指定時は v1 パイプラインを呼び出す:

```bash
npx tsx scripts/generation/test-cover-generation.ts --novel-id=xxx --upload
```

## 参考

- 仮表紙の運用方針: 第1段階として Pollinations で fire-and-forget 生成、第2段階で v2 に磨き込み
- 生成側統合: `POST /api/admin/novels` と `POST /api/writer/novels` で fire-and-forget で v1 自動実行（既存）
- 手動再生成API: `POST /api/admin/novels/[id]/cover`（既存、v1 経路）
- 検証スクリプト:
  - v2: `scripts/generation/test-cover-v2.ts`（モック / DB両対応、`--upload` で反映）
  - v1: `scripts/generation/test-cover-generation.ts`（Pollinations 経路）
- typography パターンソース: `data/cover-corpus/alphapolis/fantasy/_features.json`
