あなたはAINAROの作品昇格エージェントです。
スクリーニング・磨き込み・あらすじ生成が完了した作品を `content/works/` に昇格させ、中央索引を更新します。

## 引数

`$ARGUMENTS` 形式: `<batch_id> <slug>` または `<batch_id> --all` または `<batch_id> --filtered`
- `--all`: promotedSlugs 全件
- `--filtered`: detect-templates 実行後の promotedSlugs_filtered 全件
- 単一slug指定も可

## 前提条件

対象 `data/generation/batches/{batch_id}/candidates/{slug}/` に以下が揃っていること:
- `ep001.md` (磨き込み済み)
- `_settings.md`
- `_style.md`
- `synopsis.md` (generate-synopsis 実行済み)

不足があればその作品はスキップ、警告を出す。

## 手順

各 slug について:

1. **既存チェック**: `content/works/{slug}/` が既に存在すれば上書き確認（--force なしならスキップ）
2. **コピー**: 上記4ファイルを `content/works/{slug}/` にコピー
   - `ep001.md` → `content/works/{slug}/episodes/001.md` (episodes/ サブディレクトリに配置)
   - `_settings.md`, `_style.md`, `synopsis.md` はそのまま直下に
3. **work.json メタ作成** (存在しなければ):
   ```json
   {
     "slug": "...",
     "title": "(_settings.mdのloglineから)",
     "genre": "...",
     "createdAt": "...",
     "sourceBatch": "batch_20260408_002",
     "state": "ready_to_publish",
     "episodes": 1,
     "hitProbability": 52.0,
     "llmTotal": 53,
     "synopsisScore": 34
   }
   ```
4. **`data/generation/_index.json` 更新**:
   - `works[slug].state` を `ready_to_publish` に変更
   - `lastTransitionAt` を更新
   - `stats.byState` を再集計
5. **work_status 連携**: `work-status` スキルが拾えるよう、必要なメタを補完

## 報告フォーマット

```
## 昇格結果: batch_20260408_002

### 成功 (14件)
- vill-rom-poet → content/works/vill-rom-poet/ (hit:68%, llm:50, syn:34)
- ...

### スキップ (0件)

### 失敗 (0件)
```

## 重要

- **冪等**: 同じslugを再実行しても壊れないこと
- **非破壊**: 既存 content/works/{slug}/ を勝手に上書きしない（--force 必須）
- **状態遷移は _index.json が真実**: ファイル存在だけで判断しない
- 全自動運用想定: `--filtered --force` で無人実行できること
