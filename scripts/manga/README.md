# scripts/manga/ 構造

横読み白黒漫画パイプラインのスクリプト群。
SSoT: `~/.claude/plans/codex-swift-kettle.md`

## 本流スクリプト（5層パイプライン）

| 層 | スクリプト | 役割 |
|---|---|---|
| L1.1 | `generate-shotlist.ts` | 原作テキスト → ショットリスト |
| L1.2 | `build-bible.ts` | キャラ/世界観バイブル構築 |
| L1.3 | `build-bible-images.ts` | バイブル参照画像生成 |
| L1.4 | `page-director-smoketest.ts` | ページ割り（page-director, project_manga_l14_page_direction.md） |
| L2 | `generate-storyboard.ts` | ストーリーボード生成 |
| L3 | `generate-panels.ts` | パネル画像生成 |
| L4 | `normalize-pages.ts` | ページ正規化 |
| L5 | `stitch-manual.ts` | ページ合成 |

## 取り込み系

- `ingest-kindle.ts` — Kindle 素材取り込み
- `ingest-manual.ts` — 手動素材取り込み
- `extract-from-video.ts` — 動画素材抽出

## モデル評価ベンチ

- `eval-bench/run-phase-a.ts` — Phase A 評価実行
- `eval-bench/runner-fal.ts` — fal.ai ランナー
- `eval-bench/runner-replicate.ts` — Replicate ランナー

## ユーティリティ

- `_env.ts` — 環境変数ヘルパー

## アーカイブ

- `_archive/feasibility-week0/` — Week 0 Pilot 完了済（2026-05-01）
  - 21ファイル、Pilot 14本 + README + util
  - 完了報告: `project_pilot_complete_2026-05-01.md`
- `_archive/scripts-deprecated/`
  - `ingest-piccoma.ts` — 縦読み時代の試行（feedback_manga_image_ingest.md で撤回済）

## ライブラリ参照

ロジックは `src/lib/manga/` にある:
- `bible/`, `storyboard/`, `page-director/`, `shotlist/`, `render/`, `bubble/`, `generate/`, `llm/`

## 関連

- 設計: `docs/architecture/manga_pipeline.md`
- 作法: `docs/strategy/manga_craft_guide.md`
- データ: `data/manga/README.md`
- 成果物: `content/manga/{slug}/`
