# AI開発アシスタント運用方針（Claude Code × Codex）

最終更新: 2026-04-28

## 基本スタンス

**Claude Code をメイン、Codex は補助の2門目の砲台**として使い分ける。
「Claude Code の代わりに Codex」ではなく、「Claude Code から Codex を呼んで併用」または「独立タスクで並列に走らせる」。

## 並列開発の物理レイアウト

同じディレクトリに複数のAIエージェントを同時稼働させると編集衝突する。
git worktree でブランチごとにフォルダを分離する。

```bash
# Claude Code 用は本体ディレクトリのまま
cd /Users/hikarumori/Developer/AINARO

# Codex / 別タスク用に worktree を生やす
git worktree add ../AINARO-codex -b codex/feature-x
```

- `.git` は共有なので push/pull/merge は普通にできる
- 物理的に別ディレクトリなのでファイル編集衝突ゼロ
- 各 worktree で `npm install` は別途必要（node_modules は共有されない）

## ツール選択基準

### Claude Code（ローカル）が担当する領域

- AINARO 本体の中核作業
- 生成パイプライン（`scripts/generation/daemon.ts`、`scripts/eval/`、`scripts/predict/` 等）
- `content/works/` への大量書き込みを伴う作業
- `.claude/commands/` のサブエージェント群（screen-mass, auto-pipeline, batch, expand-logline, generate-plot, pairwise-judge 等）に依存する作業
- `MEMORY.md` の蓄積コンテキストが効く作業
- UI 実装（chrome-devtools MCP で目視確認しながら反復）

### Codex デスクトップ（クラウドサンドボックス）が担当する領域

- AINARO 本体から切り離せる小機能の PR 量産
- 別リポでの実験
- 並列に投げたい雑タスク
- 「ローカルリソースを食わせたくない大量並列処理」

### Codex MCP（`mcp__codex__codex`）の用途

Claude Code の会話内から GPT-5 系を呼ぶ。エージェントループは Claude 側のまま、Codex は「答えを返すだけ」。

- セカンドオピニオン（同じ問題を別系統モデルに投げて比較）
- アルゴリズム・型パズル・最適化系の難問
- デザインシステム系コードの下書き生成
- `codex-reply` で対話継続

ファイル書き込み・ビルド・テスト実行は Claude が担当。Codex デスクトップの「自走してPRまで」は MCP 経由では再現できない。

## 「Codex は UX 強い」の正しい理解

**半分本当、半分誤解**:

- 本当: GPT-5 は Tailwind / shadcn-ui / Radix 等のデザインシステム系コードの引き出しが豊富、凝った CSS は得意
- 誤解: Claude Sonnet/Opus 4.x も UI コード生成は同等以上。最近のベンチでは逆転している
- 本質: 「UXが強い」≠「ビジュアル判断ができる」。どちらもテキストでコードを吐くだけ
- **本当に UX を上げるのは「画面を見て直す反復」**。これは `mcp__chrome-devtools__*`（navigate / screenshot / evaluate）を持つ Claude Code の方が強い。Codex MCP には目がない

## 実用的な使い分けマトリクス

| タスク | 推奨ツール |
|---|---|
| Novelis の UI 実装・調整 | Claude Code（chrome-devtools で目視確認） |
| デザインシステムの初期スキャフォールド | Codex MCP に下書き投げる → Claude で統合 |
| 「もっと洒落た書き方ない？」的な提案 | Codex MCP でセカンドオピニオン |
| アルゴリズム・型パズル・最適化 | Codex MCP に分担 |
| 生成パイプライン（pairwise-judge 等） | Claude Code 一択 |
| 独立した小機能の並列 PR 量産 | Codex デスクトップ（クラウド並列） |
| AINARO 中核の継続作業 | Claude Code（メモリ前提） |

## 標準フロー: Claude Code から Codex を併用する例

UI タスクの場合:

1. Claude Code から `mcp__codex__codex` で GPT-5 に下書きを書かせる
2. Claude Code が `src/` に統合（Edit/Write）
3. `mcp__chrome-devtools__navigate` で実画面を開く
4. `mcp__chrome-devtools__screenshot` で確認
5. ズレていれば修正して 3-4 反復

## やってはいけないこと

- 同じディレクトリで Claude Code と Codex を同時稼働（worktree 必須）
- AINARO 中核作業を Codex デスクトップへ移管（MEMORY/サブエージェント資産が活きない）
- Codex MCP に「自走してPRまで」を期待する（エージェントループは Claude 側）
- Codex を「Claude より UX が強いから」とUI主担当にする（実画面確認の目を持つ Claude の方が反復で勝つ）
