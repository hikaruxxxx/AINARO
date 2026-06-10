# L4 panel_count range 化 計画 (commit 457e844 の真の修正)

## 背景

commit 457e844 で L3 (`scene-extractor.ts`) の prompt に「各ページの panel_count は 4〜7 で variation」と指示を追加した。**しかし構造上効果が出ない:**

- `ShotlistV2` schema には page 概念がない (`scenes[].panel_idx_range` と panel skeleton のみ)
- L3 LLM 出力に page→panel mapping は含まれず、後段に伝達されない
- 実際の panel→page 分配は **L4 (`storyboard-extractor.ts`)** で決まる
- L4 prompt は [src/lib/manga/storyboard-v2/storyboard-extractor.ts:80](../../src/lib/manga/storyboard-v2/storyboard-extractor.ts#L80) で
  「22ページ目標なら 1ページあたり **4-6 panel** を割り当てる」と固定
- ep01 baseline (n=5: 18 page / n=6: 3 page / n=2: 1 page) はこの 4-6 prompt と完全に整合

つまり真の制御点は L4 で、そこに variation 指示を入れない限り、固定 N=5 中心の monotonous な分布は変わらない。

## ゴール

新規 episode (a07 ep02 / a08 ep01 等) で page あたり panel_count が n=4-7 でばらける。

成功基準 (定量):
- 22 page 中、最頻値が占める割合が 60% 未満 (ep01 baseline は 82%)
- n=4 と n=7 がそれぞれ 1 page 以上含まれる
- 平均は 5.0 ± 0.5 (総 panel 数が崩壊しない)

## スコープ

### 変更ファイル

1. **`src/lib/manga/storyboard-v2/storyboard-extractor.ts`**
   - `extractStoryboardFromShotlist` に optional 引数 `panelsPerPageRange?: { min: number; max: number }` (default `{ min: 4, max: 7 }`) と `avgPanelsPerPage?: number` (default 5) を追加
   - line 80 の hardcoded "1ページあたり 4-6 panel" prompt を削除
   - 代わりに L3 と整合した variation 指示を systemContext に注入:
     - 「各ページの panel_count は ${min}〜${max} の範囲で variation を付けること。固定 N の monotonous な配分は商業漫画的に NG」
     - 「配分目安: cliffhanger / 強い見せ場 = ${min}〜${avg-1} (大ゴマ多用), 対話・密度ページ = ${avg+1}〜${max} (情報密度高め), 標準 = ${avg} 中心」
     - 既存の「ページ末 (cliffhanger / page_end_hook) は重要 panel を最後に置く」は残す

2. **`scripts/manga/layers/L04-storyboard.ts`**
   - `extractStoryboardFromShotlist` 呼び出し時に default 値を明示渡し: `{ panelsPerPageRange: { min: 4, max: 7 }, avgPanelsPerPage: 5 }`
   - L3 と同じ default を一致させ、後で env 変数で上書き可能な構造に揃える

### 不変条件 (絶対に変えない)

- `EpisodeStoryboardV2` schema は無変更 (downstream layer 全部に波及するため)
- `STORYBOARD_SCHEMA` の `pages[].panel_ids` 配列構造は無変更
- `validateStoryboardEntityBinding` ロジック無変更
- L3 (`scene-extractor.ts`) は無変更 (今回の修正で L3 の prompt も「最終的な panel→page 分配は L4 が決める」前提で残す)

## やってはいけないリスト (Codex への scope creep 防止)

- ❌ `EpisodeStoryboardV2` `PageRoleV2` の型変更
- ❌ `validateStoryboardEntityBinding` に panel_count 制約 validation を追加
  (validation は将来的に別 layer で audit する。今は prompt 側だけ)
- ❌ pages[] の merge / split / 並べ替えロジック追加
- ❌ L3 (`scene-extractor.ts`) の prompt や signature に追加変更
- ❌ pipeline.ts や他 layer (L05/L06...) への波及
- ❌ tests を新規追加 (今回は prompt 改修のみで型変更なし、既存 test pass で十分)
- ❌ docs/plans/manga/pipeline-v2.md 等の other plan ファイル編集

## 検証

### tsc / test
- `npx tsc --noEmit` で既存 unrelated 失敗以外 clean
- `npm test` で既存 22 files / 138 tests pass

### LLM 実検証 (本 commit 後に別作業)
- a07 ep02 で `pipeline.ts --from L03 --to L04` を走らせる
- 生成された `episodes/ep02/storyboard.json` の `pages[].panels.length` 分布を計測
- ep01 baseline (n=5: 82%) と比較し、上記成功基準を満たすか確認
- 失敗時: prompt 文言の表現を強める (例: 「3 種類以上の panel_count を必ず使う」を追加)

## 工数

- Plan + Codex 実装: 30 分
- レビュー + 証跡 + commit: 15 分
- ep02 実走 + 分布確認: 30 分 (LLM 待ち含む)

合計 1.5 時間程度。

## 関連

- 直近 commit: 457e844 (L3 panel_count range 化 — 構造上効果なし、本 commit で実効化)
- 関連メモリ: project_layout_patterns_b2pp.md
- 上位 SSoT: `docs/plans/manga/pipeline-v2.md`
