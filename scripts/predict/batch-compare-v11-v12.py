#!/usr/bin/env python3
"""
content/works/ 配下の全作品に対し v11-ep1 / v12-ep1 / v12-longform を一括予測し、
v11 と v12 アンサンブルのスコア・順位差を比較する。

出力:
  data/experiments/batch-compare-v11-v12.json — 作品別スコア一覧
  標準出力 — 要約統計
"""

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts" / "predict"))

# predict-hit-v11.py / predict-hit-v12.py は予約名で import できないため、
# 内部関数を直接定義した predict_hit_v11 をインラインで再実装してもよいが、
# 関数コピーを避けるため v12 を再利用する。
import importlib.util

def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

PREDICT_DIR = ROOT / "scripts" / "predict"
v12 = _load_module("predict_hit_v12", PREDICT_DIR / "predict-hit-v12.py")

CONTENT = ROOT / "content" / "works"
MODELS = ROOT / "data" / "models"
OUT = ROOT / "data" / "experiments" / "batch-compare-v11-v12.json"


def load_model(filename: str) -> dict:
    with open(MODELS / filename) as f:
        return json.load(f)


def predict_once(model: dict, surface: dict, title: str, avg_ep_chars: int) -> float:
    feat_sources = {**surface, **v12.title_features(title), "avgEpChars": avg_ep_chars}
    features = []
    for name in model["feature_names"]:
        val = feat_sources.get(name)
        features.append(float(val) if val is not None else None)
    return v12.predict_hit(features, model)


def extract_genre_from_settings(settings_path: Path) -> str:
    if not settings_path.exists():
        return ""
    text = settings_path.read_text(encoding="utf-8")
    m = re.search(r"- ジャンル[：:]\s*(\S+)", text)
    return m.group(1) if m else ""


def main():
    model_v11 = load_model("hit-prediction-v11-ep1.json")
    model_v12_ep1 = load_model("hit-prediction-v12-ep1.json")
    model_v12_long = load_model("hit-prediction-v12-longform.json")

    works = sorted([p for p in CONTENT.iterdir() if p.is_dir()])
    print(f"対象作品: {len(works)}件")

    results = []
    errors = []
    for w in works:
        ep1 = w / "ep001.md"
        if not ep1.exists():
            continue
        try:
            raw = ep1.read_text(encoding="utf-8")
            title = v12.extract_title_from_md(raw)
            text = raw
            if text.startswith("---"):
                parts = text.split("---", 2)
                if len(parts) >= 3:
                    text = parts[2]
            text = v12.TITLE_HEADER_RE.sub("", text)

            surface = v12.extract_extended_features(text)
            if surface is None:
                errors.append({"slug": w.name, "reason": f"本文が短すぎる ({len(text)}字)"})
                continue

            avg_ep_chars = len(re.sub(r"\s", "", text))
            p_v11 = predict_once(model_v11, surface, title, avg_ep_chars)
            p_v12_ep1 = predict_once(model_v12_ep1, surface, title, avg_ep_chars)
            p_v12_long = predict_once(model_v12_long, surface, title, avg_ep_chars)
            p_v12_ens = math.sqrt(p_v12_ep1 * p_v12_long)

            results.append({
                "slug": w.name,
                "title": title,
                "genre": extract_genre_from_settings(w / "_settings.md"),
                "textLength": len(text),
                "v11_ep1": round(p_v11 * 100, 2),
                "v12_ep1": round(p_v12_ep1 * 100, 2),
                "v12_longform": round(p_v12_long * 100, 2),
                "v12_ensemble": round(p_v12_ens * 100, 2),
                "v11_to_v12_delta": round((p_v12_ens - p_v11) * 100, 2),
            })
        except Exception as e:
            errors.append({"slug": w.name, "reason": str(e)})

    # ─── ソートと要約 ───
    results.sort(key=lambda r: -r["v12_ensemble"])

    def pct(predicate, arr):
        n = len(arr)
        if n == 0:
            return 0.0
        return sum(1 for r in arr if predicate(r)) / n * 100

    def mean(key):
        return sum(r[key] for r in results) / len(results) if results else 0

    print(f"\n成功: {len(results)}件 / 失敗: {len(errors)}件")
    print("\n" + "=" * 60)
    print("全体統計")
    print("=" * 60)
    print(f"  v11-ep1      平均: {mean('v11_ep1'):.2f}%")
    print(f"  v12-ep1      平均: {mean('v12_ep1'):.2f}%")
    print(f"  v12-longform 平均: {mean('v12_longform'):.2f}%")
    print(f"  v12-ensemble 平均: {mean('v12_ensemble'):.2f}%")
    print(f"  v11→v12差分  平均: {mean('v11_to_v12_delta'):+.2f}%")

    print("\n" + "=" * 60)
    print("Tier 分布 (v12-ensemble)")
    print("=" * 60)
    for name, pred in [
        ("top (≥45%)", lambda r: r["v12_ensemble"] >= 45),
        ("upper (35-45%)", lambda r: 35 <= r["v12_ensemble"] < 45),
        ("mid (25-35%)", lambda r: 25 <= r["v12_ensemble"] < 35),
        ("lower (15-25%)", lambda r: 15 <= r["v12_ensemble"] < 25),
        ("bottom (<15%)", lambda r: r["v12_ensemble"] < 15),
    ]:
        n = sum(1 for r in results if pred(r))
        print(f"  {name:<18} {n:>4}件 ({n/max(len(results),1)*100:>5.1f}%)")

    print("\n" + "=" * 60)
    print("v11 vs v12-ensemble 順位変動 (上位/下位)")
    print("=" * 60)
    # v11 順位と v12 順位の差が大きい作品を抽出
    rank_v11 = {r["slug"]: i for i, r in enumerate(sorted(results, key=lambda x: -x["v11_ep1"]))}
    rank_v12 = {r["slug"]: i for i, r in enumerate(sorted(results, key=lambda x: -x["v12_ensemble"]))}
    for r in results:
        r["rank_v11"] = rank_v11[r["slug"]] + 1
        r["rank_v12"] = rank_v12[r["slug"]] + 1
        r["rank_delta"] = r["rank_v11"] - r["rank_v12"]  # 正 = v12 で上昇

    biggest_up = sorted(results, key=lambda r: -r["rank_delta"])[:10]
    biggest_down = sorted(results, key=lambda r: r["rank_delta"])[:10]
    print(f"\n{'slug':<30} {'genre':<20} {'v11':>6} {'v12ens':>7} {'Δ順位':>7}")
    print("-- v12 で評価上昇 Top 10 --")
    for r in biggest_up:
        print(f"{r['slug']:<30} {r['genre']:<20} {r['v11_ep1']:>6.1f} {r['v12_ensemble']:>7.1f} {r['rank_delta']:>+7d}")
    print("-- v12 で評価下落 Top 10 --")
    for r in biggest_down:
        print(f"{r['slug']:<30} {r['genre']:<20} {r['v11_ep1']:>6.1f} {r['v12_ensemble']:>7.1f} {r['rank_delta']:>+7d}")

    print("\n" + "=" * 60)
    print("v12-ensemble Top 20")
    print("=" * 60)
    print(f"{'slug':<30} {'genre':<20} {'v11':>6} {'v12ep1':>7} {'v12lng':>7} {'v12ens':>7}")
    for r in results[:20]:
        print(f"{r['slug']:<30} {r['genre']:<20} {r['v11_ep1']:>6.1f} {r['v12_ep1']:>7.1f} {r['v12_longform']:>7.1f} {r['v12_ensemble']:>7.1f}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({
            "generatedAt": __import__("datetime").datetime.now().isoformat(),
            "modelVersions": ["v11-ep1", "v12-ep1", "v12-longform", "v12-ensemble"],
            "summary": {
                "total": len(results),
                "errors": len(errors),
                "v11_mean": round(mean("v11_ep1"), 2),
                "v12_ensemble_mean": round(mean("v12_ensemble"), 2),
                "delta_mean": round(mean("v11_to_v12_delta"), 2),
            },
            "results": results,
            "errors": errors,
        }, f, indent=2, ensure_ascii=False)
    print(f"\n保存: {OUT}")


if __name__ == "__main__":
    main()
