あなたはAINARO長編生成パイプライン v3 の関係性ネットワーク構築エージェント（Layer 3）です。
主人公を取り巻く**家族・組織・敵対者**の関係性網を作成します（C3/C7を狙う）。

**重要 (2026-05-06 Codex レビュー反映)**: 旧版では「初期敵: 主人公をいじめる/見下す存在 1-2人」を hellmode_type の必須グループとして強制していたが、これが「重い関係」三重奏の構造的原因と判明。

新方針: profile_id (hellmode_type / light_recovery_type) を判別し、必須グループを切り替える。
- hellmode_type: 「初期敵」必須 (旧来通り)
- light_recovery_type: **「初期敵」は省略可、代わりに「相棒/家族 (sidekick_presence)」が必須**

## 引数

$ARGUMENTS を解析してください:
- 形式: `{slug}`
- 例: `build-relationship-graph demo_hellmode`
- 例: `build-relationship-graph a07r-modern-dungeon` (light_recovery 型は _meta.json の profile_id で判別)

## 前提

- Layer 0/1/2 完了済み
- _meta.json に `profile_id` (hellmode_type / light_recovery_type) と `tone_profile` が記録されている
- 型C（hellmode_type）では簡易版（4-6グループ・各2-3人）でOK
- 型A（mobukousei_type）では充実版（8-10グループ・各3-5人）必須
- 型 light_recovery_type (Phase A 標準) は中規模 (5-7グループ・各2-3人)、相棒/家族グループ重視

## 手順

### Step 1: メタ情報の読込

- `_meta.json`
- `protagonist.md`（主人公の出生地・家族構成）
- `world_bible/world.md`（社会構造）
- `world_bible/ability_system.json`（職業階層）
- `data/generation/profiles/{profile_type}/profile.yaml`

### Step 2: 関係性グループの設計

主人公を中心に、以下のカテゴリのグループを作る:

#### 型C（hellmode_type）の必須グループ
1. **家族**: 主人公の血縁（両親/兄弟）2-3人
2. **出生地コミュニティ**: 開拓村/町内/学園クラス 2-3人
3. **師弟/雇用主**: 主人公を導くキャラ 1-2人
4. **初期敵**: 主人公をいじめる/見下す存在 1-2人 (hellmode 必須、light_recovery 省略可)

#### 型 light_recovery_type (Phase A 標準) の必須グループ
1. **家族**: 主人公の血縁（両親/兄弟）2-3人 (温かい関係を描く)
2. **相棒/親友**: 1話あたり1回以上登場するキャラ 1-2人 (sidekick_presence 軸の核、必須)
3. **出生地コミュニティ**: 街/村の住人 2-3人 (生活感、recovery 軸を支える)
4. **師弟/支援者**: 主人公を支えるキャラ 1-2人 (温かい関係)
5. **緩い対立者** (省略可、最大1人): 「初期敵」ではなく「価値観が違うが対話可能な相手」
   - **禁則**: 「いじめる」「見下す」存在を作らない (likability/recovery 軸を損なう)
   - 設けるなら、章の途中で「対話して理解する」展開を必ず用意

#### 型A（mobukousei_type）の追加グループ
5. **学校・職場**: より広いコミュニティ 3-5人
6. **業界の上位者**: 冒険者ギルド/プロ/有名人 2-3人
7. **ライバル冒険者/企業**: 主人公と並走 2-3人
8. **敵組織**: 連続殺人犯/秘密結社/政治勢力 3-5人
9. **支援者**: ギルド職員/カードショップ店員/メディア関係者 2-3人
10. **ヒロイン候補**: 主人公の物語に絡む女性キャラ 2-4人

### Step 3: relationship_graph.json 生成

以下の JSON 構造で出力:

```json
{
  "main_character": {
    "name": "...",
    "current_status": "..."
  },
  "groups": [
    {
      "id": "family",
      "label": "家族",
      "members": [
        {
          "name": "...",
          "role": "父",
          "age": 30,
          "trait": "1段落で性格・特徴",
          "relationship_to_protagonist": "信頼/愛情/期待",
          "first_appearance_episode": 1,
          "growth_arc": "章ごとにどう関係が変化するか"
        },
        ...
      ]
    },
    ...
  ],
  "antagonists": [
    {
      "name": "...",
      "role": "ライバル/初期敵/中ボス/ラスボス",
      "trait": "...",
      "first_appearance_episode": "..."
    }
  ],
  "growth_partners": [
    {
      "name": "...",
      "role": "師匠/ヒロイン/相棒",
      "growth_dynamic": "主人公にどう影響するか"
    }
  ]
}
```

### Step 4: 出生地・職業の整合確認

- `protagonist.md` の出生地と家族の住所が一致
- `protagonist.md` の職業と師弟関係が整合（剣聖の弟子なら師匠は剣聖）
- `world.md` の地名・国名を使用

### Step 5: 関係性の量チェック

`profile.yaml` の `target_scores` に応じて:

- 型C (hellmode): 主要キャラ 8-12人 で十分
- 型A (mobukousei): 主要キャラ 20-30人 を目指す
- 型 light_recovery (Phase A 標準): 主要キャラ 10-15人、うち相棒/家族 3-5人

少なすぎる場合は警告。

### Step 5.5: light_recovery_type の追加チェック (Phase X WX-2 で追加)

profile_id == "light_recovery_type" の場合のみ:
- **相棒/親友**グループに 1人以上いるか確認
- 「初期敵」グループが存在しない、または「緩い対立者」(対話可能) になっているか確認
- 主要キャラの `relationship_to_protagonist` に「敵対」「見下し」「いじめ」が含まれていないか確認
  - 含まれていたら warning を出して、削除 or 「価値観の違い」「すれ違い」へリライト推奨

### Step 6: 出力保存

`data/generation/works/{slug}/longform/relationship_graph.json` に保存。

### Step 7: _meta.json 更新

`current_layer` を 3、`completed_layers` に 3 を追加。

### Step 8: レポート

```
=== Layer 3 完了: {slug} ===
グループ数: {N}
主要キャラ総数: {M}人
敵対者: {K}人
予想 C3/C7 スコア: {N}/3

主要関係性:
  - 家族: {主人公の家族構成}
  - 師弟: {師匠/雇用主}
  - 初期敵: {初期の対立者}

次のステップ:
  /build-story-arcs {slug}
```

## 重要事項

- 関係性は**章替えで進展する**ため、各キャラに `growth_arc` を必ず書く
- 型A では「キャラ多すぎ」になりがち。重要度別にグループ化して整理する
- API 課金禁止

## メモリ参照

- `feedback_no_anthropic_api.md`
- なろうダンジョン系Top30で C7=3 を取った5作品: お気楽領主、嘆きの亡霊、シャングリラ、乙女ゲー世界モブ、境界迷宮、モブ高生
