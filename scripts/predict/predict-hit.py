#!/usr/bin/env python3
"""
ヒット予測スクリプト v10

エピソードのテキストとオプショナルなLLM/Synopsisスコアから
v10モデルでヒット確率を計算する。

Usage:
  python3 scripts/predict-hit.py --slug test-villainess --episode 1 \
    --llm-hook 7 --llm-character 6 --llm-originality 5 \
    --llm-prose 6 --llm-tension 7 --llm-pull 7 \
    --synopsis-concept 7 --synopsis-hook 6 \
    --synopsis-differentiation 5 --synopsis-appeal 6
"""

import argparse
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
MODELS_DIR = PROJECT_ROOT / "data" / "models"
CONTENT_DIR = PROJECT_ROOT / "content" / "works"
FEEDBACK_DIR = PROJECT_ROOT / "data" / "feedback" / "hit-prediction"

# ─── 表層特徴量抽出（gbt-predictor.tsと同等） ───

POSITIVE_EMO = [
    "嬉しい", "嬉し", "喜び", "幸せ", "楽しい", "好き", "愛し",
    "感動", "ときめ", "安心", "微笑", "笑顔", "笑い", "笑っ",
]
NEGATIVE_EMO = [
    "悲しい", "悲し", "泣い", "涙", "辛い", "苦しい", "痛い",
    "怖い", "恐怖", "不安", "心配", "焦っ", "怒り", "怒っ",
    "悔し", "絶望", "寂し",
]
CONJ = [
    "しかし", "そして", "また", "さらに", "そのため", "ところが",
    "けれど", "だが", "それでも", "つまり", "すると", "やがて",
    "それから", "だから",
]


def extract_surface_features(text: str) -> list[float] | None:
    """テキストから21次元の表層特徴量を抽出"""
    sentences = [s.strip() for s in re.split(r"(?<=[。！？!?])", text) if s.strip()]
    if len(sentences) < 5:
        return None

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    chars = len(re.sub(r"\s", "", text))
    s_lens = [len(s) for s in sentences]
    s_avg = sum(s_lens) / len(s_lens)
    s_std = math.sqrt(sum((l - s_avg) ** 2 for l in s_lens) / len(s_lens))

    p_lens = [len(p) for p in paragraphs]
    p_avg = sum(p_lens) / len(p_lens)
    p_std = math.sqrt(sum((l - p_avg) ** 2 for l in p_lens) / len(p_lens))

    dialogues_text = "".join(re.findall(r"「[^」]*」", text))
    monologues_text = "".join(re.findall(r"（[^）]*）", text))

    diffs = [abs(s_lens[i] - s_lens[i - 1]) for i in range(1, len(s_lens))]
    mean_diff = sum(diffs) / len(diffs) if diffs else 0

    pos_count = sum(1 for w in POSITIVE_EMO if w in text)
    neg_count = sum(1 for w in NEGATIVE_EMO if w in text)
    total_emo = pos_count + neg_count

    kanji = re.findall(r"[\u4e00-\u9fff]", text)
    katakana = re.findall(r"[\u30a0-\u30ff]", text)
    hiragana = re.findall(r"[\u3040-\u309f]", text)
    commas = len(re.findall(r"、", text))
    questions = sum(1 for s in sentences if "？" in s or "?" in s)
    exclamations = sum(1 for s in sentences if "！" in s or "!" in s)

    clean_chars = list(re.sub(r"[\s\n\r、。！？!?「」『』（）\(\)・…―─ー]", "", text))
    bigrams = set()
    for i in range(len(clean_chars) - 1):
        bigrams.add(clean_chars[i] + clean_chars[i + 1])

    conj_used = sum(len(re.findall(w, text)) for w in CONJ)

    return [
        s_avg,
        s_std / s_avg if s_avg > 0 else 0,
        sum(1 for l in s_lens if l <= 20) / len(s_lens),
        sum(1 for l in s_lens if l >= 50) / len(s_lens),
        sum(1 for l in s_lens if 20 < l < 50) / len(s_lens),
        mean_diff / s_avg if s_avg > 0 else 0,
        p_std / p_avg if p_avg > 0 else 0,
        p_avg,
        dialogues_text.__len__() / chars if chars > 0 else 0,
        monologues_text.__len__() / chars if chars > 0 else 0,
        (chars - len(dialogues_text) - len(monologues_text)) / chars if chars > 0 else 0,
        total_emo / (chars / 1000) if chars > 0 else 0,
        len(set(w for w in POSITIVE_EMO + NEGATIVE_EMO if w in text)) / total_emo if total_emo > 0 else 0,
        questions / len(sentences),
        exclamations / len(sentences),
        commas / len(sentences),
        len(bigrams) / (len(clean_chars) - 1) if len(clean_chars) > 1 else 0,
        len(kanji) / chars if chars > 0 else 0,
        len(katakana) / chars if chars > 0 else 0,
        len(hiragana) / chars if chars > 0 else 0,
        conj_used / (chars / 1000) if chars > 0 else 0,
    ]


# ─── ジャンル推定 ───

GENRE_GROUPS_MAP = {"ファンタジー": 0, "恋愛": 1, "文芸": 2, "その他": 3}
GENRE_KEYWORDS = {
    "ファンタジー": ["ファンタジー", "追放", "ざまぁ", "スローライフ", "チート", "転生", "魔法", "勇者", "魔王"],
    "恋愛": ["恋愛", "悪役令嬢", "婚約破棄", "溺愛", "ラブ", "恋"],
    "文芸": ["歴史", "推理", "ヒューマンドラマ", "純文学", "ホラー", "ミステリー"],
}


def detect_genre(settings_text: str) -> int:
    """設定ファイルからジャンルグループを推定"""
    for group, keywords in GENRE_KEYWORDS.items():
        for kw in keywords:
            if kw in settings_text:
                return GENRE_GROUPS_MAP[group]
    return GENRE_GROUPS_MAP["その他"]


# ─── GBT予測（v10モデル） ───

def predict_tree(node: dict, features: list) -> float:
    """ツリー走査"""
    if "v" in node:
        return node["v"]

    f_idx = node["f"]
    val = features[f_idx]

    if val is None or (isinstance(val, float) and math.isnan(val)):
        direction = node.get("d", "l")
        return predict_tree(node["l"] if direction == "l" else node["r"], features)

    if node.get("cat"):
        return predict_tree(node["l"] if val == node["t"] else node["r"], features)

    return predict_tree(node["l"] if val <= node["t"] else node["r"], features)


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def predict_hit(features: list, model: dict) -> float:
    """v10モデルでヒット確率を計算"""
    raw_score = sum(predict_tree(tree, features) for tree in model["trees"])
    return sigmoid(raw_score)


# ─── メイン処理 ───

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument("--episode", type=int, default=1)
    # LLMスコア (1-10)
    for axis in ["hook", "character", "originality", "prose", "tension", "pull"]:
        parser.add_argument(f"--llm-{axis}", type=float, default=None)
    # Synopsisスコア (1-10)
    for axis in ["concept", "hook", "differentiation", "appeal"]:
        parser.add_argument(f"--synopsis-{axis}", type=float, default=None)
    parser.add_argument("--text-file", default=None, help="エピソードのmdファイルパス（省略時はslug/episodeから自動）")
    args = parser.parse_args()

    # ─── テキスト読み込み ───
    if args.text_file:
        text_path = Path(args.text_file)
    else:
        text_path = CONTENT_DIR / args.slug / f"ep{args.episode:03d}.md"

    if not text_path.exists():
        print(f"エラー: {text_path} が見つかりません", file=sys.stderr)
        sys.exit(1)

    text = text_path.read_text(encoding="utf-8")

    # md frontmatter除去
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            text = parts[2]

    # ─── 設定ファイル読み込み（ジャンル推定用） ───
    settings_path = CONTENT_DIR / args.slug / "_settings.md"
    settings_text = settings_path.read_text(encoding="utf-8") if settings_path.exists() else ""
    genre_id = detect_genre(settings_text)
    genre_name = [k for k, v in GENRE_GROUPS_MAP.items() if v == genre_id][0]

    # ─── 表層特徴量 ───
    surface = extract_surface_features(text)
    if surface is None:
        print(f"エラー: テキストが短すぎて特徴量抽出できません ({len(text)}文字)", file=sys.stderr)
        sys.exit(1)

    # ─── 特徴量ベクトル構築（v10のfeature_names順） ───
    features = list(surface)
    # メタ4D（ランタイムでは不明）
    features.extend([None, None, None, None])
    # log_episodes（不明）
    features.append(None)
    # genre_group
    features.append(float(genre_id))
    # Synopsis 4D
    for axis in ["concept", "hook", "differentiation", "appeal"]:
        val = getattr(args, f"synopsis_{axis}")
        features.append(val)
    # LLM 6D
    for axis in ["hook", "character", "originality", "prose", "tension", "pull"]:
        val = getattr(args, f"llm_{axis}")
        features.append(val)

    # ─── モデル読み込み・予測 ───
    model_path = MODELS_DIR / "hit-prediction-v10.json"
    with open(model_path) as f:
        model = json.load(f)

    probability = predict_hit(features, model)
    probability_pct = round(probability * 100, 1)

    # ─── Tier判定 ───
    if probability >= 0.5:
        tier = "top"
    elif probability >= 0.35:
        tier = "upper"
    elif probability >= 0.2:
        tier = "mid"
    elif probability >= 0.1:
        tier = "lower"
    else:
        tier = "bottom"

    # ─── 信頼度判定 ───
    has_llm = any(getattr(args, f"llm_{a}") is not None for a in ["hook", "character", "originality", "prose", "tension", "pull"])
    has_syn = any(getattr(args, f"synopsis_{a}") is not None for a in ["concept", "hook", "differentiation", "appeal"])
    if has_llm and has_syn:
        reliability = "high"
    elif has_llm or has_syn:
        reliability = "medium"
    else:
        reliability = "low"

    # ─── 結果出力 ───
    result = {
        "slug": args.slug,
        "episode": args.episode,
        "modelVersion": "v10",
        "hitProbability": probability_pct,
        "tier": tier,
        "predictedAt": datetime.now().isoformat(),
        "genre": genre_name,
        "textLength": len(text),
        "reliability": reliability,
        "inputScores": {
            "llm": {a: getattr(args, f"llm_{a}") for a in ["hook", "character", "originality", "prose", "tension", "pull"]} if has_llm else None,
            "synopsis": {a: getattr(args, f"synopsis_{a}") for a in ["concept", "hook", "differentiation", "appeal"]} if has_syn else None,
        },
    }

    # ─── 保存 ───
    FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)
    out_path = FEEDBACK_DIR / f"{args.slug}_ep{args.episode:03d}.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # ─── 表示 ───
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n保存: {out_path}")


if __name__ == "__main__":
    main()
