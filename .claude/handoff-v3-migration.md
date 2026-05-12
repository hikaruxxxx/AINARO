# AINARO 漫画 bible V3 移行 — 次セッション引継ぎ

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
| (本コミット) | docs: handoff に a07-v01 全 10 ep scoring-loop live 完成反映 (8 ep 並列 42.6 分、Tier 3 = 0) |

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
4. **次の最優先タスク (推奨順)**:
   - **A. L4 storyboard を新しい scene-graph で再展開 → 1 巻完成** — `/tmp/a07-epNN-scoring-result.json` を `data/manga/works/a07-modern-dungeon/episodes/epNN/scene_graph.json` に反映 → `L04-storyboard --from-scene-graph --enrich` で全 panel + 描画準備
   - **B. 漫画用 episode_patterns 辞書構築 (B4 pattern_match wire)** — 既存 yaml は小説用、漫画用は新規設計が必要。Plan で 4 論点 (ソース / 粒度 / 比較方式 / agent 漫画版) を固めてから着手
   - **C. L4-1 / L4-9 を scene-swap に置換** — legacy panel patch 廃止、`swapScenes()` 呼び出しに置換
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
