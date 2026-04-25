#!/usr/bin/env python3
"""
batch-compare-v11-v12.json に後処理でジャンル別加重アンサンブルスコアを付与し、
等重みアンサンブルとの差分を比較する。
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
IN = ROOT / "data" / "experiments" / "batch-compare-v11-v12.json"
WEIGHTS = ROOT / "data" / "models" / "genre-weights-v12.json"
OUT = ROOT / "data" / "experiments" / "batch-compare-weighted-v12.json"


def resolve_weight(slug: str, weights_doc: dict):
    aliases = weights_doc.get("slug_aliases", {})
    if slug in aliases:
        return aliases[slug]["w_ep1"], aliases[slug]["w_long"], f"alias:{aliases[slug]['alias_of']}"
    narou = weights_doc.get("narou_genres", {})
    if slug in narou:
        return narou[slug]["w_ep1"], narou[slug]["w_long"], f"narou:{slug}"
    d = weights_doc.get("default", {"w_ep1": 0.5, "w_long": 0.5})
    return d["w_ep1"], d["w_long"], "default"


def main():
    with open(IN) as f:
        data = json.load(f)
    with open(WEIGHTS) as f:
        weights_doc = json.load(f)

    results = data["results"]

    # 加重スコア付与
    for r in results:
        p_ep1 = r["v12_ep1"] / 100
        p_long = r["v12_longform"] / 100
        w_ep1, w_long, source = resolve_weight(r.get("genre", ""), weights_doc)
        if p_ep1 <= 0 or p_long <= 0:
            p_weighted = 0
        else:
            p_weighted = (p_ep1 ** w_ep1) * (p_long ** w_long)
        r["v12_weighted"] = round(p_weighted * 100, 2)
        r["weight_source"] = source
        r["w_ep1"] = round(w_ep1, 4)
        r["w_long"] = round(w_long, 4)

    # 順位計算
    for key in ("v11_ep1", "v12_ensemble", "v12_weighted"):
        ordered = sorted(results, key=lambda x: -x[key])
        for i, r in enumerate(ordered):
            r[f"rank_{key}"] = i + 1

    # 等重み vs 加重 の差分
    for r in results:
        r["weight_delta"] = round(r["v12_weighted"] - r["v12_ensemble"], 2)
        r["weighted_rank_shift"] = r["rank_v12_ensemble"] - r["rank_v12_weighted"]  # 正=加重で上昇

    def mean(key):
        return sum(r[key] for r in results) / len(results) if results else 0

    print(f"対象: {len(results)}件")
    print("\n" + "=" * 60)
    print("平均スコア比較")
    print("=" * 60)
    print(f"  v11-ep1           : {mean('v11_ep1'):.2f}%")
    print(f"  v12-ensemble (等重み): {mean('v12_ensemble'):.2f}%")
    print(f"  v12-weighted (加重) : {mean('v12_weighted'):.2f}%")
    print(f"  加重-等重み 差分平均   : {mean('weight_delta'):+.2f}%")

    # 重みソース別分布
    src_count = {}
    for r in results:
        src = r["weight_source"].split(":")[0]
        src_count[src] = src_count.get(src, 0) + 1
    print(f"\n重みソース: {src_count}")

    # 等重み→加重で上昇/下落した作品 Top10
    up = sorted(results, key=lambda r: -r["weighted_rank_shift"])[:10]
    down = sorted(results, key=lambda r: r["weighted_rank_shift"])[:10]
    print("\n" + "=" * 60)
    print("加重で順位上昇 Top 10 (ep1寄りジャンル)")
    print("=" * 60)
    print(f"{'slug':<28} {'genre':<22} {'w_ep1':>5} {'v12ens':>7} {'v12wt':>6} {'shift':>6}")
    for r in up:
        print(f"{r['slug']:<28} {r['genre']:<22} {r['w_ep1']:>5.2f} {r['v12_ensemble']:>7.2f} {r['v12_weighted']:>6.2f} {r['weighted_rank_shift']:>+6d}")

    print("\n" + "=" * 60)
    print("加重で順位下落 Top 10 (ep1不利ジャンル)")
    print("=" * 60)
    print(f"{'slug':<28} {'genre':<22} {'w_ep1':>5} {'v12ens':>7} {'v12wt':>6} {'shift':>6}")
    for r in down:
        print(f"{r['slug']:<28} {r['genre']:<22} {r['w_ep1']:>5.2f} {r['v12_ensemble']:>7.2f} {r['v12_weighted']:>6.2f} {r['weighted_rank_shift']:>+6d}")

    # Top 20 を3モデル並べて比較
    print("\n" + "=" * 60)
    print("v12-weighted Top 20")
    print("=" * 60)
    print(f"{'slug':<28} {'genre':<22} {'v11':>5} {'ens':>5} {'wt':>5}")
    top20 = sorted(results, key=lambda r: -r["v12_weighted"])[:20]
    for r in top20:
        print(f"{r['slug']:<28} {r['genre']:<22} {r['v11_ep1']:>5.1f} {r['v12_ensemble']:>5.1f} {r['v12_weighted']:>5.1f}")

    # Top 30 集合の入れ替わり
    top30_ens = set(r["slug"] for r in sorted(results, key=lambda r: -r["v12_ensemble"])[:30])
    top30_wt = set(r["slug"] for r in sorted(results, key=lambda r: -r["v12_weighted"])[:30])
    print(f"\nTop 30 の入れ替わり: 等重み∩加重 = {len(top30_ens & top30_wt)}件 / 加重のみ = {len(top30_wt - top30_ens)}件")

    with open(OUT, "w") as f:
        json.dump({
            "generatedAt": __import__("datetime").datetime.now().isoformat(),
            "summary": {
                "total": len(results),
                "v11_mean": round(mean("v11_ep1"), 2),
                "v12_ensemble_mean": round(mean("v12_ensemble"), 2),
                "v12_weighted_mean": round(mean("v12_weighted"), 2),
            },
            "results": results,
        }, f, indent=2, ensure_ascii=False)
    print(f"\n保存: {OUT}")


if __name__ == "__main__":
    main()
