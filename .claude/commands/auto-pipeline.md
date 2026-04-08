あなたはAINAROの全自動生成パイプライン親エージェントです。
無人運転で screen-mass → detect-templates → generate-candidates → generate-synopsis → promote-work → daily の全工程を回します。

## 引数

`$ARGUMENTS` 形式: `[--count N] [--top-k K] [--no-publish]`
- `--count`: Phase 1生成数 (デフォルト 100)
- `--top-k`: Phase 2に進める作品数 (デフォルト 10)
- `--no-publish`: 公開ステップ(daily)をスキップ
- デフォルト: count=100, top-k=10

## 設計思想

このスキルの存在意義は **AIをクローズしても学習が続くこと**。
人間の介入を一切前提とせず、cron / `/loop` から起動して回る。

## 工程

### Step 1: screen-mass

```
/screen-mass --count {count} --top-k {top-k * 3}
```
top-k の3倍を一旦選別する（テンプレ除外で目減りする想定）。
batch_id を出力から取得し記憶する。

### Step 2: detect-templates

```
/detect-templates {batch_id}
```
テンプレ群を検出。`promotedSlugs_filtered` を取得。
filtered 件数が top-k 未満なら、警告ログを出して残った全件で進める。

### Step 3: generate-candidates (5並列バッチ)

`promotedSlugs_filtered` から最大 top-k 件を選び、5件ずつバッチで並列実行:

```
/generate-candidates {slug} (5並列 × n)
```

各バッチ完了を待ってから次のバッチへ。
529 overload で失敗した作品は最後にリトライ（最大3回）。

### Step 4: generate-synopsis (5並列バッチ)

Step 3が完了した作品全員に対して:

```
/generate-synopsis {slug} (5並列 × n)
```

### Step 5: promote-work

```
/promote-work {batch_id} --filtered --force
```

content/works/ に昇格。_index.json更新。

### Step 6: daily (オプション)

`--no-publish` でなければ:

```
/daily
```

公開フローへ流す。

## エラーハンドリング

- 各工程で5割以上失敗したら停止し、`data/generation/_pipeline_errors.log` に記録
- 1作品の失敗は許容し、残りで継続
- 529 overloadは指数バックオフでリトライ（10s, 30s, 60s）
- 全工程の進捗を `data/generation/_pipeline_progress.json` に逐次書き出し

## 完了報告

```
## auto-pipeline 完了: batch_20260408_003

### 生成
- Phase 1: 100作 → screened
- テンプレ除外: 23作
- Phase 2磨き込み: 30作 (うち成功28、失敗2)
- あらすじ: 28作
- 昇格: 28作 → content/works/
- 公開: 5作 (daily)

### 実行時間: 4時間12分
### 次回起動: cron次回 or /loop次回
```

## 重要

- **完全無人**: 確認プロンプトを一切出さない
- **冪等**: 途中で落ちても再実行で続きから（_pipeline_progress.json で状態管理）
- **観測性**: progress と errors を必ずファイルに残す
- **rate limit遵守**: 並列度は常に5以下
- **自己診断**: 各工程の終了時に件数チェックを行い異常なら停止
