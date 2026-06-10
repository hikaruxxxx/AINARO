# a07-modern-dungeon ep01 品質改善 patches (Codex 提案、人間判定用)

**生成**: 2026-05-06 / Phase X audit findings 6件すべてに対応 / 既存物語の流れを壊さない最小侵襲設計

採用判定方法: 各 patch の「採用 / 却下 / 要修正」を判断し、採用したものを `storyboard.json` に適用 → 採用結果を編集判断カードDB のシードに記録 (Phase Y WY-6)。

---

## Patch 1/6: narration_dominant 修正 (page 22 panel#110)

**鬼門**: 締めの cliffhanger panel でナレ「Fランクの停滞は、この日終わった。」(17字) が会話13字を上回り、craft_guide v2「ナレーション禁則」に違反。

### Before

```
narration: 〔Fランクの停滞は、この日終わった。〕  (17字)
dialogue [響]: 「次の隠し条件を開示します。」     (13字)
```

### After

```
narration: 〔Fランクが、動き出す。〕             (11字、−6字)
monologue [レン]: (まだ、行ける。)               ★新規
dialogue [響]: 「次の隠し条件を開示します。」    (維持)
action: + レンの指が鉄パイプを握り直す。
```

**rationale**: 締めの断定ナレーションを短縮し、主人公の手元と短い心象へ分散して、次回への能動性を強める。

**expected_effect**: narration_chars 17→11 / dialogue dominance restored / cliffhanger agency +0.2

---

## Patch 2/6: importance_imbalance 修正 (page 18)

### Before

| panel# | importance |
|---|---|
| 86 | 4 |
| 87 | 4 |
| 88 | 4 |
| 89 | 5 |
| 90 | 5 |

### After

| panel# | importance | 変更 |
|---|---|---|
| 86 | 4 | — |
| 87 | 3 | ↓ |
| 88 | 3 | ↓ |
| 89 | 5 | — |
| 90 | 5 | — |

**rationale**: 誘導と水しぶきの中継コマを一段落とし、最後の突き上げと撃破に視線の山を集中させる。

---

## Patch 3/6: importance_imbalance 修正 (page 22)

### Before / After

```
106: 4   →   4
107: 4   →   3
108: 4   →   3
109: 4   →   2  (溜めとして最低化)
110: 5   →   5
```

**rationale**: 監査室の情報提示を抑え、無音の異常枠を溜めにして、最終コマの下降階段とナビ告知を最大の山にする。

---

## Patch 4/6: shot_repetition 修正 (page 19 panel#94)

### Before

```
shot_type: close_up
action: スマホ光を映した瞳が数値の異常を理解する。
monologue [レン]: (跳ねた。桁が、違う。)
```

panel #92, #93, #94 が close_up 3連続 → 視覚的変化が乏しい。

### After

```
shot_type: over_the_shoulder
action: レンの肩越しに、ヒビ入りスマホの経験値ログと倒れた敵影を同時に見せる。
monologue [レン]: (跳ねた。桁が、違う。)  (維持)
```

**rationale**: close_up 3連続を崩しつつ、スマホ数値と戦闘結果を同一画面に入れて成果の実感を増やす。

---

## Patch 5/6: recovery_beat_missing 解消 (新規 panel 差し込み)

**位置**: page 19 panel#95 の **後** に新規 panel 96 として挿入。

```
shot_type: medium
importance: 2
silence: false
action:    レンが壁にもたれ、支給用ゼリー飲料を一口だけ飲む。耳元の青光が少し柔らかく灯る。
key_visual: 割れたスマホ、安いゼリー飲料、倒れた影の奥で小さく息を整える生活感のある余白コマ。
dialogue:
  [響]: 「水分補給を推奨。三十秒、休んでください。」
  [レン]: 「……ありがとう。少し、ほっとした。」  ★ recovery 語彙が直接入る
sfx: ぷし
```

**rationale**: 戦闘後の張り詰めた流れに小さな休息とナビへの感謝を差し込み、相棒感と主人公への共感を補強する。

**expected_effect**: recovery_cadence 0→0.6 / sidekick_warmth +0.4 / reader_friction -0.2

**audit token match**: 「ありがとう」「ほっと」が POSITIVE_TOKENS に直接マッチ → recovery_beat_missing 解消

---

## Patch 6/6: expectation_reality_gap_absent 解消 (新規 panel 差し込み)

**位置**: page 5 panel#23 の **後** に新規 panel 24 として挿入。

```
shot_type: close_up
importance: 2
silence: false
action:     スマホに探索報酬三百二十円の振込通知が出る。背後ではコンビニの廃棄弁当袋が揺れる。
key_visual: ヒビ入り画面の少額振込通知と、半額シールの弁当袋を同じコマに収める。
monologue [レン]: (探索者になれば、少しは変わると思ってた。)  ★ expectation gap 語彙が直接入る
sfx: ピコン
```

**rationale**: 探索者への期待と少額報酬の現実を一コマで見せ、Fランク境遇の苦さを軽く刺さる形にする。

**expected_effect**: expectation_reality_gap 0→1 / early_empathy +0.3 / commercial_hook +0.2

**audit token match**: 「と思ってた」が GAP_TOKENS に直接マッチ → expectation_reality_gap_absent 解消

---

## サマリ

| # | finding | scope | 修正方法 |
|---|---|---|---|
| 1 | narration_dominant | panel_modify | ナレ短縮 + monologue 追加 |
| 2 | importance_imbalance (p18) | page_metadata | panel#87,88 を 4→3 |
| 3 | importance_imbalance (p22) | page_metadata | panel#107,108→3, panel#109→2 (溜め) |
| 4 | shot_repetition (p19) | panel_modify | close_up → over_the_shoulder |
| 5 | recovery_beat_missing | panel_insert | 新規 panel #96 (ありがとう/ほっとした) |
| 6 | expectation_reality_gap_absent | panel_insert | 新規 panel #24 (報酬320円/弁当袋) |

**期待される総合効果**:
- 6件の audit findings すべて解消
- recovery_cadence 0 → 0.6 (商業ラノベの「軽快な読み心地」獲得)
- 商業フック (期待 vs 現実) 獲得
- cliffhanger 視覚インパクト強化
- panel数: 110 → 112 (+2、両 page で +1 panel ずつ)

**既存物語の継続性**:
- Fランク探索者「桐生レン」/ AIナビ「獅童響」/ 現代ダンジョン / レベルアップシステム すべて維持
- 新規 panel も世界観に整合

---

## 採用判定の進め方

1. このファイルを精読
2. 各 patch に「採用 / 却下 / 要修正」のステータスを付ける
3. 採用したものを `apply-patches.ts` で `storyboard.json` に適用 (実装予定)
4. 適用後、Phase X audit を再実行して findings 数が減ったか確認
5. 採用された patch を編集判断カードDB に記録 (Phase Y WY-6 のシード)

## ユーザー向け質問

- patches 6件のうちどれを採用しますか?
- 採用条件 (例: panel_insert 2件は要レビュー、panel_modify は即採用) を決めますか?
- 適用後の再 audit / 再 render は別タスクとして実行しますか?
