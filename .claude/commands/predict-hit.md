あなたはAINAROのヒット予測エージェントです。
v11-ep1 ヒット予測モデル (`data/models/hit-prediction-v11-ep1.json`) を使って、指定されたエピソードがヒット作（top 20%）に入る確率を予測します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{作品slug} {話数}` または `{作品slug}` (省略時はep001)
- 例: `predict-hit test-villainess 1` → ep001のヒット確率予測
- 例: `predict-hit test-villainess` → ep001を予測

## 前提

ヒット予測モデル v11-ep1:
- LightGBM binary classification
- 訓練データ: なろう 20,077件（GP/ep 上位20%をヒットラベル）
- 訓練と推論がどちらも ep1 のみの特徴量で一貫（v10 の分布不一致を解消）
- LLM/Synopsis スコア不要。本文+タイトルだけで完結
- ROC-AUC: 0.739, Top 5% Precision: 54.6%
- 入力特徴量: 表層25D（本文）+ タイトル3D + avgEpChars = 29D

## 手順

### Step 1: モデル予測実行

```bash
python3 scripts/predict/predict-hit-v11.py \
  --slug {slug} \
  --episode {num}
```

ep001.md 先頭の `# 第1話「...」` ヘッダーからタイトルを自動抽出。
タイトルを明示したい場合は `--title "..."` を追加。

### Step 2: 結果の解釈と表示

予測結果を以下の形式で報告:

```
## ヒット予測結果: {slug} ep{num}

**ヒット確率: XX%** (top 20%入り確率)

### Tier判定 (v11-ep1 スコア分布)
- top:    ≥45% (上位5%相当)
- upper:  35-45% (上位10%相当)
- mid:    25-35% (上位20%相当)
- lower:  15-25%
- bottom: <15%

→ 判定: {tier}

### 改善ポイント（確率が低い場合）
表層特徴のうち寄与の大きい要素を強化:
- `endingQuestionOrTension` → ep末尾に引き（？／――／まさか等）
- `sceneBreakCount` → シーン転換を増やす（***や空行3連で区切る）
- `uniqueEmotionRatio` → 感情表現のバリエーションを増やす
- `titleLen`/`titleHasBracket` → タイトルの情報量・慣習要素の強化
```

### Step 3: 結果保存

`data/feedback/hit-prediction/{slug}_ep{num}.json` に保存（スクリプトが自動）:

```json
{
  "slug": "test-villainess",
  "episode": 1,
  "modelVersion": "v11-ep1",
  "hitProbability": 32.5,
  "tier": "mid",
  "predictedAt": "2026-04-20T...",
  "title": "...",
  "reliability": "high"
}
```

## 用途

- `/generate-candidates` での候補選別
- `/daily` の公開ゲート
- `/screen-mass` のスクリーニング評価
- 新作の初期スクリーニング（投資判断）

## 重要

- v11-ep1 は「明らかにヒット」「明らかに駄作」の識別が主目的。中位帯の細かい順位は予測困難（feedback_hit_prediction_limit.md）
- v11-surface（10話平均+log_episodes+genre_group）は AUC 0.89 だが推論時分布不一致でep1単体には使えない
- 旧 v10 モデル (predict-hit.py) は同じ分布不一致バグを抱えていたため本スクリプト (predict-hit-v11.py) に置き換え済み
