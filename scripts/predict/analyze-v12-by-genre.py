#!/usr/bin/env python3
"""
v12-ep1 / v12-longform をジャンル別に分解分析

既存モデルで特徴量データ全件を CV 予測し、ジャンル別に:
- AUC
- Top 5% / 10% / 20% Precision
- 基底ヒット率 (ジャンル内の hit 比率)
を算出する。

出力: data/experiments/v12-genre-breakdown.json
"""

import json
import math
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
import lightgbm as lgb

ROOT = Path(__file__).parent.parent.parent
DATA = ROOT / "data"
EXPERIMENTS = DATA / "experiments"
MODELS = DATA / "models"

# 訓練スクリプトと同一の特徴量定義
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
ALL_FEATURES = SURFACE_FEATURES + META_FEATURES

LGB_PARAMS = {
    "objective": "binary",
    "metric": ["binary_logloss", "auc"],
    "boosting_type": "gbdt",
    "num_leaves": 63,
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "min_child_samples": 50,
    "lambda_l2": 1.0,
    "max_depth": 8,
    "verbose": -1,
    "seed": 42,
    "is_unbalance": True,
}
N_FOLDS = 10


def auc_score(y_true, y_score):
    pairs = sorted(zip(y_score, y_true), reverse=True)
    pos = sum(1 for _, t in pairs if t == 1)
    neg = len(pairs) - pos
    if pos == 0 or neg == 0:
        return 0.5
    tp_count = 0
    auc = 0
    for _, t in pairs:
        if t == 1:
            tp_count += 1
        else:
            auc += tp_count
    return auc / (pos * neg)


def build_rows(feat_data, target_fn):
    """target_fn(row) -> 1/0 or None(除外)"""
    rows = []
    for r in feat_data:
        y = target_fn(r)
        if y is None:
            continue
        feats = [r.get(f) for f in ALL_FEATURES]
        rows.append({
            "ncode": r["ncode"],
            "genre": r.get("genre") or "不明",
            "features": [np.nan if v is None else float(v) for v in feats],
            "label": y,
        })
    return rows


def run_cv(rows):
    random.seed(42)
    np.random.seed(42)
    random.shuffle(rows)

    X = np.array([r["features"] for r in rows], dtype=np.float64)
    y = np.array([r["label"] for r in rows], dtype=np.int32)
    n = len(X)

    hit_idx = [i for i in range(n) if y[i] == 1]
    non_idx = [i for i in range(n) if y[i] == 0]
    random.shuffle(hit_idx)
    random.shuffle(non_idx)

    folds = [[] for _ in range(N_FOLDS)]
    for i, idx in enumerate(hit_idx):
        folds[i % N_FOLDS].append(idx)
    for i, idx in enumerate(non_idx):
        folds[i % N_FOLDS].append(idx)

    probs = np.zeros(n)
    for fold in range(N_FOLDS):
        test_idx = np.array(folds[fold])
        mask = np.ones(n, dtype=bool)
        mask[test_idx] = False
        train_idx = np.where(mask)[0]

        dtrain = lgb.Dataset(X[train_idx], label=y[train_idx], feature_name=ALL_FEATURES)
        dvalid = lgb.Dataset(X[test_idx], label=y[test_idx], feature_name=ALL_FEATURES, reference=dtrain)
        model = lgb.train(
            LGB_PARAMS, dtrain,
            num_boost_round=800,
            valid_sets=[dvalid],
            callbacks=[lgb.early_stopping(80, verbose=False), lgb.log_evaluation(0)],
        )
        probs[test_idx] = model.predict(X[test_idx])

    return probs, y


def topn_precision(probs, y, pct):
    order = np.argsort(-probs)
    k = max(1, int(len(probs) * pct / 100))
    top = order[:k]
    return int(y[top].sum()) / k


def genre_breakdown(rows, probs, y, min_n=200):
    """ジャンル別に AUC / Top-N precision / ヒット率 を計算"""
    by_g = defaultdict(list)
    for i, r in enumerate(rows):
        by_g[r["genre"]].append(i)

    out = []
    for g, idxs in by_g.items():
        if len(idxs) < min_n:
            continue
        gp = probs[idxs]
        gy = y[idxs]
        pos = int(gy.sum())
        neg = len(gy) - pos
        if pos == 0 or neg == 0:
            continue
        out.append({
            "genre": g,
            "n": len(idxs),
            "hit_rate": round(pos / len(idxs), 4),
            "auc": round(auc_score(gy.tolist(), gp.tolist()), 4),
            "top5_precision": round(topn_precision(gp, gy, 5), 4),
            "top10_precision": round(topn_precision(gp, gy, 10), 4),
            "top20_precision": round(topn_precision(gp, gy, 20), 4),
        })
    out.sort(key=lambda x: -x["auc"])
    return out


def main():
    with open(EXPERIMENTS / "full-feature-extraction-50k-ep1.json") as f:
        feat_data = json.load(f)["results"]

    # ─── モデル1: v12-ep1 (GP/ep top20%) ───
    gp_per_ep = []
    for r in feat_data:
        gp = r.get("gp", 0)
        eps = r.get("totalEpisodes", 0)
        if gp > 0 and eps > 0:
            gp_per_ep.append((r["ncode"], gp / eps))
    gp_per_ep.sort(key=lambda x: x[1])
    thresh_idx = int(len(gp_per_ep) * 0.80)
    hit_set = {nc for nc, _ in gp_per_ep[thresh_idx:]}

    def target_ep1(r):
        if r.get("gp", 0) <= 0 or r.get("totalEpisodes", 0) <= 0:
            return None
        return 1 if r["ncode"] in hit_set else 0

    print("=" * 60)
    print("v12-ep1 ジャンル別 CV 実行")
    print("=" * 60)
    rows_ep1 = build_rows(feat_data, target_ep1)
    print(f"rows: {len(rows_ep1)}件")
    probs_ep1, y_ep1 = run_cv(rows_ep1)
    print(f"全体 AUC: {auc_score(y_ep1.tolist(), probs_ep1.tolist()):.4f}")
    breakdown_ep1 = genre_breakdown(rows_ep1, probs_ep1, y_ep1)

    # ─── モデル2: v12-longform (>=50話) ───
    def target_long(r):
        eps = r.get("totalEpisodes", 0)
        if eps <= 0:
            return None
        return 1 if eps >= 50 else 0

    print("\n" + "=" * 60)
    print("v12-longform ジャンル別 CV 実行")
    print("=" * 60)
    rows_long = build_rows(feat_data, target_long)
    print(f"rows: {len(rows_long)}件")
    probs_long, y_long = run_cv(rows_long)
    print(f"全体 AUC: {auc_score(y_long.tolist(), probs_long.tolist()):.4f}")
    breakdown_long = genre_breakdown(rows_long, probs_long, y_long)

    # ─── 出力 ───
    print("\n" + "=" * 60)
    print("v12-ep1 ジャンル別 (min n=200)")
    print("=" * 60)
    print(f"{'ジャンル':<18} {'n':>5} {'hit%':>6} {'AUC':>6} {'T5%':>6} {'T10%':>6} {'T20%':>6}")
    for row in breakdown_ep1:
        print(f"{row['genre']:<18} {row['n']:>5} {row['hit_rate']*100:>6.1f} {row['auc']:>6.3f} "
              f"{row['top5_precision']*100:>5.1f} {row['top10_precision']*100:>5.1f} {row['top20_precision']*100:>5.1f}")

    print("\n" + "=" * 60)
    print("v12-longform ジャンル別 (min n=200)")
    print("=" * 60)
    print(f"{'ジャンル':<18} {'n':>5} {'hit%':>6} {'AUC':>6} {'T5%':>6} {'T10%':>6} {'T20%':>6}")
    for row in breakdown_long:
        print(f"{row['genre']:<18} {row['n']:>5} {row['hit_rate']*100:>6.1f} {row['auc']:>6.3f} "
              f"{row['top5_precision']*100:>5.1f} {row['top10_precision']*100:>5.1f} {row['top20_precision']*100:>5.1f}")

    out_path = EXPERIMENTS / "v12-genre-breakdown.json"
    with open(out_path, "w") as f:
        json.dump({
            "v12_ep1": {
                "overall_auc": round(auc_score(y_ep1.tolist(), probs_ep1.tolist()), 4),
                "n": len(rows_ep1),
                "by_genre": breakdown_ep1,
            },
            "v12_longform": {
                "overall_auc": round(auc_score(y_long.tolist(), probs_long.tolist()), 4),
                "n": len(rows_long),
                "by_genre": breakdown_long,
            },
        }, f, indent=2, ensure_ascii=False)
    print(f"\n保存: {out_path}")


if __name__ == "__main__":
    main()
