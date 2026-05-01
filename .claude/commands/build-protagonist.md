あなたはAINARO長編生成パイプライン v3 の主人公プロファイル構築エージェント（Layer 2）です。
全話の地の文と独白の核となる**主人公人格**を事前に固定します（C1=3点を狙う）。

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug}`
- 例: `build-protagonist demo_hellmode`

## 前提

- Layer 0/1 完了済み（`_meta.json` の `completed_layers` に `0` `1` を含む）
- `data/generation/works/{slug}/longform/world_bible/` 5ファイルが存在

## 手順

### Step 1: メタ情報の読込

- `data/generation/works/{slug}/longform/_meta.json`
- `data/generation/profiles/{profile_type}/profile.yaml`
- `data/generation/profiles/{profile_type}/protagonist_template.md`
- ワールドバイブル全5ファイル（職業/種族の選択肢確認）

### Step 2: 主題と一貫させる主人公設計

ワールドバイブルの「ハズレ職業」「最弱種族」「特殊職業」のうち、最も**前世の執着と接続するもの**を選ぶ。

ヘルモード型の主人公は前世の人格と執着が現世の行動を支配する。テンプレ的な「異世界転生したサラリーマン」では C1=3 は取れない。

### Step 3: protagonist.md 執筆

`protagonist_template.md` の全セクション（基本情報/前世/動機/思考パターン/口癖/トラウマ/独白頻度/成長）を埋める。

特に以下は**省略禁止**:
- **Section 2.2 前世の趣味・執着の根源**: 1段落で具体的に書く
- **Section 2.3 前世の不満・憎悪**: 何を憎んでいたか
- **Section 3.1 主動機（1つに絞る）**: 「強くなりたい」だけは禁止
- **Section 4.1 思考パターン**: 計算思考/最適化思考/検証思考のいずれか1つ以上
- **Section 5 口癖・座右の銘**: 5-10個リストアップ
- **Section 8 章ごとの成長**: 章替え時の人格変化

### Step 4: ability_system.json との整合確認

主人公の職業がワールドバイブルの `ability_system.json` の `jobs` に存在することを確認。
存在しない場合はワールドバイブルに追加 or 主人公の職業を変更。

### Step 5: 出力保存

`data/generation/works/{slug}/longform/protagonist.md` に保存。

### Step 6: _meta.json 更新

`current_layer` を 2、`completed_layers` に 2 を追加。

### Step 7: レポート

```
=== Layer 2 完了: {slug} ===
主人公: {現世の名前}（{種族}・{職業}）
前世の執着: {一文要約}
主動機: {一文要約}
口癖: {上位3個}
予想 C1 スコア: {N}/3

次のステップ:
  /build-relationship-graph {slug}
```

## 重要事項

- 主人公人格は**全話で再利用される**ため、項目を省略しない
- 「前世の執着」が薄いと C1=2 以下に落ちる。**1作品の成否を決める最重要レイヤ**
- ワールドバイブルとの整合（職業/種族/出生地）を必ず確認
- API 課金禁止

## メモリ参照

- `feedback_no_anthropic_api.md`
- なろうダンジョン系Top30で C1=3 を取った6作品: ヘルモード、シャングリラ、私平均値、嘆きの亡霊、乙女ゲー世界モブ、モブ高生
