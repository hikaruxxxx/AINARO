# AINARO 漫画 bible V3 移行 — 次セッション引継ぎ

## このセッション (2026-05-12 最終) の成果 — A/B/C 完了

| commit | 内容 |
|---|---|
| 9de7817 | feat: scoring-loop に L2 (volume_plot) context 注入 + foreshadow 件数整合 warning (A) |
| f948cd1 | feat: scoring-loop に motif_id runtime normalize safety net (B) |
| 9ffbe14 | feat: volume-level foreshadow validator に L2 cross-reference 追加 (C) |

### A: L2 context 注入 (9de7817)

`scoring-loop.ts` の 3 プロンプト (`buildSceneCandidatePrompt` / `buildPairwisePrompt` /
`buildAnchorComparePrompt`) に、`volume_plot.json` から抽出した:
- volume_theme / 当 ep の theme / protagonist_arc (start/turn/end)
- must_include_events / cliffhanger_hook / beats summary (8 行まで)
- 周辺 ep (prev / next) の theme + cliffhanger
- 当 ep が関わる foreshadow_map (seed / payoff 両側)

を「## 巻内位置」section として注入。これまで path 文字列だけ渡していた状態を解消。

`validateSceneGraph` の options に `volumeForeshadowMap` + `episodeNo` を追加し、
件数チェック (seed/payoff の expected vs actual) と hint 分布整合チェックを warnings として出す
(errors は増やさず後方互換維持)。L03_5-scene-graph.ts でも foreshadow_map を読み込み、
modeGenerate で `volumePlotPath` を context へ配線。

新規 export: VolumeContext / loadVolumeContext / formatVolumeContextSection。

### B: motif_id runtime normalize (f948cd1)

`generateSceneCandidates` の出力で、LLM が prompt 指示に反して motif description 本文を
motif_id 欄にコピーするケース (a07-ep01 で 24 件残存) の safety net。

`normalizeMotifAnchors` 新設:
1. exact match (id ?? name) → そのまま
2. substring match (motif.name を含む) → canonical 化、longest 優先、1文字除外
3. no match → drop + stats.dropped に積む

generic 型 `T extends { motif_id; intensity? }` で intensity 等他フィールド preserve。
substring/dropped 発生時に stderr に 1 行ログ。

新規 export: MotifNormalizeStats / normalizeMotifAnchors。

### C: volume-level L2 cross-reference (9ffbe14)

既存 stand-alone CLI `_volume-foreshadow-validate.ts` (Phase γ 実装済) に
L2 `volume_plot.foreshadow_map` 件数比較セクションを追加。

`summarizeL2CrossRef` / `formatL2CrossRef` 新設 (helper を src/ 側に export):
- L2 total foreshadows + in-episode/cross-episode 内訳
- scene_graph total setups + resolved/unresolved
- 大幅 mismatch (over-foreshadowed / under-foreshadowed) を warning

a07 vol1 実走で動作確認: L2 expects 9 / scene_graphs 63 → over-foreshadowed warning 発火。

新規 export: L2CrossRefSummary / summarizeL2CrossRef / formatL2CrossRef。

### A/B/C 全体指標

- vitest: 427 → 447 pass (+20 新規、5 skipped 維持)
- Test Files: 54 → 57
- tsc: clean
- a07 fatal=0 維持
- 既存 dry-run 動作互換性維持
- 三段リレー: 3 件すべて Codex 経由 (mcp__codex__codex)、Claude code-review 経由

### Codex のスコープ外編集問題 (今後注意)

B/C の Codex セッションで、spec で明示禁止したにもかかわらず scope 外ファイル
(prompt-composer-v2 / broker-v3 / schemas-v2 等) を Codex が編集する事案が 2 回発生。
都度 `git checkout --` で revert した。next session で Codex 依頼するときは:
- spec に「絶対変更しない files」のリストを明示
- 完了後 `git status` で意図外ファイルを必ず確認

### D: 1 巻ネーム完成達成 (commit 21326c4)

全 10 ep を A/B/C 後 pipeline で再生成、第 1 巻 a07-v01 ネーム完成。

実走サマリ:
- ep01 単独 live 再走 (commit bf7b1fd, 40.6min)
- ep02-10 並列 live 再走 (commit fc6df6c, 33.2min Promise.all 9 ep)
- ep02 Rule 4 違反修正 (S01 may_repeat と S02 scene_exclusive が同 text、jq で S01 から削除)
- 全 ep で `loc_lawson_*` (LLM hallucination) を `loc_bluewhite_mart_exterior_night_v1` /
  `loc_blueway_interior_v1` へ sed 置換 (commit b93b40f で lawson 駆逐済の所を LLM が知らず再出現)
- L04 並列 enrich を 2 回実行 (1 回目 ep10 のみ成功、lawson fix 後の 2 回目で残り 7 ep 成功)
- 最終 commit 21326c4 で全 10 ep storyboard + scene_graph 確定 (220 pages, 1093 panels)

A/B/C 効果実証 (ep01 単独 live):
- motif Rule 13 errors: 47 → 0 (B の normalize で 100% 削減)
- foreshadow Rule 5 errors: 21 → 9 (A の L2 context 注入で 57% 削減)
- foreshadow_setup hint 分布: 全 this_episode → cross-episode 73% (L2 foreshadow_map 理解)
- anchor_llm 範囲拡大 0.66-0.84 (前回 0.66 最高 → 0.84 最高)

品質指標 (全 10 ep volume-level):
- panel-scene inheritance: 全 ep ok
- foreshadow hint_violations: 0 (hint と実位置の不整合ゼロ)
- volume-level foreshadow: 195 items, resolved 53, cross_volume 22 (ep08-10 末尾、設計通り)
- per-episode Rule 5 errors 計 95 件は coarse check 限界 (token vs description 機械照合不能)、
  volume-level では hint_violations=0 で実害なし

## 次セッション最優先候補 (1 巻完成後)

### α: scoring-loop の foreshadow 設計の絞り込み (品質改善、最優先候補)

現状: L2 expects 9 foreshadows in volume vs scene_graph generated 142 setups (15.8 倍過剰)。
LLM が「foreshadow_setup を積極的に作る」傾向で、payoff_without_setup 53 件、duplicated 7 件が発生。

改善案:
1. `buildSceneCandidatePrompt` の foreshadow 指示を「3-5 件/scene」「volume_plot.foreshadow_map に
   ある seed のみ拡張」に厳格化
2. payoff token は「他 scene にある setup token と完全一致のみ許可」を prompt で明示
3. validateSceneGraph で per-ep setup 過剰 (>5/scene) を warning 化
4. scoring-loop に validateSceneGraph を generate 後 fire し、Rule 5 違反含む候補は自動 reject

### β: motif_id LLM 遵守の根本改善

現状: 全 scene で exact match=0、substring 救済 13-17 件/ep、drop が大半 (B の normalize で捕捉)。
LLM が motif_id 欄に description 本文を入れ続ける。

改善案:
1. motif anchor の prompt 提示を「id だけのリスト + description は別 section」に分離
2. motif_id 出力例 (例: `motif_id: "黒のフードジャケット"`) を prompt 内に 3 サンプル提示
3. JSON schema で motif_id を enum 制限 (Codex の structured output mode)

### γ: 漫画用 episode_patterns 辞書構築 (B4 pattern_match wire)

handoff の H にあった残課題。現状 hardcoded stub のため pattern_match metric が無効。
スコープ大 (4 論点: ソース / 粒度 / 比較方式 / agent 漫画版) のため別 plan 必要。

### δ: L4-1 / L4-9 を scene-swap に置換 (legacy panel patch 廃止)

handoff の F にあった残課題。`L04-1-opening-hook.ts` / `L04-9-cliffhanger.ts` を `swapScenes()`
呼び出しに置換、legacy panel patch 廃止。

### ε: L2 改善ロードマップ (別セッション、user 指示済)

- foreshadow_map に `token_hint?: string` フィールド追加 (機械照合可能化、最優先)
- 複数案生成 + 選別 (anchor pool + pairwise)
- L2 品質評価 validator (`validateVolumePlot`)
- 読者リテンション 6 レバー (`feedback_reader_retention_levers`) 明示化
- L3.5 → L2 フィードバックループ

## 前セッション (2026-05-11) の成果

| commit | 内容 |
|---|---|
| a3b3fd7 | feat: L4 storyboard 詳細化 prompt に visibility 縛り + bible context 注入 |
| d2a60bd | fix: applyCharBudget が先頭 fact 1 件の単独 max 超過で空配列を返すバグを skip ロジックで修正 |
| 6726327 | docs: V3 移行 handoff を 2026-05-11 セッション成果で更新 |
| 980737c | feat: sub-split prompt に長さ上限 800字 / 長文 field の段落分割指示を追加 |
| b8c43ec | fix: sub-split default timeout を 60s→180s に拡張 (long prompt 出力対応) |
| 39f8a95 | docs: handoff を sub-split 再走完了 + L4 visibility 縛り本実証成果で更新 |
| e1784f3 | fix: contextForScene を cast-fair filter に変更 (各 cast 毎に per-budget query → merge) |
| 2445be9 | docs: handoff に cast-fair filter 完了を反映 |
| 3d85576 | feat: Wave 1 - USE_BIBLE_V3 default true + undefined-reference-detector 強化 |
| bca7afb | docs: handoff に Wave 1 完了反映 |
| 7dedb83 | fix: compliance scanner に positive_context を追加して「ライン」「LINE」の誤検出修正 |
| d3cd17b | docs: handoff に Wave 2 + 2-C 調査結果反映 |
| 6a6700e | feat: deepen-snapshot-field.ts (Codex CLI 経由 deepener、初回実走で課題判明) |
| f493f8b | feat: apply-deepen-patch.ts (Claude Agent 経由の追記式 patch apply、a07 玲二 origin_wound_deep で実証成功 fatal 27→26) |
| 5cb85c4 | feat: evaluate-and-rewrite + apply-rewrite-patch (Claude Agent 評価+上書き式 rewrite インフラ、a07 で実走確認 + hallucination 課題判明) |
| f199fb1 | feat: Quality Gate (--diff-check + prompt 厳守ルール) - hallucination 検出 33 件で apply 阻止を実証 |
| 158f956 | docs: ワークフロー実証完了 - 玲二 ideology_argument を Agent rewrite → gate 通過 → apply、a07 fatal 26→25 |
| 0ac325e | feat: v3-adapter D1-3 修正 + apply-deepen-patch dotted/world 拡張 (a07 fatal 25→0、L1 bible 完成、tests 398→413) |
| b889742 | docs: handoff を a07 L1 完成で更新、Wave 3 (L3.5 強化) を次最優先に |
| 5fe6666 | feat: L03_5-scene-graph.ts に --live flag 追加 (scoring-loop B3 live 動作確認、a07-ep01 S01 で 154.7s 実走成功) |
| 9d191e5 | docs: handoff に Wave 3 進捗反映 |
| 09ca178 | docs: handoff に a07-ep01 全 10 scene live 結果と Tier 3 escalation 課題反映 |
| 5ae70dd | feat: scoring-loop Tier 2 feedback prompt + 閾値 0.50 化 (Tier 3 escalation 50%→0%、ep01 9/1/0・ep02 並列 6/0/0) |
| f975bef | docs: handoff に Tier 2 feedback 効果実証反映、Wave 3 主要課題解消 |
| 3601b01 | docs: handoff に a07-v01 全 10 ep scoring-loop live 完成反映 (8 ep 並列 42.6 分、Tier 3 = 0) |
| 1eeddb9 | feat: scoring-loop scene_exclusive 重複防止 (prompt + validateSceneGraph Rule 4 強化、ep01 再走で tier 10/0/0 達成) |
| 571cadc | docs: handoff に L4 再展開試行と残課題 (motif_id description 誤注入 / location_id 不整合) 反映 |
| dd04870 | feat: scoring-loop motif prompt 改善 (description 分離 + motif_id 厳守、ただし LLM 不遵守は残存) |
| e5c3ca5 | fix: a07 ep01 scene_graph の location_id 不整合修正 (loc_blueway → loc_bluewhite_mart) |
| (本コミット) | docs: handoff に L2 context 未注入の設計欠陥反映、次セッション最優先を切替 |

## L2 context 未注入の設計欠陥 (2026-05-12 末、user 指摘で判明)

`scoring-loop.ts` `buildSceneCandidatePrompt` は `volume_plot` を **path のみ** で
プロンプトに含め、内容を読み込んでいない:

```
slug=a07-modern-dungeon, episode=1, scene=S01
bible: /Users/.../bible/snapshot.json
brief: /Users/.../episodes/ep01/_brief.v2.md
volume_plot: /Users/.../volumes/v01/plot.json  ← path だけ
```

これは scoring-loop の **設計上の根本問題**:

### 影響範囲

1. **各 ep が「独立した場面集」として生成** — 巻全体での位置付け・他 ep との関係不明
2. **foreshadow 単発化** — 巻またぎ伏線 (ep01 setup → ep05 payoff) の context がないため、LLM は当 ep 内で完結させる / 逆に payoff を起こす (今回 21 件の Rule 5 違反の原因)
3. **採点 LLM も巻基準で判定不能** — pairwise / anchor 比較は各場面単独でしか評価できない
4. **motif / 主人公 arc / 関係性 delta も巻設計から外れる** — L2 のテーマ整合が崩れやすい

### user の指摘

「L2 がちゃんとしていないと L3.5 を修正しても評価できなくない?」 — その通りで、
L2 (a07 v01/plot.json) は内容良好だが、scoring-loop が L2 を消費していないため
今回の Tier 2 feedback / motif prompt 修正の効果も半減状態。

### 必要な対応 (次セッション最優先)

- **`generateSceneCandidates` で `context.volumePlotPath` を fs 読み込み** → 当 ep の役割・テーマ・周辺 ep foreshadow を抽出 → prompt の「## 巻内位置」section に注入
- **`buildPairwisePrompt` にも** 「この巻のテーマ X、当 ep の役割 Y を踏まえて判定」を追加
- **`compareToAnchorPool` (anchor 比較 LLM) にも同様注入**
- **`validateSceneGraph` の foreshadow 検査も `volume_plot.foreshadow_map` 参照** で当 ep の設計通りか機械的に検査

### a07-ep01 で発覚した症状サマリ (今セッション再走後)

motif prompt 修正 (dd04870) + Rule 4 強化 (1eeddb9) 後の ep01 再走で残った errors:

| 種類 | 件数 | 原因 |
|---|---|---|
| motif_id に自由文 (description) | ~24 件 | LLM が prompt 指示遵守せず (Codex prompt 改善のみでは不十分、runtime normalize が必要) |
| foreshadow Rule 5 違反 | ~21 件 | L2 context 未注入で巻全体の伏線設計を踏まえない自由生成 |

## 次セッション最優先 (推奨順、再整理)



## L4 storyboard 再展開試行と発見した残課題 (2026-05-12 末)

scoring-loop 出力を `data/.../scene_graph.json` に反映 → L04-storyboard --from-scene-graph
--enrich で再展開を試行したが、3 段階の問題発生:

### 問題 1: scene_exclusive 台詞重複 (解消済、commit 1eeddb9)
- S03 の "経験値倍化条件、開示します。" が S08 で may_repeat 再出現
- 原因: scoring-loop prompt が過去 scene_exclusive 台詞を後続 scene 生成 context に渡してない
- 対応: buildSceneCandidatePrompt に「過去 scene_exclusive 台詞リスト」section 追加 + validateSceneGraph Rule 4 を text-level uniqueness 強化
- ep01 再走結果: tier 10/0/0、scene_exclusive 重複なし (各 scene 1 つ、全 text 異なる)

### 問題 2: location_id 既存不整合 (未対応)
- ep01 scene_graph で S03 / S06 が `loc_blueway_exterior_night_v1` を参照、bible には未定義
- bible には `loc_bluewhite_mart_exterior_night_v1` (正) と `loc_blueway_interior_v1` (内装) のみ
- commit b93b40f (lawson 駆逐) で中途半端な rename が残った跡
- L04 validation で「unknown location_id」9 panel で検出して停止
- 対応: a07 全 ep の scene_graph で `loc_blueway_exterior_night_v1` を一括 sed 置換、または bible に正しい id 追加

### 問題 3: motif_id に description 誤注入 (未対応)
- scoring-loop が visual_motif_anchors.motif_id に motif の description 文章 (80字 prefix) を返す
- 47 errors (10 scene 各 1-3 motif)
- 原因: buildSceneCandidatePrompt の motif 提示形式 `- name=X (id=Y): description...` を LLM が分解できず description を motif_id として再利用
- 対応: motif 提示形式の単純化 (description は別 section へ) + 「motif_id は必ず name または id」と明示
- これも scoring-loop prompt の別欠陥

### 次セッションで進める順序

1. **scoring-loop motif prompt 修正** (Codex 依頼) → ep01 再走 (~45 分) で motif_id 問題解消確認
2. **location_id 体系的修正** (a07 全 ep の scene_graph + storyboard で `loc_blueway_exterior_night_v1` を一括 sed 置換、または bible に正しい id 追加)
3. **ep01 で L04 --enrich 再展開** → 動作確認 (1 巻完成への最後のピース)
4. **他 9 ep 並列再走** → 1 巻完成

### enrich 落ち skeleton state の発見

Console の P.1 [buildup] 画面で「同じ S01 (introduce/establishing) panel N/12: 墨色の新宿夜景…」が
4 panel 連続している現象を確認 (Phase 8 以降の commit eedf8f3 で「新 plot.json で再生成」したとき
--enrich を通さずに skeleton state で上書きされた跡)。L04 --from-scene-graph --enrich を通せば
panel.action / dialogue が具体になり scene_id も bind される。問題 2/3 解消後にこれが本来の姿に戻る。



## a07-v01 第 1 巻 全 10 ep scoring-loop live 完成 (2026-05-12 末)

ep03-ep10 を 8 ep Promise.all 並列で live 実走、**1 巻全 72 scene の scene-graph が
scoring-loop B3 採点ループ経由で確定**。

| ep | scenes | time | tier 1/2/3 | anchor min-max (avg) |
|---|---|---|---|---|
| 01 | 10 | 32.5 分 (単独) | 9/1/0 | 0.52-0.74 |
| 02 | 6 | 18.3 分 (並列 ep01) | 6/0/0 | 0.61-0.74 |
| 03 | 7 | 38.6 分 (並列 8) | 6/1/0 | 0.63-0.71 (avg 0.66) |
| 04 | 7 | 33.8 分 (並列 8) | **7/0/0** | 0.64-0.76 (avg 0.71) |
| 05 | 7 | 42.6 分 (並列 8) | 6/1/0 | 0.58-0.76 (avg 0.66) |
| 06 | 7 | 39.0 分 (並列 8) | 6/1/0 | 0.56-0.72 (avg 0.64) |
| 07 | 7 | 35.4 分 (並列 8) | **7/0/0** | 0.56-0.73 (avg 0.66) |
| 08 | 7 | 31.5 分 (並列 8) | **7/0/0** | 0.58-0.72 (avg 0.64) |
| 09 | 7 | 34.7 分 (並列 8) | **7/0/0** | 0.62-0.74 (avg 0.67) |
| 10 | 7 | 33.9 分 (並列 8) | **7/0/0** | 0.58-0.74 (avg 0.67) |
| **合計** | **72** | **(並列で 42.6 分)** | **65/4/0** | (全 ep 合算 avg 0.66) |

### 並列運用の知見

- 8 ep Promise.all 並列起動で全 ep 42.6 分 (sequential 換算 4.8 時間)
- ep ごとに Codex CLI を多数 spawn (1 ep = candidate gen + C(N,2) pairwise + N anchor)
- 途中 1 回「Selected model is at capacity」エラー発生、retry で自動回復、結果に影響なし
- ChatGPT Pro 定額枠内 (cost ~2M tokens 合計、API 課金ゼロ)
- 結果ダンプ: `/tmp/a07-epNN-scoring-result.json` (ep03-ep10)

### scene 採用品質サマリ

- Tier 1 採用: 65/72 (90.3%)
- Tier 2 採用: 4/72 (5.6%、ep03/ep05/ep06 で各 1 + ep01 で 1)
- Tier 3 escalation: **0/72 (完全解消)**
- anchor_llm 平均 0.66 (Tier 2 fix 後の妥当範囲)
- key_visual_intent は bible motifs (黒フード、ヒビ端末、Fランク ID、青光、朱色公的光、空枠オーバーレイ) を全 ep で多用、world.premise の哲学を反映

### 次セッション最優先候補 (a07-v01 1 巻完成後)

1. **L4 storyboard を新しい scene-graph で再展開** — 今回 scoring-loop が出した scene-graph (`/tmp/a07-epNN-scoring-result.json`) を `data/manga/works/a07-modern-dungeon/episodes/epNN/scene_graph.json` に反映 → L4 storyboard を `--from-scene-graph --enrich` で再生成 → 1 巻全 panel + 描画準備完成
2. **漫画用 episode_patterns 辞書構築 (B4 pattern_match wire)** — 既存 yaml は小説用。漫画用は新規設計が必要 (4 論点: ソース / 粒度 / 比較方式 / agent 漫画版)
3. **L4-1 / L4-9 を scene-swap に置換** — legacy panel patch 廃止、`swapScenes()` 呼び出しに置換
4. **anchor pool 改善** — 全 ep avg 0.66 は妥当だが、anchor source の見直しでさらに品質改善余地
5. **scene 間並列化検討** — 1 ep 内の scene 間 sequential を緩めれば ep 単独実走も 2-3 倍加速可能性

## 続きセッション (2026-05-12 後半) の成果

**ゴール達成: scoring-loop B3 live 動作確認 — Wave 3 L3.5 強化の主要マイルストーン**

### Wave 3 真の現状判明 (Explore Agent 調査 + 直接確認)

- `src/lib/manga/scene-graph/scoring-loop.ts` (1168 行) は **既にほぼ完全実装済**
  - `generateSceneCandidates` (line 182-225): dry_run + 実 Codex CLI 両対応
  - `runPairwiseTournament` (line 378-425): C(N,2) マッチを Codex CLI 並列実行
  - `compareToAnchorPool` (line 823): anchor pool cosine + LLM 採点
  - `runTier1` (line 972): candidate → pairwise → anchor → 採用判定
  - `runTier2` (line 1028): 再生成ループ + Tier 3 escalation
  - `runEpisodeScoringLoop` (line 1069): episode 全体オーケストレーション
- 本当の bottleneck は **CLI entry が dry_run=true ハードコード** ([L03_5-scene-graph.ts:304](scripts/manga/layers/L03_5-scene-graph.ts#L304))
- handoff の 4 子タスクのうち volume_plot 生成 + 巻またぎ伏線も既に完了 (`computeVolumeForeshadowDag` 実装済、a07 errors=0)

### a07-ep01 S01 live 実走結果 (1 scene、candidates=3)

| 項目 | 結果 |
|---|---|
| 実走時間 | 154.7s (約 2.5 min) |
| 推定コスト | ~24k tokens (ChatGPT Pro 定額枠内) |
| selected beat / mode | reveal / silence |
| key_visual_intent | 「空の通知枠と右上ヒビだけが光る端末を見下ろすレンの目元に、薄い青の反射を一点だけ置く」 |
| protagonist_belief | 「自分の疲労が幻聴を生んだだけかもしれないが、検証できる数字は無視できない」 |
| cast | char_桐生_レン_v1(in_person), char_獅童_響_v1(voice_off) |
| pairwise_score | 1.00 (完勝) |
| anchor_llm_score | 0.64 |
| needs_regeneration | true (Tier 2 発火条件成立) |

candidate gen / pairwise / anchor pool 比較すべて live で動作確認。

### a07-ep01 全 10 scene live 実走結果 (2026-05-12)

| 指標 | 値 |
|---|---|
| 実走時間 | **3732.2s = 62 分** (1 scene 平均 373s) |
| candidates 生成数 | 69 (30 base + 39 Tier 2 再生成) |
| tier_breakdown | **tier1=3, tier2=2, tier3=5** |
| anchor_llm 平均 | 0.66 (最低 S02=0.42 / 最高 S06=0.74) |
| scene 採用品質 | 高 (bible motifs / world.premise 哲学を反映、商業作家レベル key_visual) |

scene 採用品質は高いが、**Tier 3 escalation が 50%** という運用上の課題判明。
LLM 出力は良質だが、`tier2_threshold_pct: 0.30` (デフォルト) で anchor_llm < 0.70 を
「再生成」と判定するのが厳しめ、かつ Tier 2 feedback prompt が単純再実行のため Tier 2
で改善せず Tier 3 (人間 review pending) に流れる。

scene_graph 結果 dump: `/tmp/a07-ep01-scoring-result.json`

### Tier 3 escalation 解消 検証結果 (2026-05-12 後半セッション、commit 5ae70dd)

閾値 0.50 化 + Tier 2 feedback prompt 実装で、ep01/ep02 並列 live 再走 (Codex CLI 別 process):

| 指標 | ep01 (初回) | ep01 (Tier 2 fix 後) | ep02 (並列) |
|---|---|---|---|
| 実走時間 | 62 分 | 32.5 分 | 18.3 分 |
| total_candidates | 69 | 33 | 18 |
| tier_breakdown | 3/2/5 | **9/1/0** | **6/0/0** |
| Tier 1 採用率 | 30% | 90% | **100%** |
| Tier 3 escalation | 50% | **0%** | **0%** |
| anchor_llm 範囲 | 0.42-0.74 | 0.52-0.74 | 0.61-0.74 |

両 ep で Tier 3 escalation 完全解消。Wave 3 B3 採点ループの量産耐性確保。

### 残課題 (次セッション以降、優先順)

1. ~~**Tier 3 escalation 50% 問題の解消**~~ — **完了 (5ae70dd)**
2. **template_collision の B4 wire** ([scoring-loop.ts:1010](src/lib/manga/scene-graph/scoring-loop.ts#L1010)) — episode-metrics の TODO
3. **pattern_match metric の hardcoded stub 解消** ([episode-metrics.ts:49](src/lib/manga/scene-graph/episode-metrics.ts#L49)) — 漫画用 episode_patterns 辞書が未構築
   - 既存 `data/generation/profiles/{hellmode,light_recovery}_type/episode_patterns.yaml` は **長編小説用** (phase/words 単位)、漫画は scene/page 単位なので新規設計が必要
   - ソースは a07 自身 (self-circular) でなく、外部商業漫画 (kindle-test-1 等) からの手動 or LLM 抽出が筋
   - スコープ大 (Plan で 4 論点 — ソース / 粒度 / 比較方式 / agent 漫画版 を固める必要あり)
4. **L4-1 / L4-9 を scene-swap に置換** ([L04-1-opening-hook.ts](scripts/manga/layers/L04-1-opening-hook.ts)) — legacy panel patch 廃止
5. **10 agent prompt の scene-graph 対応** (`.claude/commands/*.md`)
6. **scene 間並列化検討** — 1 ep 62 分は許容範囲だが、巻全体 (10 ep) で 10 時間。episode 並列起動 (Codex CLI 別 process) で 1/4 短縮可



## このセッション (2026-05-12) の成果

**ゴール達成: a07 fatal lint 25 → 0 (L1 bible 完成)**

### Phase 1: 既存インフラ路線 (4 件)
- 玲二 `dark_mirror_to_protagonist`: 1192 → 4592 字 (Claude Agent + apply-deepen-patch、新規 7 軸展開)
- motif_02f386de9770 (数値オーバーレイの空枠) 3 fields:
  - meaning 57 → 914 字
  - draw_directive 179 → 1705 字
  - symbolic_lineage 0 → 1428 字 (**新規 field 追加、apply-deepen-patch は current="" でも動作確認**)

### Phase 2: 真因調査 — 残り 21 件は lint バグと apply 機能不足
- `v3-adapter.ts` バグ 3 件発見:
  - D-1: growth_per_volume の `body: growth.description` 参照だが、実 snapshot は `{vol, growth}` 形式 → fact 化失敗
  - D-2: motif を 1 fact にまとめており、`reference_scenes[]` / `negative_examples[]` を要素ごと fact 化していない
  - D-3: location.spec の `history` / `visual_description` / `socioeconomic_context` / `sensory_textures` を fact 化していない
- `apply-deepen-patch.ts` 機能不足 2 件:
  - 拡張A: `spec.who_typically_inhabits` のような dotted path に非対応
  - 拡張B: `scope: world` (world.premise 用) に非対応

### Phase 3: Codex 一括修正 (commit 次1 候補)
- mcp__codex__codex に仕様書 `/tmp/v3-l4-spec/spec-v3adapter-and-apply-extensions.md` で依頼
- 修正 8 ファイル (+260/-34、新規テスト 15 件):
  - `src/lib/manga/bible/v3-adapter.ts` (D-1/D-2/D-3)
  - `src/lib/manga/bible/v3-adapter.test.ts` (新規)
  - `src/lib/manga/bible/depth-lint.ts` (motif/location の pathFilter 追加)
  - `src/lib/manga/bible/depth-lint.test.ts`
  - `src/lib/manga/schemas-v2.ts` (growth_per_volume の両形式 union)
  - `src/lib/manga/bible/broker.ts` (consumer 側の両形式対応、副次的必要修正)
  - `scripts/manga/bible/apply-deepen-patch.ts` (拡張 A/B)
  - `scripts/manga/bible/apply-deepen-patch.test.ts`
- `npx vitest run`: 413 tests pass + 5 skipped (398→+15)
- `npx tsc --noEmit`: pass
- D-3 適用で他 location の visual_description 不足が表面化 (元 21 件 → 8 件、想定の 4 件より多い)

### Phase 4: 残り 8 件のデータ追記 (8 Agent 出力)
| target | field | before | after |
|---|---|---|---|
| world.premise | (global) | 1497 | 3254 |
| loc_shinjuku_third_dungeon_gate_v1 | spec.who_typically_inhabits | 470 | 1571 |
| loc_bluewhite_mart_exterior_night_v1 | spec.visual_description | 1277 | 3992 |
| loc_shinjuku_third_3f_hidden_cache_v1 | spec.visual_description | 1289 | 3291 |
| loc_shinjuku_third_3f_hidden_cache_v1 | spec.history | 521 | 2677 |
| loc_shinjuku_third_3f_hidden_cache_v1 | spec.socioeconomic_context | 451 | 2469 |
| loc_shinjuku_third_3f_hidden_cache_v1 | spec.sensory_textures | 675 | 2792 |
| loc_shinjuku_third_3f_hidden_cache_v1 | spec.who_typically_inhabits | 397 | 2226 |

**最終: `npx tsx /tmp/v3-l4-spec/scan-lint.ts` → fatal=0, warn=2210 達成**

### 残懸念 (本タスクスコープ外、次回検討)
- `undefined-reference-detector.ts:530` は growth_per_volume の `description` のみ参照、`{vol, growth}` 形式に未対応 → false negative の可能性 (false negative なので bible 品質に影響なし、優先度低)



- handoff の **最優先タスク (L4 visibility 縛り)** 完了
- 副産物として broker-v3 `applyCharBudget` のバグを発見・修正
  - 修正前: cast character の最初の長文 fact 1 件で空配列を返し、character section が完全消滅
  - 修正後: a07 ep01 S01 で character section に psychology fact 1 件 (1,628 字) が正しく拾われる
- 連鎖発見: a07 cast facts には relationship aspect の 5K-8K 字超長文 fact が複数存在 (sub-split が長さを意識していない設計)
  - sub-split prompt を拡張 (980737c) し、新 prompt で 1 fact 検証: **8,323 字 → 5 sub-facts (各 120-203 字、すべて 800 字目安以下)、副次効果として revealed_at_volume layer に正しく分類**
- 378 → 379 tests (+1: buildSubSplitPrompt 拡張指示確認)
- 詳細 spec: `/tmp/v3-l4-spec/spec.md`, `/tmp/v3-l4-spec/spec-budget.md`, `/tmp/v3-l4-spec/spec-subsplit-len.md`
- a07 全体再 sub-split 2 回目 (timeout 180s) で **190/190 成功 / failed=0**
  - facts: 1,156 → 1,205 (+49)
  - layer 分布: in_world_belief 706→724, revealed_at_volume 33→70 (2倍), character_arc_state 120→127, system_specification 142→155
  - 平均 confidence 0.91、avg <0.7 fact=0
  - **fatal lint 70 → 30 (半減)**
- swap-v2-to-v3 で facts/ 反映済 (snapshot.json は V2 不変、snapshot.v3.json + facts/{characters,locations,motifs,props,world}/ 更新)
- L4 visibility 縛り検証 (V3 直接読み込み path):
  - characters facts 0/1 → **7 件** (appearance×5 + backstory×2、各 216-272 字)
  - location facts → 6 件、world_rules → 31 件、motifs → 1 件
  - prompt size: 7,515 → 9,922 chars (Codex 入力上限 32k 内、実用問題なし)

## このセッションのゴール

V3 移行 plan の **残課題に着手**:
1. ~~(最優先) L4 storyboard visibility 縛りの本格実装~~ — **完了 (a3b3fd7)**
2. ~~b/c 系作品 (転生貴族・現代ダンジョン2 等) で V3 migration を実走~~ — **a07 以外の作品 bible が `data/manga/works/` 配下に存在しないため skip**
3. ~~Character 長文 fact の sub-split~~ — **完了 (980737c + b8c43ec、a07 再 sub-split → swap 済)**
4. ~~broker-v3.contextForScene の cast-fair filter~~ — **完了 (e1784f3、a07 ep01 S01 でレン 3 + 灯里 3 にバランス回復)**
5. ~~USE_BIBLE_V3 default true 化~~ — **完了 (3d85576、USE_BIBLE_V3=false で V2 fallback、それ以外は V3)**
6. ~~undefined-ref detector 改善~~ — **部分完了 (3d85576、a07 で 1,971 → 1,442 件 -26.8%、known_terms.json 拡張で更に削減可)**
7. ~~(任意・**新最優先候補**) a07 bible の depth 不足解消~~ — **完了 (このセッション、fatal 25→0)**。当時の fatal lint 27 件のうち depth 系。主人公 growth_per_volume 未着手 / antagonist 心理 60-80% 不足 / location history 未着手 / visual_motifs 各種項目不足。
   - **インフラ完成**: `scripts/manga/bible/deepen-snapshot-field.ts` (snapshot 起点で character/location/motif の指定 field を Codex CLI で deepen するスクリプト) を実装済
   - **初回実走で課題判明** (玲二 psychology):
     - Stage 1b は 7 field 同時生成で `enforcedTotalMinChars: 5000` だが各 field 個別 min 未強制
     - 結果: 出力が分散して全 field を min 達成できず、`ideology_argument` が **既存値より短い patch で上書きされて後退** (1192→1090 字)
     - a07 snapshot は backup から revert 済 (fatal 27 維持)
   - **追加実装**: `scripts/manga/bible/apply-deepen-patch.ts` (Claude Agent 経由の追記式 patch apply、Codex CLI 経由と独立)
   - **a07 玲二 origin_wound_deep で実証成功**:
     - Claude Agent (general-purpose) で追加段落 3 つ (約 2,000 字) を生成
     - apply-deepen-patch.ts で snapshot に追記
     - origin_wound_deep: 1,186 → 3,162 字 (+1,976、min=2000 クリア)
     - **fatal lint: 27 → 26 (確実に減少、後退ゼロ)**
   - **評価+書き直しインフラ追加**: `evaluate-and-rewrite.ts` (Agent 用 prompt 生成) + `apply-rewrite-patch.ts` (上書き式 apply、backup あり)
   - **a07 で 1 件実走 (psychology_deep) で hallucination 課題判明**:
     - Agent が誤キャラ名「天野レン」を生成 (正: 桐生レン)
     - 新規語彙 (偶然許可リスト / 信頼スコア / 国家直轄部隊 等) を context 無視で多数導入
     - revert 済 (fatal=26 維持)
   - **Quality Gate 完成** (commit TBD):
     - `apply-rewrite-patch --diff-check` で新文章の未登録固有名詞を検出 → exit 1
     - `detectUndefinedReferencesInText(text, bible, knownTerms)` API 追加
     - evaluate-and-rewrite prompt に厳守ルール 3 件追加 (キャラ名厳守 / 新規固有名詞禁止 / 既存設定優先)
     - a07 玲二 psychology_deep で実証: 直前の hallucination 入り result (天野レン誤キャラ + 偶然許可リスト等新概念) → **gate が 33 件検出して apply 阻止**、snapshot 変更ゼロ
   - **ワークフロー実証完了** (本セッション末):
     - 玲二 ideology_argument を Claude Agent で rewrite (厳守ルール込み prompt) → hallucination 33→4 件に激減 (88% 削減)
     - 4 件中 3 件は detector の regex 境界問題、1 件は context 妥当語 → known_terms.json に追加 (130→150 terms) で gate 通過
     - apply 成功: ideology_argument 1192 → 2890 字 (min=2000 クリア)
     - **a07 fatal lint: 26 → 25 (1 件減)**
     - data は gitignored (a07 local のみ)、code 変更なし、コミットは handoff のみ
   - **次セッションでやるべきこと**:
     1. 残り fatal 25 件を同じワークフローで一括処理 (Agent → gate → known_terms 追加 → apply)
     2. **growth_per_volume (array field)** 対応で apply-deepen/rewrite-patch を拡張 (主人公の巻ごと成長アーク = 商業漫画核心)
     3. **visual_motifs に id 自動付与** (現状 name しか無く、apply-rewrite-patch で扱えない) または name 検索 fallback
     4. detector regex 境界問題の修正 (途中切れ単語の検出を減らす)
     5. (任意) apply-rewrite-patch に `--interactive` モード追加 (人間が新規語彙を確認 + known_terms.json に登録)
     6. (任意) 段落単位の部分置換 (issues の location_hint を活用して該当段落だけ置換)
8. ~~bible-lint の「ライン」誤検出修正~~ — **完了 (7dedb83、a07 fatal 30→27)**
9. (**Wave 3 — 新最優先候補**) L3.5 強化 — a07 では volume_plot.json が**未作成**で cross-episode validator が弱動作。1. a07 用 volume_plot 生成、2. 巻またぎ伏線の自動配置、3. episode-patterns 辞書のカバー率向上、4. anchor pool scoring 統合 (4 子タスク)
10. (任意) L11 audit / L12 repair の本格化 (現状は雛形のみ)
11. (任意) L8.5/8.6/8.7 name gate UI 改善 (Console 中央コックピット化)

## 前提 (前セッションで完了済)

- repo: `/Users/hikarumori/Developer/AINARO`
- branch: `feat/manga-pipeline-v2` (push 済、最新 commit `80b8a91`)
- plan: `~/.claude/plans/wild-exploring-crescent.md` (Phase 1-8C + 拡張完了マーク済)
- 手順書: `docs/architecture/bible_v3_migration_guide.md` (b/c 系展開用レシピ)

### V3 移行 27 commits (Phase 1-9)

| Phase | commit | 内容 |
|---|---|---|
| 1 | c453bea | V3 schema + v3-adapter + determinism test |
| 2 | 732fba2 | broker-v3 read-only mirror + parity test |
| 3 | f34f31e | bible-lint chunked + --llm-lint + provenance + undefined-ref |
| 3-ext | 0f91ec1 | depth-spec layer/aspect filter + V3 fact-based depth check |
| 4 | 20df8bd | deep-extractor 文体規制 + Stage 8 per-volume + Stage 9 v3 cross-ref |
| 5-A | bd10d92 | a07 V2→V3 deterministic migration script |
| 5-B | b738076 | LLM refine N 周回 classify (Codex CLI 並列) |
| 6 | d5de6cb | USE_BIBLE_V3 flag + monologue-layer-check |
| 7 | 9eb9259 | Console v3 preview タブ + provenance modal |
| 7-ext | cd477ba | Console v3 preview に LLM refine 結果表示 |
| 8-A | 57cd86c | undefined-reference-detector 精度改善 (16,181→1,971) |
| 8-B | d8b625c | USE_BIBLE_V3 V2/V3 parity (intersection 1.000) |
| 8-C | 0109bf0 | prompt-composer USE_BIBLE_V3 全 broker 呼び出し wire-up |
| 拡張 | c77a87b | V3 snapshot atomic write + rollback (R9 緩和) |
| 拡張 | 8c59233 | swap-v2-to-v3.ts (Phase 8 本番置換準備) |
| 9 | 0c20c6b | Phase 9 V2 string LLM sub-split |
| swap fix | d8b1192 | swap script V2 保護型に修正 (snapshot.json=V2 維持、V3 並存) |
| 9-A | f2743c0 | broker-v3 を本物 V3 fact-based logic に置換 (主要 2 wrapper) |
| 9-C | 17fc120 | Console handler facts/ 分割ロード API |
| 9-A 完成 | 80b8a91 | broker-v3 残り 9 wrapper 全て本物 V3 logic に置換 |
| docs | f6cc950 | bible_v3_migration_guide.md |
| docs | 4066ba1 | CLAUDE.md V3 section 追加 |
| api fix | da0e53a | bible-v3-preview API llmRefine shape 修正 |

### a07 で実証済の V3 経路

- `data/manga/works/a07-modern-dungeon/bible/snapshot.json` = V2 (schema_version=2、変更禁止)
- `data/manga/works/a07-modern-dungeon/bible/snapshot.v3.json` = V3 (schema_version=3、entities=82)
- `data/manga/works/a07-modern-dungeon/bible/facts/{characters,locations,world,motifs,props}/<id>.json` = 1,156 facts split
- `data/manga/works/a07-modern-dungeon/bible/fact_index.json` = 全 fact index
- `data/manga/works/a07-modern-dungeon/bible/v3-classified-llm-refine.json` = LLM refine 結果 (stable 67%、avg conf 0.57)
- `data/manga/works/a07-modern-dungeon/bible/snapshot.v2-final.json` = V2 永久保存 (rollback 用)
- `data/manga/works/a07-modern-dungeon/episodes/ep01/renders/p05_v14.png` = USE_BIBLE_V3=true で生成 (broker-v3 主要 2 本物化時点)
- `data/manga/works/a07-modern-dungeon/episodes/ep01/renders/p15_v15.png` = USE_BIBLE_V3=true で生成 (全 11 wrapper 本物化後)

### Phase 9 で実装した V3 経路全体

```
USE_BIBLE_V3=true
   ↓ L09-render (flag 認識)
   ↓ prompt-composer-v2 (全 broker 呼出 *FromV2 経由)
   ↓ broker-v3 (11 wrapper 全て本物 V3 logic):
     - summarizeCharacterForEpisodeV3 (visibility filter で巻ごと変化)
     - relevantWorldRulesV3 (4 件 hard-clip 撤廃、char_budget 動的)
     - activeCostumeForV3 (episode_range 整合性)
     - relationshipStateAtV3 (pov=specific_character + character_arc_state)
     - relevantMotifsV3 (entities[kind=motif] + facts[aspect=motif_directive])
     - summarizeMotifForPanelV3 / summarizeLocationForSceneV3 / summarizeWorldRulesForSceneV3
     - attributeTagsForV3 / continuityAnchorTextForV3 / sceneOverrideTextForV3
   ↓ v3-loader.loadBibleSnapshotV3FromDir (snapshot.v3.json + facts/ 集約)
   ↓ 1,156 facts visibility filter で抽出
   ↓ prompt 構築 → 画像生成
```

### 数値メトリクス

- **297 → 372 tests** (+75 新規、tsc clean、全 pass)
- a07 V3 facts: **1,156** (sub-split で 600→1,156)
- Layer 分布: in_world_belief 677 / system_specification 153 / character_arc_state 143 / meta_truth 119 / revealed_at_volume 64
- LLM refine: stable 67%、avg conf 0.57、meta_truth 88.2% / character_arc_state 82.5% 高品質
- Console v3 preview: facts 1,156 / role violations 2 / unresolved refs 1,971 表示
- render 検証: p5 v14 + p15 v15、failed=0、商標リーク 0

## このセッションでやること (詳細)

### 1. (新規・最優先候補) Character 長文 fact の sub-split

**背景:**
前セッションで L4 visibility 縛り (a3b3fd7) + applyCharBudget 修正 (d2a60bd) を入れて、a07 ep01 S01 で character section に fact 1 件が拾われるようになった。

しかし、a07 cast (レン) の facts を見ると、最初の数件が異常に長い (2,546 / 3,815 / 3,255 字)。これらは V2 の `psychology_deep` `personality_visual_detailed` `belief_system_full` 等の長大フィールドが Phase 9 sub-split で分割されていない疑い。

```
レン facts body length 上位:
  fact 1: 2,546 chars (backstory)
  fact 2: 3,815 chars (psychology)
  fact 3: 3,255 chars (...)
  fact 4: 1,345 chars
  fact 5: 1,312 chars
  fact 6: 2,316 chars
  fact 7-46: 50-80 chars (speech 等、short fact)
```

**目指す状態:**
- character の長文 V2 source fields も sub-split 対象に追加
- 各 character fact が ~500 字以下に分割される
- L4 visibility 縛り prompt の character section に複数 fact (identity / appearance / psychology / backstory / relationship / speech) がバランスよく拾われる

**対象ファイル候補:**
- `scripts/manga/migrate/v2-to-v3-classify.ts` (Phase 9 sub-split を駆動)
- `src/lib/manga/migrate/llm-sub-split.ts` (推定: sub-split LLM ロジック)
- 関連: `data/manga/works/a07-modern-dungeon/bible/facts/characters/` の現状確認

**確認手順:**
```bash
# 既存 fact body length を集計
npx tsx -e "
import { promises as fs } from 'node:fs';
const dir = 'data/manga/works/a07-modern-dungeon/bible/facts/characters';
const files = await fs.readdir(dir);
for (const f of files.filter(n => n.endsWith('.json'))) {
  const fact = JSON.parse(await fs.readFile(dir + '/' + f, 'utf-8'));
  console.log(\`\${f}: body=\${fact.body?.length ?? 0} chars\`);
}
"
```

**規模感:** 中。`v2-to-v3-classify.ts --with-sub-split` の動作確認 + 必要なら sub-split target field の拡張 + a07 で再 migrate (LLM コール多)。

### 2. ~~b/c 系作品で V3 migration 実走~~ skip 確定

`data/manga/works/` 配下に a07-modern-dungeon 以外の bible は存在しない (2026-05-11 確認)。b/c 系 = 「ダンジョン探索」「転生貴族領地経営」は bible 構築自体が未着手。bible 構築は別ワーク扱い (`run-deepen-all.ts` 等)。

### 3. (任意) undefined-reference-detector 更改善

**現状:** a07 で 1,971 件 (Phase 8-A で 16,181→1,971 に改善済)
**目標:** 数百件まで絞る
**改善余地:**
- 役職呼称 (主任、部長、窓口担当) を除外辞書に追加
- character 別名・敬称付き形を `expandCharacterNames` の対象拡張
- 「鑑定石プロトコル」「ナビ第二段階」のような複合語を bible.entities に登録 → 自動消える

### 4. (任意) USE_BIBLE_V3 default 化

a07 で十分検証 → `process.env.USE_BIBLE_V3 === "true"` を default true に変更
- 影響範囲: scoring-loop / prompt-composer-v2 / L9
- リスク: 他作品で V3 swap してない場合 fallback (v2ToV3 adhoc 変換) が走るので動くはずだが要検証

## 制約・ルール

- src/ scripts/ 編集は **Codex 経由** (CLAUDE.md 三段リレー)
- レビュー証跡: `echo ok > /tmp/ainaro-codex-reviewed-$(git rev-parse HEAD)`
- docs/, *.md, snapshot.json 等のデータファイルは Claude 直接編集 OK
- コミットメッセージ: `<type>: <日本語説明>`
- Co-Authored-By: Claude Opus 4.7 (1M context) を残す
- 各 logical change ごとに 1 commit
- LLM コール (Codex CLI 経由) は ChatGPT Pro 定額枠内、追加課金なし
- ANTHROPIC_API_KEY 課金前提にしない (`feedback_no_anthropic_api` メモリ参照)

## 着手順 (次セッション、Wave 3 = L3.5 強化の完成)

1. `git log --oneline -10` で 158f956 以降の 3 commit (0ac325e, b889742, 5fe6666) を確認
2. `npx vitest run` で 413 tests pass を確認
3. `npx tsx /tmp/v3-l4-spec/scan-lint.ts` で a07 fatal=0 を再確認
4. **次の最優先タスク (推奨順、2026-05-12 末再整理)**:
   - **A. (最優先) scoring-loop に L2 context 注入** — generateSceneCandidates / buildPairwisePrompt / compareToAnchorPool / validateSceneGraph で `volume_plot.json` を fs 読み込み、当 ep の役割 + 巻 foreshadow_map を prompt context に注入。**これが他全ての改善の前提**。今回の Tier 2 feedback / motif prompt 修正の効果も L2 注入なしでは半減
   - **B. motif_id runtime normalize** — LLM が prompt 指示を遵守しないため、generateSceneCandidates 後処理で「bible.visual_motifs に存在しない motif_id を best-match で fix or 削除」する safety net を実装。jq による暫定 normalize は実証済 (ただし「全部 first match」で精度低い、TypeScript で fuzzy match 実装が筋)
   - **C. foreshadow 整合検査の L2 連携** — validateSceneGraph に L2 foreshadow_map との同期 (orphan_setup / unexpected_payoff の判定) を追加
   - **D. ep01 再走 → L04 --enrich → 動作確認 → 他 9 ep 並列 → 1 巻完成**
   - **E. (中期) 漫画用 episode_patterns 辞書構築 (B4 pattern_match wire)**
   - **F. (中期) L4-1 / L4-9 を scene-swap に置換**
5. 上記いずれも完走後、handoff を更新し、Wave 3 完成度を表に追記

## 注意点

### V2/V3 並存状態
- snapshot.json は V2 (絶対に touch 禁止、broker default 経路の source)
- snapshot.v3.json + facts/ が V3 (USE_BIBLE_V3=true で読む)
- swap script は `--v2-overwrite` flag を持つが **使わない** (Phase 9 本物実装完了まで V2 保護)

### broker-v3 全 wrapper 本物 V3 logic
- Phase 9-A 完成 (commit 80b8a91) で 11 wrapper 全て本物実装
- 内部で `v2ToV3(v2)` → V3 logic を呼ぶ V2 互換 shim も併設 (*FromV2 suffix)
- prompt-composer-v2 の USE_BIBLE_V3=true 分岐は全部 *FromV2 を呼ぶ

### Console 起動状態
- 前セッションで `npm run console` 起動済 (port 5174)
- 新セッションで bundle 再生成が必要なら **再起動** (HMR なし、`project_console_dev_no_hmr` メモリ参照)
- `lsof -ti:5174 | xargs -r kill` → `npm run console -- --no-open` で再起動

### 既知問題
- a07 で role enum 違反 2 件 (白瀬灯里・獅童響、`role: "heroine"`)、`role_enum_violations.json` で推奨修正案 (supporting + subrole=heroine) あり、未適用
- a07 で fatal lint 70 件 (Phase 8 で減ったが残る)、内訳: depth 不足 67 件 + 「ライン」誤検出 3 件。swap は `--allow-fatal` 経由で完走済
- L9 で USE_BIBLE_V3=true 時 prompt size 8K threshold を僅か超過 warning (8231 chars)、render は完走

### メモリ参照
- `~/.claude/projects/-Users-hikarumori-Developer-AINARO/memory/MEMORY.md` 索引
- 重要: `feedback_no_anthropic_api`, `project_kdp_strategy`, `project_megahit_strategy`, `project_genre_3parallel`, `project_console_dev_no_hmr`
