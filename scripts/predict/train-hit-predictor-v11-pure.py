#!/usr/bin/env python3
"""
ヒット予測モデル v11-pure — 純粋文章力版（リーケージ除外）

設計思想:
- v11-surface は log_episodes / genre_group が支配的だった（重要度1位2位）
- log_episodes は「長く続いた作品=ヒット」という生存バイアスを学習している疑い
- genre_group は「ヒット率が高いジャンル」を学習しているだけで文章力と無関係
- v11-pure はこの2つを除外し、**文章そのもの**から予測できるかを検証
- これが本当の「初期10話で見抜けるヒット予測性能」

目的変数: GP/totalEpisodes が上位20%なら1
モデル: LightGBM (binary classification)
特徴量: 表層25D + メタ4D = 計29D（log_episodes / genre_group なし）

実行: python3 scripts/predict/train-hit-predictor-v11-pure.py
"""

import json
import math
import random
from pathlib import Path

import numpy as np
import lightgbm as lgb

DATA_DIR = Path(__file__).parent.parent.parent / "data"
EXPERIMENTS = DATA_DIR / "experiments"
MODELS = DATA_DIR / "models"
MODELS.mkdir(exist_ok=True)

# ─── データ読み込み ───
print("=" * 60)
print("Step 1: データ読み込み (50k narou)")
print("=" * 60)

with open(EXPERIMENTS / "full-feature-extraction-50k.json") as f:
    feat_data = json.load(f)["results"]

print(f"feat: {len(feat_data)}件")

# ─── 目的変数: GP/ep のtop 20% ───
print("\n" + "=" * 60)
print("Step 2: 目的変数構築（GP/ep上位20%をヒット=1）")
print("=" * 60)

gp_per_ep_list = []
for r in feat_data:
    gp = r.get("gp", 0)
    eps = r.get("totalEpisodes", 0)
    if gp > 0 and eps > 0:
        gp_per_ep_list.append((r["ncode"], gp / eps))

gp_per_ep_list.sort(key=lambda x: x[1])
n_total = len(gp_per_ep_list)
threshold_idx = int(n_total * 0.80)
hit_threshold = gp_per_ep_list[threshold_idx][1]
hit_ncodes = {nc for nc, _ in gp_per_ep_list[threshold_idx:]}

print(f"GP/ep計算可能: {n_total}件")
print(f"ヒット閾値 (P80): GP/ep = {hit_threshold:.0f}")
print(f"ヒット作品数: {len(hit_ncodes)} ({len(hit_ncodes)/n_total:.0%})")

# ─── 特徴量定義（表層のみ） ───
# src/lib/features.ts の ExtendedFeatures と一致させる
SURFACE_FEATURES = [
    "avgSentenceLength", "sentenceLengthCV", "dialogueRatio", "shortSentenceRatio",
    "emotionDensity", "questionRatio", "exclamationRatio", "burstRatio",
    "paragraphLengthCV", "avgParagraphLength", "longSentenceRatio",
    "sentenceLengthRange", "dialogueAvgLength",
    "emotionPolarity", "emotionSwing", "uniqueEmotionRatio",
    "commaPerSentence", "sceneBreakCount", "openingLength", "endingQuestionOrTension",
    "speakerVariety", "innerMonologueRatio",
    "uniqueKanjiRatio", "katakanaRatio", "punctuationVariety",
]
META_FEATURES = ["titleLen", "titleHasBracket", "titleHasTemplateKw", "avgEpChars"]

GENRE_GROUPS_MAP = {"ファンタジー": 0, "恋愛": 1, "文芸": 2, "その他": 3}
GENRE_KW = {
    "ファンタジー": ["ファンタジー", "追放", "ざまぁ", "スローライフ", "チート", "転生"],
    "恋愛": ["恋愛", "悪役令嬢", "婚約破棄", "溺愛"],
    "文芸": ["歴史", "推理", "ヒューマンドラマ", "純文学", "ホラー", "ミステリー"],
}

def genre_id(genre):
    g = str(genre) if genre else ""
    for grp, kws in GENRE_KW.items():
        for kw in kws:
            if kw in g:
                return GENRE_GROUPS_MAP[grp]
    if "悪役令嬢" in g: return GENRE_GROUPS_MAP["恋愛"]
    if "追放" in g: return GENRE_GROUPS_MAP["ファンタジー"]
    return GENRE_GROUPS_MAP["その他"]

ALL_FEATURES = SURFACE_FEATURES + META_FEATURES  # log_episodes / genre_group 除外

# ─── データセット構築 ───
print("\n" + "=" * 60)
print("Step 3: データセット構築")
print("=" * 60)

dataset = []
stats = {"total": 0, "no_gp": 0, "ok": 0, "hit": 0}

for r in feat_data:
    stats["total"] += 1
    gp = r.get("gp", 0)
    eps = r.get("totalEpisodes", 0)
    if gp <= 0 or eps <= 0:
        stats["no_gp"] += 1
        continue

    ncode = r["ncode"]
    label = 1 if ncode in hit_ncodes else 0

    feats = [r.get(f) for f in SURFACE_FEATURES]
    feats += [r.get(f) for f in META_FEATURES]
    # log_episodes と genre_group は意図的に除外（リーケージ対策）

    dataset.append({
        "ncode": ncode,
        "features": [np.nan if v is None else float(v) for v in feats],
        "label": label,
        "gp_per_ep": gp / eps,
    })
    stats["ok"] += 1
    if label == 1:
        stats["hit"] += 1

print(f"全作品: {stats['total']}")
print(f"訓練データ: {stats['ok']}")
print(f"  ヒット (1): {stats['hit']} ({stats['hit']/stats['ok']:.0%})")
print(f"  非ヒット (0): {stats['ok'] - stats['hit']} ({(stats['ok']-stats['hit'])/stats['ok']:.0%})")

# ─── 訓練 ───
print("\n" + "=" * 60)
print("Step 4: LightGBM訓練 (10-fold CV)")
print("=" * 60)

random.seed(42)
np.random.seed(42)
random.shuffle(dataset)

X = np.array([d["features"] for d in dataset], dtype=np.float64)
y = np.array([d["label"] for d in dataset], dtype=np.int32)
n = len(X)

cat_idx = []  # カテゴリカル特徴なし

hit_indices = [i for i in range(n) if y[i] == 1]
non_hit_indices = [i for i in range(n) if y[i] == 0]
random.shuffle(hit_indices)
random.shuffle(non_hit_indices)

N_FOLDS = 10
folds = [[] for _ in range(N_FOLDS)]
for i, idx in enumerate(hit_indices):
    folds[i % N_FOLDS].append(idx)
for i, idx in enumerate(non_hit_indices):
    folds[i % N_FOLDS].append(idx)

print(f"Fold sizes: {[len(f) for f in folds]}")

params = {
    "objective": "binary",
    "metric": ["binary_logloss", "auc"],
    "boosting_type": "gbdt",
    "num_leaves": 63,          # 50kスケールでは広げる
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "min_child_samples": 50,   # より多いサンプルを要求（過学習対策）
    "lambda_l2": 1.0,
    "max_depth": 8,
    "verbose": -1,
    "seed": 42,
    "is_unbalance": True,
}

all_probs = np.zeros(n)
fold_iterations = []
for fold in range(N_FOLDS):
    test_idx = np.array(folds[fold])
    train_mask = np.ones(n, dtype=bool)
    train_mask[test_idx] = False
    train_idx = np.where(train_mask)[0]

    dtrain = lgb.Dataset(X[train_idx], label=y[train_idx],
                         feature_name=ALL_FEATURES)
    dvalid = lgb.Dataset(X[test_idx], label=y[test_idx],
                         feature_name=ALL_FEATURES,
                         reference=dtrain)
    model = lgb.train(
        params, dtrain,
        num_boost_round=800,
        valid_sets=[dvalid],
        callbacks=[lgb.early_stopping(80, verbose=False), lgb.log_evaluation(0)],
    )
    fold_iterations.append(model.best_iteration)
    all_probs[test_idx] = model.predict(X[test_idx])
    print(f"Fold {fold+1}/{N_FOLDS}: best_iter={model.best_iteration}")

# ─── 評価 ───
print("\n" + "=" * 60)
print("Step 5: 評価")
print("=" * 60)

def auc_score(y_true, y_score):
    pairs = sorted(zip(y_score, y_true), reverse=True)
    pos = sum(1 for _, t in pairs if t == 1)
    neg = len(pairs) - pos
    if pos == 0 or neg == 0: return 0.5
    tp_count = 0
    auc = 0
    for _, t in pairs:
        if t == 1:
            tp_count += 1
        else:
            auc += tp_count
    return auc / (pos * neg)

auc = auc_score(y.tolist(), all_probs.tolist())
print(f"ROC-AUC: {auc:.4f}")

print(f"\n閾値別 (CV予測):")
print(f"{'閾値':>6} {'予測陽性':>10} {'TP':>5} {'FP':>5} {'Precision':>10} {'Recall':>10} {'F1':>8}")
for threshold in [0.3, 0.4, 0.5, 0.6, 0.7]:
    pred = (all_probs >= threshold).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    pred_pos = int(pred.sum())
    precision = tp / max(pred_pos, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-10)
    print(f"{threshold:>6.2f} {pred_pos:>10} {tp:>5} {fp:>5} {precision:>10.3f} {recall:>10.3f} {f1:>8.3f}")

print(f"\nTop-N% 取り出し精度:")
sorted_idx = np.argsort(-all_probs)
top_n_pcts = [5, 10, 15, 20, 25, 30]
top_precisions = {}
for top_pct in top_n_pcts:
    top_n = int(n * top_pct / 100)
    top_indices = sorted_idx[:top_n]
    hit_in_top = int(y[top_indices].sum())
    top_precisions[top_pct] = hit_in_top / top_n
    print(f"  Top {top_pct:>2}% ({top_n}件): ヒット {hit_in_top}件 = Precision {hit_in_top/top_n:.1%}")

# ─── 最終モデル ───
print("\n" + "=" * 60)
print("Step 6: 最終モデル訓練")
print("=" * 60)

best_iter = int(np.median(fold_iterations))
print(f"Best iteration (median): {best_iter}")

dtrain_full = lgb.Dataset(X, label=y, feature_name=ALL_FEATURES)
final_model = lgb.train(params, dtrain_full, num_boost_round=best_iter)

importance = final_model.feature_importance(importance_type="gain")
feat_imp = sorted(zip(ALL_FEATURES, importance), key=lambda x: -x[1])
print(f"\n特徴量重要度 Top 15:")
for name, imp in feat_imp[:15]:
    print(f"  {name:>25s}: {imp:.1f}")

# ─── 保存 ───
def _convert_node(node):
    if "leaf_value" in node:
        return {"v": round(node["leaf_value"], 6)}
    result = {
        "f": node["split_feature"],
        "t": round(node["threshold"], 6) if isinstance(node["threshold"], float) else node["threshold"],
        "l": _convert_node(node["left_child"]),
        "r": _convert_node(node["right_child"]),
    }
    if not node.get("default_left", True):
        result["d"] = "r"
    if node.get("decision_type") == "==":
        result["cat"] = True
    return result

model_dump = final_model.dump_model()
trees_json = [_convert_node(t["tree_structure"]) for t in model_dump["tree_info"]]

model_output = {
    "version": "v11-pure",
    "type": "binary_classification_gbt",
    "description": "ヒット予測モデル v11-pure — 文章力のみ (log_episodes/genre_group除外)",
    "target": "is_hit (top 20% by GP/ep)",
    "hit_threshold_gp_per_ep": round(hit_threshold, 2),
    "trainingData": {
        "total": stats["ok"],
        "hits": stats["hit"],
        "non_hits": stats["ok"] - stats["hit"],
        "hit_ratio": round(stats["hit"] / stats["ok"], 4),
    },
    "feature_names": ALL_FEATURES,
    "categorical_features": [],
    "categorical_indices": [],
    "trees": trees_json,
    "num_iterations": best_iter,
    "objective": "binary",
    "genre_groups": GENRE_GROUPS_MAP,
    "performance": {
        "cv_auc": round(auc, 4),
        "top20_precision": round(top_precisions[20], 4),
        "top10_precision": round(top_precisions[10], 4),
        "top5_precision": round(top_precisions[5], 4),
    },
    "feature_importance": {name: round(float(imp), 1) for name, imp in feat_imp[:20]},
}

output_path = MODELS / "hit-prediction-v11-pure.json"
with open(output_path, "w") as f:
    json.dump(model_output, f, indent=2, ensure_ascii=False)

file_size = output_path.stat().st_size
print(f"\nモデル保存: {output_path}")
print(f"ファイルサイズ: {file_size:,} bytes ({file_size/1024:.0f} KB)")
print(f"ツリー数: {len(trees_json)}")
print("\n完了")
