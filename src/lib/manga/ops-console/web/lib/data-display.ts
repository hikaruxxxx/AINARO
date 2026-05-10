import type { JobEvent } from "./api";

export type AnyRecord = Record<string, unknown>;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function jsonHtml(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

export function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const obj = asRecord(value);
  for (const key of ["description", "summary", "text", "name", "title", "label"]) {
    const found = obj[key];
    if (typeof found === "string" && found.trim()) return found;
  }
  return JSON.stringify(value, null, 2);
}

export function asList(value: unknown): string {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  if (items.length === 0) return `<div class="nc-empty">項目がありません。</div>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(asText(item))}</li>`).join("")}</ul>`;
}

export function asKeyValueTable(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return `<div class="nc-empty">項目がありません。</div>`;
  return `<dl class="nc-kv">${entries.map(([key, value]) => `
    <div class="nc-kv__row">
      <dt>${escapeHtml(key)}</dt>
      <dd>${typeof value === "object" && value !== null ? `<pre class="nc-code-block">${jsonHtml(value)}</pre>` : escapeHtml(asText(value))}</dd>
    </div>`).join("")}</dl>`;
}

export function detailsRaw(label: string, value: unknown): string {
  return `<details class="nc-raw-details">
    <summary>${escapeHtml(label)}</summary>
    <pre class="nc-code-block">${jsonHtml(value)}</pre>
  </details>`;
}

export function extractL09FailedPages(events: JobEvent[]): number[] {
  const pages = new Set<number>();
  for (const event of events) {
    // FAIL pXX: の行から失敗ページ番号を集める。
    const match = event.channel === "stdout" ? event.line.match(/^\[L09\] FAIL p(\d+):/) : null;
    if (match) pages.add(Number(match[1]));
  }
  return Array.from(pages).sort((a, b) => a - b);
}
