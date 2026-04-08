# Novelis 計画ドキュメント一覧

## ディレクトリ構成

```
docs/
├ strategy/      事業計画・哲学・市場戦略
├ architecture/  技術仕様・生成パイプライン設計
└ platform_pl_model.xlsx  P&Lモデル
```

## strategy/ — 事業計画・哲学

- **[product_philosophy.md](strategy/product_philosophy.md)** — プロダクト哲学。「読者にとっての面白さを最大化する」。すべての判断の最上位原則
- **[platform_strategy_v4.md](strategy/platform_strategy_v4.md)** — 事業計画 v4（現行）。1人開発・VCなし・自社AI制作→プラットフォーム化。90%還元モデル
- **[engagement_strategy.md](strategy/engagement_strategy.md)** — エンゲージメント・マネタイズ戦略。ポイント経済圏・時限解放・A/Bテスト
- **[competitor_revenue_analysis.md](strategy/competitor_revenue_analysis.md)** — 競合4社（アルファポリス・カクヨム・なろう・エブリスタ）の収益モデル推定

## architecture/ — 技術設計

- **[web_specification.md](architecture/web_specification.md)** — Web設計仕様書。Phase 0-1 MVPの技術仕様・DB・ページ・API
- **[ai_pipeline_design.md](architecture/ai_pipeline_design.md)** — 運用設計書。生成→品質管理→配信→計測→改善の全サイクル
- **[ai_generation_architecture.md](architecture/ai_generation_architecture.md)** — Phase 0 生成アーキテクチャ。Markdown + Claude、月100話規模
- **[generation_architecture_v2.md](architecture/generation_architecture_v2.md)** — Phase 2 生成アーキテクチャ。AIプロット自動生成、月5,000-10,000話規模
- **[generation_pipeline_management.md](architecture/generation_pipeline_management.md)** — 生成パイプライン状態管理・ディレクトリ構造・索引ルール
- **[self_reinforcing_loop.md](architecture/self_reinforcing_loop.md)** — 自己強化ループ設計（生成 ↔ 評価 ↔ 予測）

## 財務モデル

- **[platform_pl_model.xlsx](platform_pl_model.xlsx)** — 月次損益シミュレーション

## 計画の進化

```
v1 → v2（エコシステム）→ v3 → v4（現行・採用版）
v4: 自社AI制作メディアとして開始、VCなし、月60万バーンレート
    プラットフォーム化は実績後（Phase 2以降のオプション）
```
