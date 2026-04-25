#!/usr/bin/env python3
"""
v12-genre-breakdown.json から、ジャンル別アンサンブル重みを生成する。

重み式:
  w_long = clamp(0.5 + (auc_long - auc_ep1) * SCALE, 0.2, 0.8)
  w_ep1  = 1 - w_long
  p_ensemble = p_ep1^w_ep1 * p_long^w_long   (加重幾何平均)

narou ジャンル名と自社生成作品のジャンルスラグをマッピングして保存。
未知ジャンルは w_ep1 = w_long = 0.5 (従来の等重み幾何平均) をデフォルトに。
"""

import json
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
IN = ROOT / "data" / "experiments" / "v12-genre-breakdown.json"
OUT = ROOT / "data" / "models" / "genre-weights-v12.json"

SCALE = 3.0  # AUC差分を重みに変換する係数。大きいほど差を強調
CLAMP_MIN = 0.2
CLAMP_MAX = 0.8

# 自社生成作品ジャンルスラグ → narou ジャンル名 マッピング
# 生成作品側のジャンル体系（content/works/*/_settings.md 参照）を narou 基準に対応付け
GENRE_ALIAS = {
    # isekai 系
    "isekai_high_fantasy": "ハイファンタジー",
    "isekai_slowlife": "ローファンタジー",
    "isekai_tensei_cheat": "ハイファンタジー",
    "isekai_tsuiho_zamaa": "異世界恋愛",
    "異世界ハイファンタジー": "ハイファンタジー",
    "異世界追放ざまぁ": "異世界恋愛",
    "異世界転生チート": "ハイファンタジー",
    "異世界スローライフ": "ローファンタジー",
    "ローファンタジー（現代ダンジョンもの）": "ローファンタジー",
    "スローライフ_ファンタジー": "ローファンタジー",
    # otome / 悪役令嬢系
    "otome_akuyaku_zamaa": "異世界恋愛",
    "otome_konyaku_haki": "異世界恋愛",
    "otome_isekai_pure": "異世界恋愛",
    "otome_villain_fantasy": "異世界恋愛",
    "悪役令嬢ファンタジー": "異世界恋愛",
    "悪役令嬢ざまぁ（乙女ゲーム転生）": "異世界恋愛",
    "悪役令嬢・転生ファンタジー": "異世界恋愛",
    # battle 系
    "battle_modern_power": "アクション",
    "battle_war_chronicle": "ハイファンタジー",
    "battle_dungeon": "ローファンタジー",
    "battle_vrmmo": "VRゲーム",
    # mystery 系
    "mystery_horror": "ホラー",
    "mystery_action": "推理",
    "mystery_detective": "推理",
    "mystery_sf": "推理",
    # modern 系
    "modern_school": "現実世界恋愛",
    "modern_human_drama": "ヒューマンドラマ",
    "modern_romance": "現実世界恋愛",
    "modern_history": "歴史",
    "近代歴史": "歴史",
}


def compute_weight(auc_ep1: float, auc_long: float) -> dict:
    w_long = 0.5 + (auc_long - auc_ep1) * SCALE
    w_long = max(CLAMP_MIN, min(CLAMP_MAX, w_long))
    w_ep1 = 1 - w_long
    return {"w_ep1": round(w_ep1, 4), "w_long": round(w_long, 4)}


def main():
    with open(IN) as f:
        breakdown = json.load(f)

    ep1_by_g = {row["genre"]: row["auc"] for row in breakdown["v12_ep1"]["by_genre"]}
    long_by_g = {row["genre"]: row["auc"] for row in breakdown["v12_longform"]["by_genre"]}

    # narou ジャンル共通集合で重みを決定
    narou_weights = {}
    for g in ep1_by_g.keys() & long_by_g.keys():
        narou_weights[g] = compute_weight(ep1_by_g[g], long_by_g[g])
        narou_weights[g]["auc_ep1"] = ep1_by_g[g]
        narou_weights[g]["auc_long"] = long_by_g[g]

    # 自社ジャンルスラグ → 重み
    slug_weights = {}
    for slug, narou_g in GENRE_ALIAS.items():
        if narou_g in narou_weights:
            slug_weights[slug] = {
                "alias_of": narou_g,
                **narou_weights[narou_g],
            }

    out = {
        "schemaVersion": 1,
        "description": "v12-ep1 / v12-longform のジャンル別AUC差分から算出した加重幾何平均の重み",
        "formula": f"w_long = clamp(0.5 + (auc_long - auc_ep1) * {SCALE}, {CLAMP_MIN}, {CLAMP_MAX})",
        "default": {"w_ep1": 0.5, "w_long": 0.5},
        "narou_genres": narou_weights,
        "slug_aliases": slug_weights,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"保存: {OUT}")
    print(f"\nnarou ジャンル別重み ({len(narou_weights)}件):")
    print(f"{'ジャンル':<18} {'auc_ep1':>8} {'auc_long':>9} {'w_ep1':>6} {'w_long':>6}")
    for g, w in sorted(narou_weights.items(), key=lambda x: -x[1]["w_long"]):
        print(f"{g:<18} {w['auc_ep1']:>8.3f} {w['auc_long']:>9.3f} {w['w_ep1']:>6.3f} {w['w_long']:>6.3f}")

    print(f"\n自社ジャンルスラグ別重み ({len(slug_weights)}件):")
    for slug, w in sorted(slug_weights.items(), key=lambda x: -x[1]["w_long"]):
        print(f"  {slug:<30} → {w['alias_of']:<15} w_long={w['w_long']:.3f}")


if __name__ == "__main__":
    main()
