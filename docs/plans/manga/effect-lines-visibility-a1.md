# Effect Lines Phase A.1 — visibility tuning 計画

## 背景

Phase A 実装後、a07 ep01 p03 で smoketest を実行し panel_composite ルートで page を組み立てて目視確認した結果、**effect_lines (speed × 3) が描画されているが視認できない**ことが判明。

原因:
- color = `#000000` 黒線のみ → 暗い背景や黒い髪・服に完全に消失
- opacity = speed:0.5 / focus:0.55 / radial:0.75 / vibration:0.65 → 写実的画像の細部に埋もれる
- stroke-width = subtle:1 / normal:2 / strong:3 px → 商業漫画の効果線として細い

商業漫画の効果線は **白縁取り (黒線の周りに白い縁)** で必ず可視性を確保する。これは Phase A の SVG パラメータ調整で対応可能。Phase B (breakout) や Phase C (schema 拡張) を先にやっても、visibility が低いままだと検証が成立しない。

## ゴール

a07 ep01 p03 を smoketest で再 render したとき、**目視で 3 箇所の speed effect_lines が判別できる**。

## スコープ

### 変更ファイル (これ以外触らない)

1. **`src/lib/manga/effect-lines/svg-overlay.ts`**
   - 各 line の描画を「白縁背面 + 黒線前面」の 2 段重ね構造に変更:
     - 背面: 同じ pos / 同じ direction、stroke=`#ffffff`、stroke-width = 黒線 +3 px、opacity = 黒線と同じ
     - 前面: 既存 stroke=`#000000` 黒線
   - `strokeWidthFor`: subtle=2 / normal=3 / strong=4 (現状 1/2/3 → +1)
   - opacity 全般引き上げ:
     - speed: 0.5 → 0.85
     - focus: 0.55 → 0.85
     - radial: 0.75 → 0.9 (元々高めなのでわずか調整)
     - vibration: 0.65 → 0.85
   - radial の white impact gap line は現状の白いままで残す (構造的に「衝撃の切れ目」演出のため必要)
   - SVG の data-effect-line attribute / clipPolygon 対応は無変更

2. **`src/lib/manga/effect-lines/svg-overlay.test.ts`**
   - 既存 test の opacity / stroke-width 期待値を新値に合わせて更新
   - 新規 test 追加: 「各 line に対応する白縁 line が同数生成される」(2 倍構造の確認)

### 不変条件 (絶対に変えない)

- ❌ `detector.ts` のロジック (rule 6 個) は無変更
- ❌ `page-effect-composer.ts` は無変更
- ❌ `page-with-effect-lines.ts` は無変更
- ❌ L09-render.ts は無変更
- ❌ EffectLineSpec / EffectLineType / EffectLineIntensity の型は無変更
- ❌ direction 推定ロジックの追加 (これは Phase A.2 として別扱い)
- ❌ schema 拡張、Phase B/C への着手
- ❌ bubble system / 他 layer への影響

## 検証

### tsc / test
- `npx tsc --noEmit` clean
- `npm test` で既存 + 更新 test pass

### smoketest 目視
本コミット後、`npx tsx scripts/manga/effect-lines-smoketest.ts` を再実行し、`/tmp/effect-lines-smoketest/p03-with-effects.png` を Read tool で目視:
- 3 箇所の speed effect_lines が **黒い背景 / 暗い髪・服の上でも視認できる** ことを確認
- 他 panel に過剰な visual noise を生じていないか確認 (白縁が太すぎる場合の副作用)

## 工数

- Plan: 完了
- Codex 実装: 30 分
- レビュー + smoketest 目視: 30 分
- 合計: 1 時間

## 関連

- 上位 Plan: `docs/plans/manga/effect-lines-mvp4.md`
- 上位 SSoT: `docs/plans/manga/pipeline-v2.md`
- Phase A commit: 7ba6bcc
