# Console Panel Fix UI — ネームレビュー findings から panel 単位修正

- 起票: 2026-05-10
- ステータス: Draft (要ユーザレビュー)
- 関連 plan:
  - `docs/plans/manga/name-lint.md` (Phase 1/2/3 完成、commit f630bba)
  - `docs/plans/manga/lint-enrich-loop.md` (Phase 1/2 完成、commit 22b3232)
- 関連 commit (既存 UI):
  - `6d301f4` 漫画 Console ネーム toolbar の AI 修正ボタン整理 (episode-level)

---

## 1. 背景

name-lint で出た findings (a07-ep01: fatal 1 / warn 68 / info 37) を panel 単位で修正したい。現状の選択肢:
- **A loop**: episode 全 scene を re-enrich、findings 一括処理 (粗い)
- **B 手動 (Claude 経由)**: ユーザが「panel #93 修正して」と Claude に依頼 → Edit + 再生成
- **B 手動 (vscode)**: ユーザが storyboard.json を直編集 → CLI 再生成

### 課題
- B を **Console から触れない**。Console には episode-level の「AI で修正」ボタン (L04 / L08.5) はあるが、panel 単位の修正トリガがない
- ユーザは Console で finding を見て、その場で「これ直して」を 1 クリックで起動したい
- 現状は Console → ターミナル切替 → Claude 依頼 / CLI 実行 → Console refresh の往復が必要

### 設計目的
**Console name-gate UI の各 finding (or panel) に「AI で修正」ボタンを追加**、押下で panel 限定 re-enrich → SSE で進捗 → 完了後自動 refresh。

---

## 2. 設計

### UI 案 (どちらか or 両方)

#### 案 A: finding 行ごとに「修正」ボタン (細粒度)
```
─ ネームレビュー [fatal 1 / warn 68 / info 37]
  ▶ panel #93 emotion_arc_flat (fatal): レンの「頼む」決断後...   [AI 修正]
  ▶ panel #57 dialogue_unnatural (warn): 「改札の向こう...」      [AI 修正]
```
- メリット: 1 finding ピンポイント、hint だけで修正
- デメリット: 同 panel に複数 finding 時は最初の 1 件のみ反映 (or 一括選択 UI 必要)

#### 案 B: panel 単位の「AI 書き直し」ボタン (中粒度)
```
─ panel #93 (page 22)
  [見出し: shot=close_up importance=4]
  action: 「監査室の赤ログが点滅」
  key_visual: ...
  findings (3 件):
    - emotion_arc_flat (fatal)
    - cliffhanger_weak (warn)
  [この panel を AI で書き直す] ← ボタン
```
- メリット: 同 panel の全 finding を 1 回で渡せる
- デメリット: 既存 page-card UI に panel 単位の表示がない (storyboard 併記の details 内に panel 一覧あるが click target ではない)

### 推奨: **案 A** (finding 単位)
理由: 既存 UI (renderLintFindingsSection) に finding リストが既にある、ボタン追加が容易

ただし「同 panel の他 finding も併せて渡す」を server 側で自動処理 (panel_no で aggregate)。

### server handler

```
POST /api/name-lint-fix
  body: { slug, episode, panel_nos: [93], finding_rules: ["emotion_arc_flat"] }
  挙動:
    1. lint_report.json から panel_nos に該当する findings を全部抽出
       (ボタン押下した finding に加え、同 panel の他 finding も自動同梱)
    2. L08-9 lint-enrich-loop を spawn:
       --target-panels 93 --max-iterations 1 --improvement-threshold 0
    3. SSE で進捗 stream (re-enrich 中 → name-lint 中 → 完了)
    4. 完了後 client が manifest を再 fetch
```

### L08-9 拡張

新 flag:
- `--target-panels 93,57`: 指定 panel のみ re-enrich (該当 scene を limit)
- `--target-finding-rules emotion_arc_flat`: 特定 rule のみ修正対象 (将来用、本 plan では default で不問)
- `--improvement-threshold 0`: 1 iteration 強制実行 (停止判定なし)

既存実装:
- `selectScenesForReEnrich(feedback)` は scene_id を返す
- 新規: `filterFeedbackByPanelNos(feedback, panelNos)` で panel 限定

### SSE (Server-Sent Events) or polling

既存 Console に SSE があれば踏襲。なければ最小 polling で実装。

---

## 3. 実装

### 修正ファイル

1. **src/lib/manga/qa-v2/lint-loop.ts** (修正)
   - `selectScenesForReEnrich(feedback, options?: { targetPanelNos?: number[] })`: panel フィルタ追加

2. **scripts/manga/layers/L08-9-lint-enrich-loop.ts** (修正)
   - `--target-panels` flag 追加
   - filterFeedbackByPanelNos を呼ぶ
   - 該当 panel が 1 つもない scene は re-enrich skip

3. **src/lib/manga/ops-console/server/handlers/name-lint-fix.ts** (新規)
   - POST /api/name-lint-fix endpoint
   - L08-9 を spawn (panel 限定)
   - SSE で stdout を stream

4. **src/lib/manga/ops-console/server/router.ts** (修正)
   - 新 endpoint route 追加

5. **src/lib/manga/ops-console/web/views/name-gate.ts** (修正)
   - renderLintFindingsSection で finding 行に「AI 修正」ボタン追加
   - ボタン handler で fetch POST → SSE 受信 → 完了後 manifest reload

6. **src/lib/manga/ops-console/web/lib/api.ts** (修正)
   - `runNameLintFix(slug, episode, panelNos, findingRules?)` client 関数

### CSS

name-gate.ts の既存 CSS に「AI 修正」ボタンスタイル追加 (既存 `.nc-button--ghost` 等を流用)。

### test

- lint-loop.test.ts: filterFeedbackByPanelNos の test
- L08-9 CLI: --target-panels の動作 test
- handler: panel_nos バリデーション test

---

## 4. Phase 分け

### Phase 1: L08-9 panel 限定モード (1h)
- `--target-panels` flag 実装
- lint-loop.ts に filterFeedbackByPanelNos 追加
- test
- CLI で `npx tsx ... --target-panels 93` 動作確認

### Phase 2: server handler + SSE (1.5h)
- name-lint-fix handler
- SSE 経由 stdout stream
- router 追加

### Phase 3: UI ボタン (1h)
- finding 行に「AI 修正」ボタン
- click handler (fetch + SSE)
- 進捗表示 (loading spinner)
- 完了後 manifest reload + lint_report 表示更新

---

## 5. 完了条件

1. CLI: `--target-panels 93 --improvement-threshold 0` で 1 panel re-enrich 動作
2. server: POST /api/name-lint-fix が SSE で進捗返す
3. UI: finding 行のボタン押下 → 進捗表示 → 完了後 page 自動更新
4. typecheck + vitest pass
5. a07-ep01 fatal #93 を Console から修正 → fatal 0 になることを実証

### 非ゴール
- panel 単位の編集フォーム (action / key_visual / dialogue を直接 input、Phase X+)
- 複数 panel 一括選択 + バッチ修正 (Phase X+)
- finding 単位の「修正/無視/承認」ステート管理 (Phase X+)

---

## 6. 想定コスト

| Phase | 作業 | 見積 |
|-------|------|------|
| 1 | L08-9 panel 限定 | 1h |
| 2 | server handler + SSE | 1.5h |
| 3 | UI ボタン | 1h |
| **合計** | - | **3.5h** |

API コスト: Codex CLI 経由 (Pro plan 内)。1 panel 修正あたり ~30s (該当 scene re-enrich + name-lint)。

---

## 7. 制約・注意事項

- Console = agent proxy 原則 (memory): Console 内に LLM 呼出を持たず、L08-9 spawn で実装
- src/ scripts/ 修正は Codex 経由必須
- SSE は既存 Console pattern を踏襲 (なければ polling fallback)
- panel 限定 re-enrich は scene 全体 re-enrich より速い (該当 scene のみ、他 scene の panel は維持)
- 修正後 storyboard.json が変わるので、Console 側で manifest reload が必須

---

## 8. リスク

| リスク | 対応 |
|--------|------|
| panel 限定 re-enrich で scene 内整合性が崩れる | enrich は scene 単位なので scene 全体 re-enrich される (target_panels は finding feedback の対象 panel を絞るのみ)。他 panel は新出力で上書きされる、これは現状 enrich の挙動 |
| 同時に複数 finding ボタン押下 | server 側で queue (1 ep につき 1 修正 spawn) |
| SSE 切断 | client 側で自動再接続、または完了時 polling fallback |
| 修正で findings が増える | revert 機構は L08-9 既存 (改善 0% 未満なら revert)、UI 側で「revert する?」確認 |

---

## 9. 開始トリガー

ユーザレビュー → OK なら **Phase 1 着手** (L08-9 panel 限定 → server handler → UI、Codex 経由実装)。
