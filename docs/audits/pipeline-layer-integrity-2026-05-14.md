# パイプライン層遷移の整合性監査レポート

**日付**: 2026-05-14
**対象**: 漫画パイプライン v2 (L3.5 → L4 → L5 → L6 → L7)
**題材**: a07-modern-dungeon ep01

## Executive Summary

L3.5 scene_graph の directing_intent (opening_hook) が L4 storyboard 生成時に完全消失し、コンビニ店内から開始する storyboard が生成された問題を契機に、全層遷移の整合性を監査した。

**核心発見**: L5/L6/L7 は全て 100% 決定論的 (LLM 不使用) で、内容の勝手な書き換えは構造上起こり得ない。問題が発生し得るのは **L3.5→L4 の唯一の LLM 介在遷移のみ**。

`validatePanelSceneInheritance()` は location_id / cast / scene_exclusive text の 3 項目しか検証しておらず、narration_lines / key_lines 全量配置 / key_visual / page_range の 4 項目が未検証。ep01 では実際に narration の年数改変が発生した。

---

## 1. 各層遷移の監査結果

### L3.5 → L4 (scene_graph → storyboard): 脆弱

LLM (Codex CLI) による B5-5b enrichment が介在する唯一の層。
deterministic な B5-5a (buildStoryboardFromSceneGraph) で骨格を作り、LLM で action/key_visual/dialogue/monologue を詳細化する。

| 項目 | Prompt 強制 | Validation 検証 | ep01 実例 |
|------|:-----------:|:---------------:|:---------:|
| location_id | OK (制約#6) | **OK** validatePanelSceneInheritance | OK |
| cast (characters) | OK (制約#6) | **OK** validatePanelSceneInheritance | OK |
| scene_exclusive text | OK (制約#7) | **OK** validatePanelSceneInheritance | OK |
| directing_intent.narration_lines | OK ("省略禁止、改変は軽微に") | **NG: 未検証** | NG: "三年前"→"二十年前" |
| directing_intent.kind | OK (appendDirectingIntentSection) | **NG: 未検証** | OK (修正後は尊重) |
| key_visual_intent | OK (prompt line 714) | **NG: 未検証** | OK (概ね反映) |
| key_lines 全量配置 | OK ("全 key_lines を必ず使う") | **NG: 未検証** | N/A (S01 は key_lines=[]) |
| panel_no 連番 | OK (制約#1) | OK (zod schema) | OK |
| page_range 配置 | OK (prompt に range 記載) | **NG: 未検証** | OK |

**バリデーション関数**: `validatePanelSceneInheritance()` (schema.ts:756-842)

### L4 → L5 (storyboard → page_plan): 安全

page-mapper-v4 は storyboard.json を読み取り、layout geometry (rect/polygon/template_id/render_strategy/background_treatment) のみを付与。panel 内容は一切変更しない。LLM 不使用、100% 決定論的。

### L5 → L6 (page_plan → continuity resolve): 安全

continuity-resolve-v2 は page_plan の panel に continuity_group_ids[] を追加するのみ。storyboard のエンティティ情報を読むが変更しない。LLM 不使用、100% 決定論的。

### L6 → L7 (continuity → refs resolution): 安全

refs-resolver-v2 は 11 ルールで asset reference を解決。panel 内容は一切変更せず、resolved_refs.json という別ファイルに出力。LLM 不使用、100% 決定論的。

---

## 2. ep01 実例 Audit

### S01 (pages 1-2): opening_hook

**scene_graph 指示**:
- location_id: `loc_shinjuku_night_skyline_v1`
- directing_intent.kind: `opening_hook` (hook_pattern: `world_glimpse`)
- narration_lines: ["三年前、世界中の都市の地下にダンジョンが現れた。", "十五歳で受ける鑑定石の判定が、人生の入口を決める。", "同じ十八歳でも、世界は片方だけを入口へ通す。"]

**storyboard (修正後) 実際**:
- Panel p001: location_id=loc_shinjuku_night_skyline_v1, narration=["**二十年前**、世界中の…", "十五歳で…"]
- Panel p002: location_id=loc_shinjuku_night_skyline_v1, narration=["同じ十八歳でも…"]
- Panel p003: location_id=loc_shinjuku_night_skyline_v1, narration=[] (silence panel)

| チェック項目 | 結果 | 詳細 |
|:------------|:----:|------|
| location_id 一致 | OK | 3 panel 全て loc_shinjuku_night_skyline_v1 |
| narration_lines 全量配置 | OK | 3 行が 2 panel に分配 |
| narration_lines 内容一致 | **NG** | "三年前"→"二十年前" に年数改変 |
| key_visual 反映 | OK | "新宿夜景俯瞰、ダンジョンゲートの光" |
| page_range 内配置 | OK | pages 1-2 |

### S02-S07

location_id, cast, page_range は全 scene で正しく継承。narration_lines を持つ scene は S01 のみのため、他 scene での narration 改変は該当なし。

---

## 3. バリデーションギャップ詳細

### Gap 1: narration_lines 逐語転記チェック (重大)

- **場所**: `validatePanelSceneInheritance()` (schema.ts:756-842)
- **問題**: directing_intent.narration_lines の内容が storyboard panels の narration に含まれるか未検証
- **実害**: "三年前"→"二十年前" の改変がバリデーション通過

### Gap 2: key_lines 全量配置チェック (重大)

- **場所**: `validatePanelSceneInheritance()` (schema.ts:756-842)
- **問題**: scene.dialogue_plan.key_lines の text が panels の dialogue/monologue に全て出現するか未検証
- **実害**: ep01 S01 は key_lines=[] のため検証不能だが、他 episode で key_line 脱落のリスクあり

### Gap 3: key_visual 整合チェック (軽微)

- **場所**: `validatePanelSceneInheritance()`
- **問題**: directing_intent.key_visual が storyboard 冒頭 panel の key_visual と意味的に一致するか未検証
- **実害**: ep01 では概ね反映。テキストベースの検証は精度に限界があるため warn レベル

### Gap 4: page_range 逸脱チェック (中)

- **場所**: `validatePanelSceneInheritance()`
- **問題**: scene.panel_range の panels が storyboard のどの page に配置されたかと scene.page_range の照合がない
- **実害**: ep01 では正しかったが、LLM が page_range を無視するリスクは構造的に存在

---

## 4. 推奨修正 (優先度順)

| 優先度 | Gap | 修正内容 | 対象ファイル |
|:------:|:---:|----------|-------------|
| P0 | Gap 1 | narration_lines 存在 + キーワード一致チェック | schema.ts validatePanelSceneInheritance |
| P0 | Gap 2 | key_lines 全量配置チェック | schema.ts validatePanelSceneInheritance |
| P1 | Gap 4 | page_range 逸脱チェック | schema.ts validatePanelSceneInheritance |
| P2 | Gap 3 | key_visual キーワード重複チェック (warn のみ) | schema.ts validatePanelSceneInheritance |

全修正は `validatePanelSceneInheritance()` への追加のみで完結。L5/L6/L7 は決定論的のため修正不要。
