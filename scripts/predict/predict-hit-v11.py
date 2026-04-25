#!/usr/bin/env python3
"""
ヒット予測スクリプト v11-pure

v11-pure モデル（本文25D + タイトル3D + avgEpChars 1D = 29D）でヒット確率を計算。
v10と違い LLM/Synopsis スコア不要。テキスト＋タイトルだけで予測する。

Usage:
  python3 scripts/predict/predict-hit-v11.py \\
    --slug test-work --episode 1 \\
    --text-file data/generation/batches/batch_X/test-work/ep001.md
"""

import argparse
import json
import math
import re
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
MODELS_DIR = PROJECT_ROOT / "data" / "models"
CONTENT_DIR = PROJECT_ROOT / "content" / "works"
FEEDBACK_DIR = PROJECT_ROOT / "data" / "feedback" / "hit-prediction"

# ─── 感情語辞書（src/lib/features.ts と一致） ───

POSITIVE_EMOTIONS = [
    "嬉しい", "嬉し", "喜び", "喜ん", "幸せ", "楽しい", "楽し",
    "好き", "愛し", "感動", "ときめ", "ドキドキ", "わくわく",
    "安心", "安堵", "ほっと", "微笑", "笑顔", "笑い", "笑っ",
]

NEGATIVE_EMOTIONS = [
    "悲しい", "悲し", "泣い", "泣き", "涙", "辛い",
    "苦しい", "苦し", "痛い", "怖い", "恐ろし", "恐怖",
    "不安", "心配", "焦り", "焦っ", "怒り", "怒っ",
    "悔し", "絶望", "寂し", "孤独",
]

TENSION_WORDS = ["しかし", "だが", "その時", "まさか", "突然", "……", "――", "？"]

# ─── 表層特徴量抽出（ExtendedFeatures 25D） ───

def round4(v: float) -> float:
    return round(v * 10000) / 10000


def extract_extended_features(text: str) -> dict | None:
    """
    src/lib/features.ts::extractExtendedFeatures の Python 移植。
    25次元の表層特徴量を返す。テキストが短すぎる場合は None。
    """
    if not text or len(text) < 300:
        return None

    sentences = [s.strip() for s in re.split(r"(?<=[。！？!?])", text) if s.strip()]
    if len(sentences) < 5:
        return None

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    char_count = len(re.sub(r"\s", "", text))
    lengths = [len(s) for s in sentences]
    avg_len = sum(lengths) / len(lengths)
    std_dev = math.sqrt(sum((l - avg_len) ** 2 for l in lengths) / len(lengths))

    dialogues = re.findall(r"「[^」]*」", text)
    dialogue_chars = sum(len(d) for d in dialogues)
    monologue_chars = sum(len(m) for m in re.findall(r"（[^）]*）", text))

    diffs = [abs(lengths[i] - lengths[i - 1]) for i in range(1, len(lengths))]
    mean_diff = sum(diffs) / len(diffs) if diffs else 0

    para_lengths = [len(p) for p in paragraphs]
    para_avg = sum(para_lengths) / len(para_lengths) if para_lengths else 0
    para_std = math.sqrt(
        sum((l - para_avg) ** 2 for l in para_lengths) / len(para_lengths)
    ) if para_lengths else 0

    pos_count = sum(1 for w in POSITIVE_EMOTIONS if w in text)
    neg_count = sum(1 for w in NEGATIVE_EMOTIONS if w in text)
    total_emotion = pos_count + neg_count

    half_point = len(text) // 2
    first_half = text[:half_point]
    second_half = text[half_point:]
    pos_first = sum(1 for w in POSITIVE_EMOTIONS if w in first_half)
    neg_first = sum(1 for w in NEGATIVE_EMOTIONS if w in first_half)
    pos_second = sum(1 for w in POSITIVE_EMOTIONS if w in second_half)
    neg_second = sum(1 for w in NEGATIVE_EMOTIONS if w in second_half)
    polarity_first = (pos_first - neg_first) / (pos_first + neg_first) if (pos_first + neg_first) > 0 else 0
    polarity_second = (pos_second - neg_second) / (pos_second + neg_second) if (pos_second + neg_second) > 0 else 0

    commas = len(re.findall(r"、", text))

    scene_breaks = (
        len(re.findall(r"\n\s*\n\s*\n", text))
        + len(re.findall(r"\n\s*[＊*]{3,}\s*\n", text))
        + len(re.findall(r"\n\s*[─―]{3,}\s*\n", text))
    )

    opening_3 = sentences[:3]
    opening_len = sum(len(s) for s in opening_3)

    last_sentences = sentences[-3:]
    ending_tension = 1 if any(
        any(w in s for w in TENSION_WORDS) for s in last_sentences
    ) else 0

    speaker_contexts = set()
    for m in re.finditer(r"([^\n「」]{0,10})「[^」]+」", text):
        speaker_contexts.add(m.group(1).strip()[-5:])

    kanji = re.findall(r"[\u4e00-\u9fff]", text)
    unique_kanji = set(kanji)
    katakana = re.findall(r"[\u30a0-\u30ff]", text)

    special_punct = set()
    for ch in text:
        if ch in "——――……！？!?「」（）『』【】":
            special_punct.add(ch)

    unique_emotions = set()
    for w in POSITIVE_EMOTIONS:
        if w in text:
            unique_emotions.add(w)
    for w in NEGATIVE_EMOTIONS:
        if w in text:
            unique_emotions.add(w)

    return {
        "avgSentenceLength": round4(avg_len),
        "sentenceLengthCV": round4(std_dev / avg_len if avg_len > 0 else 0),
        "dialogueRatio": round4(dialogue_chars / char_count if char_count > 0 else 0),
        "shortSentenceRatio": round4(sum(1 for l in lengths if l <= 20) / len(lengths)),
        "emotionDensity": round4((total_emotion / char_count) * 100 if char_count > 0 else 0),
        "questionRatio": round4(sum(1 for s in sentences if "？" in s or "?" in s) / len(sentences)),
        "exclamationRatio": round4(sum(1 for s in sentences if "！" in s or "!" in s) / len(sentences)),
        "burstRatio": round4(mean_diff / avg_len if avg_len > 0 else 0),
        "paragraphLengthCV": round4(para_std / para_avg if para_avg > 0 else 0),
        "avgParagraphLength": round4(para_avg),
        "longSentenceRatio": round4(sum(1 for l in lengths if l >= 50) / len(lengths)),
        "sentenceLengthRange": round4((max(lengths) - min(lengths)) / avg_len if avg_len > 0 else 0),
        "dialogueAvgLength": round4(dialogue_chars / len(dialogues) if dialogues else 0),
        "emotionPolarity": round4((pos_count - neg_count) / total_emotion if total_emotion > 0 else 0),
        "emotionSwing": round4(abs(polarity_first - polarity_second)),
        "uniqueEmotionRatio": round4(len(unique_emotions) / total_emotion if total_emotion > 0 else 0),
        "commaPerSentence": round4(commas / len(sentences)),
        "sceneBreakCount": scene_breaks,
        "openingLength": opening_len,
        "endingQuestionOrTension": ending_tension,
        "speakerVariety": len(speaker_contexts),
        "innerMonologueRatio": round4(monologue_chars / char_count if char_count > 0 else 0),
        "uniqueKanjiRatio": round4(len(unique_kanji) / len(kanji) if kanji else 0),
        "katakanaRatio": round4(len(katakana) / char_count if char_count > 0 else 0),
        "punctuationVariety": len(special_punct),
    }


# ─── タイトル特徴量 ───

TEMPLATE_KWS = [
    "追放", "ざまぁ", "転生", "異世界", "婚約破棄", "悪役令嬢",
    "聖女", "チート", "スローライフ", "ハーレム", "最強",
]


def title_features(title: str) -> dict:
    return {
        "titleLen": len(title),
        "titleHasBracket": 1 if re.search(r"[【」『]|（", title) else 0,
        "titleHasTemplateKw": 1 if any(kw in title for kw in TEMPLATE_KWS) else 0,
    }


# ─── GBT予測 ───

def predict_tree(node: dict, features: list) -> float:
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
    raw = sum(predict_tree(tree, features) for tree in model["trees"])
    return sigmoid(raw)


# ─── タイトル抽出 ───

TITLE_HEADER_RE = re.compile(r"^#\s*第\d+話「(.+?)」\s*$", re.MULTILINE)


def extract_title_from_md(text: str) -> str:
    """ep001.md の先頭から `# 第1話「タイトル」` を拾う"""
    m = TITLE_HEADER_RE.search(text[:500])
    return m.group(1) if m else ""


# ─── メイン ───

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument("--episode", type=int, default=1)
    parser.add_argument("--text-file", default=None)
    parser.add_argument("--title", default=None, help="作品タイトル（未指定時は ep001.md のヘッダーから抽出）")
    parser.add_argument("--model-version", default="v11-ep1",
                        choices=["v11-ep1", "v11-pure", "v11-surface", "v11-body"])
    args = parser.parse_args()

    # テキスト読み込み
    if args.text_file:
        text_path = Path(args.text_file)
    else:
        text_path = CONTENT_DIR / args.slug / f"ep{args.episode:03d}.md"

    if not text_path.exists():
        print(f"エラー: {text_path} が見つかりません", file=sys.stderr)
        sys.exit(1)

    raw_text = text_path.read_text(encoding="utf-8")

    # JSON (data/crawled 形式) の場合は bodyText を抜き出す
    if text_path.suffix == ".json":
        try:
            obj = json.loads(raw_text)
            raw_text = obj.get("bodyText", raw_text)
        except json.JSONDecodeError:
            pass

    # タイトル抽出（md ヘッダーから自動、--title があれば優先）
    title = args.title or extract_title_from_md(raw_text)

    # md ヘッダー除去（タイトル行は本文特徴から外す）
    text = raw_text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            text = parts[2]
    text = TITLE_HEADER_RE.sub("", text)

    # 特徴量抽出
    surface = extract_extended_features(text)
    if surface is None:
        print(f"エラー: テキストが短すぎて特徴量抽出できません ({len(text)}文字)", file=sys.stderr)
        sys.exit(1)

    # モデル読み込み
    model_file = f"hit-prediction-{args.model_version}.json"
    model_path = MODELS_DIR / model_file
    if not model_path.exists():
        print(f"エラー: モデルが見つかりません: {model_path}", file=sys.stderr)
        sys.exit(1)
    with open(model_path) as f:
        model = json.load(f)

    # 特徴量ベクトル構築（feature_names の順に従う）
    feat_sources = {**surface}
    if args.model_version in ("v11-ep1", "v11-pure", "v11-surface"):
        feat_sources.update(title_features(title))
        feat_sources["avgEpChars"] = len(re.sub(r"\s", "", text))

    features = []
    for name in model["feature_names"]:
        v = feat_sources.get(name)
        features.append(float(v) if v is not None else None)

    probability = predict_hit(features, model)
    probability_pct = round(probability * 100, 1)

    # Tier判定（v11-ep1 の実スコア分布に合わせ調整）
    # 既知ヒット作は 24-34% 前後、AINARO生成品は 3-15% 前後で分離
    # top5% ≈ 0.45+、top10% ≈ 0.38+、top20% ≈ 0.30+
    if probability >= 0.45:
        tier = "top"
    elif probability >= 0.35:
        tier = "upper"
    elif probability >= 0.25:
        tier = "mid"
    elif probability >= 0.15:
        tier = "lower"
    else:
        tier = "bottom"

    result = {
        "slug": args.slug,
        "episode": args.episode,
        "modelVersion": args.model_version,
        "hitProbability": probability_pct,
        "tier": tier,
        "predictedAt": datetime.now().isoformat(),
        "title": title,
        "textLength": len(text),
        "reliability": "high",  # v11 は LLM スコア不要で自己完結
    }

    FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)
    out_path = FEEDBACK_DIR / f"{args.slug}_ep{args.episode:03d}.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"\n保存: {out_path}")


if __name__ == "__main__":
    main()
