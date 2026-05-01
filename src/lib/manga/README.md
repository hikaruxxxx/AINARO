# src/lib/manga/ ライブラリ構造

横読み白黒漫画パイプラインの本流ロジック。
SSoT: `~/.claude/plans/codex-swift-kettle.md`

## ディレクトリ構成

```
src/lib/manga/
├── types.ts                # 共通型定義
├── schemas.ts              # Zod スキーマ
│
├── shotlist/               # L1.1 ショット計画
│   ├── shot-planner.ts
│   ├── scene-splitter.ts
│   └── rhythm-curve.ts
│
├── bible/                  # L1.2 キャラ・世界観バイブル
│   ├── character-builder.ts
│   ├── character-graph.ts
│   ├── character-images.ts
│   ├── costume-timeline.ts
│   ├── location-builder.ts
│   ├── props-tracker.ts
│   ├── source-loader.ts
│   └── style-sheet.ts
│
├── page-director/          # L1.4 ページ割り（PagePlan IR + 16テンプレ）
│   ├── index.ts
│   ├── types.ts
│   ├── page-mapper.ts
│   ├── template-selector.ts
│   ├── layout-templates.ts
│   └── validator.ts
│   詳細: project_manga_l14_page_direction.md
│
├── storyboard/             # L2 ストーリーボード
│   ├── storyboard-builder.ts
│   ├── storyboard-renderer.ts
│   ├── plot-extractor.ts
│   └── genre-presets.ts
│
├── render/                 # L3 パネル画像レンダ
│   ├── adapter.ts          # RenderAdapter 抽象化
│   └── panel-composite.ts
│
├── bubble/                 # 吹き出し配置
│   ├── placer.ts
│   └── svg-overlay.ts
│
├── generate/               # 生成オーケストレーション
│   ├── orchestrator.ts
│   └── prompt-composer.ts
│
└── llm/                    # LLM 抽象化
    └── codex-text.ts       # Codex CLI 経由 (project_chatgpt_pro_image_gen.md)
```

## レイヤと呼び出し関係

```
shotlist/  →  bible/  →  page-director/  →  storyboard/  →  render/ + bubble/
                              ↑                                      ↓
                          generate/orchestrator.ts ────────────  RenderAdapter
                                  ↑
                              llm/codex-text.ts
```

## 関連

- スクリプト: `scripts/manga/README.md`
- 設計: `docs/architecture/manga_pipeline.md`
- 作法: `docs/strategy/manga_craft_guide.md`
- データ: `data/manga/README.md`
- ビューア: `src/app/[locale]/manga/[slug]/[episodeNum]/page.tsx`
