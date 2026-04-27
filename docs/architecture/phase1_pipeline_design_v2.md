# Phase 1 生成パイプライン詳細設計 v2

**作成日**: 2026-04-08
**改訂日**: 2026-04-28
**ステータス**: 絶対品質閾値方式に再設計
**前身**: `generation_pipeline_management.md` の Phase 1 部分を全面再設計

## 0. 設計原則

Phase 1 は「一定割合を通す」ためのパイプラインではない。目的は、参照作品群に照らして品質証拠がある作品だけを下流へ進めること。

### 原則

- 通過率は制御対象ではなく、観測される結果指標である
- 良い作品なら全件通ってよい。悪い作品なら全件止まってよい
- 合格は positive evidence のみで発生する
- 証拠不足は合格でも不合格でもなく、保留である
- 作品間の相対順位だけで判定しない
- 判定基準は anchor reference pool に対して校正された絶対値で表す

### 禁止する判定

- 同一バッチ内の相対順位だけでの合格判定
- ジャンル内の分位点による合格判定
- 一定割合を通すためのしきい値調整
- 比較数不足を理由にした暫定合格
- 通過数確保を目的にしたヒット予測しきい値の緩和

通過率、保留率、失格率はログ・週次レポート・運用品質監視に記録する。ただし目標値としては扱わない。

---

## 1. 全体アーキテクチャ

```
launchd
  ↓
scripts/generation/daemon.ts
  ├─ throttle.ts             : Claude CLI 使用量制御
  ├─ work-queue.ts           : Layer別キュー
  ├─ seed-v2.ts              : 5次元シード生成
  ├─ layers/layer1-6         : Skill経由の生成
  ├─ pairwise.ts / league.ts : anchor 校正済み Elo 評価
  ├─ hit-predictor-v12.ts    : 絶対 hit probability 評価
  ├─ training-data.ts        : 没作品の層別保存
  └─ learning-daemon.ts      : anchor更新補助、BT再計算、探索メトリクス
```

生成は Claude CLI / Skill 経由で実行する。課金 API の直叩きは Phase 1 の前提にしない。TypeScript 側の責務はキュー、状態遷移、評価、永続化、ログである。

---

## 2. anchor reference pool

### 目的

新規生成作品の品質を「その時点の候補群の中で良いか」ではなく、「既知品質の参照作品に比べて良いか」で判定する。

anchor は評価の物差しであり、頻繁に動かさない。anchor が動くと Elo と hit probability の意味が変わるため、更新は半年から1年単位を原則とする。

### 抽出元

- `data/targets/narou_50k.json`
- narou スクレイピング 53k 本文
- v12 モデル学習に使う既存特徴量・本文
- ジャンル分類済みメタデータ

### anchor の品質帯

各ジャンルに以下の3帯を持つ。

| 帯 | 用途 | 例 |
|---|---|---|
| hit | 合格基準の基準点 | 読者反応が明確に強い既知作品 |
| middle | 境界確認 | 平均的な既知作品 |
| low | 失格基準の基準点 | 明確に弱い既知作品 |

ここでいう `hit` / `middle` / `low` は anchor 作成時に固定されたラベルであり、運用中の候補集合内順位ではない。

### 帯間ギャップ (v2 banding, 2026-04-28)

帯境界は連続的に区切らず、明示的にギャップを空けて帯間距離を確保する。

- hit: globalPoint >= 5000
- (gap: 2000-5000 を意図的に空ける)
- middle: globalPoint 200〜2000
- (gap: 50-200 を意図的に空ける)
- low: globalPoint 1〜50

連続的な banding (top-k / median / bottom-k) では LLM ペアワイズ評価で帯順序が不安定になることが観測された (2026-04-28 modern_romance 実測: hit > low > middle で逆転)。ギャップ設計後は L3 で hit > middle > low の正しい順序が再現される。

**L5 (ep1 本文) の限界**: L5 では v2 banding でも hit と middle の順序が安定しない (modern_romance 実測: middle > hit > low)。ep1 品質と生涯 globalPoint は相関が弱く、hit-tier の長期連載作は ep1 が古い様式の場合がある。L5 では Elo 単独ではなく v12 ヒット予測との AND 判定で補強する設計が機能上必要 (これは設計書 §5 Layer 5 で明示済)。

### 抽出基準

anchor 抽出では、少なくとも以下を使って人間可読な監査ログを残す。

- ジャンル
- 本文長
- 話数
- 既存人気指標
- 読者初速に関する派生特徴
- 継続性に関する派生特徴
- 重複・テンプレ類似除外結果
- 本文欠損・本文品質異常の除外理由

抽出後、各ジャンルの `hit` / `middle` / `low` から代表作を固定する。代表作は本文そのものを比較に使えるよう、Layerごとに切り出した評価素材を持つ。

### 保存パス

```
data/generation/anchors/
├── manifest.json
├── calibration.json
├── {genre}/
│   ├── anchors.json
│   ├── layer2/
│   │   ├── hit/{anchor_id}.md
│   │   ├── middle/{anchor_id}.md
│   │   └── low/{anchor_id}.md
│   ├── layer3/
│   ├── layer4/
│   └── layer5/
└── audit/
    └── build_YYYYMMDD.jsonl
```

`manifest.json` は anchor set のバージョン、抽出日、データ元、ジャンル、件数、ハッシュを持つ。

`calibration.json` は Layer別・ジャンル別の絶対しきい値を持つ。

### 更新頻度

- 通常更新: 半年から1年に1回
- 臨時更新: ジャンル体系の大幅変更、スクレイピング基盤の変更、v12 特徴量定義変更があった場合のみ
- 更新時は旧 anchor を保持し、新旧両方で1週間シャドー評価する

### 校正手順

1. anchor 候補を `narou_50k.json` から抽出する
2. ジャンルごとに `hit` / `middle` / `low` を固定する
3. 各 Layer の評価素材を作る
4. anchor 同士でペアワイズ比較を行う
5. Bradley-Terry 再計算で anchor Elo を安定化する
6. `hit` 帯の中央値 Elo、`middle` 帯の中央値 Elo、`low` 帯の中央値 Elo を記録する
7. v12 を anchor の Layer 5 本文に適用し、`hit` 帯に対する絶対確率しきい値を決める
8. `calibration.json` に保存する

---

## 3. シード設計

### 起点

```
初期:     ヒット作DB起点 + 読者感情欲求起点
中期:     ヒット作DB起点 + 読者感情欲求起点 + 自社評価データ起点
成熟期:   自社評価データの重みを増やす
```

LLM自由発想だけのシードは採用しない。読者感情欲求と既知ヒット構造を起点にし、探索枠で未知の組合せを試す。

### シード構造

```
固定軸:
  感情欲求
  ジャンル

LLM裁量軸:
  境遇
  転機
  方向
  フック
```

重複排除は `(感情欲求, ジャンル, 境遇, 転機)` の完全一致を除外する。方向とフックは重複排除キーに含めない。

---

## 4. Layer 定義

```
Layer 1: ログライン
Layer 2: プロット骨格
Layer 3: あらすじ
Layer 4: アーク1詳細プロット
Layer 5: ep1本文
Layer 6: ep2-3本文
```

各 Layer は生成後に deterministic validation を通し、評価対象に足る形式を満たしたものだけが評価へ進む。

---

## 5. 絶対合格条件

### 共通状態

各 Layer 評価は以下の3状態を返す。

| 状態 | 意味 | 次アクション |
|---|---|---|
| pass | positive evidence がしきい値を満たした | 次 Layer へ enqueue |
| hold | 証拠不足 | 評価待機キューへ戻す |
| reject | 形式破綻または絶対品質しきい値未達 | training に保存 |

### anchor Elo

各ジャンル・Layerで、候補作品は anchor pool と比較される。

```
candidate_elo = BradleyTerry(candidate, anchors, genre, layer)
hit_median_elo = calibration[genre][layer].hitMedianElo
middle_median_elo = calibration[genre][layer].middleMedianElo
low_median_elo = calibration[genre][layer].lowMedianElo
```

### Layer 1

Layer 1 は LLM 評価を行わない。明確な形式破綻だけを落とす。

条件:

```
pass if:
  30 <= logline_chars <= 100
  and includes protagonist situation
  and includes trigger
  and includes direction

reject if:
  empty
  or too long
  or parse failure after retry
```

Layer 1 の pass は品質合格ではなく、評価素材として成立したという意味である。

### Layer 2

プロット骨格は anchor の Layer 2 素材と比較する。

条件:

```
hold if:
  pairwise_evidence_count < required_anchor_matches

pass if:
  candidate_elo >= layer2_pass_elo
  and candidate_elo >= hit_median_elo - layer2_margin

reject if:
  candidate_elo < middle_median_elo
  or required sections missing
```

初期値:

```
required_anchor_matches = 10
layer2_margin = 30
```

### Layer 3

あらすじは読者向けフックと構造の伝達力を見る。

条件:

```
hold if:
  pairwise_evidence_count < required_anchor_matches

pass if:
  candidate_elo >= layer3_pass_elo
  and hook_axis_win_rate_against_middle >= 0.60

reject if:
  candidate_elo < middle_median_elo
  or synopsis_chars outside allowed range
```

初期値:

```
required_anchor_matches = 10
layer3_pass_elo = hit_median_elo - 25
```

### Layer 4

アーク詳細プロットは連載継続力、各話の動き、引きの配置を見る。

条件:

```
hold if:
  pairwise_evidence_count < required_anchor_matches

pass if:
  candidate_elo >= layer4_pass_elo
  and arc_episode_count between 10 and 20
  and ending_pull_score >= calibrated_middle_pull

reject if:
  candidate_elo < middle_median_elo
  or episode_count invalid
```

初期値:

```
required_anchor_matches = 10
layer4_pass_elo = hit_median_elo - 20
```

### Layer 5

Layer 5 は本文品質と v12 ヒット予測の AND 判定にする。

条件:

```
hold if:
  pairwise_evidence_count < required_anchor_matches
  or hit_probability unavailable

pairwise_pass =
  candidate_elo >= layer5_pass_elo

predictor_pass =
  hit_probability >= absolute_hit_probability_threshold

pass if:
  pairwise_pass and predictor_pass

reject if:
  deterministic early-exit failed
  or candidate_elo < middle_median_elo
  or hit_probability < absolute_hit_probability_reject_threshold
```

初期値:

```
required_anchor_matches = 10
layer5_pass_elo = hit_median_elo
absolute_hit_probability_threshold = 55.0
absolute_hit_probability_reject_threshold = 35.0
```

`hit_probability` は 0〜100 の絶対確率として扱う。ジャンル内分布の分位点では扱わない。

### Layer 6

Layer 6 は ep2-3 の品質確認であり、通過後は `promoted` とする。

条件:

```
hold if:
  ep2 or ep3 generation incomplete

pass if:
  ep2 deterministic validation passes
  and ep3 deterministic validation passes
  and continuity check passes
  and no severe template/repetition issue

reject if:
  ep2 or ep3 cannot satisfy minimum length after retry
  or continuity failure is severe
```

Layer 6 は探索を行わない。残った作品を磨き込む。

---

## 6. 擬似コード

```ts
function evaluateLayer(work, layer): EvalDecision {
  const deterministic = validateGeneratedArtifact(work, layer);
  if (!deterministic.ok) return reject(deterministic.reason);

  if (layer === 1) return pass("valid_logline");
  if (layer === 6) return evaluateContinuity(work);

  const evidence = compareAgainstAnchors(work, layer);
  if (evidence.matchCount < requiredAnchorMatches(layer)) {
    return hold("insufficient_anchor_evidence");
  }

  const anchor = loadCalibration(work.genre, layer);
  const eloPass = evidence.elo >= anchor.passElo;

  if (layer !== 5) {
    if (eloPass) return pass("anchor_elo_pass");
    return reject("anchor_elo_below_threshold");
  }

  const hit = runV12(work.ep1);
  if (!hit.available) return hold("hit_probability_unavailable");

  const predictorPass = hit.probability >= anchor.hitProbabilityPass;
  if (eloPass && predictorPass) {
    return pass("anchor_elo_and_hit_probability_pass");
  }

  return reject("absolute_quality_threshold_failed");
}
```

---

## 7. ペアワイズ評価

### 比較対象

候補作品は同ジャンル・同Layerの anchor と比較する。通常生成作品同士の比較は補助的な観測に留め、合格判定の主根拠にしない。

### 実装 (2026-04-28)

`src/lib/screening/anchor-eval.ts` で実装済み。

- 候補は K 件の anchor (hit/middle/low 各 ⌈K/3⌉) と LLM ペアワイズ比較する (デフォルト K=6)
- anchor のレーティングは校正済み ( `data/generation/anchors/{genre}/anchor-ratings/layer{N}.json` ) で固定
- 候補の Elo は 1D Bradley-Terry MLE (二分探索) で anchor スケール上に位置決め
- 全勝 / 全敗の退化ケースは mean(anchor) ± 400 のオフセットで返す
- 候補と anchor の対戦履歴は `data/generation/anchors/{genre}/candidate-matches/layer{N}/{slug}.jsonl` に追記、再実行は冪等

`src/lib/screening/layer-eval.ts` で評価ルートを動的に分岐:

- anchor 校正済みジャンル × 層 → anchor-eval (主根拠)
- 未校正 → 旧 candidate-pool ペアワイズ (legacy fallback)

校正状態は `isCalibrated(genre, layer)` + `hasAnchorRatings(genre, layer)` で判定。両方 true で anchor 主根拠評価が選択される。

### 評価軸

共通軸:

- hook
- character
- prose
- tension
- pull

ジャンル特化軸は `data/generation/eval-weights-by-genre.json` で管理する。

### 再現性対策

- 絶対スコアは使わない
- 勝敗のみを保存する
- Layer 5 は position-symmetric 比較を使う
- 評価モデルと anchor set version を試合ログに保存する
- 複数セッションを混ぜて1つの未完了判定を確定しない

---

## 8. ヒット予測 v12

v12 はヒット作識別器であり、細かい順位付けには使わない。

### 判定

```
hit_probability_pass = hit_probability >= 55.0
hit_probability_reject = hit_probability < 35.0
otherwise = pairwise evidence と合わせて hold/reject 判定
```

この値は anchor pool の hit 帯に対する再現率と誤通過率で校正する。ジャンル内分布の分位点では決めない。

### 校正ログ

```
data/generation/anchors/calibration.json
{
  "version": "anchor-2026-04",
  "hitProbability": {
    "pass": 55.0,
    "reject": 35.0,
    "calibratedOn": "data/generation/anchors/..."
  }
}
```

---

## 9. 探索枠

探索枠は生成の多様性確保のために残す。ただし評価基準は通常作品と同一である。

探索作品は、ヒット予測で弾かない特別扱いをしない。未知の組合せであっても、anchor に対して positive evidence が出た場合だけ通す。

### Surprise

旧定義の分位差は廃止する。新定義は絶対値で測る。

```
surprise =
  candidate_anchor_elo - expected_anchor_elo_from_hit_probability
```

または

```
surprise =
  candidate_anchor_elo - hit_anchor_median_elo
```

ヒット予測が低く出たが anchor Elo が hit 帯を超える作品を、モデル盲点候補として記録する。

---

## 10. 訓練データ保存

Layer 2 以降で reject された作品は全て保存する。

```
data/training/layer{N}/{genre}/{slug}/
  ├── _meta.json
  ├── layer{N}_*.md
  └── training_label.json
```

ラベル:

```
label = "bottom"
reason = reject reason
anchorSetVersion = calibration.version
```

hold は訓練データではない。証拠不足であり、品質ラベルを持たない。

---

## 11. キュー状態

```
pending
processing
done
waiting_evidence
rejected
failed
```

`waiting_evidence` は anchor 比較不足、ヒット予測一時失敗、対戦相手不足などで評価証拠が足りない状態である。生成物は保持し、anchor pool または評価リソースが揃った時点で再評価する。

`waiting_evidence` を pass として扱ってはいけない。

---

## 12. ログと監視

通過率は監視するが、目標値ではない。

記録する指標:

- generated_count
- pass_count
- hold_count
- reject_count
- pass_rate
- hold_rate
- reject_rate
- anchor_elo_mean
- anchor_elo_by_genre
- hit_probability_mean
- hit_probability_by_genre
- reject_reason_distribution
- waiting_evidence_age

異常検知の例:

- すべて hold になっている
- 特定ジャンルだけ全件 reject
- anchor Elo が anchor middle より大きく乖離
- v12 が全件低確率を返す

異常検知は運用調査の入口であり、通過数を増やすための自動緩和には使わない。

---

## 13. ディレクトリ構造

```
data/
├── generation/
│   ├── anchors/
│   │   ├── manifest.json
│   │   ├── calibration.json
│   │   └── {genre}/...
│   ├── reader-desires.json
│   ├── genre-taxonomy.json
│   ├── hit-loglines.json
│   ├── hit-loglines-with-desires.json
│   ├── element-grid.json
│   ├── yield-stats.json
│   ├── _used_seeds.json
│   ├── _queues/
│   ├── plot-templates/{genre}.md
│   ├── style-templates/{genre}.md
│   ├── eval-weights-by-genre.json
│   ├── leagues/{genre}/
│   │   ├── ratings.json
│   │   └── matches.jsonl
│   ├── works/{slug}/
│   │   ├── _meta.json
│   │   ├── layer1_logline.md
│   │   ├── layer2_plot.md
│   │   ├── layer3_synopsis.md
│   │   ├── layer4_arc1_plot.md
│   │   ├── layer5_ep001.md
│   │   ├── layer6_ep002.md
│   │   ├── layer6_ep003.md
│   │   └── screening_result.json
│   └── exploration/
└── training/
    └── layer{N}/{genre}/{slug}/
```

---

## 14. 実装ロードマップ

### Critical

1. anchor reference pool 抽出スクリプト
2. `calibration.json` 定義
3. anchor 対戦を主根拠にした `pairwise.ts` / `league.ts` 拡張
4. `layer-eval.ts` の絶対しきい値化
5. `work-queue.ts` の `waiting_evidence` 運用
6. v12 の絶対確率しきい値化

### High

1. anchor set version を match record と screening result に保存
2. exploration Surprise の絶対値化
3. hold 再評価ジョブ
4. Skill と TypeScript の責務分離整理

### Medium

1. `negative.ts` を `training-data.ts` へ統合
2. launchd plist の整備
3. 監視レポートの整備

---

## 15. 残課題

- anchor 抽出基準の最終決定
- anchor 比較に必要な LLM 予算の見積もり
- Layer 2〜4 の anchor 素材生成方法
- v12 絶対確率 55.0 の初期値検証
- waiting_evidence の再評価スケジュール
- 既存リーグデータを anchor 校正済み Elo に移行する方法
