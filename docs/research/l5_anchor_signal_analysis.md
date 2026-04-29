# L5 anchor 選定の代替シグナル分析

**作成日**: 2026-04-29
**経緯**: Layer 5 anchor 校正で hit/middle/low の中央値 Elo が安定しない問題 (modern_romance: middle > hit > low) の再現性を確認するために、narou メタデータから ep1 品質に直接相関するシグナルを探した。

## 結論

**narou_50k.json には ep1 品質を直接捉えるメタデータが存在しない**。lifetime globalPoint は ep1 retention + 累積読者数 + 連載速度 + ジャンルブームの混合指標で、ep1 品質に対するノイズが大きい。

代替シグナル候補を検討したが、いずれも globalPoint 以上の強い相関は得られない見込み。

## 検討したシグナル

### 1. `source` フィールドのランキング種別 (favnovelcnt / hyoka / impressioncnt 等)

- narou crawl 時の発掘経路。例えば `favnovelcnt` (ブックマーク数ランキング) はリーダー engagement の指標になりうる
- 実測:
  - `hyoka` (評価ランキング) 経由: hit 3742 / low 593 (強い hit 偏り — ただし循環的)
  - `lengthdesc` 経由: hit 39 / low 3479 (長文は hit になりにくい)
  - `ncodedesc` 経由: low 3605 (新作は累積ポイント不足)
- **問題**: これは「我々がどのランキングで発見したか」を示すだけで、作品自体の質指標ではない。同じ作品が複数ランキングに出現することはなく、サンプリング artifact

### 2. `episodes` × `globalPoint` (継続性 × 人気)

- 完結作 + 高 gp は読者が離れずに最後まで読んだ → ep1 がよかった可能性
- ただし `episodes` フィールドは 8k source の seed では 0 で欠損が多い
- crawl したディレクトリ数 (`data/crawled/{ncode}/ep*.json`) で代替できるが、これも crawl decision 由来 (hit-tier だけ深く crawl した) でバイアスが入っている

### 3. v12 hit predictor 出力を anchor 選定基準に

- v12 は ep1 本文を入力に hit 確率を出すモデル
- v12 訓練の正例 = 既知ヒットの ep1 (gp 高い narou 作品)
- これを anchor 選定に使うと「v12 が高く評価する ep1 = 既知 hit」で循環参照になる
- 校正用途には使えない (校正される側が校正基準になるため)

### 4. ep1 本文の構造的特徴 (機械的抽出)

- ep1 第一段落の長さ、対話の早期出現、固有名詞密度などを feature 化
- gp と弱相関する可能性はあるが、未検証
- 投資対効果不明

## 推奨

L5 anchor 選定は globalPoint banding を継続。**順序逆転 (hit < middle) はノイズとして許容**。

理由:
1. L5 評価は anchor Elo 単独ではなく v12 ヒット予測との **AND 判定** (設計書 §5)
2. v12 は ep1 本文を直接入力にするため、ep1 品質の signal がここに集約されている
3. anchor Elo は v12 の補助 — 単独の精度より AND 判定の robust 性が重要
4. middle/low の順序ノイズは passElo (hit と middle の中点) には影響しない (hit median が支配的)

## 補強案 (将来検討)

L5 anchor を完結作のみに絞る:
- `episodes` >= 30 かつ `status` 完結を条件に追加
- crawl-coverage バイアスは避けられないが、未完作品の ep1 に比べて読者継続が確認された作品に絞れる
- 実装コスト低、効果は未検証だが理屈は通る

ただし battle_modern_power のように既存サンプルが少ないジャンルでは候補数が更に絞られるリスクあり。
