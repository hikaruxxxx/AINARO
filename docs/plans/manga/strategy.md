# 漫画パイプライン 陳腐化耐性戦略 (Durability Strategy)

**Status**: Active (2026-05-05 〜)
**Scope**: 横読み白黒漫画パイプライン v2 (B6 KDP+KU)
**Position**: 実装 SSoT (`pipeline-v2.md`) の **上位戦略文書**。投資配分・抽象境界の判断材料に使う。
**Trigger for revision**: 主要画像生成モデル世代交代 / 月次レビュー (毎月初)

---

## 1. 背景: なぜこの文書が要るか

横読み漫画パイプラインは 12 layer (L01-L13) の積み上げで複雑化している。
LLM / 画像生成モデルは半年〜1年で世代交代するため、決定論ロジックを作り込みすぎると数ヶ月で陳腐化するリスクがある。

このドキュメントは「**何を厚く / 何を薄く保つか**」の判断基準を一元化し、各 layer 開発時に投資配分を誤らないためのもの。

## 2. 結論 (一行)

> **決定論ロジックは薄く、Bible・評価軸・出口 (KDP / 多言語 / 権利) は厚く。**

- 6 ヶ月窓: 中段 (L05-L08) の **20-30% が無力化**される確率
- 12 ヶ月窓: 中段の **50-60% が無力化**される確率
- 全層が同時に飛ぶ確率は低い → 層別の durability 評価で投資配分を変える

## 3. 層別 durability マトリクス

| Layer | 内容 | 陳腐化リスク | 投資強度 | 根拠 |
|---|---|---|---|---|
| L01 Bible Snapshot | 世界観・キャラ・style 設計 | **低** | **厚** | コンテンツ著作。モデル能力ではなく差別化の本丸 |
| L01b/L01c Bible Lint/Deepen | 怠惰チェック・深化 | **低** | **厚** | 自社評価軸の核。durability 高い |
| L02 Bible Images | キャラ/ロケ参照画像 | **中** | **中** | 「永続キャラ」が native 化したら一部不要 |
| L02b Volume Plot | 巻プロット | **低** | **中** | プロット骨格は durable |
| L03 Shotlist | シーン分割・リズム曲線 | **中** | **中** | LLM 改善で粒度は粗くなるが構造は残る |
| L04 Storyboard | entity_id binding | **中** | **中** | binding 概念は残るが ref 解決は楽になる |
| **L05 Page Director** | テンプレ選択・配置 | **高** | **薄** | native page-level layout が来たら不要化 |
| **L06 Continuity Resolve** | continuity_group_id 注入 | **高** | **薄** | 永続キャラ native 化で消える可能性 |
| **L07 Refs Resolution** | RULE 1-10 決定論 | **高** | **薄** | 50+ 枚 native 参照で大半が不要 |
| **L08 Incremental Refs** | 不足 ref 追加生成 | **高** | **薄** | character bank unlimited 化で消える |
| L09 Render | gpt-image-2 adapter | **低** (差替で対応) | **中** (interface のみ厚く) | RenderAdapter 抽象が残れば model swap で OK |
| L11 Audit | 自社品質基準 | **中** | **厚** | judgement は durable、自社差別化資産 |
| L12 Repair | 失敗 panel 再走 | **中** | **薄** | self-correct する model が来たら薄くなる |
| L13 KDP Package | PDF/X-1a・背幅・奥付 | **極低** | **厚** | 物理印刷制約、LLM 射程外 |

### 「厚く / 薄く」の運用定義

- **厚く**: スキーマを丁寧に切る、テストを書く、エラーケースを潰す、ドキュメント整備
- **薄く**: 最小実装で通す、過剰なルール網羅をしない、捨てやすく書く、抽象に引きこもる

## 4. 抽象境界の死守ポイント (interface contract)

陳腐化が起きても**ここだけ守れば全層を作り直せる**境界:

1. **`BibleSnapshot` schema** (`schemas-v2.ts`) — 入力契約
2. **`EpisodeStoryboard.entities` の entity_id 規約** — 中段で何が変わっても entity 由来は不変
3. **`RenderAdapter` interface** — model 差替時の唯一の接点
4. **`PagePlan` の page_role + panel_no + reading_order** — 描画 IR の核
5. **`audit.json` schema** — 自社評価軸の出口

→ これら 5 つの interface は陳腐化耐性が最大なので、**変更は最小限・破壊的変更は archive 経由**で行う。

## 5. 12 ヶ月シナリオ (確率 + 対応)

### S1: gpt-image-3 が「page-level 一貫性 + 50+ refs」を native 化 (確率 50-60%)
- **影響**: L07 RULE 1-10 のうち RULE 2-9 が不要、L08 が消える
- **対応**: `prompt-composer-v2` 側で「ref 一覧をまとめて投げるだけ」モードを追加、L07 はフォールバックとして残す
- **準備**: いま L07 を「厚く」しないこと、ルール追加は最小限に

### S2: 長尺 storyboard → 連続ページ生成が出る (確率 30-40%)
- **影響**: L04-L05 が「Bible + script を渡すだけ」に圧縮、L06/L09b が不要化
- **対応**: `EpisodeStoryboard` を「人間レビュー用 IR」と「モデル投入用 IR」に分離、後者は薄く保つ
- **準備**: L04 storyboard-builder-v2 を**過剰な細目化で作り込まない**

### S3: Bible 自動生成 (キャラ deep + 関係性 + 整合性) が native 化 (確率 20-30%)
- **影響**: L01b/L01c の lint/deepen ロジックが LLM ネイティブで置き換わる
- **対応**: それでも**何を OK とするか** (自社基準) は残るので、L01b の評価軸 (criteria) を独立資産化
- **準備**: 評価軸を Bible 本体ではなく**別ファイル** (criteria.json) に分離

### S4: 全モデル進化が予想以下 (確率 10-15%)
- **影響**: 現行設計を素直に積み増しで OK
- **対応**: 通常開発を継続

## 6. 修正指示 UI / 人間判断ループの位置付け

「画像クリック → 修正指示 → 該当 panel 再走」の UI は**陳腐化耐性が高い**:
- どれだけモデルが進化しても「採用 / 不採用」の taste は人間に残る
- editorial workflow は durability 高い領域 (Bible・評価軸と同じ系統)

ただし**L12 repair policy を作り込みすぎない**こと:
- 修正指示はメタデータ (revision_queue.jsonl) に積むだけ
- L12 は「該当 panel を再走させて versioned 出力」する**薄い接続層**に留める
- 比較・採用の判断は UI 側で完結させる (L12 は I/O のみ)

## 7. 月次レビューチェックリスト

毎月初に以下を確認し、本ドキュメントを更新する:

- [ ] 主要画像生成モデル (gpt-image / Niji / Flux / Qwen) で **page-level 一貫性 / 多 ref 参照** に新世代が出たか
- [ ] L05-L08 のうち、決定論ルール追加を検討した layer はあるか → 戦略違反なら却下
- [ ] L11 audit の自社評価軸を増やしたか → durable 投資なので OK
- [ ] interface 5 種 (§4) に破壊的変更を入れていないか
- [ ] 修正指示 UI / 評価データセットへの投資が継続しているか

## 8. アンチパターン (これをやり始めたら戦略違反)

- ❌ L07 Refs Resolution に新ルールを 5 個以上追加する
- ❌ L05 Page Director のテンプレを 30 種類超に増やす
- ❌ L12 Repair に判定ロジックを組み込む (UI に寄せる)
- ❌ `RenderAdapter` interface を model 固有プロパティで汚染する
- ❌ Bible 評価基準を Bible 本体に埋め込む (criteria.json で外出し)

## 9. 関連ドキュメント

### 直接連動
- 実装 SSoT: `docs/plans/manga/pipeline-v2.md`
- アーキテクチャ: `docs/architecture/manga_pipeline.md`
- B-1 (KDP) 領域詳細: `docs/plans/manga/kdp.md`
- L8.5 ネーム gate: `docs/plans/manga/name-gate.md`
- L8.5 後リファクタ: `docs/plans/manga/name-gate-refactor.md`

### 戦略整合
- プロダクト哲学: `docs/strategy/product_philosophy.md`
- 漫画作法ガイド: `docs/strategy/manga_craft_guide.md`
- Phase A 品質チェックリスト: `docs/strategy/phase_a_quality_checklist.md`

### 関連メモリ
- `project_horizontal_manga_pivot` — 横読みピボットの根拠
- `project_kdp_strategy` — KDP+KU Phase A/B 戦略
- `project_manga_models_2026` — 3 段階モデル戦略 (gpt-image-2 → ベンチ → LoRA)
- `project_chatgpt_pro_image_gen` — Pro 定額枠の運用
- `feedback_quality_over_novelty` — 差別化 ≠ 奇抜さ
- `feedback_commercial_vs_readable` — 商業品質と「読める」は別物

## 10. 改訂履歴

- 2026-05-05: 初版。陳腐化リスク 6ヶ月 20-30% / 12ヶ月 50-60% の見立てから策定。L05-L08 を「薄く」、L01/L11/L13 を「厚く」の方針確定。
