#!/usr/bin/env python3
"""
品質予測モデル v9 訓練スクリプト

v8からの変更点:
- 目的変数: log10(GP/log10(ep+1)) → コホート内パーセンタイルランク (年×ジャンル)
- モデル: Ridge回帰 → LightGBM (勾配ブースティング木)
- データ: 264件(LLM) → 統一モデル (表層+Synopsis+LLM、欠損はNaN)
- 時系列バイアス除去: 同年×同ジャンル内での相対順位を学習
"""

import json
import math
import random
from pathlib import Path
from collections import defaultdict

import numpy as np
import lightgbm as lgb

# ─── パス定義 ───
DATA_DIR = Path(__file__).parent.parent / "data"
EXPERIMENTS = DATA_DIR / "experiments"
TARGETS = DATA_DIR / "targets"
MODELS = DATA_DIR / "models"

# v8性能（比較用）
V8_SURFACE_SPEARMAN = 0.3585
V8_FULL_SPEARMAN = 0.6139

# ─── Step 1: ncode suffix → 年のマッピング構築 ───

print("=" * 60)
print("Step 1: ncode suffix → 年マッピング構築")
print("=" * 60)

with open(TARGETS / "narou_50k.json") as f:
    narou_50k = json.load(f)

# firstPublished付きエントリからsuffix→年を学習
suffix_years: dict[str, list[int]] = defaultdict(list)
for r in narou_50k:
    fp = r.get("firstPublished", "").strip()
    ncode = r["ncode"]
    if not fp or not ncode.startswith("n"):
        continue
    year = int(fp[:4])
    # suffix = 末尾2文字
    suffix = ncode[-2:]
    if suffix.isalpha():
        suffix_years[suffix].append(year)

# 中央値マッピング
suffix_to_year: dict[str, int] = {}
for suffix, years in suffix_years.items():
    years.sort()
    suffix_to_year[suffix] = years[len(years) // 2]

# カバーされていないsuffixは、アルファベット順で補間
# 全2文字suffix候補を生成し、近隣から推定
all_known = sorted(suffix_to_year.items(), key=lambda x: x[0])
if all_known:
    # 最小suffixより前は最古の年、最大suffixより後は最新の年
    min_suffix, min_year = all_known[0]
    max_suffix, max_year = all_known[-1]

def estimate_year_from_suffix(suffix: str) -> int:
    """suffix（2文字アルファベット）から年を推定"""
    if suffix in suffix_to_year:
        return suffix_to_year[suffix]
    # 最も近いsuffixを二分探索
    keys = sorted(suffix_to_year.keys())
    # suffixより小さい最大のkey
    lower = [k for k in keys if k <= suffix]
    upper = [k for k in keys if k >= suffix]
    if lower and upper:
        return suffix_to_year[lower[-1]]  # 保守的に小さい方
    elif lower:
        return suffix_to_year[lower[-1]]
    elif upper:
        return suffix_to_year[upper[0]]
    return 2021  # フォールバック


def get_year(ncode: str) -> int | None:
    """ncodeから公開年を推定"""
    if ncode.startswith("n") and len(ncode) >= 3:
        suffix = ncode[-2:]
        if suffix.isalpha():
            return estimate_year_from_suffix(suffix)
    return None  # 非なろう作品


print(f"suffix→年マッピング: {len(suffix_to_year)}パターン")
print(f"年の範囲: {min(suffix_to_year.values())}-{max(suffix_to_year.values())}")

# ─── Step 2: コホートパーセンタイル計算 ───

print("\n" + "=" * 60)
print("Step 2: コホートパーセンタイル計算")
print("=" * 60)

# narou_50k全体でコホートを作成（年×ジャンル）
# feature extraction作品だけでなく全作品をコホートに入れることで
# パーセンタイルの精度を上げる
n50k_by_ncode = {r["ncode"]: r for r in narou_50k}

# なろう: ジャンルコード → 大カテゴリ
GENRE_CODE_TO_GROUP = {
    101: "ファンタジー", 102: "ファンタジー",
    201: "恋愛", 202: "恋愛",
    301: "文芸", 302: "文芸", 303: "文芸", 304: "文芸",
    305: "文芸", 306: "文芸", 307: "文芸",
    401: "その他", 402: "その他", 403: "その他", 404: "その他",
}

# ジャンル文字列 → 大カテゴリ
GENRE_STR_KEYWORDS = {
    "ファンタジー": ["ファンタジー", "追放", "ざまぁ", "スローライフ", "チート", "転生"],
    "恋愛": ["恋愛", "悪役令嬢", "婚約破棄", "溺愛"],
    "文芸": ["歴史", "推理", "ヒューマンドラマ", "純文学", "ホラー", "ミステリー"],
}

GENRE_GROUPS_MAP = {"ファンタジー": 0, "恋愛": 1, "文芸": 2, "その他": 3}


def genre_to_group_str(genre) -> str:
    """ジャンル → グループ名"""
    genre = str(genre) if genre else ""
    # ジャンルコード（数値）の場合
    try:
        code = int(genre)
        return GENRE_CODE_TO_GROUP.get(code, "その他")
    except (ValueError, TypeError):
        pass
    # 文字列の場合
    for group, keywords in GENRE_STR_KEYWORDS.items():
        for kw in keywords:
            if kw in genre:
                return group
    if "悪役令嬢" in genre:
        return "恋愛"
    if "追放" in genre:
        return "ファンタジー"
    return "その他"


def genre_to_group_id(genre) -> int:
    return GENRE_GROUPS_MAP[genre_to_group_str(genre)]


# コホート構築: narou_50kの全GP>0作品をyear×genre_groupでグループ化
cohorts: dict[str, list[tuple[str, int]]] = defaultdict(list)

for r in narou_50k:
    gp = r.get("globalPoint", 0)
    if gp <= 0:
        continue
    ncode = r["ncode"]
    genre = r.get("genre", "other")
    genre_group = genre_to_group_str(genre)

    # 年の取得
    fp = r.get("firstPublished", "").strip()
    if fp:
        year = int(fp[:4])
    else:
        year = get_year(ncode)
        if year is None:
            continue

    cohort_key = f"{year}_{genre_group}"
    cohorts[cohort_key].append((ncode, gp))

# 最小コホートサイズ: 不足時は年のみにフォールバック
MIN_COHORT = 50
year_cohorts: dict[str, list[tuple[str, int]]] = defaultdict(list)
for key, members in cohorts.items():
    year_str = key.split("_")[0]
    year_cohorts[year_str].extend(members)

ncode_to_percentile: dict[str, float] = {}

for key, members in cohorts.items():
    effective = members if len(members) >= MIN_COHORT else year_cohorts[key.split("_")[0]]
    sorted_m = sorted(effective, key=lambda x: x[1])
    n = len(sorted_m)
    for rank, (ncode, _) in enumerate(sorted_m):
        ncode_to_percentile[ncode] = rank / max(n - 1, 1)

print(f"コホート数: {len(cohorts)}")
print(f"  サイズ≥{MIN_COHORT}: {sum(1 for v in cohorts.values() if len(v) >= MIN_COHORT)}")
print(f"パーセンタイル計算済み: {len(ncode_to_percentile)}作品")

# feature extractionの作品がどれだけマッチするか確認
with open(EXPERIMENTS / "full-feature-extraction.json") as f:
    feat_data = json.load(f)["results"]

feat_matched = sum(1 for r in feat_data if r.get("gp", 0) > 0 and r["ncode"] in ncode_to_percentile)
feat_total = sum(1 for r in feat_data if r.get("gp", 0) > 0)
print(f"Feature extraction GP>0: {feat_total}, percentileマッチ: {feat_matched}")

# 非なろう作品（kakuyomu/alphapolis）は独自コホートを作成
# paired_comparison + stratified_all からGP情報を取得
# → サイト×ジャンルグループでパーセンタイル化
non_narou_ncodes = {r["ncode"] for r in feat_data
                    if r.get("gp", 0) > 0
                    and r["ncode"] not in ncode_to_percentile}
print(f"非なろう（パーセンタイル未割当）: {len(non_narou_ncodes)}")

# 非なろう作品はサイト内GP順位でパーセンタイル化
non_narou_by_site: dict[str, list[tuple[str, int]]] = defaultdict(list)
for r in feat_data:
    ncode = r["ncode"]
    gp = r.get("gp", 0)
    if gp > 0 and ncode in non_narou_ncodes:
        site = "kakuyomu" if ncode.startswith("kakuyomu_") else "alphapolis"
        non_narou_by_site[site].append((ncode, gp))

for site, members in non_narou_by_site.items():
    sorted_m = sorted(members, key=lambda x: x[1])
    n = len(sorted_m)
    for rank, (ncode, _) in enumerate(sorted_m):
        ncode_to_percentile[ncode] = rank / max(n - 1, 1)
    print(f"  {site}: {n}作品をサイト内パーセンタイル化")

feat_matched_final = sum(1 for r in feat_data
                         if r.get("gp", 0) > 0 and r["ncode"] in ncode_to_percentile)
print(f"最終パーセンタイルマッチ: {feat_matched_final}/{feat_total}")

# ─── Step 3: データ統合 ───

print("\n" + "=" * 60)
print("Step 3: データ統合")
print("=" * 60)

# Synopsis評価
with open(EXPERIMENTS / "synopsis-llm-scores-full.json") as f:
    synopsis_data = json.load(f)["results"]
synopsis_by_ncode = {r["ncode"]: r["scores"] for r in synopsis_data}

# LLMスコア v3
with open(EXPERIMENTS / "llm-feature-scores-v3.json") as f:
    llm_data = json.load(f)["results"]
llm_by_ncode = {r["ncode"]: r["scores"] for r in llm_data}

# ─── 特徴量定義 ───

SURFACE_FEATURES = [
    "avgSentenceLen", "sentenceLenCV", "shortSentenceRatio", "longSentenceRatio",
    "medSentenceRatio", "burstRatio", "paragraphLenCV", "avgParagraphLen",
    "dialogueRatio", "innerMonologueRatio", "narrativeRatio",
    "emotionDensity", "uniqueEmotionRatio", "questionRatio", "exclamationRatio",
    "commaPerSentence", "bigramTTR", "kanjiRatio", "katakataRatio", "hiraganaRatio",
    "conjDensity",
]

META_FEATURES = ["titleLen", "titleHasBracket", "titleHasTemplateKw", "avgEpChars"]

SYNOPSIS_FEATURES = ["concept", "hook", "differentiation", "appeal"]
LLM_FEATURES = ["hook", "character", "originality", "prose", "tension", "pull"]

ALL_FEATURE_NAMES = (
    SURFACE_FEATURES
    + META_FEATURES
    + ["log_episodes", "genre_group"]
    + [f"synopsis_{f}" for f in SYNOPSIS_FEATURES]
    + [f"llm_{f}" for f in LLM_FEATURES]
)

CATEGORICAL_FEATURES = ["genre_group"]

# ─── データセット構築 ───

dataset = []
stats = {"total": 0, "no_gp": 0, "no_percentile": 0, "ok": 0,
         "has_synopsis": 0, "has_llm": 0}

for r in feat_data:
    stats["total"] += 1
    gp = r.get("gp", 0)
    if gp <= 0:
        stats["no_gp"] += 1
        continue

    ncode = r["ncode"]
    percentile = ncode_to_percentile.get(ncode)
    if percentile is None:
        stats["no_percentile"] += 1
        continue

    # 表層特徴量
    features: list[float | None] = []
    for sf in SURFACE_FEATURES:
        val = r.get(sf)
        features.append(float(val) if val is not None else None)

    # メタ特徴量
    for mf in META_FEATURES:
        val = r.get(mf)
        features.append(float(val) if val is not None else None)

    # log(episodes)
    episodes = r.get("totalEpisodes", 1)
    features.append(math.log10(max(episodes, 1) + 1))

    # ジャンルグループ（カテゴリカル: 0-3）
    features.append(float(genre_to_group_id(r.get("genre", ""))))

    # Synopsis スコア（欠損=None → np.nan）
    syn_scores = synopsis_by_ncode.get(ncode)
    if syn_scores:
        for sf in SYNOPSIS_FEATURES:
            val = syn_scores.get(sf)
            features.append(float(val) if val is not None and val > 0 else None)
        stats["has_synopsis"] += 1
    else:
        features.extend([None] * len(SYNOPSIS_FEATURES))

    # LLMスコア（欠損=None → np.nan）
    llm_scores = llm_by_ncode.get(ncode)
    if llm_scores:
        for lf in LLM_FEATURES:
            val = llm_scores.get(lf)
            features.append(float(val) if val is not None and val > 0 else None)
        stats["has_llm"] += 1
    else:
        features.extend([None] * len(LLM_FEATURES))

    year = get_year(ncode)

    dataset.append({
        "ncode": ncode,
        "features": features,
        "target": percentile,
        "gp": gp,
        "year": str(year) if year else "unknown",
    })
    stats["ok"] += 1

print(f"データ統合結果:")
print(f"  全作品: {stats['total']}")
print(f"  GP=0除外: {stats['no_gp']}")
print(f"  パーセンタイルなし除外: {stats['no_percentile']}")
print(f"  訓練データ: {stats['ok']}")
print(f"  Synopsis付き: {stats['has_synopsis']}")
print(f"  LLM付き: {stats['has_llm']}")

# ─── Step 4: LightGBM訓練 ───

print("\n" + "=" * 60)
print("Step 4: LightGBM訓練 (10-fold CV)")
print("=" * 60)

random.seed(42)
np.random.seed(42)

n_samples = len(dataset)
n_features = len(ALL_FEATURE_NAMES)
print(f"サンプル数: {n_samples}, 特徴量数: {n_features}")

# numpy配列に変換（Noneはnp.nan）
X = np.array([[np.nan if v is None else v for v in d["features"]] for d in dataset],
             dtype=np.float64)
y = np.array([d["target"] for d in dataset], dtype=np.float64)

# カテゴリカル特徴量のインデックス
cat_indices = [ALL_FEATURE_NAMES.index(f) for f in CATEGORICAL_FEATURES]

# 層化分割（年×ターゲット5分位）
N_FOLDS = 10
strat_keys = []
for d in dataset:
    year = d["year"]
    target_bin = min(int(d["target"] * 5), 4)
    strat_keys.append(f"{year}_{target_bin}")

fold_indices: list[list[int]] = [[] for _ in range(N_FOLDS)]
strat_groups: dict[str, list[int]] = defaultdict(list)
for i, key in enumerate(strat_keys):
    strat_groups[key].append(i)

for key, indices in strat_groups.items():
    random.shuffle(indices)
    for i, idx in enumerate(indices):
        fold_indices[i % N_FOLDS].append(idx)

print(f"Fold サイズ: {[len(f) for f in fold_indices]}")

# ─── ハイパーパラメータ探索 ───

PARAM_GRID = [
    {"num_leaves": nl, "learning_rate": lr, "min_child_samples": mc}
    for nl in [15, 31, 63]
    for lr in [0.03, 0.05, 0.1]
    for mc in [10, 20, 30]
]

BASE_PARAMS = {
    "objective": "regression",
    "metric": "rmse",
    "boosting_type": "gbdt",
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "lambda_l2": 1.0,
    "max_depth": 6,
    "verbose": -1,
    "seed": 42,
    "num_threads": 4,
}


def spearman(a, b):
    """Spearman順位相関"""
    from scipy.stats import spearmanr
    return spearmanr(a, b).correlation


def spearman_manual(a: list, b: list) -> float:
    """Spearman順位相関（scipy不要版）"""
    n = len(a)
    def rank(lst):
        indexed = sorted(range(n), key=lambda i: lst[i])
        ranks = [0.0] * n
        for r_idx, i in enumerate(indexed):
            ranks[i] = r_idx
        return ranks
    ra, rb = rank(list(a)), rank(list(b))
    d_sum = sum((ra[i] - rb[i]) ** 2 for i in range(n))
    return 1 - (6 * d_sum) / (n * (n ** 2 - 1))


# scipy有無を確認
try:
    from scipy.stats import spearmanr
    def calc_spearman(a, b):
        return spearmanr(a, b).correlation
except ImportError:
    def calc_spearman(a, b):
        return spearman_manual(a, b)


def rmse(a, b):
    return float(np.sqrt(np.mean((np.array(a) - np.array(b)) ** 2)))


print(f"\nハイパーパラメータ探索 ({len(PARAM_GRID)}組み合わせ)...")

best_sp = -1.0
best_params = None
best_rm = float("inf")

for pi, pg in enumerate(PARAM_GRID):
    params = {**BASE_PARAMS, **pg}

    all_preds = np.zeros(n_samples)
    all_actual = np.zeros(n_samples)

    for fold in range(N_FOLDS):
        test_idx = np.array(fold_indices[fold])
        train_mask = np.ones(n_samples, dtype=bool)
        train_mask[test_idx] = False
        train_idx = np.where(train_mask)[0]

        dtrain = lgb.Dataset(X[train_idx], label=y[train_idx],
                             feature_name=ALL_FEATURE_NAMES,
                             categorical_feature=cat_indices)
        dvalid = lgb.Dataset(X[test_idx], label=y[test_idx],
                             feature_name=ALL_FEATURE_NAMES,
                             categorical_feature=cat_indices,
                             reference=dtrain)

        model = lgb.train(
            params, dtrain,
            num_boost_round=500,
            valid_sets=[dvalid],
            callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(period=0)],
        )

        preds = model.predict(X[test_idx])
        all_preds[test_idx] = preds
        all_actual[test_idx] = y[test_idx]

    sp = calc_spearman(all_preds, all_actual)
    rm = rmse(all_preds, all_actual)

    marker = ""
    if sp > best_sp:
        best_sp = sp
        best_params = dict(params)
        best_rm = rm
        marker = " ← best"

    if (pi + 1) % 9 == 0 or marker:
        print(f"  [{pi+1:>2}/{len(PARAM_GRID)}] leaves={pg['num_leaves']:>2}, "
              f"lr={pg['learning_rate']:.2f}, mc={pg['min_child_samples']:>2}: "
              f"Spearman={sp:.4f}, RMSE={rm:.4f}{marker}")

print(f"\n最良パラメータ: leaves={best_params['num_leaves']}, "
      f"lr={best_params['learning_rate']}, mc={best_params['min_child_samples']}")
print(f"CV Spearman: {best_sp:.4f}, CV RMSE: {best_rm:.4f}")

# ─── 最終モデル訓練 ───

print("\n" + "=" * 60)
print("Step 5: 最終モデル訓練（全データ）")
print("=" * 60)

# CVでbest iterationを取得
dtrain_full = lgb.Dataset(X, label=y,
                          feature_name=ALL_FEATURE_NAMES,
                          categorical_feature=cat_indices)

# fold_indicesを使って手動CVでbest iterationを推定
fold_best_iters = []
for fold in range(N_FOLDS):
    test_idx = np.array(fold_indices[fold])
    train_mask = np.ones(n_samples, dtype=bool)
    train_mask[test_idx] = False
    train_idx = np.where(train_mask)[0]

    dtrain = lgb.Dataset(X[train_idx], label=y[train_idx],
                         feature_name=ALL_FEATURE_NAMES,
                         categorical_feature=cat_indices)
    dvalid = lgb.Dataset(X[test_idx], label=y[test_idx],
                         feature_name=ALL_FEATURE_NAMES,
                         categorical_feature=cat_indices,
                         reference=dtrain)
    m = lgb.train(
        best_params, dtrain,
        num_boost_round=500,
        valid_sets=[dvalid],
        callbacks=[lgb.early_stopping(50, verbose=False), lgb.log_evaluation(period=0)],
    )
    fold_best_iters.append(m.best_iteration)

best_iteration = int(np.median(fold_best_iters))
print(f"Fold best iterations: {fold_best_iters}")
print(f"最良iteration（中央値）: {best_iteration}")

final_model = lgb.train(
    best_params, dtrain_full,
    num_boost_round=best_iteration,
)

# 訓練データ性能（過学習チェック）
train_preds = final_model.predict(X)
train_sp = calc_spearman(train_preds, y)
train_rm = rmse(train_preds, y)
print(f"Train Spearman: {train_sp:.4f} (過学習ギャップ: {train_sp - best_sp:.4f})")
print(f"Train RMSE: {train_rm:.4f}")

# ─── 特徴量重要度 ───

print("\n" + "=" * 60)
print("特徴量重要度 (top 15)")
print("=" * 60)

importance = final_model.feature_importance(importance_type="gain")
feat_imp = sorted(zip(ALL_FEATURE_NAMES, importance), key=lambda x: -x[1])
for name, imp in feat_imp[:15]:
    print(f"  {name:>25s}: {imp:.1f}")

# ─── 診断: CVの予測を使って詳細分析 ───

print("\n" + "=" * 60)
print("診断: 年別・ジャンル別精度")
print("=" * 60)

# best paramsでCVの予測を再計算
all_cv_preds = np.zeros(n_samples)
for fold in range(N_FOLDS):
    test_idx = np.array(fold_indices[fold])
    train_mask = np.ones(n_samples, dtype=bool)
    train_mask[test_idx] = False
    train_idx = np.where(train_mask)[0]

    dtrain = lgb.Dataset(X[train_idx], label=y[train_idx],
                         feature_name=ALL_FEATURE_NAMES,
                         categorical_feature=cat_indices)
    model = lgb.train(best_params, dtrain, num_boost_round=best_iteration)
    all_cv_preds[test_idx] = model.predict(X[test_idx])

# 年別Spearman
by_year: dict[str, tuple[list, list]] = defaultdict(lambda: ([], []))
for i, d in enumerate(dataset):
    by_year[d["year"]][0].append(all_cv_preds[i])
    by_year[d["year"]][1].append(y[i])

print("\n年別:")
for year in sorted(by_year.keys()):
    preds_y, actual_y = by_year[year]
    if len(preds_y) >= 20:
        sp_y = calc_spearman(preds_y, actual_y)
        print(f"  {year}: n={len(preds_y):>5}, Spearman={sp_y:.4f}")

# ジャンル別Spearman
genre_names = {v: k for k, v in GENRE_GROUPS_MAP.items()}
by_genre: dict[int, tuple[list, list]] = defaultdict(lambda: ([], []))
genre_col = ALL_FEATURE_NAMES.index("genre_group")
for i in range(n_samples):
    g = int(X[i, genre_col]) if not np.isnan(X[i, genre_col]) else -1
    by_genre[g][0].append(all_cv_preds[i])
    by_genre[g][1].append(y[i])

print("\nジャンル別:")
for g in sorted(by_genre.keys()):
    preds_g, actual_g = by_genre[g]
    if len(preds_g) >= 20:
        sp_g = calc_spearman(preds_g, actual_g)
        name = genre_names.get(g, f"genre_{g}")
        print(f"  {name:>10s}: n={len(preds_g):>5}, Spearman={sp_g:.4f}")

# Tier分類精度
TIER_THRESHOLDS = [0.2, 0.4, 0.6, 0.8]

def to_tier(p: float) -> int:
    for i, t in enumerate(TIER_THRESHOLDS):
        if p < t:
            return i
    return 4

correct = sum(1 for i in range(n_samples) if to_tier(all_cv_preds[i]) == to_tier(y[i]))
within_one = sum(1 for i in range(n_samples) if abs(to_tier(all_cv_preds[i]) - to_tier(y[i])) <= 1)
print(f"\nTier分類精度:")
print(f"  完全一致: {correct/n_samples:.1%} (chance=20%)")
print(f"  ±1 tier:  {within_one/n_samples:.1%}")

# 時系列バイアスチェック
years_num, preds_bias = [], []
for i, d in enumerate(dataset):
    if d["year"].isdigit():
        years_num.append(int(d["year"]))
        preds_bias.append(all_cv_preds[i])
if years_num:
    bias_sp = calc_spearman(preds_bias, years_num)
    print(f"\n時系列バイアスチェック:")
    print(f"  予測percentile vs 公開年 Spearman: {bias_sp:.4f} (0に近いほど良い)")

# ─── v8との比較 ───

print("\n" + "=" * 60)
print("v8 vs v9 性能比較")
print("=" * 60)
print(f"  {'':>20} {'v8':>10} {'v9':>10} {'差分':>10}")
print(f"  {'Surface Spearman':>20} {V8_SURFACE_SPEARMAN:>10.4f} {best_sp:>10.4f} {best_sp - V8_SURFACE_SPEARMAN:>+10.4f}")
print(f"  {'Full Spearman':>20} {V8_FULL_SPEARMAN:>10.4f} {'N/A':>10} {'(統一)':>10}")
print(f"  {'訓練データ数':>20} {'3,911+264':>10} {f'{n_samples:,}':>10}")

# ─── Step 6: モデルJSONエクスポート ───

print("\n" + "=" * 60)
print("Step 6: モデルJSONエクスポート")
print("=" * 60)

model_dump = final_model.dump_model()


def _convert_node(node: dict) -> dict:
    """LightGBMノードを軽量JSON形式に変換"""
    if "leaf_value" in node:
        return {"v": round(node["leaf_value"], 6)}

    result: dict = {
        "f": node["split_feature"],
        "t": round(node["threshold"], 6) if isinstance(node["threshold"], float) else node["threshold"],
        "l": _convert_node(node["left_child"]),
        "r": _convert_node(node["right_child"]),
    }

    if not node.get("default_left", True):
        result["d"] = "r"  # デフォルトleftなので、rightの場合だけ記録

    if node.get("decision_type") == "==":
        result["cat"] = True

    return result


trees_json = [_convert_node(t["tree_structure"]) for t in model_dump["tree_info"]]

model_output = {
    "version": "v9",
    "type": "gradient_boosted_trees",
    "description": "品質予測GBTモデル v9 — 目的変数: コホート内パーセンタイル (年×ジャンル)",
    "target": "cohort_percentile",
    "trainingData": {
        "total": n_samples,
        "withSynopsis": stats["has_synopsis"],
        "withLLM": stats["has_llm"],
    },
    "hyperparameters": {
        "num_leaves": best_params["num_leaves"],
        "learning_rate": best_params["learning_rate"],
        "min_child_samples": best_params["min_child_samples"],
        "max_depth": best_params["max_depth"],
        "lambda_l2": best_params["lambda_l2"],
        "num_iterations": best_iteration,
    },
    "feature_names": ALL_FEATURE_NAMES,
    "categorical_features": CATEGORICAL_FEATURES,
    "categorical_indices": cat_indices,
    "learning_rate": best_params["learning_rate"],
    "trees": trees_json,
    "tier_thresholds": {"top": 0.8, "upper": 0.6, "mid": 0.4, "lower": 0.2},
    "genre_groups": GENRE_GROUPS_MAP,
    "performance": {
        "cv_spearman": round(best_sp, 4),
        "cv_rmse": round(best_rm, 4),
        "train_spearman": round(train_sp, 4),
        "tier_exact_accuracy": round(correct / n_samples, 4),
        "tier_within_one_accuracy": round(within_one / n_samples, 4),
    },
    "feature_importance": {name: round(float(imp), 1) for name, imp in feat_imp[:20]},
}

output_path = MODELS / "quality-prediction-v9.json"
with open(output_path, "w") as f:
    json.dump(model_output, f, indent=2, ensure_ascii=False)

file_size = output_path.stat().st_size
print(f"モデル保存: {output_path}")
print(f"ファイルサイズ: {file_size:,} bytes ({file_size/1024:.0f} KB)")
print(f"ツリー数: {len(trees_json)}")

print("\n完了")
