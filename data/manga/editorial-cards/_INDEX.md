# 編集判断カードDB — 索引

Phase Y WY-6 で本格構造化。各カードは `data/manga/editorial-cards/EC-NNNN-*.json` に保存。

schema 定義: `/Users/hikarumori/.claude/plans/groovy-wishing-castle.md` WY-6 セクション

## カード一覧 (2026-05-06 時点、計11枚)

### Phase X 由来 (2026-05-06、5枚)

| ID | title | scope | trigger | accepted |
|---|---|---|---|---|
| EC-0001 | cliffhanger ページの締めナレ短縮 + 主人公モノローグ追加 | panel | narration_dominant | a07/ep01/p110 |
| EC-0002 | action ページの importance 凸凹化で視線の山を作る | page | importance_imbalance | a07/ep01/page-18, page-22 |
| EC-0003 | close_up 3連続を over_the_shoulder で崩す | panel | shot_repetition | a07/ep01/p94 |
| EC-0004 | 戦闘直後に「相棒との温度ある会話」panel を差し込む (recovery beat) | page | recovery_beat_missing | a07/ep01/inserted-after-p95 |
| EC-0005 | 巻前半に「期待 vs 現実」ギャップ panel を差し込む (商業フック) | volume | expectation_reality_gap_absent | a07/ep01/inserted-after-p23 |

### Phase Y WY-1 / WY-3 / WY-2 由来 (2026-05-06、6枚)

| ID | title | scope | trigger | pattern_id |
|---|---|---|---|---|
| EC-0006 | 現代/学園系 opening_hook を「日常×異変」型で再構成 | episode | opening_hook_no_focus | P1_daily_anomaly |
| EC-0007 | なろう系ゲーム化 opening_hook を「ステータス画面」型で再構成 | episode | opening_hook_no_focus | P6_status_window_reveal |
| EC-0008 | 話末 cliffhanger を「主人公の決意モノローグ」型で締める | page | cliffhanger_role_mismatch | protagonist_resolve_monologue |
| EC-0009 | 巻末 cliffhanger を「ヒロイン消滅リスク」型で締める | page | cliffhanger_role_mismatch | heroine_jeopardy |
| EC-0010 | 話末 cliffhanger を「能力/正体の片鱗」型で締める | page | cliffhanger_role_mismatch | ability_or_identity_glimpse |
| EC-0011 | page narration 過多を会話/モノローグに置換 (budget 違反解消) | page | narration_page_count_exceeded | (汎用) |

## カード schema 必須項目 (Codex 指摘反映)

各カードは以下を必ず持つ:
- `card_id` / `version` / `title` / `scope` (panel/page/episode/volume)
- `trigger` (layer + flag + min_severity)
- `preconditions` (tone_profile/genre/page_role 等の発動条件)
- **`contraindications`** (使うと悪化する条件 — 重要、Codex 指摘)
- `diagnosis` / `decision_type` / `instruction`
- `target_axis` / `expected_delta` / `success_metric`
- `examples` (before/after with asset_id)
- `applied_to` (適用履歴)
- `reviewer_decision` (accepted / pending / rejected / overridden)
- `outcome` (Phase Z で実 KENP データを後追い記録)
- `learned_from` (source + context)
- `status` (active / deprecated / experimental)
- `created_at` / `created_by`

## Phase Y 進捗

- WY-1 (Opening Hook): EC-0006, EC-0007 でカード化
- WY-2 (narration_kind + budget): EC-0011 でカード化
- WY-3 (Cliffhanger Architect): EC-0008, EC-0009, EC-0010 でカード化
- WY-6 完了: 5枚 → 11枚に拡張、全パターンに contraindications 必須

## Phase Z への申し送り (2027 Q1-)

- WZ-3 で 50枚 → 200枚に拡張 (Phase A 3作品制作中の修正パターンをカード化)
- 200枚到達で predict-completion v1 の入力特徴量に「適用カードID群」追加 (因果学習)
- `applied_to[].outcome` に実 KENP データ (Phase Z WZ-2) を後追い記録
- パターン別の次話 read-through 寄与を計測してカード重み校正

## カード追加方法

1. trigger 条件を audit-rules.ts の AuditRuleKind から選ぶ
2. preconditions / contraindications を bible.meta.tone_profile / genre / page_role 等の参照可能な値で書く
3. before/after の examples を必ず付ける (asset_id でリンク)
4. applied_to に実際の適用履歴を残す (Phase Z で KENP outcome と接続)

## Console UI 連携 (Phase Y WY-7)

Console「品質改善 (Hook / Cliff)」view の `related_cards` セクションでこの DB を読み出して
findings に紐付けて表示する (handlers/improvements.ts)。
