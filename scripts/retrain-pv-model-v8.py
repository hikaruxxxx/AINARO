#!/usr/bin/env python3
"""
PV予測モデル v8 再訓練スクリプト

変更点（v7→v8）:
- 訓練データ拡大: 1,290→3,962作品（表層）、264→拡大中（LLM）
- 10-fold CV（データ増によりfold数増加）
- lambda探索の細粒度化
- v7との性能比較を自動出力
"""

import json
import math
import random
from pathlib import Path

# ─── データ読み込み ───

DATA_DIR = Path(__file__).parent.parent / "data"

with open(DATA_DIR / "experiments" / "full-feature-extraction.json") as f:
    feat_data = json.load(f)["results"]

with open(DATA_DIR / "experiments" / "llm-feature-scores-v2-full.json") as f:
    llm_data = json.load(f)["results"]

# LLMスコアをncodeでインデックス化
llm_by_ncode = {}
for r in llm_data:
    llm_by_ncode[r["ncode"]] = r["scores"]

# v7モデルの性能（比較用）
V7_SURFACE_SPEARMAN = 0.4133
V7_SURFACE_RMSE = 1.1953
V7_FULL_SPEARMAN = 0.5995
V7_FULL_RMSE = 0.9777

# ─── 特徴量定義 ───

SURFACE_FEATURES = [
    "avgSentenceLen", "sentenceLenCV", "shortSentenceRatio", "longSentenceRatio",
    "medSentenceRatio", "burstRatio", "paragraphLenCV", "avgParagraphLen",
    "dialogueRatio", "innerMonologueRatio", "narrativeRatio",
    "emotionDensity", "uniqueEmotionRatio", "questionRatio", "exclamationRatio",
    "commaPerSentence", "bigramTTR", "kanjiRatio", "katakanaRatio", "hiraganaRatio",
    "conjDensity",
]

LLM_FEATURES = ["hook", "character", "originality", "prose", "tension", "pull"]

# ジャンルグループ（小カテゴリを統合）
GENRE_GROUPS = {
    "ファンタジー": ["追放_ファンタジー", "悪役令嬢_ファンタジー", "ハイファンタジー", "ローファンタジー",
                   "ハイファンタジー_純粋", "ローファンタジー_純粋", "転生_ファンタジー",
                   "チート_ファンタジー", "ざまぁ_ファンタジー", "スローライフ", "ざまぁ"],
    "恋愛": ["悪役令嬢_恋愛", "異世界恋愛", "現実世界恋愛", "異世界恋愛_純粋", "婚約破棄_恋愛", "婚約破棄"],
    "文芸": ["歴史", "推理", "ヒューマンドラマ", "純文学"],
}

def get_genre_group(genre) -> str:
    genre = str(genre) if genre else ""
    for group, members in GENRE_GROUPS.items():
        if genre in members:
            return group
        for m in members:
            if m in genre or genre in m:
                return group
    if "悪役令嬢" in genre:
        return "恋愛"
    if "追放" in genre:
        return "ファンタジー"
    return "文芸"

N_FOLDS = 10  # v7の5-foldから増加

GENRE_FEATURE_NAMES = ["genre_fantasy", "genre_romance"]
SITE_FEATURE_NAMES = ["site_kakuyomu", "site_alphapolis"]  # なろうがベースライン
FEATURES_WITH_GENRE = SURFACE_FEATURES + GENRE_FEATURE_NAMES + SITE_FEATURE_NAMES
ALL_FEATURES = SURFACE_FEATURES + GENRE_FEATURE_NAMES + SITE_FEATURE_NAMES + [f"llm_{f}" for f in LLM_FEATURES]


def compute_target(gp: float, episodes: int) -> float:
    """正規化された目的変数: log10(GP / log10(episodes + 1))"""
    ep_factor = math.log10(max(episodes, 1) + 1)
    return math.log10(max(gp, 1) / ep_factor)


# ─── データセット構築 ───

dataset_surface = []
dataset_full = []

for r in feat_data:
    gp = r.get("gp", 0)
    episodes = r.get("totalEpisodes", 1)
    if gp <= 0:
        continue

    target = compute_target(gp, episodes)
    surface_vec = [r.get(f, 0) or 0 for f in SURFACE_FEATURES]

    genre_group = get_genre_group(r.get("genre", ""))
    genre_vec = [1.0 if genre_group == "ファンタジー" else 0.0,
                 1.0 if genre_group == "恋愛" else 0.0]

    # サイト判定（ncode先頭で判別）
    ncode = r["ncode"]
    site_vec = [
        1.0 if ncode.startswith("kakuyomu_") else 0.0,
        1.0 if ncode.startswith("alphapolis_") else 0.0,
    ]

    dataset_surface.append({
        "ncode": ncode,
        "features": surface_vec + genre_vec + site_vec,
        "target": target,
        "gp": gp,
        "episodes": episodes,
    })

    llm_scores = llm_by_ncode.get(ncode)
    if llm_scores:
        llm_vec = [llm_scores.get(f, 0) or 0 for f in LLM_FEATURES]
        dataset_full.append({
            "ncode": ncode,
            "features": surface_vec + genre_vec + site_vec + llm_vec,
            "target": target,
            "gp": gp,
            "episodes": episodes,
        })

print(f"表層のみデータセット: {len(dataset_surface)}作品 (v7: 1,290)")
print(f"表層+LLMデータセット: {len(dataset_full)}作品 (v7: 264)")


# ─── リッジ回帰（numpy不使用） ───

def standardize(data: list[dict], feature_count: int):
    n = len(data)
    means = [0.0] * feature_count
    stds = [0.0] * feature_count

    for d in data:
        for j in range(feature_count):
            means[j] += d["features"][j]
    means = [m / n for m in means]

    for d in data:
        for j in range(feature_count):
            stds[j] += (d["features"][j] - means[j]) ** 2
    stds = [math.sqrt(s / n) if s > 0 else 1.0 for s in stds]

    target_mean = sum(d["target"] for d in data) / n
    target_var = sum((d["target"] - target_mean) ** 2 for d in data) / n
    target_std = math.sqrt(target_var) if target_var > 0 else 1.0

    X = []
    y = []
    for d in data:
        row = [(d["features"][j] - means[j]) / stds[j] if stds[j] > 0 else 0.0 for j in range(feature_count)]
        X.append(row)
        y.append((d["target"] - target_mean) / target_std)

    return X, y, means, stds, target_mean, target_std


def ridge_fit(X, y, lam: float) -> list[float]:
    n = len(X)
    p = len(X[0])

    XtX = [[0.0] * p for _ in range(p)]
    for i in range(n):
        for j in range(p):
            for k in range(p):
                XtX[j][k] += X[i][j] * X[i][k]
    for j in range(p):
        XtX[j][j] += lam

    Xty = [0.0] * p
    for i in range(n):
        for j in range(p):
            Xty[j] += X[i][j] * y[i]

    A = [row[:] + [Xty[j]] for j, row in enumerate(XtX)]
    for col in range(p):
        max_row = col
        for row in range(col + 1, p):
            if abs(A[row][col]) > abs(A[max_row][col]):
                max_row = row
        A[col], A[max_row] = A[max_row], A[col]

        pivot = A[col][col]
        if abs(pivot) < 1e-12:
            continue
        for j in range(col, p + 1):
            A[col][j] /= pivot
        for row in range(p):
            if row == col:
                continue
            factor = A[row][col]
            for j in range(col, p + 1):
                A[row][j] -= factor * A[col][j]

    return [A[j][p] for j in range(p)]


def predict(X, coeffs):
    return [sum(x * c for x, c in zip(row, coeffs)) for row in X]


def spearman(a, b):
    n = len(a)
    def rank(lst):
        indexed = sorted(range(n), key=lambda i: lst[i])
        ranks = [0.0] * n
        for r, i in enumerate(indexed):
            ranks[i] = r
        return ranks
    ra, rb = rank(a), rank(b)
    d_sum = sum((ra[i] - rb[i]) ** 2 for i in range(n))
    return 1 - (6 * d_sum) / (n * (n ** 2 - 1))


def rmse(a, b):
    n = len(a)
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(n)) / n)


# ─── K-fold CV with lambda search ───

def cross_validate(dataset, feature_count, lam, n_folds=N_FOLDS):
    n = len(dataset)
    fold_size = n // n_folds

    all_preds = [0.0] * n
    all_actuals = [0.0] * n

    for fold in range(n_folds):
        test_start = fold * fold_size
        test_end = test_start + fold_size if fold < n_folds - 1 else n
        test_idx = set(range(test_start, test_end))
        train = [dataset[i] for i in range(n) if i not in test_idx]
        test = [dataset[i] for i in range(n) if i in test_idx]

        X_train, y_train, means, stds, t_mean, t_std = standardize(train, feature_count)
        coeffs = ridge_fit(X_train, y_train, lam)

        X_test = []
        for d in test:
            row = [(d["features"][j] - means[j]) / stds[j] if stds[j] > 0 else 0.0 for j in range(feature_count)]
            X_test.append(row)

        preds_std = predict(X_test, coeffs)

        for i, idx in enumerate(sorted(test_idx)):
            all_preds[idx] = preds_std[i] * t_std + t_mean
            all_actuals[idx] = dataset[idx]["target"]

    sp = spearman(all_preds, all_actuals)
    rm = rmse(all_preds, all_actuals)
    return sp, rm


def train_final_model(dataset, feature_count, lam):
    X, y, means, stds, t_mean, t_std = standardize(dataset, feature_count)
    coeffs = ridge_fit(X, y, lam)

    preds = predict(X, coeffs)
    preds_orig = [p * t_std + t_mean for p in preds]
    actuals = [d["target"] for d in dataset]

    sp = spearman(preds_orig, actuals)
    rm = rmse(preds_orig, actuals)

    stats = [{"mean": means[j], "std": stds[j]} for j in range(feature_count)]
    return coeffs, stats, t_mean, t_std, sp, rm


# ─── 実行 ───

random.seed(42)
random.shuffle(dataset_surface)
random.shuffle(dataset_full)

# lambda探索範囲を細粒度化
LAMBDA_RANGE = [0.1, 0.2, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 75, 100, 150, 200]

print("\n" + "=" * 60)
print(f"モデルA: 表層+ジャンル（{len(FEATURES_WITH_GENRE)}変数）— {N_FOLDS}-fold CV")
print("=" * 60)

best_lam_a, best_sp_a = 0, -1
for lam in LAMBDA_RANGE:
    sp, rm = cross_validate(dataset_surface, len(FEATURES_WITH_GENRE), lam)
    marker = ""
    if sp > best_sp_a:
        best_sp_a = sp
        best_lam_a = lam
        marker = " ← best"
    print(f"  λ={lam:>6.1f}: Spearman={sp:.4f}, RMSE={rm:.4f}{marker}")

coeffs_a, stats_a, tmean_a, tstd_a, sp_train_a, rm_train_a = train_final_model(
    dataset_surface, len(FEATURES_WITH_GENRE), best_lam_a
)
sp_cv_a, rm_cv_a = cross_validate(dataset_surface, len(FEATURES_WITH_GENRE), best_lam_a)
print(f"\n最終モデル (λ={best_lam_a}):")
print(f"  CV Spearman={sp_cv_a:.4f}, CV RMSE={rm_cv_a:.4f}")
print(f"  Train Spearman={sp_train_a:.4f}, Train RMSE={rm_train_a:.4f}")

print("\n" + "=" * 60)
print(f"モデルB: 表層+ジャンル+LLM（{len(ALL_FEATURES)}変数）— {N_FOLDS}-fold CV")
print("=" * 60)

best_lam_b, best_sp_b = 0, -1
for lam in LAMBDA_RANGE:
    sp, rm = cross_validate(dataset_full, len(ALL_FEATURES), lam)
    marker = ""
    if sp > best_sp_b:
        best_sp_b = sp
        best_lam_b = lam
        marker = " ← best"
    print(f"  λ={lam:>6.1f}: Spearman={sp:.4f}, RMSE={rm:.4f}{marker}")

coeffs_b, stats_b, tmean_b, tstd_b, sp_train_b, rm_train_b = train_final_model(
    dataset_full, len(ALL_FEATURES), best_lam_b
)
sp_cv_b, rm_cv_b = cross_validate(dataset_full, len(ALL_FEATURES), best_lam_b)
print(f"\n最終モデル (λ={best_lam_b}):")
print(f"  CV Spearman={sp_cv_b:.4f}, CV RMSE={rm_cv_b:.4f}")
print(f"  Train Spearman={sp_train_b:.4f}, Train RMSE={rm_train_b:.4f}")

# ─── v7との比較 ───

print("\n" + "=" * 60)
print("v7 vs v8 性能比較")
print("=" * 60)

def delta(new, old):
    d = new - old
    return f"{d:+.4f}" if d != 0 else "±0"

print(f"\n表層のみモデル:")
print(f"  {'':>15} {'v7':>10} {'v8':>10} {'差分':>10}")
print(f"  {'データ数':>15} {'1,290':>10} {len(dataset_surface):>10,}")
print(f"  {'Spearman':>15} {V7_SURFACE_SPEARMAN:>10.4f} {sp_cv_a:>10.4f} {delta(sp_cv_a, V7_SURFACE_SPEARMAN):>10}")
print(f"  {'RMSE':>15} {V7_SURFACE_RMSE:>10.4f} {rm_cv_a:>10.4f} {delta(rm_cv_a, V7_SURFACE_RMSE):>10}")

print(f"\n表層+LLMモデル:")
print(f"  {'':>15} {'v7':>10} {'v8':>10} {'差分':>10}")
print(f"  {'データ数':>15} {'264':>10} {len(dataset_full):>10,}")
print(f"  {'Spearman':>15} {V7_FULL_SPEARMAN:>10.4f} {sp_cv_b:>10.4f} {delta(sp_cv_b, V7_FULL_SPEARMAN):>10}")
print(f"  {'RMSE':>15} {V7_FULL_RMSE:>10.4f} {rm_cv_b:>10.4f} {delta(rm_cv_b, V7_FULL_RMSE):>10}")

# ─── Tier閾値 ───

print("\n" + "=" * 60)
print("Tier閾値（正規化ターゲット: GP/log10(ep+1)）")
print("=" * 60)

all_targets = sorted([d["target"] for d in dataset_surface])
n = len(all_targets)
for p in [20, 40, 60, 80]:
    idx = int(n * p / 100)
    val = all_targets[idx]
    gp_equiv = 10 ** val
    print(f"  P{p:2d}: log10値={val:.4f} → 正規化GP={gp_equiv:,.0f}")

# ─── モデル出力 ───

model_output = {
    "version": "v8",
    "description": "PV予測リッジ回帰モデル v8 — 目的変数: log10(GP/log10(ep+1))",
    "trainingData": {
        "surfaceOnly": len(dataset_surface),
        "withLLM": len(dataset_full),
    },
    "target": "log10(GP / log10(episodes + 1))",
    "surfaceModel": {
        "featureNames": SURFACE_FEATURES,
        "featureStats": stats_a,
        "coefficients": coeffs_a,
        "targetMean": tmean_a,
        "targetStd": tstd_a,
        "lambda": best_lam_a,
        "cvSpearman": round(sp_cv_a, 4),
        "cvRMSE": round(rm_cv_a, 4),
    },
    "fullModel": {
        "featureNames": ALL_FEATURES,
        "featureStats": stats_b,
        "coefficients": coeffs_b,
        "targetMean": tmean_b,
        "targetStd": tstd_b,
        "lambda": best_lam_b,
        "cvSpearman": round(sp_cv_b, 4),
        "cvRMSE": round(rm_cv_b, 4),
    },
    "tierThresholds": {
        "description": "正規化GP（GP/log10(ep+1)）のパーセンタイル閾値",
        "P80": round(all_targets[int(n * 0.80)], 4),
        "P60": round(all_targets[int(n * 0.60)], 4),
        "P40": round(all_targets[int(n * 0.40)], 4),
        "P20": round(all_targets[int(n * 0.20)], 4),
    },
}

output_path = DATA_DIR / "models" / "quality-prediction-v8.json"
with open(output_path, "w") as f:
    json.dump(model_output, f, indent=2, ensure_ascii=False)
print(f"\nモデル保存: {output_path}")
print("（v7モデルは上書きしていない。切り替えは手動で）")
