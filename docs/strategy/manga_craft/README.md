# Manga Craft Guide v3

漫画作法ガイド v3。kindle-test-1 (現代ダンジョン系・全 156p 精読) を起点に、
**階層 / 場面 / ジャンル** の 3 軸で構造化したモジュール集。

旧 v2 ([../manga_craft_guide.md](../manga_craft_guide.md)) を分解・再構成した
もの。コード側 ([`craft-guide-directives.ts`](../../../src/lib/manga/storyboard-v2/craft-guide-directives.ts))
の `buildCraftGuideDirectives()` への注入と整合する。

---

## ファイル構成

```
docs/strategy/manga_craft/
├── README.md                    # 本ファイル
├── 00_principles.md             # L0 大原則 + 3 軸定義 + tier 規約
├── 10_chapter_structure.md      # 章構成・密度リズム・panel 連結
├── 20_characters.md             # キャラ造形パターン
├── 30_scenes/                   # 場面別 8 モジュール
│   ├── chapter_opener.md        # 章扉
│   ├── establishing.md          # 場面導入・ロケ提示
│   ├── dialogue.md              # 会話 + 会話で世界観説明
│   ├── monologue.md             # 主人公独白 + 感情演出
│   ├── item_analysis.md         # アイテム解析・ステータス画面
│   ├── combat.md                # 戦闘 (buildup/action/climax)
│   ├── social_reaction.md       # SNS / ニュース / 配信反応
│   └── cliffhanger.md           # 章末引き・時間転換
├── 40_genres/                   # ジャンル別差分
│   ├── modern_dungeon.md        # 現代ダンジョン (kindle-test-1 系)
│   ├── battle_dungeon.md        # バトルダンジョン (stub)
│   ├── isekai_tensei_cheat.md   # 異世界転生チート (stub)
│   └── isekai_slowlife.md       # スローライフ (stub)
└── 50_index.json                # 機械可読タグ index
```

---

## 3 軸の概要

| 軸 | 役割 | 値 |
|---|---|---|
| **階層 (tier)** | 順守度の優先順位 | L0 / L1 / L2 / L3 |
| **場面 (scene)** | どの種類のページか | chapter_opener / establishing / dialogue / monologue / item_analysis / combat / social_reaction / cliffhanger |
| **ジャンル (genre)** | どこまで一般化していい作法か | universal / modern_dungeon / battle_dungeon / isekai_tensei_cheat / isekai_slowlife |

詳細は [`00_principles.md`](./00_principles.md) 参照。

---

## 使い方

### 人間が参照する場合

1. ある場面の作法を調べたい → [`30_scenes/`](./30_scenes/) の該当モジュール
2. ジャンル特有の差分を調べたい → [`40_genres/`](./40_genres/) の該当ファイル
3. 全体方針 → [`00_principles.md`](./00_principles.md)
4. 章構成 / 密度 → [`10_chapter_structure.md`](./10_chapter_structure.md)
5. キャラ造形 → [`20_characters.md`](./20_characters.md)

### storyboard-builder / F-2 page_one_shot から参照する場合

[`50_index.json`](./50_index.json) の `rules[]` を tier / scene / genre で
フィルタして注入する。注入順は:

1. `tier: L0` 全要素 (常時)
2. `tier: L1` 全要素 (常時)
3. `tier: L2` のうち `scene` がページ scene_type に一致 (場面マッチ時)
4. `tier: L3` のうち `scene` 一致 (初稿生成では省略可)
5. `genre` 一致 directive (genre マッチ時)
6. `tone_profile` 一致 directive (light_recovery / hellmode の追記)

これにより 1 ページ生成プロンプトのトークン量を ≈40-60% 削減できる見込み
(現行は v2 全文 ≈ 18KB を毎回注入)。

### 既存コードとの整合

[`src/lib/manga/storyboard-v2/craft-guide-directives.ts`](../../../src/lib/manga/storyboard-v2/craft-guide-directives.ts)
の `buildCraftGuideDirectives()` は:

- 既に **PANEL_CRAFT_RULES** (panel 単位ルール 18 個) と
  **PANEL_CONNECTION_PATTERNS** (連結 15 種) を抽出済み
- `LIGHT_RECOVERY_ADDITIONAL_DIRECTIVES` / `HELLMODE_ADDITIONAL_DIRECTIVES` で
  tone_profile 別追加 directive 対応
- `GENRE_DIRECTIVES` で modern_dungeon / battle_dungeon / isekai_tensei_cheat /
  isekai_slowlife の差分対応

将来 v3.x で:
- 引数に `sceneType` を追加
- 50_index.json から rule 配列を読み込んで動的に組み立て
- ファイル境界 = 軸境界 で「必要な作法だけ注入」を実現

---

## 2 冊目精読の進め方

各場面モジュール末尾の「参考実例」スロットに `(kindle-vol-2 待ち)` の
プレースホルダを置いている。2 冊目精読時に:

1. 全 156p 通読でなく、**薄い場面から targeted に** 精読
   ([`50_index.json`](./50_index.json) `stats.scene_density` 参照)
2. 既存要素の確認 vs 新規要素の発見を区別して追記
3. ジャンル必須 vs 作品固有を `genre` タグで切り分け

優先順位 (現状の薄さ順):

| scene | 現状 rule 数 | 2 冊目精読の重点 |
|---|---|---|
| chapter_opener | 4 | パターン B/C の検証、intro_box の使用頻度 |
| social_reaction | 4 | 1 巻あたりの SNS panel 数、海外要素導入位置 |
| item_analysis | 5 | ステータス UI のジャンル別デザイン差 |
| establishing | 5 | 復帰 establishing の必須度、season 表現 |
| cliffhanger | 7 | 場面転換型 vs シルエット型の使い分け |
| combat | 7 | 弱点描写の表現方法、buildup の長さ |
| monologue | 8 | 独白頻度の作品差、ギャグ顔とのバランス |
| dialogue | 11 | 温度差ペアの配置頻度、写真フレームの使い方 |

`chapter_opener` と `social_reaction` が最も rule 数が少ない = 情報不足。
ここから補強する方が ROI 高い。

---

## 関連ドキュメント

- 戦略: [`docs/plans/manga/strategy.md`](../../plans/manga/strategy.md)
- パイプライン: [`docs/plans/manga/pipeline-v2.md`](../../plans/manga/pipeline-v2.md)
- Phase A 候補作品: [`docs/strategy/phase_a_three_works_concepts.md`](../phase_a_three_works_concepts.md)
- 品質チェックリスト: [`docs/strategy/phase_a_quality_checklist.md`](../phase_a_quality_checklist.md)
- KDP 安全運用: [`docs/strategy/kdp_account_safety.md`](../kdp_account_safety.md)

---

## 著作権上の確認

本ガイドは精読対象作品 (個人蔵書) を **作法分析** の目的で参照したもの。

- ✅ 抽出対象: 「panel 構成パターン」「感情演出技法」「設定説明の流れ」
  「章構成のリズム」(漫画の普遍的作法に近く、著作権法 30 条の 4
  情報解析の範疇)
- ❌ 複製禁止: 具体的なキャラデザ、台詞、固有名詞、特定構図の直接コピー

Phase A 制作の品質チェックに「原作の構図・キャラデザを直接複製していない」
目視確認を含める。

---

## 変更履歴

- **2026-05-06 v3.0**: v2 (1 ファイル) を 3 軸モジュール構造に分解。
  階層 (L0/L1/L2/L3) と場面 (scene-type) の機械可読タグを 50_index.json に
  起こす。Phase A 候補 3 作品の生成リスク低減を目的とする
- **2026-05-01 v2**: kindle-test-1 全 156p 精読で 80+ 要素を抽出。
  storyboard-builder の system context として注入する形式
- **2026-04-30**: 横読み白黒漫画ピボット。webtoon 系作法は撤回
