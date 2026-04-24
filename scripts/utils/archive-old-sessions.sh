#!/bin/bash
# Claude Codeセッション履歴の自動アーカイブ
# 7日経過した .jsonl を gzip 圧縮して .archive/YYYY-MM/ に退避
# 削除はしない。完全保管。
# 保護: *.keep.jsonl はスキップ（手動でリネームすると退避対象外）

set -euo pipefail

PROJECT_DIR="$HOME/.claude/projects/-Users-hikarumori-Developer-AINARO"
ARCHIVE_ROOT="$PROJECT_DIR/.archive"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
LOG_FILE="${LOG_FILE:-$HOME/Developer/AINARO/data/archive-sessions/archive.log}"

mkdir -p -- "$(dirname "$LOG_FILE")"
mkdir -p -- "$ARCHIVE_ROOT"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== START archive-old-sessions (retention=${RETENTION_DAYS}d) ==="

if [ ! -d "$PROJECT_DIR" ]; then
  log "ERROR: project dir not found: $PROJECT_DIR"
  exit 1
fi

ARCHIVED=0
SKIPPED=0
FAILED=0

# 7日以上経過した .jsonl を処理
while IFS= read -r -d '' file; do
  base=$(basename -- "$file")

  # *.keep.jsonl はスキップ（手動保護用）
  if [[ "$base" == *.keep.jsonl ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # mtime から YYYY-MM を取り出してサブディレクトリ作成
  ym=$(stat -f '%Sm' -t '%Y-%m' -- "$file")
  dest_dir="$ARCHIVE_ROOT/$ym"
  mkdir -p -- "$dest_dir"

  dest="$dest_dir/${base}.gz"
  tmp="${dest}.tmp.$$"

  # gzip → 一時ファイル → アトミック rename → 元ファイル削除
  if gzip -c -- "$file" > "$tmp" 2>>"$LOG_FILE"; then
    mv -- "$tmp" "$dest"
    rm -- "$file"
    ARCHIVED=$((ARCHIVED + 1))
  else
    rm -f -- "$tmp" 2>/dev/null || true
    FAILED=$((FAILED + 1))
    log "FAILED to archive: $file"
  fi
done < <(find "$PROJECT_DIR" -maxdepth 1 -name '*.jsonl' -mtime +"${RETENTION_DAYS}" -print0)

log "=== DONE archived=${ARCHIVED} skipped=${SKIPPED} failed=${FAILED} ==="

# サマリー
ACTIVE_COUNT=$(find "$PROJECT_DIR" -maxdepth 1 -name '*.jsonl' 2>/dev/null | wc -l | tr -d ' ')
ARCHIVE_SIZE=$(du -sh -- "$ARCHIVE_ROOT" 2>/dev/null | awk '{print $1}')
ACTIVE_SIZE=$(find "$PROJECT_DIR" -maxdepth 1 -name '*.jsonl' -exec du -k {} + 2>/dev/null | awk '{sum+=$1} END {if (sum>1024) printf "%.1fM\n", sum/1024; else print sum"K"}')
log "Active: ${ACTIVE_COUNT} sessions (${ACTIVE_SIZE}) | Archive: ${ARCHIVE_SIZE}"
