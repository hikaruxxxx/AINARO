# AI開発アシスタント運用方針（Claude Code × Codex）

最終更新: 2026-05-05

## 基本スタンス

**設計・リサーチ・レビューは Claude、コード実装は Codex** の三段リレーを基本とする。
Claude がエージェントループの主導権を持ち、Codex は「コードを書く専用の手」として呼び出す。

- 設計 → Claude Code（MEMORY とサブエージェント資産が効くレイヤー）
- 実装 → Codex（`mcp__codex__codex` MCP / codex CLI / Codex デスクトップ）
- レビュー → Claude Code（`/code-review` で Codex 出力を必ず通す）
- コミット → AINARO ローカル hook がレビュー証跡を要求（`.claude/hooks/codex-commit-review-gate.sh`）

理由: Codex はデザインシステム系コードと型パズルに引き出しが多く、Claude は会話の継続性・チェックリスト遵守・実画面確認（chrome-devtools MCP）に強い。各々の得意領域に役割を寄せる。

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

- 設計・要件整理・アーキテクチャ判断
- Codex 出力のコードレビュー（`/code-review`）
- `.claude/commands/` のサブエージェント群（screen-mass, auto-pipeline, batch, expand-logline, generate-plot, pairwise-judge 等）の実行
- `content/works/` への大量書き込み（生成パイプラインの実行）
- `MEMORY.md` の蓄積コンテキストが効く判断作業
- UI 実装の最終調整（chrome-devtools MCP で目視確認しながら反復）
- ドキュメント・MEMORY・CLAUDE.md の編集

### Codex デスクトップ（クラウドサンドボックス）が担当する領域

- AINARO 本体から切り離せる小機能の PR 量産
- 別リポでの実験
- 並列に投げたい雑タスク
- 「ローカルリソースを食わせたくない大量並列処理」

### Codex MCP（`mcp__codex__codex`）の用途

Claude Code の会話内から GPT-5 系を呼び、**実装の主担当**として使う。エージェントループは Claude 側に残したまま、コードを書く工程を Codex に寄せる。

- src/ scripts/ 配下の機能実装（コンポーネント、ユーティリティ、スクリプト）
- 型パズル・最適化系の難問
- デザインシステム系コードの生成
- `codex-reply` で対話継続して反復

ビルド・テスト実行・実画面確認・最終的なファイル書き込み統合は Claude 側で行うことが多い。Codex 出力を Claude がそのまま採用するのではなく、`/code-review` を必ず通す。

## 「Codex は UX 強い」の正しい理解

**半分本当、半分誤解**:

- 本当: GPT-5 は Tailwind / shadcn-ui / Radix 等のデザインシステム系コードの引き出しが豊富、凝った CSS は得意
- 誤解: Claude Sonnet/Opus 4.x も UI コード生成は同等以上。最近のベンチでは逆転している
- 本質: 「UXが強い」≠「ビジュアル判断ができる」。どちらもテキストでコードを吐くだけ
- **本当に UX を上げるのは「画面を見て直す反復」**。これは `mcp__chrome-devtools__*`（navigate / screenshot / evaluate）を持つ Claude Code の方が強い。Codex MCP には目がない

## 実用的な使い分けマトリクス

| タスク | 推奨ツール |
|---|---|
| src/ scripts/ の新規実装 | Codex（実装）→ Claude（レビュー） |
| UI コンポーネント実装 | Codex で書かせる → Claude が chrome-devtools で確認・調整 |
| デザインシステムの初期スキャフォールド | Codex MCP |
| アルゴリズム・型パズル・最適化 | Codex MCP |
| 生成パイプラインの設計判断 | Claude Code（MEMORY 必須） |
| サブエージェントの実行（auto-pipeline 等） | Claude Code |
| ドキュメント・戦略の更新 | Claude Code |
| 独立した小機能の並列 PR 量産 | Codex デスクトップ（クラウド並列） |
| 既存コードのリファクタ | Codex（実装）→ Claude（レビュー） |
| バグ修正（数行レベル） | Claude 直接編集 OK |

## 標準フロー: 設計 → Codex 実装 → Claude レビュー

1. **設計（Claude）**: 要件・I/O・型・関連ファイルを Plan モードまたは通常会話で固める
2. **実装依頼（Claude → Codex）**: `mcp__codex__codex` で「このファイルにこういう関数を実装して」と仕様を渡す
3. **コード受領**: Codex 出力を Claude が src/ または scripts/ に統合（Edit/Write、AINARO ローカル hook が警告を出すが進行可）
4. **レビュー（Claude）**: `/code-review` を実行。`/tmp/claude-code-review-passed` に HEAD SHA が書かれる
5. **コミット**: AINARO ローカル `codex-commit-review-gate.sh` がレビュー証跡を確認して通す
6. **UI タスクの場合**: コミット前後に `mcp__chrome-devtools__navigate` / `screenshot` で実画面確認、ズレていれば 2-5 を反復

### Codex 実装→Claude レビュー完了の手動マーキング（`/code-review` を使わない場合）

```bash
echo ok > /tmp/ainaro-codex-reviewed-$(git rev-parse HEAD)
```

このマーカーがあれば、AINARO の commit ゲートは通過する。

## やってはいけないこと

- 同じディレクトリで Claude Code と Codex を同時稼働（worktree 必須）
- AINARO 中核作業を Codex デスクトップへ移管（MEMORY/サブエージェント資産が活きない）
- Codex MCP に「自走してPRまで」を期待する（エージェントループは Claude 側）
- Codex 出力をレビュー無しでコミット（hook がブロックする。バイパスする場合も品質責任は人間に残る）
- 「設計を Codex に任せる」運用（Codex は MEMORY を持たないため AINARO の文脈判断ができない。設計は Claude 側）
