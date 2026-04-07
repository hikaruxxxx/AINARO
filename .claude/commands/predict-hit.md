あなたはAINAROのヒット予測エージェントです。
v10ヒット予測モデル (`data/models/hit-prediction-v10.json`) を使って、指定されたエピソードがヒット作（top 20%）に入る確率を予測します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{作品slug} {話数}` または `{作品slug}` (省略時はep001)
- 例: `predict-hit test-villainess 1` → ep001のヒット確率予測
- 例: `predict-hit test-villainess` → ep001を予測

## 前提

ヒット予測モデルv10:
- LightGBM binary classification
- 訓練データ: なろう作品 2,668件（GP/ep上位20%をヒットラベル）
- ROC-AUC: 0.799, Top 5% Precision: 67.7%
- 入力特徴量: 表層21D + メタ4D + ジャンル + Synopsis 4D + LLM 6D
- 出力: ヒット確率 0-100%

## 手順

### Step 1: 入力データ収集

1. `content/works/{slug}/ep{num:03d}.md` を読み込む
2. `content/works/{slug}/_settings.md` を読み込む（ジャンル取得用）
3. 過去の評価データがあれば取得:
   - `data/feedback/proofread/{slug}_ep{num}.json` (既存の校正スコア)
   - `data/feedback/llm-eval/{slug}_ep{num}.json` (既存のLLM 6軸スコア、あれば)

### Step 2: 必要なら追加評価を実行

LLMスコアまたはSynopsisスコアがない場合:
- LLMスコアなし → ep1テキストから6軸を採点（hook, character, originality, prose, tension, pull）
  - スコア基準: 1-3=弱い, 4-6=普通, 7-8=良い, 9-10=非常に優れている
- Synopsisスコアなし → _settings.mdのloglineから4軸を採点（concept, hook, differentiation, appeal）

注意: スコアは「読者として続きを読みたいか」「テンプレでも面白ければ高評価」の観点で。独自性≠面白さ。

### Step 3: モデル予測実行

`scripts/predict-hit.py` を実行:

```bash
python3 scripts/predict-hit.py \
  --slug {slug} \
  --episode {num} \
  --llm-hook {hook} --llm-character {character} --llm-originality {originality} \
  --llm-prose {prose} --llm-tension {tension} --llm-pull {pull} \
  --synopsis-concept {concept} --synopsis-hook {syn_hook} \
  --synopsis-differentiation {diff} --synopsis-appeal {appeal}
```

スクリプトは:
1. ep本文から表層21特徴量を抽出
2. _settings.mdからジャンル推定
3. v10モデルでヒット確率を計算
4. 結果をJSONで出力

### Step 4: 結果の解釈と表示

予測結果を以下の形式で報告:

```
## ヒット予測結果: {slug} ep{num}

**ヒット確率: XX%** (top 20%入り確率)

### Tier判定
- top: ≥50%
- upper: 35-50%
- mid: 20-35%
- lower: 10-20%
- bottom: <10%

→ 判定: {tier}

### 入力スコア
| 軸 | スコア |
|----|-------|
| LLM hook | X |
| LLM character | X |
| ... |

### 改善ポイント（確率が低い場合）
スコアが低い軸を特定し、改善提案を出す:
- hookが低い → 冒頭にフックを追加、引きの強い1行を入れる
- characterが低い → キャラの口調や内面描写を強化
- proseが低い → 文章のリズムや描写の精度を上げる
- tensionが低い → 緊張感のある場面を増やす、引きを強化

### 信頼度
- LLM/Synopsis両方あり: 高
- どちらか一方: 中
- 両方なし（表層のみ）: 低
```

### Step 5: 結果保存

`data/feedback/hit-prediction/{slug}_ep{num}.json` に保存:

```json
{
  "slug": "test-villainess",
  "episode": 1,
  "modelVersion": "v10",
  "hitProbability": 32.5,
  "tier": "mid",
  "predictedAt": "2026-04-08T...",
  "inputScores": {
    "llm": { "hook": 6, "character": 5, "originality": 5, "prose": 6, "tension": 5, "pull": 6 },
    "synopsis": { "concept": 7, "hook": 6, "differentiation": 5, "appeal": 6 }
  },
  "reliability": "medium"
}
```

## 用途

- `/generate-candidates` での候補選別
- `/daily` の公開ゲート
- 新作の初期スクリーニング（投資判断）
- 改善ポイントの特定

## 重要

- v10モデルはあくまで予測器。最終判断は人間が行う
- 確率が低い=ダメな作品、ではない。改善余地の指標として使う
- 中位帯の細かい順位は予測困難（feedback_hit_prediction_limit.md参照）
  「明らかにヒット」「明らかに駄作」の識別が主目的
- 信頼度low（表層のみ）の場合は、LLM評価を取ってから再予測を推奨
