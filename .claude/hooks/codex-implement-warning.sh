#!/bin/bash
# codex-implement-warning.sh
# AINARO ローカル限定 PreToolUse(Edit|Write) フック
# src/ または scripts/ 配下のファイルを Claude 直接編集しようとしたとき、
# 「Codex で実装することを推奨」と警告する（exit 0、ブロックはしない）。
#
# 適用範囲:
#   src/** または scripts/** に該当する file_path のみ
# 除外:
#   docs/**, content/**, data/**, *.md, *.json（拡張子で素朴に除外）
#   その他 (test, supabase, public, .vscode, MEMORY.md, CLAUDE.md など) は対象外

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# file_path が無い（無関係なツール呼び出し）ならスキップ
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

PROJECT_ROOT="/Users/hikarumori/Developer/AINARO"

# AINARO 配下でなければスキップ（worktree 等で別 root の場合の安全装置）
case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) ;;
  *) exit 0 ;;
esac

# プロジェクト相対パス
REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"

# 拡張子による除外（*.md, *.json は警告対象外）
case "$REL_PATH" in
  *.md|*.json) exit 0 ;;
esac

# src/ または scripts/ 配下のみ警告対象
case "$REL_PATH" in
  src/*|scripts/*) ;;
  *) exit 0 ;;
esac

cat >&2 <<'MSG'
[Codex 実装フロー推奨] AINARO の src/ または scripts/ 配下のファイルです。

  推奨フロー:
    1. 設計・要件整理は Claude Code（Plan モード or 通常会話）で固める
    2. 実装は Codex に投げる（mcp__codex__codex MCP または codex CLI）
    3. Codex 出力を Claude が /code-review でレビュー
    4. レビュー証跡を残してから git commit

  直接編集する場合も、設計→実装→レビューの流れを意識してください。
  小さな修正・タイポ・型合わせ程度なら直接編集で OK です。
MSG

exit 0
