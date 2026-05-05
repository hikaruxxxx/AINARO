# Plans 索引

実装計画書 (Plan) のリポジトリ内 SSoT。
2026-05-05 に `~/.claude/plans/` から repo へ移転（コードネーム命名から意味のあるファイル名へ rename）。

## 階層

```
docs/plans/
├── manga/      ← 漫画パイプライン (横読み白黒 B6 KDP+KU)
│   └── _archive/
├── novel/      ← 小説生成・評価系
└── platform/   ← Web プラットフォーム機能
```

## 漫画 (`manga/`)

| ファイル | 内容 | Status |
|---|---|---|
| [strategy.md](manga/strategy.md) | **上位戦略**: 投資配分 (厚く/薄く)・陳腐化耐性 | Active (2026-05-05) |
| [pipeline-v2.md](manga/pipeline-v2.md) | **実装 SSoT**: 12 layer・スキーマ・CLI | Active (2026-05-02) |
| [kdp.md](manga/kdp.md) | KDP/B-1 領域詳細 (Codex レビュー反映版) | Active |
| [name-gate.md](manga/name-gate.md) | L8.5/L8.7/L9 ネーム gate 導入計画 | Draft (2026-05-05) |
| [name-gate-refactor.md](manga/name-gate-refactor.md) | L8.5 Name Preview 後のリファクタ整理 | Active |
| [cover-generation.md](manga/cover-generation.md) | 表紙画像自動生成 | Active |

### Archive (`manga/_archive/`)

| ファイル | 内容 |
|---|---|
| [pipeline-v1-2026-05-02.md](manga/_archive/pipeline-v1-2026-05-02.md) | 旧 SSoT (縦読み + 横読み 17 層、12 layer に圧縮で撤回) |
| [pipeline-vertical-readout.md](manga/_archive/pipeline-vertical-readout.md) | 縦読み漫画パイプライン (横読みピボットで撤回) |

## 小説 (`novel/`)

| ファイル | 内容 |
|---|---|
| [longform-pipeline-v3.md](novel/longform-pipeline-v3.md) | ヘルモード/モブ高生型 長編生成パイプライン v3 |
| [hit-prediction-v9.md](novel/hit-prediction-v9.md) | v9 品質予測モデル 全体設計 |
| [llm-eval-redesign.md](novel/llm-eval-redesign.md) | LLM 評価パイプライン再設計 |
| [self-reinforcing-loop.md](novel/self-reinforcing-loop.md) | 自己強化学習ループ 全自動実装計画 |

## プラットフォーム (`platform/`)

| ファイル | 内容 |
|---|---|
| [i18n.md](platform/i18n.md) | AINARO i18n 対応計画（日本語・英語） |
| [author-submission.md](platform/author-submission.md) | 作家投稿機能 機能設計 |
| [swipe-recommendation.md](platform/swipe-recommendation.md) | TikTok/Tinder 風スワイプレコメンド |
| [quote-rt-diversity.md](platform/quote-rt-diversity.md) | 引用 RT の AI 感低減（パターン拡張＋多様性強制） |

## 運用ルール

- **新規 plan は repo 内 (`docs/plans/<category>/`) に直接書く**。`~/.claude/plans/` は使わない（personal scratch のみ）
- ファイル名は**意味のある英小文字 kebab-case**。Claude harness 自動生成のコードネーム (`codex-*`, `eager-*` 等) でも、repo 入りする際は意味のある名前に rename
- Status は `Draft / Active / Archived` のいずれか、冒頭メタに記載
- Archive 化は `_archive/` へ移動 + 索引から削除（理由を archive 化したファイル冒頭に追記）

## 関連

- アーキ概要: [docs/architecture/manga_pipeline.md](../architecture/manga_pipeline.md), [generation_architecture_v2.md](../architecture/generation_architecture_v2.md)
- 戦略: [docs/strategy/](../strategy/)
