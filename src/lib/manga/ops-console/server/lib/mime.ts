/**
 * 静的配信用の MIME マップ
 *
 * 旧 serve-name.ts / serve-revision.ts に重複していた MIME table を集約。
 * 不明な拡張子は呼び出し側で application/octet-stream にフォールバックする。
 */
export const MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
};
