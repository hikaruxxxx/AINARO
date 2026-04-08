#!/usr/bin/env python3
"""
PV予測モデル v7 再訓練スクリプト

変更点（v3→v7）:
- 目的変数: log10(GP) → log10(GP/log10(ep+1))（エピソード数バイアス除去）
- 訓練データ: 746作品（特徴量抽出済み全量）
- 5-fold CV + lambda最適化
- 表層のみ(21変数) と 表層+LLM(27変数) の両モデルを出力
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

def get_genre_group(genre: str) -> str:
    for group, members in GENRE_GROUPS.items():
        if genre in members:
            return group
        # 部分一致も確認
        for m in members:
            if m in genre or genre in m:
                return group
    # 悪役令嬢（サブカテゴリなし）
    if "悪役令嬢" in genre:
        return "恋愛"
    if "追放" in genre:
        return "ファンタジー"
    return "文芸"

GENRE_FEATURE_NAMES = ["genre_fantasy", "genre_romance"]  # 文芸がベースライン

FEATURES_WITH_GENRE = SURFACE_FEATURES + GENRE_FEATURE_NAMES
ALL_FEATURES = SURFACE_FEATURES + GENRE_FEATURE_NAMES + [f"llm_{f}" for f in LLM_FEATURES]


def compute_target(gp: float, episodes: int) -> float:
    """正規化された目的変数: log10(GP / log10(episodes + 1))"""
    ep_factor = math.log10(max(episodes, 1) + 1)
    return math.log10(max(gp, 1) / ep_factor)


# ─── データセット構築 ───

dataset_surface = []  # 全746作品
dataset_full = []     # LLMスコア付き264作品

for r in feat_data:
    gp = r.get("gp", 0)
    episodes = r.get("totalEpisodes", 1)
    if gp <= 0:
        continue

    target = compute_target(gp, episodes)
    surface_vec = [r.get(f, 0) or 0 for f in SURFACE_FEATURES]

    # ジャンルone-hot（ファンタジー/恋愛の2変数、文芸がベースライン）
    genre_group = get_genre_group(r.get("genre", ""))
    genre_vec = [1.0 if genre_group == "ファンタジー" else 0.0,
                 1.0 if genre_group == "恋愛" else 0.0]

    dataset_surface.append({
        "ncode": r["ncode"],
        "features": surface_vec + genre_vec,
        "target": target,
        "gp": gp,
        "episodes": episodes,
    })

    # LLMスコアがあれば full にも追加
    ncode = r["ncode"]
    llm_scores = llm_by_ncode.get(ncode)
    if llm_scores:
        llm_vec = [llm_scores.get(f, 0) or 0 for f in LLM_FEATURES]
        dataset_full.append({
            "ncode": ncode,
            "features": surface_vec + genre_vec + llm_vec,
            "target": target,
            "gp": gp,
            "episodes": episodes,
        })

print(f"表層のみデータセット: {len(dataset_surface)}作品")
print(f"表層+LLMデータセット: {len(dataset_full)}作品")


# ─── リッジ回帰（numpy不使用） ───

def standardize(data: list[dict], feature_count: int):
    """特徴量と目的変数を標準化"""
    n = len(data)
    means = [0.0] * feature_count
    stds = [0.0] * feature_count

    # 特徴量の平均
    for d in data:
        for j in range(feature_count):
            means[j] += d["features"][j]
    means = [m / n for m in means]

    # 特徴量の標準偏差
    for d in data:
        for j in range(feature_count):
            stds[j] += (d["features"][j] - means[j]) ** 2
    stds = [math.sqrt(s / n) if s > 0 else 1.0 for s in stds]

    # 目的変数の平均・標準偏差
    target_mean = sum(d["target"] for d in data) / n
    target_var = sum((d["target"] - target_mean) ** 2 for d in data) / n
    target_std = math.sqrt(target_var) if target_var > 0 else 1.0

    # 標準化した特徴量行列と目的変数
    X = []
    y = []
    for d in data:
        row = [(d["features"][j] - means[j]) / stds[j] if stds[j] > 0 else 0.0 for j in range(feature_count)]
        X.append(row)
        y.append((d["target"] - target_mean) / target_std)

    return X, y, means, stds, target_mean, target_std


def ridge_fit(X, y, lam: float) -> list[float]:
    """リッジ回帰の閉形式解: β = (X'X + λI)^{-1} X'y"""
    n = len(X)
    p = len(X[0])

    # X'X + λI
    XtX = [[0.0] * p for _ in range(p)]
    for i in range(n):
        for j in range(p):
            for k in range(p):
                XtX[j][k] += X[i][j] * X[i][k]
    for j in range(p):
        XtX[j][j] += lam

    # X'y
    Xty = [0.0] * p
    for i in range(n):
        for j in range(p):
            Xty[j] += X[i][j] * y[i]

    # ガウス消去法で解く
    A = [row[:] + [Xty[j]] for j, row in enumerate(XtX)]
    for col in range(p):
        # ピボット選択
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
    """予測"""
    return [sum(x * c for x, c in zip(row, coeffs)) for row in X]


def spearman(a, b):
    """スピアマン相関係数"""
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
    """RMSE"""
    n = len(a)
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(n)) / n)


# ─── 5-fold CV with lambda search ───

def cross_validate(dataset, feature_count, lam):
    """5-fold CVでSpearman相関とRMSEを返す"""
    n = len(dataset)
    fold_size = n // 5
    indices = list(range(n))

    all_preds_std = [0.0] * n
    all_actuals_std = [0.0] * n
    all_preds_raw = [0.0] * n
    all_actuals_raw = [0.0] * n

    for fold in range(5):
        test_start = fold * fold_size
        test_end = test_start + fold_size if fold < 4 else n
        test_idx = set(range(test_start, test_end))
        train = [dataset[i] for i in range(n) if i not in test_idx]
        test = [dataset[i] for i in range(n) if i in test_idx]

        X_train, y_train, means, stds, t_mean, t_std = standardize(train, feature_count)
        coeffs = ridge_fit(X_train, y_train, lam)

        # テストデータを同じ統計量で標準化
        X_test = []
        for d in test:
            row = [(d["features"][j] - means[j]) / stds[j] if stds[j] > 0 else 0.0 for j in range(feature_count)]
            X_test.append(row)

        preds_std = predict(X_test, coeffs)

        for i, idx in enumerate(sorted(test_idx)):
            all_preds_std[idx] = preds_std[i] * t_std + t_mean
            all_actuals_std[idx] = dataset[idx]["target"]
            # 元のGPスケールでも比較
            all_preds_raw[idx] = preds_std[i] * t_std + t_mean
            all_actuals_raw[idx] = dataset[idx]["target"]

    sp = spearman(all_preds_std, all_actuals_std)
    rm = rmse(all_preds_std, all_actuals_std)
    return sp, rm


def train_final_model(dataset, feature_count, lam):
    """全データで最終モデルを訓練"""
    X, y, means, stds, t_mean, t_std = standardize(dataset, feature_count)
    coeffs = ridge_fit(X, y, lam)

    # 訓練データでの予測
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

print("\n" + "=" * 60)
print("モデルA: 表層+ジャンル（23変数）")
print("=" * 60)

best_lam_a, best_sp_a = 0, -1
for lam in [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100]:
    sp, rm = cross_validate(dataset_surface, len(FEATURES_WITH_GENRE), lam)
    marker = ""
    if sp > best_sp_a:
        best_sp_a = sp
        best_lam_a = lam
        marker = " ← best"
    print(f"  λ={lam:>5.1f}: Spearman={sp:.4f}, RMSE={rm:.4f}{marker}")

coeffs_a, stats_a, tmean_a, tstd_a, sp_train_a, rm_train_a = train_final_model(
    dataset_surface, len(FEATURES_WITH_GENRE), best_lam_a
)
sp_cv_a, rm_cv_a = cross_validate(dataset_surface, len(FEATURES_WITH_GENRE), best_lam_a)
print(f"\n最終モデル (λ={best_lam_a}):")
print(f"  CV Spearman={sp_cv_a:.4f}, CV RMSE={rm_cv_a:.4f}")
print(f"  Train Spearman={sp_train_a:.4f}, Train RMSE={rm_train_a:.4f}")

print("\n" + "=" * 60)
print("モデルB: 表層+ジャンル+LLM（29変数）")
print("=" * 60)

best_lam_b, best_sp_b = 0, -1
for lam in [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100]:
    sp, rm = cross_validate(dataset_full, len(ALL_FEATURES), lam)
    marker = ""
    if sp > best_sp_b:
        best_sp_b = sp
        best_lam_b = lam
        marker = " ← best"
    print(f"  λ={lam:>5.1f}: Spearman={sp:.4f}, RMSE={rm:.4f}{marker}")

coeffs_b, stats_b, tmean_b, tstd_b, sp_train_b, rm_train_b = train_final_model(
    dataset_full, len(ALL_FEATURES), best_lam_b
)
sp_cv_b, rm_cv_b = cross_validate(dataset_full, len(ALL_FEATURES), best_lam_b)
print(f"\n最終モデル (λ={best_lam_b}):")
print(f"  CV Spearman={sp_cv_b:.4f}, CV RMSE={rm_cv_b:.4f}")
print(f"  Train Spearman={sp_train_b:.4f}, Train RMSE={rm_train_b:.4f}")

# ─── 新Tier閾値の計算（正規化ターゲットのパーセンタイル） ───

print("\n" + "=" * 60)
print("新Tier閾値（正規化ターゲット: GP/log10(ep+1)）")
print("=" * 60)

all_targets = sorted([d["target"] for d in dataset_surface])
n = len(all_targets)
for p in [20, 40, 60, 80]:
    idx = int(n * p / 100)
    val = all_targets[idx]
    gp_equiv = 10 ** val  # 正規化GPの等価値
    print(f"  P{p:2d}: log10値={val:.4f} → 正規化GP={gp_equiv:,.0f}")

# ─── モデル出力 ───

model_output = {
    "version": "v7",
    "description": "PV予測リッジ回帰モデル v7 — 目的変数: log10(GP/log10(ep+1))",
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

output_path = DATA_DIR / "models" / "quality-prediction-v7.json"
with open(output_path, "w") as f:
    json.dump(model_output, f, indent=2, ensure_ascii=False)
print(f"\nモデル保存: {output_path}")

# ─── analyzer.ts用のコード出力 ───

print("\n" + "=" * 60)
print("analyzer.ts 用コードスニペット")
print("=" * 60)

print("\n// ─── PV予測モデル v7（目的変数: log10(GP/log10(ep+1))） ───")
print("const PV_MODEL = {")
print(f'  version: "v7",')
print(f'  target: "log10(GP/log10(ep+1))",')

# 表層モデル（analyzer.tsで使用）
print(f"  featureNames: {json.dumps(ALL_FEATURES)},")
print(f"  textOnlyFeatureCount: {len(FEATURES_WITH_GENRE)},")  # 表層+ジャンル
print(f"  featureStats: [")
for s in stats_b:
    print(f"    {{ mean: {s['mean']:.6f}, std: {s['std']:.6f} }},")
print(f"  ],")
print(f"  targetMean: {tmean_b:.6f},")
print(f"  targetStd: {tstd_b:.6f},")
print(f"  coefficients: [")
for i in range(0, len(coeffs_b), 5):
    chunk = coeffs_b[i:i+5]
    line = ", ".join(f"{c:.6f}" for c in chunk)
    print(f"    {line},")
print(f"  ],")
print(f"  // 表層+ジャンルのみの係数（23変数）")
print(f"  surfaceCoefficients: [")
for i in range(0, len(coeffs_a), 5):
    chunk = coeffs_a[i:i+5]
    line = ", ".join(f"{c:.6f}" for c in chunk)
    print(f"    {line},")
print(f"  ],")
print(f"  surfaceTargetMean: {tmean_a:.6f},")
print(f"  surfaceTargetStd: {tstd_a:.6f},")
print(f"  surfaceFeatureStats: [")
for s in stats_a:
    print(f"    {{ mean: {s['mean']:.6f}, std: {s['std']:.6f} }},")
print(f"  ],")
# RMSE
print(f"  fullRMSE: {rm_cv_b:.4f},")
print(f"  surfaceRMSE: {rm_cv_a:.4f},")
print(f"}};")
