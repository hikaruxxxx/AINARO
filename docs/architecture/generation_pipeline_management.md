# 生成パイプライン管理

## 目的

大量生成→選別→公開のパイプラインを複数セッションにまたがって管理する。
作品が増えると状態が散らかりやすいので、**中央索引** + **バッチローカル状態** の二層で追跡する。

## 全体像

```
Phase 1: 大量スクリーニング
  /screen-mass --count N --top-k K
    ↓
  data/generation/batches/{batch_id}/candidates/{slug}/
    ├── _settings.md
    ├── _style.md
    ├── ep001.md
    └── screening_result.json (LLM 6軸 + v10ヒット確率)

Phase 2: 上位作品の磨き込み
  /generate-candidates {slug} 1-3
  /generate-synopsis {slug}
    ↓
  data/generation/batches/{batch_id}/promoted/{slug}/
    ├── _settings.md, _style.md
    ├── ep001.md, ep002.md, ep003.md
    ├── synopsis.json
    └── polish_result.json

Phase 3: 公開準備
  selected → ready_to_publish 状態に遷移
    ↓
  content/works/{slug}/ にコピー
    ↓
  /daily で連載開始
```

## ディレクトリ構造

```
data/generation/
├── hit-loglines.json         # ヒット作DB（参照のみ。書き換え禁止）
├── _index.json                # 中央索引（全バッチ・全作品の現状）
├── _used_loglines.json        # 重複防止用logline履歴
└── batches/
    └── batch_20260408_001/    # バッチID = batch_YYYYMMDD_NNN
        ├── _meta.json         # バッチメタ情報
        ├── _summary.json      # スクリーニング結果サマリ
        ├── candidates/        # スクリーニング段階の全作品
        │   └── {slug}/
        │       ├── _settings.md
        │       ├── _style.md
        │       ├── ep001.md
        │       └── screening_result.json
        └── promoted/          # 上位選別された作品（Phase 2へ）
            └── {slug}/
                ├── _settings.md, _style.md
                ├── ep001.md, ep002.md, ep003.md
                ├── synopsis.json
                └── polish_result.json
```

## バッチID命名規則

`batch_YYYYMMDD_NNN`

- `YYYYMMDD`: 実行日（JST）
- `NNN`: その日の連番（001から）

例:
- `batch_20260408_001` (4/8 1回目)
- `batch_20260408_002` (4/8 2回目)
- `batch_20260409_001` (4/9 1回目)

## 状態モデル

各作品は1つのstateを持ち、以下の遷移をたどる:

```
generated      ← screen-mass で生成直後
   ↓
screened       ← v10ヒット予測完了
   ↓
   ├── promoted    ← top-k に入った（Phase 2へ）
   │      ↓
   │   polished    ← generate-candidates 完了
   │      ↓
   │   synopsized  ← generate-synopsis 完了
   │      ↓
   │   ready_to_publish ← 全工程完了、公開待ち
   │      ↓
   │   published   ← content/works/ に移動、daily稼働中
   │
   └── abandoned   ← 下位除外（学習データ化）
```

`abandoned` 後でも参照可能な状態として残す（削除しない）。

## 中央索引 `_index.json`

全バッチ・全作品の現状を1ファイルで把握する。

```json
{
  "lastUpdated": "2026-04-08T10:00:00Z",
  "stats": {
    "totalBatches": 5,
    "totalGenerated": 1000,
    "totalPromoted": 150,
    "totalPublished": 12,
    "topTierCount": 50,
    "byState": {
      "screened": 800,
      "abandoned": 200,
      "promoted": 130,
      "polished": 15,
      "synopsized": 8,
      "ready_to_publish": 5,
      "published": 12
    }
  },
  "batches": [
    {
      "batchId": "batch_20260408_001",
      "createdAt": "2026-04-08T01:00:00Z",
      "count": 200,
      "topK": 30,
      "promoted": 30,
      "summary": "data/generation/batches/batch_20260408_001/_summary.json"
    }
  ],
  "works": {
    "{slug}": {
      "batchId": "batch_20260408_001",
      "state": "screened",
      "genre": "悪役令嬢_恋愛",
      "logline": "...",
      "hitProbability": 32.5,
      "tier": "mid",
      "createdAt": "2026-04-08T01:30:00Z",
      "lastTransitionAt": "2026-04-08T02:00:00Z",
      "path": "data/generation/batches/batch_20260408_001/candidates/{slug}/"
    }
  }
}
```

## 重複防止 `_used_loglines.json`

過去に生成したloglineを記録し、新規バッチで再利用しない。

```json
{
  "lastUpdated": "2026-04-08T10:00:00Z",
  "loglines": [
    {
      "logline": "処刑された王女が...",
      "slug": "death-princess-loop",
      "batchId": "batch_20260408_001",
      "addedAt": "2026-04-08T01:30:00Z"
    }
  ],
  "loglineHashes": [
    "abc123...",
    "def456..."
  ]
}
```

新規logline生成時は `loglineHashes` と一致するものを除外する。
ハッシュは logline の正規化（小文字化、空白除去）後の sha256 prefix。

## バッチメタ `_meta.json`

各バッチの設定を記録。

```json
{
  "batchId": "batch_20260408_001",
  "createdAt": "2026-04-08T01:00:00Z",
  "createdBy": "screen-mass",
  "params": {
    "count": 200,
    "topK": 30,
    "genreFilter": null
  },
  "status": "completed",
  "executionTimeMinutes": 32
}
```

## バッチサマリ `_summary.json`

`/screen-mass` の実行結果。

```json
{
  "batchId": "batch_20260408_001",
  "totalCount": 200,
  "successCount": 198,
  "tierDistribution": {
    "top": 8, "upper": 22, "mid": 67, "lower": 78, "bottom": 23
  },
  "promotedCount": 30,
  "promotedSlugs": ["slug-1", "slug-2"],
  "executionTimeMinutes": 32,
  "llmScoreAverages": {"hook": 5.2, "character": 4.8}
}
```

## セッション間の引き継ぎルール

複数セッションで作業する際の必須動作:

### セッション開始時
1. `data/generation/_index.json` を読む
2. 進行中のバッチ（状態が `generated` 〜 `polished`）がないか確認
3. あれば「中断したバッチがあります。続きから処理しますか？」と確認

### セッション終了時
1. 進行中の全バッチの状態を `_index.json` に書き戻す
2. 未完成のバッチは状態を維持（次セッションで継続可能）

### バッチ実行ルール
- 同時に複数バッチを並行実行しない（_index.jsonへの競合を避ける）
- バッチが完了するまで他のバッチを開始しない
- 失敗した場合は `status: "failed"` を記録し、次バッチに進む

## 重要な制約

- **content/works/ への直接書き込み禁止**: published状態になるまで `data/generation/` に隔離
- **削除禁止**: abandoned作品も削除しない（学習データとして使う）
- **slug衝突防止**: 全バッチを通して slug は一意
- **同一logline禁止**: `_used_loglines.json` でチェック
- **バッチ単位のロールバック**: バッチ実行中にエラーが出たら、そのバッチ全体を `failed` 扱いにして手動確認

## 監視コマンド

```bash
# 全体状況の確認
/screen-status

# 特定バッチの詳細
/screen-status batch_20260408_001

# Phase 2 候補の一覧（promoted状態）
/screen-status --state promoted

# 公開準備完了の作品リスト
/screen-status --state ready_to_publish
```

## ジャンル分布の管理

ヒットDBに準じて、生成バッチごとにジャンルを偏らせない:

| ジャンル | 目標比率 |
|---------|---------|
| 追放_ファンタジー | 20% |
| 悪役令嬢_恋愛 | 20% |
| スローライフ_ファンタジー | 15% |
| 悪役令嬢_ファンタジー | 15% |
| 転生_ファンタジー | 10% |
| 異世界恋愛_純粋 | 10% |
| 婚約破棄_恋愛 | 10% |

`screen-mass` はデフォルトでこの分布に従う。意図的に偏らせたい場合のみ `--genre` 指定。

## ヒットDBの再構築

`data/generation/hit-loglines.json` は半年に1回程度、最新のなろうデータで再構築する。
再構築コマンド（手動）:

```bash
python3 scripts/build-hit-loglines-db.py
```

## トラブルシューティング

### 状態が壊れた場合
1. `_index.json` をバックアップ
2. 各バッチの `_summary.json` から再構築
3. content/works/ と照合して published 状態を確定

### バッチが途中で止まった場合
1. `_meta.json` の status を確認
2. `running` のままなら手動で `failed` に変更
3. promoted ディレクトリの中身を確認、必要なら手動で復旧

### slug が重複した場合
- `_index.json` の works から検索
- 後勝ちで上書きせず、どちらかにsuffixを追加してエラー報告
