# Claude × デザインツール自動化リサーチ（2026-05時点）

調査日: 2026-05-04
調査対象: Claudeを介したPhotoshop等デザインツール自動化の現状と、AINARO横読み漫画パイプラインへの適用可否

---

## 1. 現状サマリ（直近1〜2ヶ月で公式統合が出揃った）

- **2026-04-17**: Anthropic Labs が **Claude Design** をローンチ（Opus 4.7 vision駆動、Figma競合）
- **2026-04-28**: Anthropic が **MCP基盤の公式クリエイティブコネクタ9種** を一斉リリース
- **2026-02〜**: Figma が公式MCPサーバーを公開、Claude Code と双方向連携
- 「ClaudeがデザインツールをPoCで動かす」段階は終わり、**実運用フェーズ**に入った

## 2. 公式コネクタ一覧（2026-04-28）

| コネクタ | 操作対象 | 主な機能 |
|---|---|---|
| **Adobe for Creativity** | Photoshop / Lightroom / Illustrator / Premiere / InDesign / Firefly / Express / Stock | 50+ Pro tools。ポートレート補正・縦横変換などをマルチステップ自動実行 |
| **Blender** | Blender 4.2+ | Python APIへの自然言語UI。シーン解析・スクリプト生成 |
| **Affinity by Canva** | Affinity Designer / Photo | バッチ補正・レイヤーリネーム・書き出し量産 |
| その他 | Autodesk Fusion / Ableton / Splice / Resolume / SketchUp | 3D CAD・DAW・VJ・建築 |

**Launch時点での未実装スキル**: Illustrator（ベクター作画）, InDesign（組版）の専用スキル

## 3. Claude Design（2026-04-17）

- プロンプト → プロトタイプ / スライド / モックアップ生成、対話で改善
- オンボーディング時にコードベース＋デザインファイルを読み**デザインシステムを自動構築**
- Canva / PDF / PPTX / HTML エクスポート、Claude Code への handoff バンドル
- 発表3日前に Anthropic CPO が Figma 取締役を辞任、当日に Figma 株 -7%

## 4. Max契約での利用条件

| 必要なもの | 状態 |
|---|---|
| Claude Max | ✅ 契約済み（Cowork/プラグイン要件をクリア） |
| Adobe ID（無料可） | 別途必要（無料IDで全6スキル＋セッション継続が解放） |
| Adobe CC契約 | 別途必要（Photoshop単体プラン¥3,280/月〜） |

→ **Max + Adobe CC の二重契約**でAdobe for Creativity利用可能。Maxだけでは足りない。

## 5. 漫画パイプラインで効く工程

横読み白黒漫画パイプライン（`docs/plans/manga/_archive/pipeline-v1-2026-05-02.md`）での適用可否:

| 工程 | 自動化可否 | 実用度 | 備考 |
|---|---|---|---|
| **トーン貼り（screentone）** | ◎ | 高 | グレー領域→ドット/線トーンの一括変換 |
| **明度・コントラスト補正** | ◎ | 高 | Lightroom/PS Retouchスキル既存 |
| **2値化・線画化** | ◎ | 高 | gpt-image-2のグレー出力→白黒漫画化 |
| **ページ書き出し（B6判 / KDP仕様）** | ◎ | 高 | Batch Edit Photosスキルで規格出力一括 |
| **吹き出し配置** | △ | 中 | テキストレイヤー＋楕円シェイプの量産は可、ベクタ整形は弱い |
| **レイヤーリネーム・命名規約整備** | ◎ | 中 | Affinity by Canva連携の方が軽い |
| **セリフ組版（縦書き・ルビ）** | ✕ | 低 | InDesignスキル未実装。手作業 or Codex経由 |
| **コマ割り（パネル分割）** | ✕ | 低 | Layer 1.4 Page Direction側で完結させる |
| **効果線** | ✕ | 低 | CSPで継続 |

## 6. コミュニティ／非公式MCP（参考）

- **alisaitteke/photoshop-mcp** — Photoshop制御MCP（50+ tools）
- **loonghao/photoshop-python-api-mcp-server** — Photoshop Python API ラッパー
- **mikechambers/adb-mcp** — Adobe元社員のPoC
- Adobe Express公式のローカル開発用MCPサーバー

## 7. 注意点・限界

- **Photoshopは UXP/サンドボックス制約**があり、Computer Use的な画面操作ではなくAPI/プラグイン経由が主流
- **Claude Code単体では通常PSD編集不可**（コネクタ or Claude Desktop が必要）
- 価格層によるアクセス差はAnthropic側未明示
- Affinity連携は「量産系の単純作業」が中心、クリエイティブ判断はまだ人間
- ChatGPT Pro定額路線（image_gen）と**コスト二重化**になる点は要判断

## 8. 推奨ロードマップ（AINARO漫画パイプライン）

1. **MVP段階**: Codex CLI image_gen（ChatGPT Pro定額枠内）で生成、API課金ゼロを維持
2. **後処理の試行**: まず **Affinity by Canva コネクタ**（Maxで即利用可、Adobe CCより低コスト）でバッチ書き出し・リネームから検証
3. **品質ボトルネック発生時**: Photoshop単体プラン契約 → Adobe for Creativity 接続でトーン/補正/2値化を自動化
4. **縦組み・効果線・最終仕上げ**: Clip Studio Paint or 手作業を継続

**結論**: Adobe for Creativityコネクタは Phase A 3作品検証の「仕上げ・量産工程」を自動化する現実的な選択肢。ただし最終組版までは完結せず、**Codex生成 → Adobe後処理 → CSPで仕上げ**のハイブリッド構成が現時点の最適解。

## 参考リンク

- [Adobe for creativity blog (Adobe, 2026-04-28)](https://blog.adobe.com/en/publish/2026/04/28/adobe-for-creativity-connector)
- [Adobe for Creativity — Getting started (Adobe Developer)](https://developer.adobe.com/adobe-for-creativity/getting-started/)
- [Adobe for Creativity FAQ & support](https://developer.adobe.com/adobe-for-creativity/support/)
- [Claude for Creative Work (Anthropic)](https://www.anthropic.com/news/claude-for-creative-work)
- [Introducing Claude Design by Anthropic Labs](https://www.anthropic.com/news/claude-design-anthropic-labs)
- [Claude Connectors for Creative Tools: All 9 Explained (2026)](https://www.buildfastwithai.com/blogs/claude-connectors-creative-tools-2026)
- [Anthropic launches Claude Design (TechCrunch)](https://techcrunch.com/2026/04/17/anthropic-launches-claude-design-a-new-product-for-creating-quick-visuals/)
- [Claude AI Can Orchestrate Creative Workflows Across Adobe Apps (PetaPixel)](https://petapixel.com/2026/04/28/claude-ai-can-orchestrate-creative-workflows-across-adobe-apps/)
- [From Claude Code to Figma (Figma Blog)](https://www.figma.com/blog/introducing-claude-code-to-figma/)
- [Guide to the Figma MCP server (Figma Help)](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [alisaitteke/photoshop-mcp (GitHub)](https://github.com/alisaitteke/photoshop-mcp)
- [loonghao/photoshop-python-api-mcp-server (GitHub)](https://github.com/loonghao/photoshop-python-api-mcp-server)
- [mikechambers/adb-mcp (GitHub)](https://github.com/mikechambers/adb-mcp)
