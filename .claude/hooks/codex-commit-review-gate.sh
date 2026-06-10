#!/bin/bash
# codex-commit-review-gate.sh
# AINARO ローカル限定 PreToolUse(Bash) フック
# git commit を検知したとき、レビュー証跡が無ければブロックする（exit 2）。
#
# 通過条件（いずれか満たせば pass）:
#   1. /tmp/claude-code-review-passed の中身が現在の HEAD SHA と一致
#      （既存の /code-review グローバル hook と互換）
#   2. /tmp/ainaro-codex-reviewed-<HEAD_SHA> マーカーが存在
#      （Codex 実装→Claude レビュー完了の合図、AINARO 専用）
#   3. ステージ済み diff が src/ または scripts/ を含まない
#      （docs/ や content/ だけのコミット、設定ファイルのみのコミットは素通し）
#   4. コミットメッセージ（-m / -F）に "Co-Authored-By: Claude" が含まれる
#      （Claude がレビュー修正をコミットしている証跡）
#   5. コミットメッセージに "[skip-review]" が含まれる（人間判断の明示的バイパス）
#
# 注意:
#   このフックは AINARO ローカル settings.json でのみ有効。
#   グローバル pre-push-review-gate.sh は push 前ゲートとして別途動く。

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# git commit を含むコマンドのみ対象（git commit, git commit -m, git commit -am 等）
# git log や git commit-tree 等の誤検出を避けるため、語境界で判定
if ! echo "$CMD" | grep -qE '(^|[[:space:]]|;|&&|\|\|)git[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

# AINARO リポジトリの commit でなければ素通し
PROJECT_ROOT="/Users/hikarumori/Developer/AINARO"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ "$REPO_ROOT" != "$PROJECT_ROOT" ]; then
  exit 0
fi

HEAD_SHA=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null)

# 判定 1: グローバル /code-review マーカー
GLOBAL_MARKER="/tmp/claude-code-review-passed"
if [ -f "$GLOBAL_MARKER" ] && [ -n "$HEAD_SHA" ] && [ "$(cat "$GLOBAL_MARKER" 2>/dev/null)" = "$HEAD_SHA" ]; then
  exit 0
fi

# 判定 2: AINARO 専用 Codex レビュー済みマーカー
if [ -n "$HEAD_SHA" ] && [ -f "/tmp/ainaro-codex-reviewed-${HEAD_SHA}" ]; then
  exit 0
fi

# 判定 3: ステージ済み diff が src/ も scripts/ も含まないなら素通し
# （docs/ や content/ や設定ファイルだけのコミット等）
STAGED_FILES=$(git -C "$PROJECT_ROOT" diff --cached --name-only 2>/dev/null)
if [ -n "$STAGED_FILES" ]; then
  if ! echo "$STAGED_FILES" | grep -qE '^(src|scripts)/'; then
    exit 0
  fi
fi

# 判定 4 & 5: コマンド文字列にマーカーが含まれているかを直接判定
# （-m インライン引数・HEREDOC・-F file の中身 すべてカバー）
# このフックは git commit 検出後にしか到達しないので、
# CMD 全体を grep してもコミット以外の誤マッチは起きない。

# -F file 経由のメッセージファイル中身も連結して見る
F_FILE=$(echo "$CMD" | grep -oE -- '-F[[:space:]]+[^[:space:]]+' | awk '{print $2}')
COMBINED="$CMD"
if [ -n "$F_FILE" ] && [ -f "$F_FILE" ]; then
  COMBINED="${COMBINED}
$(cat "$F_FILE")"
fi

# 判定 4: Co-Authored-By: Claude
if echo "$COMBINED" | grep -q "Co-Authored-By: Claude"; then
  exit 0
fi
# 判定 5: 明示的バイパス
if echo "$COMBINED" | grep -qF '[skip-review]'; then
  exit 0
fi

# どの条件にも合致しない場合はブロック
cat >&2 <<'MSG'
[AINARO レビューゲート] src/ または scripts/ への変更を含むコミットです。
レビュー証跡が見つからないためブロックしました。

  通過させる方法（いずれか 1 つ）:
    1. /code-review を実行してマーカー /tmp/claude-code-review-passed を更新
       （HEAD SHA を中身に持つ形式）
    2. Codex 実装→Claude レビュー完了後、以下を実行:
         echo ok > /tmp/ainaro-codex-reviewed-$(git rev-parse HEAD)
    3. 設計フローを意図的に省略する場合はコミットメッセージに [skip-review] を含める
    4. Claude が修正コミットを作る場合は Co-Authored-By: Claude をメッセージに含める

  docs/ や content/ だけのコミットなら自動で素通ししています。
MSG

exit 2
