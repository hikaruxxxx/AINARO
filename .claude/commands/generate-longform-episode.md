あなたはAINARO長編生成パイプライン v3 の本文生成エージェント（Layer 6）です。
全層の情報を圧縮投入して**1話の本文を生成**し、状態スナップショットを更新します。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug} {ep_number}`
- 例: `generate-longform-episode demo_hellmode 1`
- 例: `generate-longform-episode demo_hellmode 30`

## 前提

- Layer 0-5 完了済み
- `world_bible/`、`protagonist.md`、`relationship_graph.json`、`story_arcs.md`、`episode_patterns.yaml` が揃う
- ep_number > 1 の場合、`ep{N-1}.md` と `ep{N-1}_state.json` が存在

## 手順

### Step 1: 全層の情報読込

以下を**すべて**読む:

1. `_meta.json`
2. `world_bible/world.md`（200字要約として圧縮）
3. `world_bible/ability_system.json`（本話で関係するスキル/職業のみ抽出）
4. `world_bible/dungeon_theory.md`（200字要約）
5. `world_bible/status_format.md`（**完全コピー**でプロンプトに投入）
6. `world_bible/mysteries.md`（本話で開示する謎があるか確認）
7. `protagonist.md`（**完全コピー**）
8. `relationship_graph.json`（本話に登場するキャラのみ抽出）
9. `story_arcs.md`（本話が属する章の情報）
10. `episode_patterns.yaml`（本話に割り当てられたパターン）
11. **直前話の状態スナップショット**: `ep{N-1}_state.json`（ep1 の場合は初期値）

### Step 2: 当話設計の決定

`story_arcs.md` から本話の以下を確認:
- 章番号と章内位置（例: 第1章の8/15話目）
- 割り当てパターン（例: P3_relationship_advance）
- 本話の主要事件
- 状態変化の予定（status_increase/skill_acquisition/relationship_change/location_change）

### Step 3: 本文生成

**プロンプトに投入する要素**:

```
# 世界設定（圧縮）
{world.md 要約}

# 能力システム（本話で使用するスキル）
{ability_system.json の関連項目}

# ステータス画面の固定書式（必ずこの書式で）
{status_format.md 完全コピー}

# 主人公プロファイル
{protagonist.md 完全コピー}

# 現在の章/位置
- 章: {章タイトル} (ep{X-Y})
- 話数: ep{N} (章内 {p}/{q}話目)

# 直前10話の状態スナップショット
HP: {現在値}/{最大値}
MP: {現在値}/{最大値}
スキル一覧: [...]
所持金: {額}
関係性の最新変化: [...]

# 当話のエピソードパターン
{episode_patterns.yaml の該当パターン}

# 当話の指示
- 場面: {主要事件}
- 登場キャラ: {キャラ一覧}
- 必須要素:
  - 主人公の口癖を2回以上使う
  - スキル経験値の増加を明示（該当する場合）
  - {状態変化の予定}を反映
  - 章替えへの伏線を1つ置く（章末の場合は階層上昇イベント）

# 出力フォーマット
- 文字数: 3000-4000字
- 一人称（主人公視点）
- ステータス画面は world_bible/status_format.md の書式を完全一致で
- スキル名は ability_system.json と表記完全一致
- 体言止めは避ける、改行は適切に
```

このプロンプトで本文を生成。**サブエージェント or 会話本体で完結**（API課金禁止）。

### Step 4: 出力保存

`data/generation/works/{slug}/longform/episodes/ep{N:04d}.md` に保存:

```markdown
# ep{N} 「{タイトル}」

章: {章タイトル}
パターン: {パターンID}

---

{本文}
```

### Step 5: 状態スナップショット生成

`scripts/generation/state-snapshot.ts` を呼び出すか、本コマンド内で以下を生成:

`data/generation/works/{slug}/longform/episodes/ep{N:04d}_state.json`:

```json
{
  "episode": N,
  "chapter": K,
  "pattern_used": "P3_relationship_advance",
  "status": {
    "hp": {"current": 100, "max": 150},
    "mp": {"current": 80, "max": 120},
    "attack": {"current": 50, "max": 70},
    "defense": {"current": 40, "max": 60},
    "speed": {"current": 70, "max": 100},
    "intelligence": {"current": 90, "max": 130},
    "luck": {"current": 50, "max": 80}
  },
  "skills": [
    {"name": "召喚", "level": 4, "exp": 47946, "exp_to_next": 1000000}
  ],
  "items": [
    {"name": "麻袋", "qty": 1},
    {"name": "銀貨", "qty": 100}
  ],
  "money": {"金貨": 0, "銀貨": 100, "銅貨": 0},
  "location": "クレナ村",
  "relationships_changed": [
    {"name": "セシル", "delta": "初対面 → 専属従僕として認識"}
  ],
  "mysteries_revealed": [],
  "skill_acquired": [],
  "diff_from_previous": {
    "hp_delta": 5,
    "mp_delta": 3,
    "skill_exp_total_delta": 1500
  }
}
```

直前話の `ep{N-1}_state.json` から差分を計算して埋める。

### Step 6: _meta.json 更新

```json
"current_episode": N,
"last_generated_at": "ISO8601 timestamp"
```

### Step 7: レポート

```
=== Layer 6 完了: {slug} ep{N} ===
章: {章タイトル} (章内 {p}/{q}話目)
パターン: {パターンID}
文字数: {N}字
状態変化:
  - HP: {前値} → {現在値}
  - MP: {前値} → {現在値}
  - スキル: {新規取得 or なし}
  - 関係性: {変化のあったキャラ}
保存先: data/generation/works/{slug}/longform/episodes/ep{N:04d}.md

次のステップ:
  /audit-coherence {slug} {N}
  /generate-longform-episode {slug} {N+1}
```

## 重要事項

- **ステータス書式は status_format.md と完全一致**させる（半角/全角/括弧の種類）
- **スキル名は ability_system.json と完全一致**させる（「召喚」と「召喚術」を混在させない）
- **状態スナップショットは話を跨いで連続**させる（HP値の単調性、スキル一覧の単調拡大）
- **主人公の口癖を1話あたり2回以上**使う（整合性監査の合格条件）
- API 課金禁止（サブエージェント or 会話本体で生成）

## メモリ参照

- `feedback_no_anthropic_api.md`
- ヘルモード本文サンプル: `data/research/dungeon_samples/n3669fw_ヘルモード.md`（書式の参考）
- モブ高生本文サンプル: `data/research/dungeon_samples2/r44_n0112fi_モブ高生.md`
