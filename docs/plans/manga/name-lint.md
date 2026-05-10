# Name Lint (L8.7) — ネーム監査機能

- 起票: 2026-05-10
- ステータス: Draft (要ユーザレビュー)
- 関連 plan: なし (新規)
- 参考実装: `src/lib/manga/qa-v2/bible-lint.ts` (2 段構成 static + LLM)
- 起点フィードバック: 本日の scene-graph 経由再生成サイクル後「レベルとしては低いな」(Codex enrich 後の panel 内容、cliché 等の課題)
- 関連 memory: `feedback_intermediate_representation_over_audit` (構造矛盾は audit 増設より上流の中間表現欠落を疑う) — **本 plan は audit を増やす案だが、ユーザ明示の希望**。同時に「audit が浮き出させた問題は scene-graph や enrich の改善にフィードバック」する設計

---

## 1. 背景と問題意識

scene-graph 経由 + Codex enrich で生成した a07-ep01 storyboard (commit f2dd2d9) はパイプラインとしては動作したが、ユーザレビューで「レベルとしては低い」評価。商業漫画品質に届かない panel 内容が含まれる。

**現状 audit の不足**:
- L08.5 `name_audit.json` の rule は 2 つのみ (`establishing_late` / `shot_repetition`)
- panel 内容の重複・cliché・dialogue 質・shot バリエーションは未検査
- bible には L01b lint (static rule + LLM judge 2 段) があるが、ネームには相当機能なし

**ユーザ明示希望** (2026-05-10):
> 「次はネームの監査機能を実装できるようにして」「バイブルと同じようなことをしたい」

---

## 2. 設計目的

`bible-lint.ts` と同じ **2 段構成** をネームに移植:
1. **Static lint** (rule-based): JSON/SVG 解析で機械的に検出可能な品質問題
2. **LLM judge** (Codex CLI 経由): 商業漫画として読めるか、cliché、自然さ、論理的整合性

出力:
- `data/manga/works/<slug>/episodes/ep<NN>/name/lint_report.json` (新規)
- 既存 `name_audit.json` (L08.5 audit-rules.ts 由来) と並列、後で integrate を検討

---

## 3. 入力と出力

### 入力 (Read で読む)
- `episodes/ep<NN>/storyboard.json` — panel 詳細 (action / key_visual / dialogue / shot_type / camera)
- `episodes/ep<NN>/page_plan.json` — page 単位 layout (panel polygon、layout pattern)
- `episodes/ep<NN>/scene_graph.json` — 物語論理 (beat_type / cast / dialogue_plan)
- `episodes/ep<NN>/_brief.v2.md` — episode brief (must_include_events、cliffhanger)
- `bible/snapshot.json` — character/location/prop 定義 (cast 整合 check 用)
- (Phase 3) `episodes/ep<NN>/name/p<NN>.svg` — vision audit 用の page SVG

### 出力 (Write)
- `episodes/ep<NN>/name/lint_report.json` — `NameLintReport` 構造

### Schema (TS 表現案)
```ts
type NameLintReport = {
  schema_version: 1;
  audited_at: string;
  slug: string;
  episode: number;
  pages_total: number;
  fatal_count: number;
  warn_count: number;
  info_count: number;
  findings: NameLintFinding[];
  summary: string;
};

type NameLintFinding = {
  severity: "fatal" | "warn" | "info";
  scope: "panel" | "page" | "scene" | "episode" | "global";
  page_no?: number;
  panel_no?: number;
  scene_id?: string;
  rule: string;        // 例: "panel_content_duplicate", "shot_diversity_low"
  message: string;     // 200字以内
  hint?: string;       // 改善示唆
};
```

---

## 4. Static rule 候補 (Phase 1 実装対象)

### 4.1 panel 内容 (重複/単調)
- **panel_content_duplicate** (warn): 同 page 内で `action` / `key_visual` の Levenshtein/Jaccard 類似度 > 0.7 → 「同じ panel が連続」検出 (本日の p1 全同一を検出する想定)
- **monologue_repetition** (info): 同 page 内で同キャラの monologue が 3+ 連続
- **dialogue_overflow** (warn): 1 panel あたり dialogue 文字数 > 60 または合計 line 数 > 4

### 4.2 視覚的多様性
- **shot_type_diversity_low** (warn): page 内 distinct shot_type / panel_count < 0.5 (既存 audit-rules.ts shot_repetition の page 単位版)
- **camera_angle_static** (info): page 内 distinct camera < 2 (例: 全 panel が eye_level)
- **importance_flat** (warn): page 内 max importance < 4 かつ panel 数 ≥ 4 (= hero panel なし)
- **importance_overload** (info): page 内 importance ≥ 4 が 3+ panel (= hero 過多)

### 4.3 page 構造
- **establishing_misplaced** (info): establishing が page 末尾 (既存 establishing_late 強化)
- **cliff_panel_too_many** (warn): page_role=cliffhanger かつ panel_count > 3
- **action_panel_too_few** (warn): page_role=action かつ panel_count < 4

### 4.4 scene_graph 整合
- **scene_must_include_missing** (fatal): scene の `must_include_events` が panel 内に登場しない
- **cast_inconsistency** (warn): panel.cast が scene.cast に含まれない (既存 validator と被るが、scene_graph に基づく検査)
- **dialogue_plan_unrealized** (info): scene.dialogue_plan.key_lines が panel に出現しない

### 4.5 cliché / textual quality
- **cliche_phrase** (info): NG リスト (「俺は…」「だから…」「まさか…」「そんな…」等) の出現頻度 > 閾値
- **placeholder_text** (fatal): action / key_visual に placeholder 文字列 (`S01 (introduce/establishing) panel N/M:`) が残存 → Codex enrich 失敗の検出

---

## 5. LLM judge schema (Phase 2 実装対象)

```ts
type LlmJudgeOutput = {
  overall_assessment: "professional" | "passable" | "shallow" | "lazy";
  rationale: string;          // 200字以内
  shallowness_findings: Array<{
    severity: "fatal" | "warn" | "info";
    scope: "panel" | "page" | "scene" | "episode";
    page_no?: number;
    panel_no?: number;
    scene_id?: string;
    rule:
      | "shot_choice_unmotivated"     // shot_type が page_role と整合しない
      | "dialogue_unnatural"          // セリフが不自然・教科書的
      | "key_visual_generic"          // 「夜景」「廊下」等の汎用すぎる描写
      | "panel_logical_break"         // panel 間の論理飛躍
      | "emotion_arc_flat"            // 感情変化の不在
      | "scene_pacing_off"            // scene 内のリズム不良
      | "cliffhanger_weak"            // cliffhanger が弱い
      | "opening_hook_weak"           // opening_hook が弱い
      | string;
    message: string;
    hint?: string;
  }>;
};
```

LLM judge の入力は **scene 単位** で送る (1 episode を 10 scene 並列 or sequential)。bible-lint と同じ `runCodexText` 経由、Codex CLI / claude CLI Haiku で実行 (Pro plan 内、API 課金ゼロ)。

### LLM judge prompt 構造案
- 入力 1: scene_graph の該当 scene (beat_type / dialogue_plan / arc_position)
- 入力 2: storyboard の該当 page 群 (panels[])
- 入力 3: bible.meta (subtype / core_hook / genre)
- 出力: 上記 LlmJudgeOutput JSON

---

## 6. CLI (L08-7-name-lint.ts)

```bash
# Phase 1: static のみ
npx tsx scripts/manga/layers/L08-7-name-lint.ts --slug a07-modern-dungeon --episode 1 --skip-llm

# Phase 2: static + LLM judge
npx tsx scripts/manga/layers/L08-7-name-lint.ts --slug a07-modern-dungeon --episode 1

# fatal で exit 2
npx tsx scripts/manga/layers/L08-7-name-lint.ts --slug a07-modern-dungeon --episode 1 --fail-on-fatal
```

実装ファイル:
- `scripts/manga/layers/L08-7-name-lint.ts` (CLI、新規)
- `src/lib/manga/qa-v2/name-lint.ts` (lint logic、新規)
- `src/lib/manga/qa-v2/name-lint.test.ts` (unit test、新規)

両方とも src/ scripts/ 配下なので **Codex 経由必須**。

---

## 7. Phase 分け

### Phase 1: Static rule 実装 (1.5-2h)
- `name-lint.ts` に staticLint 関数 (10 ルール)
- `L08-7-name-lint.ts` CLI (--skip-llm デフォルトで実装、LLM 後付け)
- a07-ep01 で実走 → 既存 lint と diff 確認
- unit test 5-10 case
- **完了条件**: a07-ep01 で fatal 0 (placeholder 残存なし)、warn ~5-10 件、info 多数

### Phase 2: LLM judge 実装 (1.5-2h)
- `llmLintName()` 関数 (bible-lint.ts と同型、scene 単位 Codex CLI 呼び出し)
- prompt 構造設計
- a07-ep01 で実走 (10 scene、各 30s 程度想定 → total 5 分)
- **完了条件**: LLM judge から overall_assessment + 5-10 件 findings 返る

### Phase 3: Console 統合 (0.5h)
- name-gate UI で lint_report.json を読んで findings を表示
- 既存 audit_findings (info:4/warn:5) と並列表示
- severity でフィルタ

### Phase 4 (将来): vision audit
- name SVG を PNG export → vision LLM (claude CLI Haiku) で panel layout 視認
- 視線誘導妥当性、テキスト overflow、商業漫画として読めるかの最終 judge
- 本 plan の対象外 (別 plan で起票)

---

## 8. 完了条件 (Definition of Done)

1. `lint_report.json` が schema validator pass (10+ rule 実装)
2. a07-ep01 で **fatal 0 / warn ≤ 10 / info ≤ 20** に収まる (placeholder 残存検出ゼロ = enrich 成功確認)
3. LLM judge 実行で overall_assessment 取得可能
4. unit test 5-10 case pass
5. CLI が `--skip-llm` / `--fail-on-fatal` で正しく動作
6. name-gate UI で findings 表示 (Phase 3)

### 非ゴール
- vision audit (Phase 4 で別 plan)
- 自動修正 (audit のみ、修正は人間 or 別 layer)
- 多 episode 一括実行 (1 episode ずつで良い)

---

## 9. 想定コスト

| Phase | 作業 | 見積 |
|-------|------|------|
| 1 | Static rule 実装 + test | 1.5-2h |
| 2 | LLM judge 実装 + test | 1.5-2h |
| 3 | Console 統合 | 0.5h |
| **合計** | - | **3.5-4.5h** |

API コスト: Codex CLI / claude CLI Haiku 経由 (Pro plan 内、API 課金ゼロ)

---

## 10. 制約・注意事項

- 実装は **Codex 経由必須** (src/ scripts/ 修正)
- bible-lint.ts を model にして同型構造 (LintFinding type、severity 4 段階、scope/rule/message)
- 既存 L08.5 `name_audit.json` の rule (`establishing_late` / `shot_repetition`) と被らない設計 (lint_report.json は別ファイル、後で integrate)
- LLM judge は **scene 単位**、batch しすぎない (memory「サブエージェント大量タスク崩壊」を考慮、10 scene 程度なら sequential or 並列 5)
- placeholder text 検出 (rule `placeholder_text` fatal) は **Phase 1 必須** (本日の p1 placeholder 問題の再発防止)

---

## 11. リスク

| リスク | 対応 |
|--------|------|
| LLM judge が「仕様通り JSON 返さない」 | bible-lint.ts と同じ runCodexText パターン (zod 検証 + retry) |
| ルール overlap (既存 audit と被る) | rule_id を name-lint プレフィックス (`nl_`) で区別 |
| 大量 finding で signal/noise 比悪化 | severity でフィルタ、page_no で sort、UI で「fatal/warn のみ」 toggle |
| 監査が増えても上流改善に繋がらない | rule 追加時に「この lint で検出された問題は scene-graph or enrich のどこを直すべきか」を rule 説明に併記 |

---

## 12. 開始トリガー

ユーザレビュー (本 plan 採否) → OK なら **Phase 1 着手** (Codex 経由で実装)。
