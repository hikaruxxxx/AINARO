# 漫画作品インデックス

横読み白黒漫画の生成成果物。slug ごとにディレクトリを作る。

## 現在の作品

| slug | タイトル候補 | ジャンル | 状態 |
|---|---|---|---|
| `modern-dungeon-salaryman` | 現代ダンジョン×サラリーマン | A. 現代ダンジョン | ストーリーボード ep001 完成 |

## ディレクトリ構造（per-work）

```
content/manga/{slug}/
├── bible/                # キャラ・世界観バイブル（L1.2の出力）
├── ep{NNN}/
│   ├── shotlist.json     # L1.1 ショットリスト
│   ├── storyboard.md     # L2 ストーリーボード（人間可読）
│   ├── storyboard.json   # L2 ストーリーボード（機械可読）
│   ├── panels/           # L3 パネル画像
│   └── pages/            # L4/L5 ページ画像
└── _meta.json            # 作品メタ
```

## 関連

- 戦略: `project_horizontal_manga_pivot.md`、`project_kdp_strategy.md`
- 並行3作品: `project_genre_3parallel.md`（ダンジョン探索 / 転生貴族領地経営 / 現代ダンジョン）
- SSoT: `docs/plans/manga/_archive/pipeline-v1-2026-05-02.md`
- パイプライン: `docs/architecture/manga_pipeline.md`
- 作法: `docs/strategy/manga_craft_guide.md`
- スクリプト: `scripts/manga/README.md`
- データ: `data/manga/README.md`
- ビューア: `src/app/[locale]/manga/[slug]/[episodeNum]/page.tsx`
