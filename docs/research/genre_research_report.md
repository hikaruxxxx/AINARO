# ジャンル軸リサーチレポート

**作成日**: 2026-04-08
**目的**: AINARO Phase 1 生成パイプラインの階層ジャンル定義(大5×サブ4=20)を構築するための調査
**成果物**: [data/generation/genre-taxonomy.json](../../data/generation/genre-taxonomy.json)

## 経緯

リサーチエージェントによる自動調査を3回試行したが、いずれもAnthropic API 529(overloaded)で完全完走できず。Step 1〜3 までの部分成果物が `data/research/` に残ったため、それらを手動統合して taxonomy v2 を構築した。

| Step | 内容 | 状態 | 出力 |
|---|---|---|---|
| 1 | scripts/crawler/ 既存実装確認 + Phase A(既存DB再クラスタリング) | ✅ 完了 | `data/research/genre_phaseA_clusters.json` |
| 2 | なろう全カテゴリランキング | ✅ 完了 | `data/research/narou_all_categories.json` |
| 3 | Amazon Kindle 3カテゴリ | ⚠️ ノイズ過多 | `data/research/amazon_rankings.json` |
| 4 | 他プラットフォーム(カクヨム/アルファポリス/エブリスタ) | ❌ 未実行 | - |
| 5 | 統合 | ✅ 手動完了 | `data/generation/genre-taxonomy.json` + 本レポート |

## データソース別サマリ

### 1. Phase A: 既存ヒットDB再クラスタリング(668件)

`data/generation/hit-loglines.json` の668作品を6大ジャンルに再クラスタリングした結果:

| 大ジャンル | サブ数 | 件数(概算) |
|---|---|---|
| 転生_異世界 | 11 | 220 |
| 追放_復讐 | 4 | 80 |
| 悪役令嬢_婚約破棄 | 5 | 100 |
| スローライフ_日常 | 3 | 60 |
| 現代_ヒューマンドラマ | 5 | 96 |
| ミステリ_ホラー | 6 | 112 |

**発見**:
- 既存7ジャンル(現状実装)は6大ジャンルのうち「転生_異世界」「追放_復讐」「悪役令嬢_婚約破棄」「スローライフ_日常」の **4つにしかカバレッジがない**
- 「現代_ヒューマンドラマ」「ミステリ_ホラー」が完全に欠落していた(2大ジャンル分)
- 既存ヒットDB自体が「ミステリ_ホラー」「現代_ヒューマンドラマ」もカバーしているのに、生成パイプラインは無視していた

### 2. なろう全カテゴリランキング

`api.syosetu.com` から6 big genres × 50件 = 300作品を取得:

- 恋愛: 50件(異世界恋愛・現代恋愛混在)
- ファンタジー: 50件(ハイ・ロー・転生・チート全般)
- 文芸: 50件(歴史・推理・ヒューマンドラマ)
- SF: 50件(VRMMO・宇宙・サイバーパンク)
- その他: 50件
- ノンジャンル: 50件

**発見**:
- なろうAPI は「恋愛」「ファンタジー」を大ジャンルとして提供しているが、内部では細分化が進んでいる(キーワードレベルで識別)
- VRMMO は SF カテゴリ扱い → 既存7ジャンルでは完全欠落
- 「文芸」カテゴリには時代小説・推理・人間ドラマが混在 → 細分化必要

### 3. Amazon Kindle ランキング(無効)

3カテゴリ(Kindleラノベ / Kindle文芸小説 / Kindleコミック)取得を試みたが、データに以下の問題があった:

- Kindleラノベ枠に「ギャグマンガ日和」(漫画)が連続出現 → スクレイピング時のセレクタ誤りまたはAmazon側の混在
- 同一商品の重複行(rank+空行のセット)
- 実質的に使えるデータゼロ

→ **本リサーチでは Amazon は除外**。将来的に Amazon PA-API 経由で再取得すべき。

### 4. 他プラットフォーム(未取得)

カクヨム/アルファポリス/エブリスタ/ピッコマ/LINEマンガ は未取得。
これにより以下の領域が **本 taxonomy v2 では欠落**:

- BL(ボーイズラブ) — アルファポリス・カクヨムが主戦場
- TL(ティーンズラブ) — アルファポリス
- 縦読みコミック由来のジャンル — ピッコマ・LINEマンガ
- 純文学寄り作品 — カクヨムが強い

## 階層ジャンル v2 (大5×サブ4=20)

### 設計判断

- 「大5」は読者の根本的な興味の方向性で分類:
  1. **isekai** 異世界・転生(逃避と冒険)
  2. **otome** 悪役令嬢・乙女(恋愛と承認)
  3. **battle** バトル・ゲーム(力と成長)
  4. **modern** 現代・文芸(共感と観察)
  5. **mystery** ミステリ・サスペンス(謎と恐怖)
- 各大ジャンルに4サブ。20サブで Web 小説の主要領域をほぼカバー
- 既存7ジャンル(現状実装)は **isekai と otome 配下にすべて吸収**される
- 各サブに `readerDesires`(感情欲求10項目から1〜3個)をマッピング

### 既存7ジャンルとの対応

| 既存ジャンル | v2 でのマッピング |
|---|---|
| 追放_ファンタジー | isekai_tsuiho_zamaa |
| 悪役令嬢_恋愛 | otome_akuyaku_zamaa |
| スローライフ_ファンタジー | isekai_slowlife |
| 悪役令嬢_ファンタジー | otome_villain_fantasy |
| 転生_ファンタジー | isekai_tensei_cheat |
| 異世界恋愛_純粋 | otome_isekai_pure |
| 婚約破棄_恋愛 | otome_konyaku_haki |

### 新規追加サブジャンル(13個)

isekai 配下:
- **isekai_high_fantasy** ハイファンタジー王道(追放/転生に依存しない剣と魔法)

battle 大ジャンル全体(4サブ):
- **battle_vrmmo** VRMMO・ゲーム転生
- **battle_modern_power** 現代異能・能力者
- **battle_war_chronicle** 戦記・群像
- **battle_dungeon** ダンジョン探索

modern 大ジャンル全体(4サブ):
- **modern_romance** 現代恋愛・ラブコメ
- **modern_school** 学園・青春
- **modern_human_drama** ヒューマンドラマ
- **modern_history** 歴史・時代

mystery 大ジャンル全体(4サブ):
- **mystery_detective** 推理・ミステリ
- **mystery_horror** ホラー・パニック
- **mystery_sf** SF・サイバーパンク
- **mystery_action** アクション・サスペンス

## 重要発見(5点)

1. **既存7ジャンルは2/5の大領域しかカバーしていなかった**: isekai と otome のみ。battle・modern・mystery の3大領域(13サブジャンル)が完全に欠落。これは batch_002 の生成多様性の上限を直接規定していた

2. **「現代_ヒューマンドラマ」「ミステリ_ホラー」は既存ヒットDBにもデータが揃っているのに使われていなかった**: 668件中208件(31%)がこの2大ジャンル。データはあるのに生成側が無視していた(機会損失)

3. **VRMMO は SF カテゴリ扱いで見落とされやすい**: なろうAPI構造上、ファンタジーカテゴリには入らない。明示的にサブジャンルとして起こさないと永久に生成されない

4. **「ハイファンタジー王道」(追放・転生に依存しない剣と魔法)が欠落していた**: 既存7ジャンルは全て「ひねり」を持つ派生形(追放/転生/悪役令嬢)で、王道直球がない。これは女性向けに比べて男性向け純ファンタジーの厚みが足りない原因

5. **BL・TL・縦読みコミック由来のジャンル軸は本 v2 でも未カバー**: 他プラットフォームクロール未実行のため。Phase 2 で追加すべき主要欠落

## 読者感情欲求マッピング集計

20サブジャンルが各感情欲求にマッピングされている件数:

| 感情欲求 | 紐付くサブ数 |
|---|---|
| dominate(無双したい) | 7 |
| grow(成長したい) | 7 |
| discover(知りたい) | 8 |
| loved(愛されたい) | 4 |
| connect(繋がりたい) | 5 |
| escape(逃避したい) | 3 |
| revenge(見返したい) | 4 |
| rewarded(報われたい) | 4 |
| observe(観察したい) | 6 |
| protected(守られたい) | 2 |

**観察**:
- `protected` (守られたい) のカバレッジが低い(2サブのみ) → 現状の otome_isekai_pure と otome_konyaku_haki に偏在
- `dominate` `grow` `discover` は広くカバー → 男性読者向けの基礎欲求として安定
- 全感情欲求が最低2サブ以上にマッピングされており、シード抽選の組合せ空間として十分

## 次のステップ(優先度順)

1. **Phase 1A 実装で本 taxonomy v2 を採用**: `seed-v2.ts` のジャンル分布、`eval-weights-by-genre.json` を v2 構造に置き換え
2. **eval-weights-by-genre.json を v2 ジャンルで全面再構築**: 現状7ジャンルしか定義なし、20サブ全てに評価重みを設定
3. **plot-templates / style-templates を新サブジャンル分作成**: 13個の新規サブジャンル分のテンプレート作成
4. **β-3 ヒットDB逆算**: 668件 × 感情欲求マッピングを LLM で実行(コスト$5以下)
5. **Step 4 リトライ(他プラットフォーム)**: API 529 が解消したらカクヨム/アルファポリス/エブリスタを取得し、taxonomy v3 で BL/TL を追加
6. **Amazon PA-API 経由での再取得**: スクレイピングのノイズを回避

## ファイル一覧

| パス | 内容 |
|---|---|
| [data/generation/genre-taxonomy.json](../../data/generation/genre-taxonomy.json) | v2 階層ジャンル定義 |
| [data/research/genre_phaseA_clusters.json](../../data/research/genre_phaseA_clusters.json) | 既存DB再クラスタリング |
| [data/research/narou_all_categories.json](../../data/research/narou_all_categories.json) | なろう全カテゴリ |
| [data/research/amazon_rankings.json](../../data/research/amazon_rankings.json) | Amazon(無効) |
| [data/generation/reader-desires.json](../../data/generation/reader-desires.json) | 感情欲求10項目 |
