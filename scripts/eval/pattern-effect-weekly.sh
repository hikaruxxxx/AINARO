#!/bin/zsh
# 週次パターン効果比較: launchd から呼び出される
# 出力: data/eval/pattern-effect-YYYYMMDD.log

set -eu

PROJECT_DIR="/Users/hikarumori/Developer/AINARO"
cd "$PROJECT_DIR"

DATE=$(date +%Y%m%d)
LOG_DIR="data/eval"
LOG_FILE="$LOG_DIR/pattern-effect-${DATE}.log"

mkdir -p "$LOG_DIR"

# launchd の PATH は最小限なので明示
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

{
  echo "=== $(date +%Y-%m-%dT%H:%M:%S%z) ==="
  npx tsx scripts/eval/pattern-effect-compare.ts
} > "$LOG_FILE" 2>&1
