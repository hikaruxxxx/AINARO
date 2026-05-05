# LLM評価パイプライン再設計

## Context
LLM評価（冒頭3000字→6項目スコア）を604作品に実施したが、精度検証で以下の問題が発覚:
- 評価テキストが保存されず、スコアの根拠を後から検証できない
- ep0001がキャラ一覧/設定ページの作品を誤評価（gp=84万の作品がpull=1）
- 精度分析が手動Python。再現性なし

## 変更内容

### 1. スコアファイル v3 新設
**`data/experiments/llm-feature-scores-v3.json`**

各結果に追加:
- `text`: 評価に使ったテキスト（~3000字）
- `totalEpisodes`: エピソード数
- `evalMeta`: `{ episodeUsed, textLength, isStoryContent, contentFilter, evaluatedAt }`

不要フィールド削除: `tier`（常に空）、`inputTokens/outputTokens`（常に0）

### 2. `scripts/llm-eval-local.ts` に非物語コンテンツフィルタ追加
`isCharacterSheet(title, bodyText)` 関数:
- タイトルに「登場人物」「キャラクター」「設定」等 → 検出
- 本文先頭1000字に■●▼が4個以上 → 検出
- 「名前：」「年齢：」「種族：」等のプロフィール書式が3個以上 → 検出

検出時はep0002にフォールバック。ep0002もダメなら除外。
キューにtotalEpisodes, episodeUsed, isStoryContent, contentFilterを追加。

### 3. `scripts/save-llm-scores.ts` をv3対応
- text, evalMeta, totalEpisodesをキューから取得して保存
- 出力先を `llm-feature-scores-v3.json` に変更

### 4. `scripts/llm-eval-analysis.ts` 新規作成
再現可能な精度分析スクリプト。出力:
- 全体Spearman相関（gp vs pull/hook/total）
- GPティア別 pull平均
- ジャンル別相関
- コンテンツフィルタ統計（pass/fallback/charsheet）
- isStoryContent別の相関比較

### 5. 既存データ移行 `scripts/migrate-llm-scores-v3.ts`
- v2-full.json の604作品をv3形式に変換
- `data/crawled/{ncode}/ep0001.json` からテキストをバックフィル
- キャラ一覧検出の作品は `isStoryContent: false` でフラグ付け
- テキスト取得不可の作品は `contentFilter: "unavailable"` 

## 実装順序
1. `scripts/migrate-llm-scores-v3.ts` — 既存データ移行
2. `scripts/llm-eval-local.ts` — フィルタ追加 + キュー拡張
3. `scripts/save-llm-scores.ts` — v3形式で保存
4. `scripts/llm-eval-analysis.ts` — 分析スクリプト
5. 移行実行 → 分析実行で検証

## 対象ファイル
- 新規: `scripts/migrate-llm-scores-v3.ts`, `scripts/llm-eval-analysis.ts`
- 修正: `scripts/llm-eval-local.ts`, `scripts/save-llm-scores.ts`
- 読取: `data/experiments/llm-feature-scores-v2-full.json`, `data/experiments/full-feature-extraction.json`

## 検証
`npx tsx scripts/migrate-llm-scores-v3.ts` → `npx tsx scripts/llm-eval-analysis.ts` で相関値がv2より改善（isStoryContent=falseの除外効果）を確認
