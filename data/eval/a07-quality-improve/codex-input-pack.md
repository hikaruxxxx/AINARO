# a07-modern-dungeon ep01 品質改善依頼

## 背景
- 作品: 「Fランク探索者の俺にだけ聞こえるんだけど…〜システム音声【ナビ】が現代ダンジョンの隠しルール全部教えてくれるから、世界最速でレベルアップした件〜」
- ジャンル: 主人公最強無双 (現代ダンジョン)
- art_style: manga_bw_seinen_urban
- 目標: KDP+KU で 1巻10万円/月を安定的に量産できる「軽快に読める商業ラノベ品質」
- 目標 tone_profile: darkness=0.3 / comedic_density=0.8 / recovery_cadence=0.9 / sidekick_presence=0.9

## 構造
- 22ページ × 5 panel/page = 110 panels
- page_role 分布: opening_hook(1-2) / buildup(3-7,13-14) / reveal(8-10) / action(11,15-18) / establishing(12) / aftermath(19-20) / cliffhanger(21-22)

## Phase X audit 検出問題 6件

### importance_imbalance (2件)

**page 18 (巻スコープ)** (info): 全コマ importance ≥ 4 (強調しすぎでメリハリが消える)

**page 22 (巻スコープ)** (info): 全コマ importance ≥ 4 (強調しすぎでメリハリが消える)

### shot_repetition (1件)

**page 19 panel#94** (warn): close_up が 3 コマ連続 (panels 92..94)
- page_role: aftermath
- shot_type: close_up, importance: 5, silence: false
- action: スマホ光を映した瞳が数値の異常を理解する。

```
  monologue [char_桐生_レン_v1]: (跳ねた。桁が、違う。)
```

### narration_dominant (1件)

**page 22 panel#110** (warn): panel#110: ナレーション 17字 が会話 13字 を上回る (manga_craft_guide v2 ナレーション禁則)
- page_role: cliffhanger
- shot_type: establishing, importance: 5, silence: false
- action: レンの背後で下降階段が暗く伸び、上向きの空HUDが浮かぶ。

```
  dialogue [char_獅童_響_v1]: 「次の隠し条件を開示します。」
  narration: 〔Fランクの停滞は、この日終わった。〕
  sfx: キン
```

### recovery_beat_missing (1件)

**page 0 (巻スコープ)** (warn): episode a07-modern-dungeon-ep01: 「小報酬/生活感/相棒との温度」beat が検出されない (light_recovery では1話1回以上必須)

### expectation_reality_gap_absent (1件)

**page 0 (巻スコープ)** (info): 巻全体で「期待 vs 現実」のギャップ panel が検出されない (manga_craft_guide v2 の typical pattern #4 推奨)

## 修正依頼

各 finding に対して **具体的な修正案** を作成してください。

### 修正方針 (Phase X craft 準拠)

1. **narration_dominant**: ナレーションを3割削り、削った分を顔以外の部位ショット + 短いSFX or 主人公モノローグ(雲型) に置換
2. **recovery_beat_missing**: aftermath / buildup ページのいずれかに、「相棒との何気ない一言」「街の生活感」「小さな達成感」beat を 1-2 panel 追加 (既存 panel の置換でなく差し込み)
3. **expectation_reality_gap_absent**: opening_hook (page 1-2) または buildup (page 3-7) のいずれかで「期待 → 現実」のギャップ panel を作る (例: 主人公が「最強の俺なら…」と期待 → 次 panel で「時給100円」現実)
4. **importance_imbalance**: 該当ページの panel importance を 1-5 で凸凹をつける (例: 5 / 2 / 4 / 2 / 5)
5. **shot_repetition**: 同じ shot_type が3連続している箇所を、別の shot_type に1つ差し替え

### 出力形式

各 finding に対して以下を返してください:

```json
{
  "patches": [
    {
      "finding_rule": "narration_dominant",
      "page_no": 22,
      "panel_no": 110,
      "current": { "narration": [...], "monologue": [...], "dialogue": [...] },
      "proposed": { "narration": [...], "monologue": [...], "dialogue": [...], "shot_type_change": null, "importance_change": null },
      "rationale": "ナレが冗長で読み心地を損なう。主人公の心象に置き換え軽快感を出す",
      "expected_effect": "narration_chars -10字, recovery_cadence +0.1"
    },
    ...
  ]
}
```

### 巻スコープの提案 (recovery_beat_missing / expectation_reality_gap_absent)

これらは既存 panel の修正ではなく、**新規 panel の差し込み案** を出してください。差し込み位置 (page_no + 既存 panel の後/前) と、新 panel の dialogue/monologue/narration を提示。

### 重要

- 既存の物語の流れ (主人公の探索者活動 + 「ナビ」音声 + ダンジョンレベルアップ) を壊さない
- 修正提案は最小侵襲。1 panel あたり 1-3 行の変更に留める
- 「商業品質」(B-→A-) を意識: 主人公への共感の摩擦を減らし、相棒/街の人との温度を入れる
- 全 panel 全文は別添 findings-detailed.json の findings_detailed[].panel_text を参照
- 全ページ全文 (110 panels) は別添 pages-full.json を参照