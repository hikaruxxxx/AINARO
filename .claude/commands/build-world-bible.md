あなたはAINARO長編生成パイプライン v3 のワールドバイブル構築エージェント（Layer 1）です。
全話で一貫して使う**世界設定を事前に固定**します。これがヘルモード型/モブ高生型の最重要レイヤです。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug}`
- 例: `build-world-bible demo_hellmode`

## 前提

- `data/generation/works/{slug}/longform/_meta.json` が `/longform-init` で作成済み
- `_meta.json` の `profile_type` を確認

## 手順

### Step 1: メタ情報の読込

- `data/generation/works/{slug}/longform/_meta.json` を読む
- `profile_type` を取得（例: `hellmode_type`）
- `data/generation/profiles/{profile_type}/profile.yaml` を読む
- `data/generation/profiles/{profile_type}/world_bible_template.md` を読む
- `data/generation/profiles/{profile_type}/profile.yaml` の `target_scores` から重点軸/軽量化軸を確認

### Step 2: 主題（コンセプト）の確認

`data/generation/works/{slug}/_meta.json`（既存形式）または ユーザーから提供される主題を確認。
- 例: 「東京迷宮（現代日本＋ダンジョン＋カード召喚）」
- 例: 「ヘルモード風の異世界転生＋召喚士＋廃ゲーマー」

主題がない場合はユーザーに尋ねるか、デフォルトで「ハイファンタジー異世界＋ダンジョン」を採用。

### Step 3: ワールドバイブルの執筆（5ファイル）

`world_bible_template.md` の項目を参考に、**1ファイルずつ書く**。

サブエージェントを呼び出すか、本コマンド内で順次執筆。
**ANTHROPIC_API_KEY を直接叩かない。Claude Code 内部の生成を使う**。

#### 3-1. world.md（W1-5）
- 大陸/国/都市（W1=1点目標）
- 政治体制（W4=1点目標）
- 経済の基本（W5=1-2点）

`world_bible_template.md` の Section 1, 5 をベースに、200-400字で簡潔に。

出力: `data/generation/works/{slug}/longform/world_bible/world.md`

#### 3-2. ability_system.json（W6=3点・最重点）

職業ツリー（最低10個）、スキル体系、合成・強化ルールを **JSON で構造化**:

```json
{
  "talent_judgment": {
    "age": 13,
    "place": "神殿",
    "outputs": ["職業", "才能ランク★1〜★8"]
  },
  "talent_ranks": {
    "1": {"label": "★1", "stat_growth_rate": 1.0, "max_skills": 2},
    "8": {"label": "★8（廃設定）", "stat_growth_rate": 2.0, "max_skills": 8}
  },
  "jobs": [
    {
      "name": "召喚士",
      "rank": 8,
      "category": "召喚系",
      "primary_skills": ["召喚", "生成", "合成", "強化", "拡張"],
      "rarity": "極希少（廃設定）"
    },
    ...
  ],
  "skills": [
    {
      "name": "召喚",
      "owner_jobs": ["召喚士"],
      "max_level": 10,
      "exp_per_level": [1000, 10000, 100000, ...],
      "effect": "保有する召喚獣カードを呼び出す"
    },
    ...
  ],
  "combination_rules": {
    "synthesis": "同種カード2枚 → 上位カード1枚",
    "enhancement": "スキル経験値消費で効果向上",
    "extension": "召喚枠/装備枠を増やす"
  }
}
```

最低 10 職業 / 20 スキル を作る。

出力: `data/generation/works/{slug}/longform/world_bible/ability_system.json`

#### 3-3. dungeon_theory.md（W7=2点）

ダンジョンの起源・構造・運用を300-500字で。

- 起源: 神/魔王/古代文明/異次元/未知 の1つ（謎として残す）
- 構造: 階層型 or フィールド型、階層数
- 運用: 誰が管理しているか、入場資格、報酬

出力: `data/generation/works/{slug}/longform/world_bible/dungeon_theory.md`

#### 3-4. status_format.md（W10=3点・最重点）

`world_bible_template.md` の Section 3 をそのままコピーして、**作品固有の値を埋める**:

- ステータス画面の固定書式
- 表記揺れ防止ルール（このオブジェクト名は「魔導書」、〈〉を使う、など）
- ステータス値の単調性ルール

出力: `data/generation/works/{slug}/longform/world_bible/status_format.md`

#### 3-5. mysteries.md（連載長期化のため）

「世界の謎」3個を表形式で:

| 謎 | 開示話 | 解明話 |
|---|---|---|
| ヘルモード設定の真意 | ep1 | 第3章末 |
| エクストラスキルの正体 | 第2章中盤 | 第4章末 |
| 世界そのものの真相 | 全体の伏線 | 完結話 |

出力: `data/generation/works/{slug}/longform/world_bible/mysteries.md`

### Step 4: 整合性の自己チェック

書き終えた5ファイルを読み直して以下を確認:
- `ability_system.json` のスキル名が `status_format.md` の表記と一致しているか
- `mysteries.md` の謎が `dungeon_theory.md` の起源と整合しているか
- `world.md` の地名が他ファイルで使われていないか（一貫性）

矛盾があれば修正。

### Step 5: _meta.json 更新

`_meta.json` の `current_layer` を 1、`completed_layers` に `1` を追加、`status` を `world_bible_built` に。

### Step 6: レポート

```
=== Layer 1 完了: {slug} ===
プロファイル: {profile_type}
ワールドバイブル: data/generation/works/{slug}/longform/world_bible/
  - world.md ({N}字)
  - ability_system.json ({N}職業, {M}スキル)
  - dungeon_theory.md ({N}字)
  - status_format.md
  - mysteries.md ({N}個の謎)

W軸スコア予測: {予測値}/36
- W6 魔法理論: {N}点
- W10 ゲーム化: {N}点
- W7 ダンジョン: {N}点

次のステップ:
  /build-protagonist {slug}
```

## 重要事項

- **ステータス画面の書式は Layer 6 で全話再利用される**ため、`status_format.md` は厳密に書く
- **スキル名・職業名・固有名詞は ability_system.json と必ず一致**させる（後で表記揺れ監査される）
- profile.yaml の `target_scores` を意識してリソース配分する（W6/W10に時間をかけ、W2/W9は最小限）
- **API 課金禁止**: 外部 LLM API 呼び出し不可。サブエージェント or 会話本体で生成

## メモリ参照

- `feedback_no_anthropic_api.md`
- `project_phase1_v2_design.md`
