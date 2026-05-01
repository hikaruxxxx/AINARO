あなたはAINARO長編生成パイプライン v3 のエピソードパターン辞書構築エージェント（Layer 5）です。
本文生成の質を底上げする**5-10個のパターン**を作品固有に調整します（S1=3点を狙う）。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug}`
- 例: `build-episode-patterns demo_hellmode`

## 前提

- Layer 0-4 完了済み
- `story_arcs.md` の主要事件にエピソードパターンID（P1-P5）が割り当てられている

## 手順

### Step 1: メタ情報の読込

- `_meta.json`
- `data/generation/profiles/{profile_type}/episode_patterns.yaml`（ベース5パターン）
- `world_bible/ability_system.json`（スキル名・ステータス書式）
- `world_bible/status_format.md`
- `protagonist.md`（口癖・思考パターン）
- `story_arcs.md`（各話のパターン割り当て）

### Step 2: ベース5パターンの作品固有化

`episode_patterns.yaml` の 5パターン（P1-P5）を、本作品の固有名詞・スキル・キャラに置換:

#### P1_skill_detect（新スキル発見）の作品固有化
- 「異常な状況」→ 本作品の世界観に即した具体例に置換
- 「ステータス画面」→ 本作品で「魔導書」or「天啓の書」など固定オブジェクト名
- 「主人公の口癖」→ `protagonist.md` Section 5 の具体的な口癖

#### P2_combat_optimize の固有化
- 「敵」→ ability_system.json の魔物名・敵職業名
- 「スキル名」→ ability_system.json と表記完全一致

#### P3-P5 も同様に固有化

### Step 3: 章別の話別割り当て

`story_arcs.md` で計画されたパターンID割り当てを `episode_patterns.yaml` に集約:

```yaml
episode_assignments:
  - episode: 1
    pattern: P1_skill_detect
    scene_focus: プロローグ + ステータス画面初登場
    skills_introduced: ["召喚", "生成"]
    status_change: "初期値 → +α"
  - episode: 2
    pattern: P3_relationship_advance
    scene_focus: 家族との会話
    new_relationships: ["父ロダン", "母テレシア"]
  - episode: 5
    pattern: P2_combat_optimize
    ...
```

### Step 4: パターン拡張（型A の場合）

`profile_type` が `mobukousei_type`（型A）の場合、追加パターンを5個作る:

- P6: 学校生活（クラスメイト・先生）
- P7: 家族時間（妹・両親）
- P8: 事件捜査（連続殺人犯系）
- P9: 試験/イベント（昇格試験・大会）
- P10: メディア露出（TV・配信）

### Step 5: 配分ルールの確認

`episode_patterns.yaml` の `allocation_rules` を作品固有に書き換える:

- 各章にP5（章替えクライマックス）が必ず1話含まれる
- 章序盤の3話にP5は配置しない
- ep1は必ずP1
- P1とP2は連続させない

### Step 6: 出力保存

`data/generation/works/{slug}/longform/episode_patterns.yaml` に保存。

### Step 7: _meta.json 更新

`current_layer` を 5、`completed_layers` に 5 を追加。

### Step 8: レポート

```
=== Layer 5 完了: {slug} ===
パターン数: {N}個（型C=5、型A=10）
作品固有化済み項目:
  - スキル名: ability_system.json と整合
  - 主人公口癖: protagonist.md と整合
  - 敵キャラ名: relationship_graph.json と整合

エピソード割り当て例:
  ep1 → P1_skill_detect (プロローグ)
  ep5 → P3_relationship_advance (家族)
  ep10 → P2_combat_optimize (初戦闘)
  ...
  ep15 → P5_chapter_climax (章替え)

予想 S1 スコア: {N}/3

次のステップ:
  /generate-longform-episode {slug} 1
```

## 重要事項

- **パターン辞書は本文生成プロンプトに毎話投入される**ため、固有名詞は必ず ability_system.json と一致
- 配分ルールを守らないと、似た展開の連続で読者が飽きる
- 型C=5パターン、型A=10パターン（無理に増やさない、薄まる）
- API 課金禁止

## メモリ参照

- `feedback_no_anthropic_api.md`
- なろうダンジョン系Top30で S1=3 を取った代表作: シャングリラ、ヘルモード、Dジェネシス、モブ高生
