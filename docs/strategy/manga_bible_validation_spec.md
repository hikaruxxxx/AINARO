# 漫画 bible 検証仕様 (Bible Validation Spec)

## 目的
漫画 bible (`data/manga/works/<slug>/bible/snapshot.v2.json`) を後段パイプライン (shotlist → storyboard → page director → 画像生成 → text 流し込み) に流す前に検査し、構造バグ・テンプレ汚染・外部キー切れを自動検出する。

## 背景: なぜ必要か (2026-05-06 学習)
a07-modern-dungeon の bible 検証で以下が同時発覚:
- **キャラID不整合** (`char_桐生_レン_v1` と `char_kiryuu_ren_v1` の混在) → props/costumes が主人公を見つけられない参照切れ
- **キャラ spec テンプレ汚染** (6/7キャラの hair/eyes/outfit がメインヒロインの spec をコピペした暫定値で全員同じ)
- **continuity_seeds テンプレ汚染** (全7キャラの「後ろ姿」invariant が同じ「フード被り肩幅」)
- **age_band 不整合** (58歳/41歳/19歳意識のキャラが全員「20s」)
- **TODO 残存** (`TODO_post_bible_review` がそのまま画像生成パイプラインに流れる危険)

これらは目視レビューでは見逃しやすく、画像生成段階で「全員銀髪青目」「主人公の小物が反映されない」等の不可逆な品質崩壊を起こす。

## 検査カテゴリ

### 1. 必須フィールド検査 (致命)
以下が欠落していれば error。
- `meta.slug`, `meta.title`, `meta.subtype`, `meta.estimated_volumes`
- `world.premise`, `world.rules`, `world.system`, `world.timeline`, `world.factions[]`
- `characters[*].id`, `characters[*].name`, `characters[*].role`, `characters[*].spec`
- `characters[*].spec.hair`, `characters[*].spec.eyes`, `characters[*].spec.outfit_default`
- `locations[*].id`, `locations[*].name`, `locations[*].spec`
- `props[*].id`, `props[*].owner_character_id`
- `costumes[*].id`, `costumes[*].character_id`
- `relations[*].from_character_id`, `relations[*].to_character_id`, `relations[*].relation_type`
- `continuity_seeds[*].group_id`, `continuity_seeds[*].kind`, `continuity_seeds[*].target_id`, `continuity_seeds[*].invariant_description`
- `volume_synopsis.theme`, `volume_synopsis.summary`, `volume_synopsis.cliffhanger`

### 2. TODO 残存検査
全フィールドを再帰探索し、値に `TODO` を含む文字列を検出する。
- **error レベル**: ID 系フィールド (id, character_id, owner_character_id, target_id, group_id) に TODO が混入
- **warning レベル**: 画像生成パイプライン直前に解決必要なフィールドに TODO 残 (spec, appearance_notes, continuity_anchors, invariant_description, attribute_classifier)
- **info レベル**: 文章フィールドに TODO 残 (description, summary 等)

### 3. ID 一意性検査 (致命)
以下のコレクションで id が一意でなければ error。
- `characters[*].id`
- `locations[*].id`
- `props[*].id`
- `costumes[*].id`
- `continuity_seeds[*].group_id`

### 4. 外部キー整合性検査 (致命)
参照先 ID が対応コレクションに存在しなければ error。
- `props[*].owner_character_id` → `characters[*].id`
- `costumes[*].character_id` → `characters[*].id`
- `relations[*].from_character_id` → `characters[*].id`
- `relations[*].to_character_id` → `characters[*].id`
- `continuity_seeds[*].target_id` → 対応 `kind` のコレクション (`character_*` → characters, `location_*` → locations, `prop` → props) の id

### 5. 論理整合性検査
- `characters[*].appears_in_volumes[*]` は `1..meta.estimated_volumes` 範囲内 (warning)
- `costumes[*].valid_from_episode <= valid_until_episode` (null許容) (warning)
- `world.factions[*].name` に重複なし (warning)
- `characters[*].attribute_classifier.age_band` と `characters[*].spec.age_visual` の整合性 (warning)
  - 数値年齢から age_band が機械的に計算可能: `<13:child / 13-19:teen / 20-29:20s / 30-39:30s / 40-49:40s / 50-59:50s / 60+:elder`
  - 「意識年齢19/肉体停止」のような特殊ケースは age_visual 文字列が数値と一致しない場合スキップ

### 6. テンプレ汚染検査 (今回の学習) ⭐
- **キャラ spec の同一値検出**: `characters[*].spec` を JSON.stringify で比較し、2キャラ以上で完全一致が出れば **warning** (テンプレ流用の疑い)
  - ただし主人公とサブキャラのコピー禁止度を区別: 主人公とそれ以外で一致なら error 級
- **continuity_seeds invariant_description の同一値検出**: 同 kind の中で 2エントリ以上で文字列が完全一致なら **warning**
- **attribute_classifier の汚染**: 全キャラの `age_band` が同一値で 3名以上に及ぶ場合 **warning** (実年齢確認推奨)

### 7. キャラ役割整合性検査
- `characters` の中に `role: "protagonist"` のキャラが exactly 1名 (warning if 0 or >1)
- `relations` で protagonist が `from_character_id` になるエントリが他キャラ数と等しい (warning if mismatch)

### 8. 巻数整合性検査
- `meta.estimated_volumes` と `volume_outline[].vol` の最大値が一致 (warning)
- `volume_outline[]` の数が `meta.estimated_volumes` と一致 (warning)
- `volume1_detail.episodes[].no` が 1..target_episodes_per_volume の範囲 (warning)

## 報告形式

```json
{
  "validated_at": "ISO 8601",
  "bible_path": "data/manga/works/<slug>/bible/snapshot.v2.json",
  "schema_version": 2,
  "summary": {
    "total_checks": 47,
    "errors": 0,
    "warnings": 3,
    "info": 5
  },
  "errors": [
    {
      "category": "foreign_key",
      "path": "props[0].owner_character_id",
      "value": "char_kiryuu_ren_v1",
      "expected": "one of characters[*].id",
      "message": "props[0] が存在しないキャラを参照"
    }
  ],
  "warnings": [...],
  "info": [...]
}
```

## 実装方針

- **配置**: `scripts/validation/manga/bible-validator.ts`
- **CLI**: `npx tsx scripts/validation/manga/bible-validator.ts <slug>`
- **JSON 出力**: stdout に JSON 形式で報告、`--write` で `bible/lint_report.json` に保存
- **exit code**: errors > 0 なら 1, warnings only なら 0 (CI で warnings を allow にするか別途調整)
- **依存**: zod でスキーマ宣言、再帰トラバースは独自実装で十分

## パイプライン統合

- **L1 bible 構築直後**: 自動実行、errors 0 になるまで次層へ進めない
- **L2 ref 画像生成前**: spec の TODO 残検査を強制、warning 0 でないと進めない
- **L3 shotlist 生成前**: 外部キー整合性を再検証

## 既知の制約と非対象

- **物語の論理整合性 (時系列矛盾、伏線回収) は対象外**: これは LLM レビュー (audit-coherence) の役割
- **絵柄の好み (silver_gray が灯里に似合うか) は対象外**: スタイル品質はビジュアルレビューで判定
- **テキスト品質 (lexicon 統一、speech_style 一貫性) は対象外**: 別の品質パスで対応

## 改訂履歴

- 2026-05-06: 初版作成。a07-modern-dungeon bible 検証で発覚した5系統の汚染パターンを成文化。
