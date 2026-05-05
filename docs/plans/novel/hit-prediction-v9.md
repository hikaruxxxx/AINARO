# v9 品質予測モデル — 全体設計

## Context

現行v8モデルの根本的問題:
1. **時系列バイアス**: 2021年作品のmedian GPは2026年の18倍。古い作品=高品質と学習している
2. **線形モデルの限界**: Ridge回帰では「ファンタジー×低対話率=人気」等の交互作用を捉えられない
3. **最大データの未活用**: Synopsis評価2,668件が完全に遊んでいる（v8はLLM 264件のみ）
4. **LLMスコアのノイズ**: セッション間再現性なし

v9ではこれらを同時に解決する。

---

## Phase A: 目的変数の再設計

### コホート内パーセンタイルランク

**定義:**
```
target(w) = rank(w.gp, cohort(year(w), genreGroup(w))) / |cohort|
```

- 同年×同ジャンルの作品群内でGP順位を取り、0-1に正規化
- 2021年ファンタジー上位20% = 2025年ファンタジー上位20% として扱える
- tierへの変換はそのままパーセンタイル閾値（0.8/0.6/0.4/0.2）

**年の推定:**
- narou_50k.json の50,135件にfirstPublished情報あり
- feature extraction作品のうち3,995件がnarou_50kとncode一致 → year取得可能
- 残り（~916件はカクヨム/アルファポリス等）→ サイト別にGP分布から推定、または独立コホート

**コホート定義:**
- narou: year × genreCode（15ジャンル × ~6年 = ~90コホート）
- 最小コホートサイズ50件。不足時は同カテゴリ内で統合
- narou_50k全体（58K件）をコホート母集団として使う（学習対象の3.9K件だけでなく）

**ファイル:** `scripts/train-quality-model-v9.py`

---

## Phase B: データ統合パイプライン

### Step 1: コホートパーセンタイル計算
```
narou_50k.json (58K) → year×genre でグループ化 → GP順位 → percentile
出力: {ncode: percentile} マッピング
```

### Step 2: 特徴量マージ
```
ベース: full-feature-extraction.json (3,911 works, GP>0)
  + narou_50k → year, keyword, episodes, firstPublished
  + synopsis-llm-scores-full.json → 4D synopsis scores (ncode join)
  + llm-feature-scores-v3.json → 6D LLM scores (ncode join)
  + Step 1のpercentile target
```

### Step 3: 特徴量構成

| 層 | 特徴量 | 件数 | 備考 |
|----|--------|------|------|
| 表層(21D) | avgSentenceLen, sentenceLenCV, ... | 3,911 | 全作品で利用可能 |
| メタ(5D) | titleLen, titleHasBracket, titleHasTemplateKw, avgEpChars, log_episodes | 3,911 | feature extractionに既存 |
| ジャンル(1D) | genre_group (categorical) | 3,911 | GBTがカテゴリ処理 |
| Synopsis(4D) | concept, hook, differentiation, appeal | 2,668 | 欠損=NaN（GBTが自然処理） |
| LLM(6D) | hook, character, originality, prose, tension, pull | 876 | 欠損=NaN |
| **合計** | **~37次元** | **3,911** | **1つの統一モデル** |

---

## Phase C: モデルアーキテクチャ

### LightGBM (Gradient Boosted Trees)

**選定理由:**
- 欠損値のネイティブ処理（synopsis/LLMが欠損でもOK）
- 非線形交互作用を自動学習
- カテゴリ特徴量のネイティブサポート
- JSON形式でモデルエクスポート可能
- CPU学習で3.9K件なら数秒

**ハイパーパラメータ:**
```python
params = {
    "objective": "regression",
    "metric": "rmse",
    "num_leaves": 31,
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "min_child_samples": 20,
    "lambda_l2": 1.0,
    "max_depth": 6,
    "num_iterations": 500,
    "early_stopping_rounds": 50,
}
```

**CV戦略:** 10-fold stratified (year_group × tier で層化)

**評価指標:**
- Primary: Spearman（予測percentile vs 実percentile）
- Secondary: Tier分類精度（5クラス、chance=20%）
- Tertiary: RMSE

---

## Phase D: モデルJSON形式 & TypeScript予測器

### モデルJSON
```json
{
  "version": "v9",
  "type": "gradient_boosted_trees",
  "target": "cohort_percentile",
  "trees": [
    {
      "split_feature": 3,
      "threshold": 0.45,
      "left": { "leaf": 0.02 },
      "right": { "split_feature": 7, ... },
      "missing_direction": "left"
    }
  ],
  "learning_rate": 0.05,
  "base_score": 0.5,
  "feature_names": [...],
  "tier_thresholds": { "top": 0.8, "upper": 0.6, "mid": 0.4, "lower": 0.2 },
  "performance": { "cv_spearman": 0.XX, "holdout_spearman": 0.XX }
}
```

### TypeScript予測器
新規: `src/lib/agents/popularity-evaluation/gbt-predictor.ts`
- ツリー走査によるGBT予測（欠損値対応）
- ~50行の軽量実装
- 500ツリーでも1ms以下

### 変更ファイル

1. **`scripts/train-quality-model-v9.py`** (新規)
   - データ統合、コホート計算、LightGBM訓練、JSONエクスポート

2. **`src/lib/agents/popularity-evaluation/gbt-predictor.ts`** (新規)
   - GBTツリー走査エンジン

3. **`src/lib/agents/popularity-evaluation/analyzer.ts`** (変更)
   - `predictPV()` を GBT 予測器に置き換え
   - PV_MODEL定数を削除、JSONファイル読み込みに変更
   - 出力にpercentile追加

4. **`src/types/agents.ts`** (変更)
   - `PVPrediction` に `predictedPercentile` フィールド追加
   - `modelVersion` フィールド追加

5. **`src/app/admin/agents/popularity-evaluation/page.tsx`** (変更)
   - パーセンタイル表示に対応

6. **`data/models/quality-prediction-v9.json`** (新規)
   - 訓練済みGBTモデル

---

## Phase E: 期待性能

| モデル | データ量 | 期待Spearman | 根拠 |
|--------|---------|-------------|------|
| v8 surface | 3,911 | 0.36 | 現行（時系列バイアスあり） |
| v9 surface | 3,911 | 0.45-0.55 | 時系列バイアス除去 + GBT非線形 |
| v9 +synopsis | 3,911 (2,668有) | 0.55-0.65 | Synopsis 4Dの内容品質信号 |
| v9 full | 3,911 (876有) | 0.60-0.72 | LLM 6D追加（欠損許容） |

---

## Phase F: 検証計画

1. **時系列バイアスチェック**: 予測percentile vs 公開年の相関がゼロに近いこと
2. **ジャンル別Spearman**: 全ジャンルで0.2以上
3. **過学習チェック**: train Spearman - CV Spearman < 0.10
4. **既知作品スポットチェック**: 2026年のGP50作品がコホート上位なら"upper"判定になること
5. **v8との直接比較**: 同じテストセットで両モデルを走らせ、Spearmanを比較
6. **ランタイムテスト**: APIエンドポイントにテキスト入力 → 正常レスポンス確認

---

## 実装順序

1. `train-quality-model-v9.py` — データ統合 + コホート計算 + LightGBM訓練 + JSONエクスポート
2. `gbt-predictor.ts` — TypeScript側のツリー走査予測器
3. `analyzer.ts` 更新 — GBT予測器に切り替え
4. `agents.ts` 型更新 + admin page更新
5. 検証実行

v8モデルJSONは保持し、ロールバック可能にする。
