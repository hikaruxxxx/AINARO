# content/works/ インデックス

エージェント・オーケストレータが対象作品を特定するための索引。
**正本は各作品の `work.json`**（存在する場合）。本ファイルと `_index.json` はその集約ビュー。

## 配置ルール

```
content/works/
├ INDEX.md         ← このファイル（人間/エージェント向けナビ）
├ _index.json      ← 機械可読インデックス（rebuild-works-index.ts で再生成）
└ <slug>/          ← 作品ディレクトリ。1スラッグ1作品。階層化しない
   ├ work.json           作品メタデータ（state, sourceBatch, hitProbability等）
   ├ synopsis.md         あらすじ
   ├ _settings.md        世界観・舞台設定
   ├ _style.md           文体ガイド
   ├ _plot.md            プロット
   ├ _characters/        キャラクター定義
   ├ _foreshadowing_ledger.md  伏線台帳
   ├ _tension_curve.md   テンション曲線
   ├ _world_state/       世界観事実DB
   └ episodes/           本文エピソード（001.md, 002.md, ...）
```

**重要**: 物理ディレクトリは平置き（1階層）。ジャンルやバッチでサブディレクトリを切らない。
分類は `_index.json` の `category`/`genre`/`sourceBatch` フィールドで論理的に行う。

## カテゴリ

| カテゴリ | 意味 | 識別 |
|---|---|---|
| `screened` | バッチ生成 → スクリーニング → 昇格された作品。`work.json` 必須 | `work.json` 存在 |
| `legacy` | 手動制作・初期実験作品。`work.json` 未生成 | `work.json` 不在 |

## 状態 (state)

- `legacy` — 旧作・実験用
- `ready_to_publish` — 昇格済み・公開待ち
- `scheduled` — 公開スケジュール済み
- `published` — 公開済み（Supabase に同期済）
- `abandoned` — 廃棄

## 現状サマリ

- 合計: 25作品
- screened (work.json あり): 14（すべて batch_20260408_002 由来、ready_to_publish）
- legacy: 11

詳細は [`_index.json`](_index.json) を参照。

## エージェント向けの参照方法

```bash
# 全 ready_to_publish 作品を取得
jq '.works | to_entries[] | select(.value.state=="ready_to_publish") | .key' content/works/_index.json

# 特定バッチの作品
jq '.works | to_entries[] | select(.value.sourceBatch=="batch_20260408_002") | .key' content/works/_index.json

# ヒット確率順
jq '.works | to_entries | sort_by(.value.hitProbability) | reverse' content/works/_index.json
```

## インデックス再生成

`work.json` を追加・更新したら必ず再生成すること:

```bash
npx tsx scripts/utils/rebuild-works-index.ts
```
