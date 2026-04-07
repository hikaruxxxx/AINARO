#!/usr/bin/env python3
"""
Bradley-Terry ペア比較パイプライン

Step 1: 作品ペアを生成（Swiss-tournament方式）
Step 2: Claude Code サブエージェントでA/B比較（手動実行）
Step 3: 勝敗データからBradley-Terryレーティングを算出

Usage:
  # Step 1: ペア生成（パイロット100ペア）
  python3 scripts/bt-pairwise-compare.py generate --pairs 100

  # Step 3: レーティング計算
  python3 scripts/bt-pairwise-compare.py rating
"""

import json
import math
import random
import sys
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path(__file__).parent.parent / "data"
EXPERIMENTS = DATA_DIR / "experiments"
BT_DIR = EXPERIMENTS / "bradley-terry"

def load_works():
    """比較対象の作品一覧を読み込み"""
    with open(EXPERIMENTS / "llm-feature-scores-v3.json") as f:
        v3 = json.load(f)["results"]

    with open(DATA_DIR / "targets" / "narou_50k.json") as f:
        n50k = json.load(f)
    n50k_story = {r["ncode"]: r.get("story", "") for r in n50k if r.get("story", "").strip()}

    works = []
    for r in v3:
        ncode = r["ncode"]

        # EP1テキスト取得（crawledを優先、v3内蔵をフォールバック）
        ep1_text = ""
        ep1_path = DATA_DIR / "crawled" / ncode / "ep0001.json"
        if ep1_path.exists():
            try:
                with open(ep1_path) as f:
                    ep = json.load(f)
                ep1_text = ep.get("bodyText", "") or ep.get("body", "") or ""
            except Exception:
                pass

        if not ep1_text or len(ep1_text) < 500:
            ep1_text = r.get("text", "")

        if len(ep1_text) < 500:
            continue

        # 5,000文字上限（末尾を優先 = 引きを残す）
        if len(ep1_text) > 5000:
            ep1_text = ep1_text[:5000]

        story = n50k_story.get(ncode, "")

        works.append({
            "ncode": ncode,
            "gp": r.get("gp", 0),
            "genre": r.get("genre", ""),
            "story": story,
            "ep1_text": ep1_text,
        })

    return works


def generate_pairs(n_pairs: int = 100, seed: int = 42):
    """Swiss-tournament方式でペアを生成"""
    works = load_works()
    random.seed(seed)

    print(f"対象作品数: {len(works)}")

    # パイロット: ランダムペア（Round 1）
    # GP層化サンプリングで全GP帯をカバー
    works_sorted = sorted(works, key=lambda w: w["gp"])
    n = len(works_sorted)

    pairs = []
    used_pairs = set()

    # 5つのGP帯から均等にサンプリング
    bands = [works_sorted[i * n // 5:(i + 1) * n // 5] for i in range(5)]

    attempts = 0
    while len(pairs) < n_pairs and attempts < n_pairs * 10:
        attempts += 1
        # 2つの異なるバンドからランダムに選ぶ（異なるGP帯の比較を多く含める）
        if random.random() < 0.6:
            # 異バンド比較（60%）
            b1, b2 = random.sample(range(5), 2)
            w1 = random.choice(bands[b1])
            w2 = random.choice(bands[b2])
        else:
            # 同バンド比較（40%）— 近いGP帯の細かい順位付けに重要
            b = random.choice(range(5))
            if len(bands[b]) < 2:
                continue
            w1, w2 = random.sample(bands[b], 2)

        pair_key = tuple(sorted([w1["ncode"], w2["ncode"]]))
        if pair_key in used_pairs:
            continue
        used_pairs.add(pair_key)

        # A/Bの配置をランダム化（順序バイアス対策）
        if random.random() < 0.5:
            w1, w2 = w2, w1

        pairs.append({
            "id": len(pairs),
            "work_a": {
                "ncode": w1["ncode"],
                "genre": w1["genre"],
                "story": w1["story"],
                "ep1_text": w1["ep1_text"],
            },
            "work_b": {
                "ncode": w2["ncode"],
                "genre": w2["genre"],
                "story": w2["story"],
                "ep1_text": w2["ep1_text"],
            },
            "result": None,  # "A" or "B" — 比較後に埋める
        })

    # ペアデータ保存
    BT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = BT_DIR / "pairs-pilot-100.json"
    with open(output_path, "w") as f:
        json.dump({
            "generatedAt": __import__("datetime").datetime.now().isoformat(),
            "totalPairs": len(pairs),
            "totalWorks": len(set(p["work_a"]["ncode"] for p in pairs) | set(p["work_b"]["ncode"] for p in pairs)),
            "pairs": pairs,
        }, f, indent=2, ensure_ascii=False)

    print(f"ペア生成完了: {len(pairs)}ペア")
    print(f"使用作品数: {len(set(p['work_a']['ncode'] for p in pairs) | set(p['work_b']['ncode'] for p in pairs))}")
    print(f"保存先: {output_path}")

    # 統計
    gps_a = [p["work_a"].get("gp", 0) for p in pairs if "gp" in p.get("work_a", {})]
    text_lens = [len(p["work_a"]["ep1_text"]) + len(p["work_b"]["ep1_text"]) for p in pairs]
    print(f"平均テキスト長（ペア合計）: {sum(text_lens) // len(text_lens):,}文字")

    # 比較用プロンプトのサンプルを出力
    p = pairs[0]
    print(f"\n--- サンプルプロンプト (pair #{p['id']}) ---")
    print(format_comparison_prompt(p))


def format_comparison_prompt(pair: dict) -> str:
    """ペア比較用のプロンプトを生成"""
    wa = pair["work_a"]
    wb = pair["work_b"]

    story_a = f"\n【あらすじ】\n{wa['story']}\n" if wa["story"] else ""
    story_b = f"\n【あらすじ】\n{wb['story']}\n" if wb["story"] else ""

    return f"""2つのWeb小説を読み比べて、「続きを読みたい」と思う方を選んでください。

=== 作品A ==={story_a}
【第1話】
{wa['ep1_text']}

=== 作品B ==={story_b}
【第1話】
{wb['ep1_text']}

===

どちらの作品の続きを読みたいですか？ AまたはBのみで回答してください。"""


def compute_ratings():
    """Bradley-Terryモデルでレーティングを計算"""
    results_path = BT_DIR / "results-pilot-100.json"
    if not results_path.exists():
        print(f"結果ファイルが見つかりません: {results_path}")
        sys.exit(1)

    with open(results_path) as f:
        data = json.load(f)

    pairs = data["pairs"]
    completed = [p for p in pairs if p.get("result") in ("A", "B")]
    print(f"完了ペア: {len(completed)}/{len(pairs)}")

    if len(completed) < 10:
        print("比較数が少なすぎます（最低10ペア）")
        sys.exit(1)

    # 勝敗集計
    wins = defaultdict(int)  # ncode -> 勝利数
    matches = defaultdict(int)  # ncode -> 対戦数
    head_to_head = defaultdict(lambda: defaultdict(int))  # i vs j -> i wins

    for p in completed:
        na = p["work_a"]["ncode"]
        nb = p["work_b"]["ncode"]
        winner = na if p["result"] == "A" else nb
        loser = nb if p["result"] == "A" else na

        wins[winner] += 1
        matches[winner] += 1
        matches[loser] += 1
        head_to_head[winner][loser] += 1

    all_works = sorted(matches.keys())
    n = len(all_works)
    idx = {w: i for i, w in enumerate(all_works)}

    print(f"参加作品数: {n}")
    print(f"平均対戦数: {sum(matches.values()) / n:.1f}")

    # Bradley-Terry MLE (反復法)
    # P(i beats j) = rating[i] / (rating[i] + rating[j])
    ratings = [1.0] * n  # 初期値

    for iteration in range(100):
        new_ratings = [0.0] * n
        for i in range(n):
            wi = all_works[i]
            numerator = wins[wi]
            denominator = 0.0
            for j in range(n):
                if i == j:
                    continue
                wj = all_works[j]
                nij = head_to_head[wi][wj] + head_to_head[wj][wi]
                if nij > 0:
                    denominator += nij / (ratings[i] + ratings[j])
            new_ratings[i] = numerator / denominator if denominator > 0 else ratings[i]

        # 正規化（幾何平均 = 1）
        geo_mean = math.exp(sum(math.log(max(r, 1e-10)) for r in new_ratings) / n)
        new_ratings = [r / geo_mean for r in new_ratings]

        # 収束チェック
        max_diff = max(abs(new_ratings[i] - ratings[i]) for i in range(n))
        ratings = new_ratings
        if max_diff < 1e-8:
            print(f"収束: {iteration + 1}回")
            break

    # Elo変換 (rating → Elo scale)
    # Elo = 400 * log10(rating) + 1500
    elo_scores = {}
    for i, w in enumerate(all_works):
        elo = 400 * math.log10(max(ratings[i], 1e-10)) + 1500
        elo_scores[w] = round(elo, 1)

    # ソートして表示
    ranked = sorted(elo_scores.items(), key=lambda x: -x[1])
    print(f"\n{'Rank':>4} {'Ncode':>15} {'Elo':>8} {'Wins':>5} {'Matches':>8}")
    print("-" * 50)
    for rank, (ncode, elo) in enumerate(ranked[:20], 1):
        print(f"{rank:>4} {ncode:>15} {elo:>8.1f} {wins[ncode]:>5} {matches[ncode]:>8}")

    # 保存
    output = {
        "generatedAt": __import__("datetime").datetime.now().isoformat(),
        "method": "bradley_terry_mle",
        "totalWorks": n,
        "totalComparisons": len(completed),
        "ratings": elo_scores,
        "ranked": [{"ncode": nc, "elo": elo, "wins": wins[nc], "matches": matches[nc]}
                   for nc, elo in ranked],
    }

    output_path = BT_DIR / "ratings-pilot.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\nレーティング保存: {output_path}")

    return elo_scores


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/bt-pairwise-compare.py [generate|rating]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "generate":
        n_pairs = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].startswith("-") is False else 100
        # --pairs オプション
        for i, arg in enumerate(sys.argv):
            if arg == "--pairs" and i + 1 < len(sys.argv):
                n_pairs = int(sys.argv[i + 1])
        generate_pairs(n_pairs)
    elif cmd == "rating":
        compute_ratings()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
