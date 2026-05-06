# 編集判断カードDB — 索引

Phase Y WY-6 の本格構造化前のシードカード。各カードは `data/manga/editorial-cards/EC-NNNN-*.json` に保存。

schema 定義: `/Users/hikarumori/.claude/plans/groovy-wishing-castle.md` WY-6 セクション

## カード一覧 (2026-05-06 時点)

| ID | title | scope | trigger | accepted |
|---|---|---|---|---|
| EC-0001 | cliffhanger ページの締めナレ短縮 + 主人公モノローグ追加 | panel | narration_dominant | a07/ep01/p110 |
| EC-0002 | action ページの importance 凸凹化で視線の山を作る | page | importance_imbalance | a07/ep01/page-18, page-22 |
| EC-0003 | close_up 3連続を over_the_shoulder で崩す | panel | shot_repetition | a07/ep01/p94 |
| EC-0004 | 戦闘直後に「相棒との温度ある会話」panel を差し込む (recovery beat) | page | recovery_beat_missing | a07/ep01/inserted-after-p95 |
| EC-0005 | 巻前半に「期待 vs 現実」ギャップ panel を差し込む (商業フック) | volume | expectation_reality_gap_absent | a07/ep01/inserted-after-p23 |

## 由来

すべて 2026-05-06 の Phase X 効果検証 + a07-modern-dungeon ep01 品質改善で生成。
Codex MCP に「Phase X audit findings 6件を最小侵襲で直す patches」を依頼し、採用された patches をカード化した。

## 適用効果 (a07-modern-dungeon ep01)

- audit findings 6件 → 0件 (完全解消)
- panel 数 110 → 112 (recovery beat + expectation gap の2 panel 追加)
- target_tone (light_recovery) との整合 確保

## Phase Y への申し送り

WY-6 で本格 schema 化する際の追加項目候補:
- decision_type の enum 拡張: 現状 `rewrite` / `panel_insert` のみ。`reject` / `defer` / `human_review` / `keep_high_variance` 等を追加 (Codex 指摘)
- outcome 計測: 適用後の KENP read-through / 完読率 を追跡 (Phase Z で実 KENP データから埋める)
- contraindications の構造化: 現状は文字列ペア。Phase Y で boolean 式または規則ベースに

## カード追加方法

1. trigger 条件を audit-rules.ts の AuditRuleKind から選ぶ
2. preconditions / contraindications を bible.meta.tone_profile / genre / page_role 等の参照可能な値で書く
3. before/after の examples を必ず付ける (asset_id でリンク、JSON 編集可能)
4. applied_to に実際の適用履歴を残す (Phase Z で KENP outcome と接続)
