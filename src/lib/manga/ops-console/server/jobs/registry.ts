export type LayerId =
  | "L01"
  | "L01b"
  | "L01c"
  | "L02"
  | "L02b"
  | "L09"
  | "L10"
  | "L11"
  | "L12"
  | "L13"
  | "L99"
  | "kdp-dry-run"
  | "scrape-bsr";

export type JobScope = "work" | "episode" | "volume";

export type AllowedFlag = {
  /** flag name (例: "--pages") */
  name: string;
  /** 値の strict regex。boolean flag は空文字のみ許可する。 */
  pattern: RegExp;
  /** path 系 flag は data/manga/ 配下に限定する。 */
  isPath?: boolean;
};

export type LayerRegistryEntry = {
  script: string;
  scope: JobScope;
  allowedFlags: AllowedFlag[];
  timeoutMs: number;
};

// SSoT: scripts/manga/pipeline.ts:LAYER_SCRIPT と
// src/lib/manga/ops-console/server/jobs/registry.ts:LAYER_REGISTRY は
// 同じ script path を持つ。一方を更新したらもう一方も同期すること。
export const LAYER_REGISTRY: Record<LayerId, LayerRegistryEntry> = {
  L01: {
    script: "scripts/manga/layers/L01-bible.ts",
    scope: "work",
    allowedFlags: [
      { name: "--concept", pattern: /^[\w./-]+\.json$/, isPath: true },
      { name: "--art-style", pattern: /^[\w-]+$/ },
    ],
    timeoutMs: 10 * 60 * 1000,
  },
  L01b: {
    script: "scripts/manga/layers/L01b-bible-lint.ts",
    scope: "work",
    allowedFlags: [
      { name: "--skip-llm", pattern: /^$/ },
      { name: "--fail-on-fatal", pattern: /^$/ },
    ],
    timeoutMs: 10 * 60 * 1000,
  },
  L01c: {
    script: "scripts/manga/layers/L01c-bible-deepen.ts",
    scope: "work",
    allowedFlags: [
      { name: "--concept", pattern: /^[\w./-]+\.json$/, isPath: true },
      { name: "--style-ref-note", pattern: /^[\s\S]{1,2000}$/ },
      { name: "--style-ref-note-file", pattern: /^[\w./-]+\.(md|txt)$/, isPath: true },
      { name: "--re-lint", pattern: /^$/ },
    ],
    timeoutMs: 15 * 60 * 1000,
  },
  L02: {
    script: "scripts/manga/layers/L02-bible-images.ts",
    scope: "work",
    allowedFlags: [
      { name: "--only", pattern: /^[a-zA-Z0-9_,\-]+$/ },
      { name: "--kinds", pattern: /^(characters|locations|props)(,(characters|locations|props))*$/ },
      { name: "--concurrency", pattern: /^[1-9][0-9]?$/ },
    ],
    timeoutMs: 60 * 60 * 1000,
  },
  L02b: {
    script: "scripts/manga/layers/L02b-volume-plot.ts",
    scope: "volume",
    allowedFlags: [
      { name: "--concept", pattern: /^[\w./-]+\.json$/, isPath: true },
    ],
    timeoutMs: 10 * 60 * 1000,
  },
  L09: {
    script: "scripts/manga/layers/L09-render.ts",
    scope: "episode",
    allowedFlags: [
      { name: "--pages", pattern: /^[0-9]+(,[0-9]+)*$/ },
      { name: "--version", pattern: /^v[0-9]+$/ },
      { name: "--revision-id", pattern: /^[0-9a-f-]{36}$/i },
    ],
    timeoutMs: 30 * 60 * 1000,
  },
  L10: {
    script: "scripts/manga/layers/L10-bubble.ts",
    scope: "episode",
    allowedFlags: [
      { name: "--pages", pattern: /^[0-9]+(,[0-9]+)*$/ },
      { name: "--version", pattern: /^v[0-9]+$/ },
      { name: "--revision-id", pattern: /^[0-9a-f-]{36}$/i },
    ],
    timeoutMs: 30 * 60 * 1000,
  },
  L11: {
    script: "scripts/manga/layers/L11-audit.ts",
    scope: "episode",
    allowedFlags: [],
    timeoutMs: 5 * 60 * 1000,
  },
  L12: {
    script: "scripts/manga/layers/L12-repair.ts",
    scope: "episode",
    allowedFlags: [
      { name: "--mode", pattern: /^(audit|revision-queue)$/ },
      { name: "--max-attempts", pattern: /^[1-9][0-9]?$/ },
    ],
    timeoutMs: 60 * 60 * 1000,
  },
  L13: {
    script: "scripts/manga/layers/L13-kdp.ts",
    scope: "volume",
    allowedFlags: [
      { name: "--episodes", pattern: /^[0-9]+(,[0-9]+)*$/ },
      { name: "--title", pattern: /^[^\n\r\t<>&"'`$\\-][^\n\r\t<>&"'`$\\]{0,199}$/ },
      { name: "--series-name", pattern: /^[^\n\r\t<>&"'`$\\-][^\n\r\t<>&"'`$\\]{0,199}$/ },
      { name: "--keywords", pattern: /^[^\n\r\t<>&"'`$\\-][^\n\r\t<>&"'`$\\]{0,499}$/ },
      { name: "--author", pattern: /^[^\n\r\t<>&"'`$\\-][^\n\r\t<>&"'`$\\]{0,79}$/ },
      { name: "--publication-date", pattern: /^\d{4}-\d{2}-\d{2}$/ },
    ],
    timeoutMs: 15 * 60 * 1000,
  },
  L99: {
    script: "scripts/manga/layers/L99-ai-edit.ts",
    scope: "work",
    allowedFlags: [
      { name: "--prompt", pattern: /^[\s\S]{1,8000}$/ },
      { name: "--target", pattern: /^[\w./-]+$/ },
      { name: "--auto-commit", pattern: /^$/ },
    ],
    timeoutMs: 30 * 60 * 1000,
  },
  "kdp-dry-run": {
    script: "scripts/manga/kdp-dry-run.ts",
    scope: "volume",
    allowedFlags: [],
    timeoutMs: 5 * 60 * 1000,
  },
  "scrape-bsr": {
    script: "scripts/manga/scrape-bsr.ts",
    scope: "work",
    allowedFlags: [],
    timeoutMs: 10 * 60 * 1000,
  },
};

export function isLayerId(value: unknown): value is LayerId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LAYER_REGISTRY, value);
}
