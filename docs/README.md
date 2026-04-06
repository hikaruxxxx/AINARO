# Novelis 計画ドキュメント一覧

## ドキュメント構成

### プロダクト哲学（最上位）
- **[product_philosophy.md](product_philosophy.md)** — プロダクト哲学。「読者にとっての面白さを最大化する」。すべてのプロダクト判断の最上位原則。事業計画・技術仕様・運用ルールはこの文書に従属する

### 現行計画（実行中）
- **[platform_strategy_v4.md](platform_strategy_v4.md)** — 事業計画 v4（最新・採用版）。1人開発・VCなし・自社AI制作→プラットフォーム化。90%還元モデル。コスト非対称性・競争戦略を追加
- **[engagement_strategy.md](engagement_strategy.md)** — エンゲージメント・マネタイズ戦略。「面白さが実証されるまで課金しない」。ポイント経済圏・時限解放・A/Bテスト・コンテンツ選別ファネルの段階的導入設計
- **[web_specification.md](web_specification.md)** — Web設計仕様書。Phase 0-1 MVPの技術仕様・DB設計・ページ設計・API設計

### AI生成アーキテクチャ
- **[generation_guidelines.md](generation_guidelines.md)** — 生成ガイドライン（実務指示書）。/generate, /seed, /batch が参照する、タイトル・あらすじ・本文・キーワード・ジャンル・品質ゲートの具体的な設計ルール
- **[ai_pipeline_design.md](ai_pipeline_design.md)** — 運用設計書（上位文書）。生成→品質管理→配信→計測→改善の全サイクル
- **[ai_generation_architecture.md](ai_generation_architecture.md)** — Phase 0 生成アーキテクチャ。Markdown + Claude、月100話規模
- **[generation_architecture_v2.md](generation_architecture_v2.md)** — Phase 2 生成アーキテクチャ。AIプロット自動生成、月5,000-10,000話規模

### 品質予測・データ分析
- **[quality_prediction_analysis.md](quality_prediction_analysis.md)** — 品質予測モデル分析レポート。なろう3,793作品のあらすじ+264作品の本文LLM評価に基づく、gP予測モデル・ジャンル別成功パターン・AI生成への適用指針

### 市場分析
- **[competitor_revenue_analysis.md](competitor_revenue_analysis.md)** — 競合4社（アルファポリス・カクヨム・なろう・エブリスタ）の収益モデル推定

### 財務モデル
- **[platform_pl_model.xlsx](platform_pl_model.xlsx)** — P&Lモデル（組織拡大版）。8→20名体制を想定した月次損益シミュレーション

## 計画の進化の経緯

```
v1 → v2（エコシステム戦略）→ v3 → v4（現行計画）と方針転換。
v1・v2・v3は整理済み（v4に集約）。

v4 (platform_strategy_v4.md) ← 現行計画
  自社AI制作メディアとして開始、VCなし、月60万バーンレート
  コスト非対称性と競争戦略を明確化
  プラットフォーム化は実績ができてから（Phase 2以降のオプション）
```
