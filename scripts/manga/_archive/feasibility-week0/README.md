# Week 0: Image Feasibility Gate

横読み白黒漫画パイプライン (2026-04-30 ピボット) の Week 0 実験スクリプト群。
gpt-image-2 で日本漫画白黒様式がどこまで再現できるかを実測し、`ModelCapabilityProfile` を確定する。

**実行計画SSoT**: `~/.claude/plans/codex-swift-kettle.md`

## 二段構造

| 段階 | 枚数 | 目的 | 期間 |
|---|---:|---|---|
| **Pilot** | 30枚 | prompt matrix 調整 + 単価/失敗率実測 | Day 1-2 |
| **本実験** | 100枚 | A-F 6実験で能力プロファイル確定 | Day 3-7 |

Pilot 合格基準を超えた場合のみ本実験へ進む。

## Pilot 30枚の構成

| 実験 | 枚数 | 内容 | スクリプト |
|---|---:|---|---|
| style-pilot | 8 | 単一キャラ・標準ポーズで線質/ベタ/AIらしさ確認 | `pilot-style.ts` |
| aspect-pilot | 8 | 4種アスペクト (1024² / 1536×1024 / 1024×1536 / 任意比) | `pilot-aspect.ts` (TBD) |
| consistency-pilot | 8 | 16枚参照の **4枚/8枚/16枚比較**(平均化検証) | `pilot-consistency.ts` (TBD) |
| page-shot-pilot | 3 | F-2 ページ一発生成のデモ映え確認 | `pilot-page-shot.ts` (TBD) |
| panel-composite-pilot | 3 | F-1 コマ単位+SVG合成の試行 | `pilot-panel-composite.ts` (TBD) |

## Pilot 合格基準

- style-pilot: 5/8 以上「使える」
- aspect-pilot: 任意比対応の有無確定
- consistency-pilot: 推奨参照枚数判定
- page-shot-pilot: 1/3 以上「漫画として読める」

## 実行方法

```bash
# Pilot 個別実行
npx tsx scripts/manga/feasibility-week0/pilot-style.ts

# Pilot 全実行 (TBD)
npx tsx scripts/manga/feasibility-week0/pilot-all.ts
```

## データ保存先

- 画像: `data/manga/feasibility-week0/pilot/{experiment}/{idx}.png`
- メタJSON: `data/manga/feasibility-week0/pilot/{experiment}/_meta.json`
- ModelCapabilityProfile (Week 0 完了後): `data/manga/model-capability/gpt-image-2.json`

## 「使える」の定義

- キャラが崩れていない
- 白黒漫画として違和感が少ない
- 重要情報が読める
- 吹き出しを置ける
- 隣のコマと並べても同じ作品に見える

## コスト

ChatGPT Pro 定額枠 (Codex CLI 経由) で実施。API 課金なし。
詳細: `project_chatgpt_pro_image_gen.md`
