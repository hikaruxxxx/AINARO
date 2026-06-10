# Lint→Enrich Loop — 監査結果を enrich にフィードバック

- 起票: 2026-05-10
- ステータス: Draft (要ユーザレビュー)
- 関連 plan:
  - `docs/plans/manga/name-lint.md` (Phase 1/2/3 完成済み、commit f630bba)
  - `docs/plans/manga/scene-graph-l3-5.md` (L3.5 設計)
- 関連 memory:
  - `feedback_quality_loop_max_investment` (選別ループは最大投資、generate→pairwise→predict-hit→anchor 4 目的の交差点)
  - `feedback_intermediate_representation_over_audit` (audit 増設より上流の中間表現欠落を疑う) — **本 plan は「audit 結果を上流 (enrich) にフィードバック」する形で両方を満たす**

---

## 1. 背景

### 現状
- name-lint Phase 1+2+3 完成 (commit 477d0ef + f630bba)、a07-ep01 で 108 findings 取得
- enrich prompt 強化 (commit 62222e0) で shallow scene 2→1 にシフトしたが、findings 数は noise レベルの変化のみ
- LLM judge は **「何が浅いか」を具体的に指摘** している (rule + message + hint) が、現状は **人間が読んで参考にする** だけで自動修正はない

### 問題
- a07-ep01 は 22 page あり、108 findings を全部見て手動修正するコストが大きい
- enrich を再実行しても **同じ弱点が再現** する (prompt 強化したが LLM judge は別観点で findings を出す)
- ユーザの「レベル低い」感覚を解消するには、findings → enrich の改善 loop が必要

### 設計目的
**LLM judge の findings を enrich の追加 prompt として渡す loop** を実装する。1-3 iteration で findings 数を減らせるか実証する。

---

## 2. 設計

### Loop 構造

```
[初期 enrich]
  ↓
[name-lint 実行] → findings (例: 108)
  ↓
[loop iteration N]:
  - findings を panel ごとに集約
  - 修正対象 panel を特定 (severity ≥ warn かつ scope=panel/page)
  - 該当 scene の re-enrich (改善指示 prompt 付き)
  - name-lint 再実行
  - findings 減少なら継続、増加なら revert
  ↓
[loop 終了]
  - max_iterations 到達
  - findings 数が threshold 以下
  - 改善が plateau (連続 2 回 findings 減少 < 5%)
```

### 入力/出力

#### 入力
- `episodes/ep<NN>/storyboard.json` — 現状 storyboard (initial enrich 済み)
- `episodes/ep<NN>/name/lint_report.json` — name-lint 結果
- `episodes/ep<NN>/scene_graph.json` — scene 文脈

#### 出力
- `episodes/ep<NN>/storyboard.json` — re-enrich された新 storyboard
- `episodes/ep<NN>/name/lint_report.json` — 更新後 lint report
- `episodes/ep<NN>/_lint_loop/iteration_<N>.json` — 各 iteration の前後 findings + 修正 panel リスト

### CLI

```bash
# default: 最大 3 iteration、findings 減少率 < 5% で停止
npx tsx scripts/manga/layers/L08-9-lint-enrich-loop.ts --slug a07-modern-dungeon --episode 1

# パラメタ指定
npx tsx scripts/manga/layers/L08-9-lint-enrich-loop.ts \
  --slug a07-modern-dungeon --episode 1 \
  --max-iterations 5 \
  --target-findings 50 \
  --improvement-threshold 0.1
```

---

## 3. Loop 単位の処理 (1 iteration)

### Step 1: findings 集約
- name-lint findings を panel_no で grouping
- panel ごとに「何が指摘されているか」一覧 (rule + message + hint を array 化)
- severity ≥ warn のみ対象 (info は無視、ノイズ多い)

### Step 2: 修正対象 panel 選別
- 対象 panel = (severity ≥ warn かつ scope=panel/page) を持つ panel
- max N panels per scene (デフォルト 5、過剰修正で textual collapse 回避)
- 1 iteration で全 scene の最大 5 panel ずつ対象 = 10 scene × 5 = 50 panel

### Step 3: 該当 scene の re-enrich (改善指示 prompt 付き)
- 既存 `enrichStoryboardWithLLM` に **lint findings** を渡す
- prompt 末尾に「## 修正指示」セクション追加:
  ```
  ## 修正指示 (前回 lint で指摘された問題)
  panel #57 (rule: dialogue_unnatural):
    指摘: "改札の向こうに置いていかれた" は作家言葉に見える
    ヒント: 通学路、制服、駅、置いていかれた経験など具体物を先に置いてから比喩に着地させる

  panel #61 (rule: key_visual_generic):
    指摘: 「青白い看板光」は定型的
    ヒント: 半額シール、Fランク表示など具体物を入れて固有性を出す
  ```
- 対象 panel のみ re-enrich (他 panel は維持)

### Step 4: name-lint 再実行
- 新 storyboard で name-lint 再実行
- findings 取得

### Step 5: 改善判定
- findings 数 (前回 vs 今回)
- improvement_rate = (前回 - 今回) / 前回
- improvement_rate > improvement_threshold (デフォルト 5%) なら継続
- それ以外なら停止 (or revert)

### Step 6: revert 機構
- 各 iteration の前後 storyboard を `_lint_loop/iteration_<N>.before.json` と `_lint_loop/iteration_<N>.after.json` に保存
- findings が **増加** した場合は前 iteration に revert
- 全 loop 失敗なら initial storyboard に revert (backup あり)

---

## 4. 実装

### 修正ファイル
1. `src/lib/manga/scene-graph/storyboard-from-scenes.ts`
   - `enrichStoryboardWithLLM` に optional `lintFeedback?: PanelLintFeedback[]` 引数追加
   - prompt に `## 修正指示` セクションを動的に追加 (lintFeedback あれば)

2. `scripts/manga/layers/L08-9-lint-enrich-loop.ts` (新規)
   - CLI: `--slug --episode --max-iterations --target-findings --improvement-threshold`
   - loop ロジック (前述 Step 1-6)

3. `src/lib/manga/qa-v2/lint-loop.ts` (新規、loop 純粋関数)
   - findings 集約・改善判定・revert ロジック

4. `src/lib/manga/qa-v2/lint-loop.test.ts` (新規、unit test)
   - 改善判定 / 集約ロジック の test

### 既存への影響
- `enrichStoryboardWithLLM` signature 変更 (optional 引数追加なので backward compat)
- `L04-storyboard.ts --enrich` は変更なし (lintFeedback は L08.9 から渡される)

---

## 5. Phase 分け

### Phase 1: 基本 loop 実装 (2h)
- `enrichStoryboardWithLLM` に lintFeedback 引数追加
- `L08-9-lint-enrich-loop.ts` CLI、max 3 iteration
- a07-ep01 で実走、findings 数推移確認
- **完了条件**: a07-ep01 で 108 → 80 (≈ 25% 減) 程度を実証

### Phase 2: 改善判定 + revert (1h)
- improvement_threshold で停止判定
- revert 機構
- `_lint_loop/iteration_<N>.json` 保存

### Phase 3: scene_graph レベル修正 (将来、別 plan)
- `scene_pacing_off` / `importance_overload` は scene_graph の panel_range を修正必要
- enrich で対処不可、scene_graph 側 loop は別 plan

---

## 6. 完了条件 (Phase 1+2)

1. `L08-9-lint-enrich-loop.ts` 実装、CLI 動作
2. a07-ep01 で `--max-iterations 3` 実走、findings 数 **20% 以上減** を実証
3. revert 機構動作 (findings 増加で前 iteration に戻る)
4. typecheck + vitest pass
5. shallow scene が 1 → 0 に改善 (passable + professional シフト)

### 非ゴール
- scene_graph レベル修正 (Phase 3、別 plan)
- 100% findings 撲滅 (LLM judge は確率的、ある程度の floor がある)
- 多 episode 一括 loop (1 ep ずつ)

---

## 7. 想定コスト

| Phase | 作業 | 見積 |
|-------|------|------|
| 1 | 基本 loop 実装 | 2h |
| 2 | 改善判定 + revert | 1h |
| **合計** | - | **3h** |

API コスト: Codex CLI 経由 (Pro plan 内、課金ゼロ)
LLM 呼び出し: 1 iteration = enrich (10 scene) + name-lint (10 scene) = 20 call。3 iteration = 60 call、各 30s で **30 分** 程度。

---

## 8. 制約・注意事項

- 実装は **Codex 経由必須** (src/ scripts/)
- enrich は scene 単位なので、修正対象 panel が含まれる scene のみ re-enrich (全 scene re-enrich しない、コスト節約 + 安定性)
- lintFeedback prompt が長くなりすぎると Codex CLI の context 圧迫、panel 5 件/scene が limit
- LLM judge の評価は確率的、findings 数の +-5% は noise として扱う

---

## 9. リスク

| リスク | 対応 |
|--------|------|
| re-enrich で findings が増える | revert 機構 (前 iteration に戻す)、improvement_threshold で停止 |
| LLM が「修正指示を反映しない」 | findings の rule/message/hint を簡潔に渡す、改善されない panel は次 iteration の対象から外す |
| iteration が長い | max_iterations 3 default、各 iteration 約 10 分、計 30 分 max |
| storyboard の semantic drift | 各 iteration の storyboard を `_lint_loop/iteration_<N>.json` に保存、最終的に initial と diff 比較可能 |

---

## 10. 開始トリガー

ユーザレビュー → OK なら **Phase 1 着手** (Codex 経由実装)。

---

## 11. 次の課題 (本 plan 完了後)

- **Phase 3: scene_graph レベル修正**: scene_pacing_off / importance_overload は scene_graph の panel_range 配分問題、別 loop 設計
- **改善 loop の自動学習**: どの rule が enrich で減らしやすいか統計化 (3 ep 試走後)
- **multi-episode loop**: 別 ep / 別作品で実走、改善率の作品差を測る
