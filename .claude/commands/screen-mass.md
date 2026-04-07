あなたはAINAROの大量スクリーニング生成エージェントです。
高速で大量の作品を生成し、v10ヒット予測モデルでスクリーニングして上位作品を選別します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `--count N [--genre GENRE] [--top-k K]`
- 例: `screen-mass --count 200 --top-k 30` → 200作品生成して上位30選別
- 例: `screen-mass --count 50 --genre fantasy --top-k 10` → ファンタジー50作品生成して上位10選別
- デフォルト: count=100, top-k=15

## 設計思想

「最高の作品を生成AIで生み出す」目的のためのPhase 1スクリーニング:

1. **量を稼ぐ**: 単発生成（候補生成なし）でep1のみ作る
2. **速攻評価**: v10ヒット予測 + 軽い校正で即座にスコアリング
3. **上位選別**: ヒット確率上位K件を「Phase 2候補」として抽出
4. **下位破棄**: ヒット確率10%未満は学習データとして保存し除外

Phase 2では選別された上位作品に対して `/generate-candidates` で磨き込みを行う。

## 手順

### Step 1: logline生成（ヒットDB参照）

**必須**: `data/generation/hit-loglines.json` を読み込み、過去ヒット作のtitleとstoryをジャンル別に参照する。

このDBには34ジャンル × top20件 = 668作品のヒット作データが入っている:
```json
{
  "byGenre": {
    "追放_ファンタジー": [
      {"title": "...", "story": "...", "keyword": "...", "gp_per_ep": 12000, ...},
      ...20件
    ],
    "悪役令嬢_恋愛": [...],
    ...
  }
}
```

`--genre` 指定があればそのジャンルで、なければヒットDBに含まれるジャンルからバランス良く配分する。

**ジャンル分布（デフォルト, ヒットDBの作品数に比例）:**
- 追放_ファンタジー: 20%
- 悪役令嬢_恋愛: 20%
- スローライフ_ファンタジー: 15%
- 悪役令嬢_ファンタジー: 15%
- 転生_ファンタジー: 10%
- 異世界恋愛_純粋: 10%
- 婚約破棄_恋愛: 10%

**logline生成手順:**
1. ジャンルごとに、ヒットDBから上位5-10作品の title + story を読む
2. それらの「ヒット要素」を抽出する:
   - 主人公の境遇（処刑された/追放された/婚約破棄された等）
   - 転機の種類（前世記憶/ループ/スキル覚醒/出会い等）
   - 物語の方向性（復讐/スローライフ/成り上がり等）
   - 読者を惹きつけるフック（理不尽/痛快/共感）
3. ヒット要素を組み合わせて、**新しい**loglineを生成する
   - 既存ヒット作の単なるコピーは禁止
   - ただし「読者が好む構造」は積極的に踏襲
   - 1文で表現、検索キーワード含有、なろう読者向け
4. 各loglineに対応するslug（英数字ハイフン区切り）を作成

logline例（ヒットDB参照後のもの）:
- 「処刑された悪役令嬢が3周目のループで真犯人を暴く復讐譚」（ヒット要素: ループ + 復讐）
- 「追放された薬師が辺境で薬草園を開き、貴族から引っ張りだこになる」（ヒット要素: 追放 + 専門スキル + スローライフ）

**重要**: ヒットDBを読まずにloglineを生成することは禁止。歩留まりが大きく下がる。

### Step 2: 並列高速生成（5並列）

サブエージェントを5並列で起動し、各エージェントが N/5 作品を担当する。

各エージェントの手順:
1. 担当の N/5 作品について、簡略seedを生成
   - 通常の `/seed` の16ステップではなく、最小限のファイル生成
   - `_settings.md` (logline + 主人公 + 世界観の3項目のみ)
   - `_style.md` (デフォルトテンプレート)
   - 詳細プロット、伏線台帳、タイムライン等は **作らない**
2. ep1のみを生成（generate相当だが軽量化）
   - 文字数 3000-4500
   - 複雑なコンテキスト構築なし
3. 結果を `data/screening/{batch_id}/{slug}/ep001.md` に保存

### Step 3: スクリーニング評価

各作品のep1に対して並列で評価を実行:

#### 3-A. LLMスコアリング（6軸）

Opusサブエージェントで6軸採点（hook/character/originality/prose/tension/pull）

#### 3-B. v10ヒット予測

```bash
python3 scripts/predict-hit.py \
  --slug {slug} --episode 1 \
  --text-file data/screening/{batch_id}/{slug}/ep001.md \
  --llm-hook {h} --llm-character {c} --llm-originality {o} \
  --llm-prose {p} --llm-tension {t} --llm-pull {pl}
```

### Step 4: 選別と保存

ヒット確率でソートして上位K件を選別:

**選別ルール:**
1. ヒット確率 ≥ 50% (top tier) → 自動的に「Phase 2候補」
2. ヒット確率 35-50% (upper tier) → top-K の枠が余れば追加
3. ヒット確率 20-35% (mid tier) → top-K の枠が余れば追加
4. ヒット確率 < 20% → 除外（学習データとして保存）

**Phase 2候補の昇格:**
選ばれた作品を `data/screening/{batch_id}/promoted/` に移動:
- `{slug}/ep001.md`
- `{slug}/_settings.md`
- `{slug}/_style.md`
- `{slug}/screening_result.json` (LLMスコア + ヒット確率)

これらは後で `/generate-candidates` で磨き込み、`/generate-synopsis` であらすじを作り、最終的に `content/works/` に昇格する。

### Step 5: バッチサマリ

```
## スクリーニング結果: batch_{id}

### 生成
- 全作品数: 200
- 生成成功: 198 (失敗 2件)
- 生成時間: 32分 (5並列)

### スコア分布
| Tier | 件数 | 割合 |
|------|-----|------|
| top    (≥50%) | 8   | 4.0% |
| upper (35-50%) | 22  | 11.1% |
| mid   (20-35%) | 67  | 33.8% |
| lower (10-20%) | 78  | 39.4% |
| bottom (<10%)  | 23  | 11.6% |

### Phase 2候補（上位30件）
1. {slug-1}: hit=58.2% (top)    "悪役令嬢ループ復讐"
2. {slug-2}: hit=52.1% (top)    "追放薬師スローライフ"
...
30. {slug-30}: hit=22.5% (mid)  "..."

### LLMスコア平均
- hook: 5.2
- character: 4.8
- originality: 4.5
- prose: 5.5
- tension: 4.9
- pull: 5.1

### 次のステップ
Phase 2: 上位30件を /generate-candidates で磨き込み
推定時間: 30件 × 30分 / 5並列 = 3時間
```

### Step 6: 結果保存

`data/screening/batch_{id}/summary.json` に保存:

```json
{
  "batchId": "batch_20260408_001",
  "generatedAt": "2026-04-08T...",
  "totalCount": 200,
  "successCount": 198,
  "tierDistribution": {
    "top": 8, "upper": 22, "mid": 67, "lower": 78, "bottom": 23
  },
  "promotedCount": 30,
  "promotedSlugs": ["slug-1", "slug-2", ...],
  "executionTimeMinutes": 32,
  "llmScoreAverages": {
    "hook": 5.2, "character": 4.8, ...
  }
}
```

## 重要事項

- **品質より量**: Phase 1は速度優先。完璧な作品を作らない
- **複雑な機能を使わない**: 伏線、世界観構造化、ペーシング分析は不要
- **並列度5を堅持**: それ以上はAPI rate limitリスク
- **失敗を許容**: 生成失敗作品はスキップ。リトライしない
- **保存場所**: `content/works/` には保存しない。`data/screening/` に隔離

## 連携フロー

```
/screen-mass --count 200 --top-k 30
  ↓
data/screening/batch_001/{slug-1〜200}/ep001.md
  ↓ [v10で評価]
data/screening/batch_001/promoted/{slug-1〜30}/
  ↓ [手動 or 自動]
/generate-candidates {slug} 1〜3 を各作品に実行
  ↓
content/works/{slug}/ にコピー
  ↓
/generate-synopsis {slug}
  ↓
/daily {slug} で公開フローへ
```

## ディレクトリ構造

```
data/screening/
├── batch_20260408_001/
│   ├── {slug-1}/
│   │   ├── _settings.md
│   │   ├── _style.md
│   │   ├── ep001.md
│   │   └── screening_result.json
│   ├── {slug-2}/
│   ├── ...
│   ├── promoted/         # 上位選別
│   │   ├── {slug-1}/
│   │   └── ...
│   └── summary.json
```
