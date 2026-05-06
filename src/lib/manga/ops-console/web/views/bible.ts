import {
  ApiError,
  apiGetBible,
  apiPostJob,
  openJobStream,
  type BibleAssetView,
  type BibleAuditCharacter,
  type BibleAuditLocation,
  type BibleAuditProp,
  type BibleAuditSeverity,
  type BibleAuditVariant,
  type BibleCharactersAuditReport,
  type BibleCharacterRef,
  type BibleImagesAuditReport,
  type BiblePropsAuditReport,
  type JobEvent,
  type LayerId,
} from "../lib/api";

type AuditEntity = BibleAuditLocation | BibleAuditCharacter | BibleAuditProp;
type AnyAuditReport = BibleImagesAuditReport | BibleCharactersAuditReport | BiblePropsAuditReport;
import {
  asKeyValueTable,
  asList,
  asRecord,
  asText,
  detailsRaw,
} from "../lib/data-display";
import { store } from "../lib/store";
import { navigateToAiEdit } from "../lib/layer-actions";

type BibleTab = "world" | "characters" | "locations" | "props" | "style" | "costumes" | "relations" | "nav" | "synopsis" | "meta" | "raw";
type ActionLayer = "L01" | "L01b" | "L01c";
type DisplayMode = "reader" | "raw";
type AnyRecord = Record<string, unknown>;
type AssetKind = "characters" | "locations" | "props";

const BIBLE_TABS: Array<{ id: BibleTab; label: string }> = [
  { id: "world", label: "世界観" },
  { id: "characters", label: "キャラクター" },
  { id: "locations", label: "場所" },
  { id: "props", label: "小道具" },
  { id: "style", label: "画風指示" },
  { id: "costumes", label: "衣装" },
  { id: "relations", label: "関係性" },
  { id: "nav", label: "ナビ仕様" },
  { id: "synopsis", label: "巻シノプシス" },
  { id: "meta", label: "メタ・補足" },
  { id: "raw", label: "生 JSON" },
];

const CSS = `
.bib-view { display: grid; gap: var(--space-3); }
.bib-tabs { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.bib-content { display: grid; gap: var(--space-3); }
.bib-reader { display: grid; gap: var(--space-3); max-width: 980px; }
.bib-mode { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.bib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-3); }
.bib-card { display: grid; gap: var(--space-2); align-content: start; padding: var(--space-2); }
.bib-section { display: grid; gap: var(--space-2); }
.bib-section h3 { margin: 0; font-size: var(--fs-lg); }
.bib-factions,.bib-style-overrides { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-2); }
.bib-costumes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--space-3); }
.bib-costumes-grid .nc-kv__row dd { min-width: 0; word-break: keep-all; overflow-wrap: break-word; }
.bib-card h3 { margin: 0; font-size: var(--fs-md); line-height: 1.3; overflow-wrap: anywhere; }
.bib-meta { color: var(--text-tertiary); font-size: var(--fs-sm); overflow-wrap: anywhere; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.bib-summary { color: var(--text-secondary); font-size: var(--fs-sm); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.bib-thumb-wrap { position: relative; width: 100%; height: 160px; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-sunken); }
.bib-thumb { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.bib-thumb-wrap[data-bib-lightbox] { cursor: zoom-in; }
.bib-spec { display: grid; gap: 2px; font-size: var(--fs-sm); }
.bib-spec__row { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: var(--space-2); align-items: baseline; }
.bib-spec__key { color: var(--text-tertiary); white-space: nowrap; }
.bib-spec__val { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bib-card details.bib-card__raw { margin-top: var(--space-1); }
.bib-card details.bib-card__raw > summary { color: var(--text-tertiary); font-size: var(--fs-sm); cursor: pointer; list-style: none; }
.bib-card details.bib-card__raw > summary::-webkit-details-marker { display: none; }
.bib-card details.bib-card__raw > summary::before { content: "▸ "; }
.bib-card details.bib-card__raw[open] > summary::before { content: "▾ "; }
.bib-card details.bib-card__raw pre { margin: var(--space-1) 0 0 0; max-height: 240px; overflow: auto; font-size: var(--fs-xs, 11px); padding: var(--space-2); background: var(--surface-sunken); border-radius: var(--radius-sm); }
.bib-modal-body { display: grid; gap: var(--space-3); padding: var(--space-4); }
.bib-modal-head { display: flex; align-items: center; gap: var(--space-2); }
.bib-modal-title { margin: 0; font-size: var(--fs-xl); }
.bib-spacer { flex: 1 1 auto; }
.bib-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.bib-log { min-height: 160px; white-space: pre-wrap; }
.bib-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.bib-ref-count[data-bib-lightbox] { cursor: zoom-in; }
.bib-ref-count[data-bib-lightbox] { border: 0; padding: 0; background: transparent; color: var(--text-tertiary); font-family: inherit; font-size: var(--fs-sm); text-align: left; }
.bib-ref-count[data-bib-lightbox]:hover { color: var(--color-primary); text-decoration: underline; }
.bib-lightbox { align-items: center; justify-content: center; padding: 0; }
.bib-lightbox__card { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; gap: var(--space-2); width: min(96vw, 1120px); height: calc(100vh - 32px); max-height: 960px; padding: var(--space-3) var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-elevated); box-shadow: var(--shadow-3); box-sizing: border-box; }
.bib-lightbox__head { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.bib-lightbox__title { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-lg); }
.bib-lightbox__stage { position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; min-width: 0; overflow: hidden; border-radius: var(--radius-md); background: #111318; padding: var(--space-2); }
.bib-lightbox__image { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: var(--radius-sm); }
.bib-lightbox__meta { display: flex; align-items: center; gap: var(--space-2); color: var(--text-secondary); font-size: var(--fs-sm); min-width: 0; }
.bib-lightbox__file { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bib-lightbox__count { flex: 0 0 auto; color: var(--text-tertiary); }
.bib-lightbox__close { flex: 0 0 auto; }
.bib-lightbox__nav { position: absolute; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--border-subtle); border-radius: 999px; background: color-mix(in srgb, var(--surface-elevated) 72%, transparent); color: var(--text-primary); font-size: 28px; line-height: 1; cursor: pointer; z-index: 1; }
.bib-lightbox__nav:hover { background: var(--surface-elevated); }
.bib-lightbox__nav--prev { left: var(--space-2); }
.bib-lightbox__nav--next { right: var(--space-2); }
.bib-lightbox__thumbs { display: flex; gap: var(--space-1); overflow-x: auto; min-height: 64px; flex: 0 0 auto; }
.bib-lightbox__thumb { flex: 0 0 auto; width: 56px; height: 56px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 2px; background: var(--surface-sunken); cursor: pointer; box-sizing: border-box; }
.bib-lightbox__thumb.is-active { border: 2px solid var(--color-primary); padding: 1px; }
.bib-lightbox__thumb img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: calc(var(--radius-sm) - 2px); }
.bib-sev { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: var(--radius-sm); font-size: var(--fs-xs, 11px); font-weight: 600; line-height: 1.2; white-space: nowrap; }
.bib-sev--ok { background: rgba(72, 187, 120, 0.15); color: #4ec27a; border: 1px solid rgba(72, 187, 120, 0.4); }
.bib-sev--minor { background: rgba(236, 201, 75, 0.15); color: #d6b340; border: 1px solid rgba(236, 201, 75, 0.4); }
.bib-sev--major { background: rgba(237, 137, 54, 0.18); color: #e0833f; border: 1px solid rgba(237, 137, 54, 0.45); }
.bib-sev--critical { background: rgba(229, 62, 62, 0.2); color: #ef4f4f; border: 1px solid rgba(229, 62, 62, 0.5); }
.bib-card__sev-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.bib-card__sev-count { color: var(--text-tertiary); font-size: var(--fs-xs, 11px); }
.bib-audit-summary { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-sunken); flex-wrap: wrap; font-size: var(--fs-sm); }
.bib-audit-summary__title { color: var(--text-secondary); font-weight: 600; }
.bib-audit-summary__meta { color: var(--text-tertiary); font-size: var(--fs-xs, 11px); }
.bib-issues { display: grid; gap: 6px; padding: var(--space-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: var(--fs-sm); }
.bib-issues__variant-head { display: flex; gap: 6px; align-items: baseline; }
.bib-issues__variant-name { color: var(--text-secondary); font-weight: 600; }
.bib-issue { display: grid; gap: 2px; padding: 4px 6px; border-left: 3px solid var(--border-subtle); }
.bib-issue--minor { border-left-color: rgba(236, 201, 75, 0.6); }
.bib-issue--major { border-left-color: rgba(237, 137, 54, 0.7); }
.bib-issue--critical { border-left-color: rgba(229, 62, 62, 0.7); }
.bib-issue__head { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.bib-issue__cat { color: var(--text-tertiary); font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: var(--fs-xs, 11px); }
.bib-issue__anchor { color: var(--text-tertiary); font-size: var(--fs-xs, 11px); }
.bib-issue__desc { color: var(--text-primary); line-height: 1.45; }
.bib-fix { color: var(--text-secondary); font-size: var(--fs-sm); margin-top: 4px; line-height: 1.4; }
.bib-strengths { color: var(--text-tertiary); font-size: var(--fs-sm); line-height: 1.4; }
.bib-cross-notes { color: var(--text-secondary); font-size: var(--fs-sm); line-height: 1.4; padding: 4px 6px; border-left: 3px solid var(--border-subtle); }
.bib-no-audit { color: var(--text-tertiary); font-size: var(--fs-sm); padding: 4px 6px; }
.bib-lightbox__audit { display: grid; gap: 6px; max-height: 220px; overflow: auto; padding: var(--space-2); margin-top: var(--space-1); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--surface-sunken); font-size: var(--fs-sm); }
.bib-lightbox__bottom { display: grid; gap: var(--space-1); }
.bib-img-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: 4px; }
.bib-img-actions__btn { padding: 4px 10px; font-size: var(--fs-sm); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: var(--surface-elevated); color: var(--text-primary); cursor: pointer; }
.bib-img-actions__btn:hover { background: var(--surface-hover, color-mix(in srgb, var(--surface-elevated) 80%, white 5%)); }
.bib-img-actions__btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bib-img-actions__btn--primary { background: var(--color-primary, #4c8bff); color: white; border-color: var(--color-primary, #4c8bff); }
.bib-img-actions__btn--primary:hover { filter: brightness(1.08); }
.bib-img-job { display: grid; gap: 4px; padding: var(--space-2); border-left: 3px solid var(--color-primary, #4c8bff); background: color-mix(in srgb, var(--surface-elevated) 90%, transparent); font-size: var(--fs-xs, 11px); }
.bib-img-job__head { display: flex; gap: 6px; align-items: baseline; }
.bib-img-job__label { font-weight: 600; color: var(--text-primary); }
.bib-img-job__log { max-height: 100px; overflow: auto; font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: var(--fs-xs, 10px); color: var(--text-tertiary); white-space: pre-wrap; line-height: 1.4; }
`;

type ViewState = {
  slug: string;
  bible: BibleAssetView | null;
  tab: BibleTab;
  displayMode: DisplayMode;
  loading: boolean;
  error: string | null;
  modal: ActionLayer | null;
  runningLayer: ActionLayer | null;
  log: string[];
  lightbox: {
    kind: AssetKind;
    id: string;
    name: string;
    files: string[];
    index: number;
    cacheBust?: number; // image src の cache 強制無効化用 (regen 後に更新)
  } | null;
  /** L02 1 variant 再生成 / L02_audit 単独再監査 / 一括再生成の進行 state */
  imageJob: {
    /** regen=単一 variant 再生成→単独再監査、audit=単独再監査、bulk_regen=複数 entity の再生成→全体再監査 */
    kind: "regen" | "audit" | "bulk_regen";
    /** locations / characters / props のいずれか */
    entityKind: AssetKind;
    /** 単一 entity 操作のとき: その id。bulk_regen で進行中のとき: 現在処理中の id。全 kind 監査のとき: ""。 */
    entityId: string;
    /** regen のとき: variant 名。それ以外のとき: ""。 */
    variant: string;
    log: string[];
    /** bulk_regen のとき: 全 entity 件数 / 完了済み件数 */
    bulkProgress?: { total: number; done: number };
  } | null;
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
};

function ensureStyles(): void {
  let style = document.getElementById("bib-styles") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "bib-styles";
    document.head.appendChild(style);
  }
  if (style.textContent !== CSS) style.textContent = CSS;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function jsonHtml(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function textField(item: unknown, keys: string[]): string {
  const obj = asRecord(item);
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function idOf(item: unknown): string {
  return textField(item, ["id", "panel_id", "page_id"]) || "(no id)";
}

function nameOf(item: unknown): string {
  return textField(item, ["name", "title", "label"]) || idOf(item);
}

function summaryOf(item: unknown): string {
  const obj = asRecord(item);
  for (const value of [obj.summary, obj.description, obj.appearance_notes]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  const spec = asRecord(obj.spec);
  for (const key of ["personality_visual", "atmosphere", "description", "summary"]) {
    const value = spec[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

const PROP_SPEC_KEYS = ["kind", "color", "material", "size", "shape"] as const;
const LOCATION_SPEC_KEYS = ["era", "location_type", "atmosphere"] as const;
const CHARACTER_SPEC_KEYS = ["role", "age_visual", "gender", "build"] as const;

function pickSpecHighlights(item: unknown, kind: AssetKind): Array<{ key: string; value: string }> {
  const obj = asRecord(item);
  const spec = asRecord(obj.spec);
  const keyset =
    kind === "props"
      ? PROP_SPEC_KEYS
      : kind === "locations"
        ? LOCATION_SPEC_KEYS
        : CHARACTER_SPEC_KEYS;
  const out: Array<{ key: string; value: string }> = [];
  for (const key of keyset) {
    const raw = spec[key] ?? obj[key];
    if (raw == null) continue;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed) out.push({ key, value: trimmed });
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      out.push({ key, value: String(raw) });
    } else if (Array.isArray(raw) && raw.every((v) => typeof v === "string" || typeof v === "number")) {
      out.push({ key, value: raw.join(", ") });
    }
  }
  if (kind === "props") {
    const owner = textField(item, ["owner_character_id", "owner"]);
    if (owner) out.push({ key: "owner", value: owner });
  }
  return out;
}

function renderSpecRows(rows: Array<{ key: string; value: string }>): string {
  if (rows.length === 0) return "";
  return `<dl class="bib-spec">${rows
    .map(
      (row) =>
        `<div class="bib-spec__row"><dt class="bib-spec__key">${escapeHtml(row.key)}</dt><dd class="bib-spec__val" title="${escapeHtml(row.value)}">${escapeHtml(row.value)}</dd></div>`
    )
    .join("")}</dl>`;
}

function refMap(refs: BibleCharacterRef[]): Map<string, string[]> {
  return new Map(refs.map((ref) => [ref.id, ref.files]));
}

// キャラサムネは穏やかな表情を優先（アルファベット順だと expr_anger.png が先頭にきて全員怒り顔になる）
const CHARACTER_THUMB_PREFERENCE = [
  "expr_smile.png",
  "expr_default.png",
  "face_three_quarter.png",
  "face_front.png",
];

function pickThumbFile(kind: AssetKind, files: string[]): string {
  if (files.length === 0) return "";
  if (kind === "characters") {
    for (const preferred of CHARACTER_THUMB_PREFERENCE) {
      if (files.includes(preferred)) return preferred;
    }
  }
  return files[0];
}

// ============================================================
// Image audit (L02b) helpers
// ============================================================

const SEVERITY_RANK: Record<BibleAuditSeverity, number> = {
  ok: 0,
  minor: 1,
  major: 2,
  critical: 3,
};

const SEVERITY_LABEL: Record<BibleAuditSeverity, string> = {
  ok: "ok",
  minor: "minor",
  major: "major",
  critical: "critical",
};

function getEntityIdField(kind: AssetKind): "location_id" | "character_id" | "prop_id" {
  if (kind === "characters") return "character_id";
  if (kind === "props") return "prop_id";
  return "location_id";
}

function getAuditEntities(audit: AnyAuditReport | null | undefined, kind: AssetKind): AuditEntity[] {
  if (!audit) return [];
  if (kind === "characters") return (audit as BibleCharactersAuditReport).characters ?? [];
  if (kind === "props") return (audit as BiblePropsAuditReport).props ?? [];
  return (audit as BibleImagesAuditReport).locations ?? [];
}

function getAuditForKind(bible: BibleAssetView, kind: AssetKind): AnyAuditReport | null {
  if (kind === "characters") return bible.image_audit_characters ?? null;
  if (kind === "props") return bible.image_audit_props ?? null;
  return bible.image_audit ?? null;
}

function getEntityAudit(
  audit: AnyAuditReport | null | undefined,
  kind: AssetKind,
  entityId: string
): AuditEntity | null {
  if (!audit) return null;
  const idField = getEntityIdField(kind);
  const entities = getAuditEntities(audit, kind);
  return entities.find((e) => (e as Record<string, unknown>)[idField] === entityId) ?? null;
}

function getVariantAudit(
  entity: AuditEntity | null,
  variantFilename: string
): BibleAuditVariant | null {
  if (!entity) return null;
  const stem = variantFilename.replace(/\.[^.]+$/, "");
  return (
    entity.variants.find((v) => {
      if (v.variant === stem) return true;
      if (v.image_relpath.endsWith(`/${variantFilename}`)) return true;
      return false;
    }) ?? null
  );
}

function maxSeverity(entity: AuditEntity | null): BibleAuditSeverity | null {
  if (!entity || entity.variants.length === 0) return null;
  let worst: BibleAuditSeverity = "ok";
  for (const v of entity.variants) {
    if (SEVERITY_RANK[v.severity] > SEVERITY_RANK[worst]) worst = v.severity;
  }
  return worst;
}

function severityCountSummary(entity: AuditEntity): string {
  const counts: Record<BibleAuditSeverity, number> = { ok: 0, minor: 0, major: 0, critical: 0 };
  for (const v of entity.variants) counts[v.severity]++;
  const parts: string[] = [];
  for (const sev of ["critical", "major", "minor", "ok"] as const) {
    if (counts[sev] > 0) parts.push(`${SEVERITY_LABEL[sev]}=${counts[sev]}`);
  }
  return parts.join(" ");
}

function renderSeverityBadge(sev: BibleAuditSeverity | null): string {
  if (!sev) return "";
  return `<span class="bib-sev bib-sev--${sev}">${escapeHtml(SEVERITY_LABEL[sev])}</span>`;
}

function renderEntityCardAudit(entity: AuditEntity | null): string {
  if (!entity) return "";
  const sev = maxSeverity(entity);
  if (!sev) return "";
  const summary = severityCountSummary(entity);
  return `<div class="bib-card__sev-row">${renderSeverityBadge(sev)}<span class="bib-card__sev-count">${escapeHtml(summary)}</span></div>`;
}

function kindLabel(kind: AssetKind): string {
  if (kind === "characters") return "キャラ";
  if (kind === "props") return "小道具";
  return "場所";
}

function renderIssueRow(issue: { category: string; anchor_id?: string; description: string }, severity: BibleAuditSeverity): string {
  const sevClass = severity === "ok" ? "" : ` bib-issue--${severity}`;
  return `<div class="bib-issue${sevClass}">
    <div class="bib-issue__head">
      <span class="bib-issue__cat">${escapeHtml(issue.category)}</span>
      ${issue.anchor_id ? `<span class="bib-issue__anchor">anchor: ${escapeHtml(issue.anchor_id)}</span>` : ""}
    </div>
    <div class="bib-issue__desc">${escapeHtml(issue.description)}</div>
  </div>`;
}

function renderVariantAuditDetail(variant: BibleAuditVariant): string {
  const issues = variant.issues.length > 0
    ? variant.issues.map((i) => renderIssueRow(i, variant.severity)).join("")
    : `<div class="bib-no-audit">issue なし</div>`;
  return `<div class="bib-issues">
    <div class="bib-issues__variant-head">
      ${renderSeverityBadge(variant.severity)}
      <span class="bib-issues__variant-name">${escapeHtml(variant.variant)}</span>
    </div>
    ${issues}
    ${variant.suggested_fix ? `<div class="bib-fix"><strong>fix:</strong> ${escapeHtml(variant.suggested_fix)}</div>` : ""}
    ${variant.strengths ? `<div class="bib-strengths"><strong>good:</strong> ${escapeHtml(variant.strengths)}</div>` : ""}
  </div>`;
}

function countMatchingVariants(audit: AnyAuditReport | null | undefined, kind: AssetKind, severities: BibleAuditSeverity[]): number {
  if (!audit) return 0;
  const set = new Set(severities);
  let count = 0;
  for (const e of getAuditEntities(audit, kind)) {
    for (const v of e.variants) if (set.has(v.severity)) count++;
  }
  return count;
}

function renderAuditTabHeader(
  audit: AnyAuditReport | null | undefined,
  kind: AssetKind,
  jobRunning: boolean,
  jobLog?: { kind: string; entityId: string; bulkProgress?: { total: number; done: number } } | null
): string {
  const label = kindLabel(kind);
  const dis = jobRunning ? " disabled" : "";
  const runFullBtn = `<button type="button" class="bib-img-actions__btn" data-bib-audit-action="full" data-bib-kind="${escapeHtml(kind)}"${dis}>全${escapeHtml(label)}監査実行</button>`;
  if (!audit) {
    return `<div class="bib-audit-summary">
      <span class="bib-audit-summary__title">画像監査 (${escapeHtml(label)})</span>
      <span class="bib-audit-summary__meta">未実施</span>
      <span class="bib-spacer"></span>
      ${runFullBtn}
    </div>`;
  }
  const s = audit.summary.by_severity;
  const critCount = countMatchingVariants(audit, kind, ["critical"]);
  const cmCount = countMatchingVariants(audit, kind, ["critical", "major"]);
  const bulkCriticalBtn = critCount > 0
    ? `<button type="button" class="bib-img-actions__btn bib-img-actions__btn--primary" data-bib-bulk-regen="critical" data-bib-kind="${escapeHtml(kind)}"${dis}>critical ${critCount} 件を一括再生成</button>`
    : "";
  const bulkBothBtn = cmCount > 0
    ? `<button type="button" class="bib-img-actions__btn" data-bib-bulk-regen="critical_major" data-bib-kind="${escapeHtml(kind)}"${dis}>critical+major ${cmCount} 件を一括再生成</button>`
    : "";
  const progressInfo = jobLog?.kind === "bulk_regen" && jobLog.bulkProgress
    ? `<span class="bib-audit-summary__meta">一括再生成 ${jobLog.bulkProgress.done}/${jobLog.bulkProgress.total} (${escapeHtml(jobLog.entityId || "...")})</span>`
    : "";
  return `<div class="bib-audit-summary">
    <span class="bib-audit-summary__title">画像監査 L02b (${escapeHtml(label)})</span>
    ${renderSeverityBadge("critical")}<span class="bib-audit-summary__meta">${s.critical}</span>
    ${renderSeverityBadge("major")}<span class="bib-audit-summary__meta">${s.major}</span>
    ${renderSeverityBadge("minor")}<span class="bib-audit-summary__meta">${s.minor}</span>
    ${renderSeverityBadge("ok")}<span class="bib-audit-summary__meta">${s.ok}</span>
    <span class="bib-audit-summary__meta">/ total ${audit.summary.total_images}</span>
    <span class="bib-audit-summary__meta">model: ${escapeHtml(audit.model)}</span>
    <span class="bib-audit-summary__meta">${escapeHtml(audit.audited_at.slice(0, 19).replace("T", " "))}</span>
    ${progressInfo}
    <span class="bib-spacer"></span>
    ${bulkCriticalBtn}
    ${bulkBothBtn}
    ${runFullBtn}
  </div>`;
}

function renderImageActions(kind: AssetKind, entityId: string, variant: string, disabled: boolean): string {
  const dis = disabled ? " disabled" : "";
  const label = kindLabel(kind);
  return `<div class="bib-img-actions">
    <button type="button" class="bib-img-actions__btn bib-img-actions__btn--primary"
      data-bib-img-action="regen" data-bib-kind="${escapeHtml(kind)}" data-bib-entity="${escapeHtml(entityId)}" data-bib-variant="${escapeHtml(variant)}"${dis}>
      この variant を再生成
    </button>
    <button type="button" class="bib-img-actions__btn"
      data-bib-img-action="audit" data-bib-kind="${escapeHtml(kind)}" data-bib-entity="${escapeHtml(entityId)}"${dis}>
      この${escapeHtml(label)}を再監査
    </button>
  </div>`;
}

function renderImageJobStatus(state: ViewState, kind: AssetKind, entityId: string, variant: string): string {
  const job = state.imageJob;
  if (!job) return "";
  if (job.kind !== "regen" && job.kind !== "audit") return "";
  if (job.entityKind !== kind) return "";
  if (job.entityId !== entityId) return "";
  if (job.kind === "regen" && job.variant !== variant) return "";
  const label = job.kind === "regen"
    ? `再生成中: ${escapeHtml(job.entityId)} / ${escapeHtml(job.variant)}`
    : `再監査中: ${escapeHtml(job.entityId)}`;
  return `<div class="bib-img-job">
    <div class="bib-img-job__head"><span class="bib-img-job__label">${label}</span></div>
    <div class="bib-img-job__log">${escapeHtml(job.log.slice(-12).join("\n"))}</div>
  </div>`;
}

function refUrl(slug: string, kind: AssetKind, id: string, file: string): string {
  return `/works/${encodeURIComponent(slug)}/bible/refs/${kind}/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;
}

function renderAssetCards(
  slug: string,
  kind: AssetKind,
  items: unknown[],
  refs: BibleCharacterRef[],
  audit?: AnyAuditReport | null,
  jobRunning?: boolean,
  jobLog?: ViewState["imageJob"] | null
): string {
  if (items.length === 0) return `<div class="nc-empty">No ${kind}</div>`;
  const byId = refMap(refs);
  const headerJobLog = jobLog && jobLog.entityKind === kind ? jobLog : null;
  const header = renderAuditTabHeader(audit, kind, jobRunning ?? false, headerJobLog);
  const cards = `<div class="bib-grid">${items.map((item) => {
    const id = idOf(item);
    const name = nameOf(item);
    const files = byId.get(id) ?? [];
    const thumbFile = pickThumbFile(kind, files);
    const thumb = thumbFile ? refUrl(slug, kind, id, thumbFile) : "";
    const lbAttrs = `data-bib-lightbox data-bib-kind="${kind}" data-bib-id="${escapeHtml(id)}"`;
    const summary = summaryOf(item);
    const highlights = pickSpecHighlights(item, kind);
    const auditCard = renderEntityCardAudit(getEntityAudit(audit, kind, id));
    return `
      <article class="nc-card nc-card--default bib-card">
        ${thumb ? `<div class="bib-thumb-wrap" ${lbAttrs}><img class="bib-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(name)}" loading="lazy"></div>` : ""}
        <h3>${escapeHtml(name)}</h3>
        <div class="bib-meta">${escapeHtml(id)}</div>
        ${auditCard}
        ${summary ? `<div class="bib-summary">${escapeHtml(summary)}</div>` : ""}
        ${renderSpecRows(highlights)}
        ${files.length > 1 ? `<button type="button" class="bib-meta bib-ref-count" ${lbAttrs}>${files.length} refs</button>` : ""}
        <details class="bib-card__raw"><summary>raw</summary><pre>${jsonHtml(item)}</pre></details>
      </article>`;
  }).join("")}</div>`;
  return header ? `${header}${cards}` : cards;
}

function renderTabs(active: BibleTab): string {
  return `<div class="bib-tabs">${BIBLE_TABS.map((tab) => `<button type="button" class="nc-pill${tab.id === active ? " nc-pill--active" : ""}" data-bible-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
}

function renderDisplayMode(active: DisplayMode): string {
  return `<div class="bib-mode">
    <button type="button" class="nc-pill${active === "reader" ? " nc-pill--active" : ""}" data-display-mode="reader">Reader</button>
    <button type="button" class="nc-pill${active === "raw" ? " nc-pill--active" : ""}" data-display-mode="raw">生 JSON</button>
  </div>`;
}

function renderWorldReader(world: unknown): string {
  const obj = asRecord(world);
  const factions = Array.isArray(obj.factions) ? obj.factions : [];
  const lexicon = asRecord(obj.lexicon);
  const { forbidden_terms_global, p1_opening_directive, ...lexiconRest } = lexicon;
  const lexiconSection = Object.keys(lexicon).length === 0 ? "" : `
    <section class="nc-card bib-section">
      <h3>用語規約 (Lexicon)</h3>
      <section class="bib-section">
        <h3>禁則語 (forbidden_terms_global)</h3>
        ${asList(forbidden_terms_global)}
      </section>
      ${p1_opening_directive !== undefined ? `<section class="bib-section">
        <h3>P1 冒頭指示 (p1_opening_directive)</h3>
        <p>${escapeHtml(asText(p1_opening_directive))}</p>
      </section>` : ""}
      ${Object.keys(lexiconRest).length > 0 ? `<section class="bib-section">
        <h3>その他</h3>
        ${asKeyValueTable(lexiconRest)}
      </section>` : ""}
      ${detailsRaw("生 JSON", obj.lexicon)}
    </section>`;
  return `<div class="bib-reader">
    <section class="nc-card bib-section">
      <h3>前提 (Premise)</h3>
      <p>${escapeHtml(asText(obj.premise))}</p>
      ${detailsRaw("生 JSON", obj.premise)}
    </section>
    <section class="nc-card bib-section">
      <h3>ルール (Rules)</h3>
      ${asList(obj.rules)}
      ${detailsRaw("生 JSON", obj.rules)}
    </section>
    <section class="nc-card bib-section">
      <h3>システム (System)</h3>
      ${typeof obj.system === "object" && obj.system !== null ? asKeyValueTable(asRecord(obj.system)) : `<p>${escapeHtml(asText(obj.system))}</p>`}
      ${detailsRaw("生 JSON", obj.system)}
    </section>
    <section class="nc-card bib-section">
      <h3>年表 (Timeline)</h3>
      ${Array.isArray(obj.timeline) ? `<ol>${obj.timeline.map((item) => `<li>${escapeHtml(asText(item))}</li>`).join("")}</ol>` : `<p>${escapeHtml(asText(obj.timeline))}</p>`}
      ${detailsRaw("生 JSON", obj.timeline)}
    </section>
    <section class="nc-card bib-section">
      <h3>勢力 (Factions)</h3>
      <div class="bib-factions">${factions.map((item) => {
        const faction = asRecord(item);
        return `<article class="nc-card nc-card--sunken bib-card">
          <h3>${escapeHtml(asText(faction.name ?? "名称未設定"))}</h3>
          <div class="bib-summary">${escapeHtml(asText(faction.summary ?? faction.description ?? item))}</div>
        </article>`;
      }).join("")}</div>
      ${detailsRaw("生 JSON", obj.factions)}
    </section>
    ${lexiconSection}
  </div>`;
}

function renderStyleReader(bible: BibleAssetView): string {
  const directives = asRecord(bible.style_directives);
  const overrides = asRecord(directives.scene_overrides);
  return `<div class="bib-reader">
    <section class="nc-card bib-section">
      <h3>全体指示 (global)</h3>
      ${typeof directives.global === "object" && directives.global !== null ? asKeyValueTable(asRecord(directives.global)) : `<p>${escapeHtml(asText(directives.global))}</p>`}
      ${detailsRaw("生 JSON", directives.global)}
    </section>
    <section class="nc-card bib-section">
      <h3>シーン別指示 (scene_overrides)</h3>
      <div class="bib-style-overrides">${Object.entries(overrides).map(([key, value]) => `<article class="nc-card nc-card--sunken bib-card">
        <h3>${escapeHtml(key)}</h3>
        <div class="bib-summary">${escapeHtml(asText(value))}</div>
      </article>`).join("")}</div>
      ${detailsRaw("生 JSON", directives.scene_overrides)}
    </section>
    <section class="nc-card bib-section">
      <h3>合成・オーバーレイ規則 (overlay_rules)</h3>
      ${asList(directives.overlay_rules)}
      ${detailsRaw("生 JSON", directives.overlay_rules)}
    </section>
    <section class="nc-card bib-section">
      <h3>視覚モチーフ / 継続性 seed</h3>
      ${asKeyValueTable({
        "visual_motifs": Array.isArray(bible.visual_motifs) ? `${bible.visual_motifs.length} 件` : bible.visual_motifs,
        "continuity_seeds": Array.isArray(bible.continuity_seeds) ? `${bible.continuity_seeds.length} 件` : bible.continuity_seeds,
      })}
      ${detailsRaw("visual_motifs", bible.visual_motifs)}
      ${detailsRaw("continuity_seeds", bible.continuity_seeds)}
    </section>
  </div>`;
}

function characterNameMap(bible: BibleAssetView): Map<string, string> {
  const map = new Map<string, string>();
  for (const character of bible.characters) {
    const id = idOf(character);
    if (id !== "(no id)") map.set(id, nameOf(character));
  }
  return map;
}

function characterLabel(id: string, names: Map<string, string>): string {
  const name = names.get(id);
  return name ? `(${id}) ${name}` : id;
}

function renderCostumesReader(bible: BibleAssetView): string {
  const costumes = Array.isArray(bible.costumes) ? bible.costumes : [];
  if (costumes.length === 0) return `<div class="nc-empty">登録された衣装はありません</div>`;
  const groups = new Map<string, unknown[]>();
  for (const costume of costumes) {
    const obj = asRecord(costume);
    const characterId = typeof obj.character_id === "string" && obj.character_id.trim() ? obj.character_id : "(character_id 未設定)";
    const list = groups.get(characterId) ?? [];
    list.push(costume);
    groups.set(characterId, list);
  }
  const names = characterNameMap(bible);
  return `<div class="bib-reader">${Array.from(groups.entries()).map(([characterId, items]) => `
    <section class="nc-card bib-section">
      <h3>${escapeHtml(characterLabel(characterId, names))}</h3>
      <div class="bib-costumes-grid">${items.map((costume) => {
        const obj = asRecord(costume);
        const id = typeof obj.id === "string" && obj.id.trim() ? obj.id : "(id 未設定)";
        const from = obj.valid_from_episode;
        const until = obj.valid_until_episode;
        const range = `${escapeHtml(asText(from))} 話 〜 ${until === null ? "最終巻" : `${escapeHtml(asText(until))}話`}`;
        return `<article class="nc-card nc-card--sunken bib-card">
          <h3>${escapeHtml(id)}</h3>
          <dl class="bib-spec">
            <div class="bib-spec__row"><dt class="bib-spec__key">有効話数</dt><dd class="bib-spec__val" title="${range}">${range}</dd></div>
          </dl>
          ${asKeyValueTable(asRecord(obj.spec))}
          <details class="bib-card__raw"><summary>生 JSON</summary><pre>${jsonHtml(costume)}</pre></details>
        </article>`;
      }).join("")}</div>
    </section>`).join("")}</div>`;
}

function renderRelationsReader(bible: BibleAssetView): string {
  const relations = Array.isArray(bible.relations) ? bible.relations : [];
  if (relations.length === 0) return `<div class="nc-empty">登録された関係性はありません</div>`;
  const names = characterNameMap(bible);
  return `<div class="bib-reader"><div class="bib-grid">${relations.map((relation) => {
    const obj = asRecord(relation);
    const from = typeof obj.from_character_id === "string" ? obj.from_character_id : "";
    const to = typeof obj.to_character_id === "string" ? obj.to_character_id : "";
    const title = `${characterLabel(from || "(from 未設定)", names)} → ${characterLabel(to || "(to 未設定)", names)}`;
    return `<article class="nc-card nc-card--default bib-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="bib-meta">${escapeHtml(asText(obj.relation_type))}</div>
      <div class="bib-summary">${escapeHtml(asText(obj.description))}</div>
      <details class="bib-card__raw"><summary>生 JSON</summary><pre>${jsonHtml(relation)}</pre></details>
    </article>`;
  }).join("")}</div></div>`;
}

function renderNavReader(bible: BibleAssetView): string {
  const nav = asRecord(bible.nav_full_spec);
  if (Object.keys(nav).length === 0) return `<div class="nc-empty">ナビ仕様は未登録です</div>`;
  const navRest = { ...nav };
  delete navRest.voice_persona;
  delete navRest.canonical_disclosure_lines_vol_1;
  delete navRest.anti_pattern_dialogue;
  const voice = asRecord(nav.voice_persona);
  const { default_tone, speech_endings, emotional_range_per_volume, ...voiceRest } = voice;
  return `<div class="bib-reader">
    <section class="nc-card bib-section">
      <h3>声・口調 (voice_persona)</h3>
      ${default_tone !== undefined ? `<p>${escapeHtml(asText(default_tone))}</p>` : ""}
      <section class="bib-section">
        <h3>語尾 (speech_endings)</h3>
        ${asList(speech_endings)}
      </section>
      <section class="bib-section">
        <h3>巻別の感情幅 (emotional_range_per_volume)</h3>
        ${asKeyValueTable(asRecord(emotional_range_per_volume))}
      </section>
      ${Object.keys(voiceRest).length > 0 ? asKeyValueTable(voiceRest) : ""}
      ${detailsRaw("生 JSON", nav.voice_persona)}
    </section>
    <section class="nc-card bib-section">
      <h3>Vol.1 開示ライン (canonical_disclosure_lines_vol_1)</h3>
      ${asList(nav.canonical_disclosure_lines_vol_1)}
      ${detailsRaw("生 JSON", nav.canonical_disclosure_lines_vol_1)}
    </section>
    <section class="nc-card bib-section">
      <h3>アンチパターン (anti_pattern_dialogue)</h3>
      ${asKeyValueTable(asRecord(nav.anti_pattern_dialogue))}
      ${detailsRaw("生 JSON", nav.anti_pattern_dialogue)}
    </section>
    ${Object.keys(navRest).length > 0 ? `<section class="nc-card bib-section">
      <h3>その他</h3>
      ${asKeyValueTable(navRest)}
      ${detailsRaw("生 JSON", navRest)}
    </section>` : ""}
  </div>`;
}

function renderSynopsisEntry(value: unknown, index?: number): string {
  const synopsis = asRecord(value);
  const theme = synopsis.theme;
  const summary = synopsis.summary;
  const cliffhanger = synopsis.cliffhanger;
  return `<section class="nc-card bib-section">
    ${index !== undefined ? `<h3>巻シノプシス ${index + 1}</h3>` : ""}
    ${theme !== undefined ? `<section class="bib-section"><h3>テーマ (theme)</h3><p>${escapeHtml(asText(theme))}</p></section>` : ""}
    ${summary !== undefined ? `<section class="bib-section"><h3>あらすじ (summary)</h3><p>${escapeHtml(asText(summary))}</p></section>` : ""}
    ${cliffhanger !== undefined ? `<section class="bib-section"><h3>引き (cliffhanger)</h3><p>${escapeHtml(asText(cliffhanger))}</p></section>` : ""}
    ${detailsRaw("生 JSON", value)}
  </section>`;
}

function renderSynopsisReader(bible: BibleAssetView): string {
  const value = bible.volume_synopsis;
  if (Array.isArray(value)) {
    if (value.length === 0) return `<div class="nc-empty">巻シノプシスは未登録です</div>`;
    return `<div class="bib-reader">${value.map((entry, index) => renderSynopsisEntry(entry, index)).join("")}</div>`;
  }
  if (Object.keys(asRecord(value)).length === 0) return `<div class="nc-empty">巻シノプシスは未登録です</div>`;
  return `<div class="bib-reader">${renderSynopsisEntry(value)}</div>`;
}

function asKeyValueTableWithLists(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj);
  if (entries.length === 0) return `<div class="nc-empty">項目がありません。</div>`;
  return `<dl class="nc-kv">${entries.map(([key, value]) => `
    <div class="nc-kv__row">
      <dt>${escapeHtml(key)}</dt>
      <dd>${Array.isArray(value) ? asList(value) : typeof value === "object" && value !== null ? `<pre class="nc-code-block">${jsonHtml(value)}</pre>` : escapeHtml(asText(value))}</dd>
    </div>`).join("")}</dl>`;
}

function renderNarrationStyleGuide(value: unknown): string {
  const guide = asRecord(value);
  const { p1_opening_directive_specific, ban_list_phrases, monologue_signature_patterns, ...rest } = guide;
  return `<section class="nc-card bib-section">
    <h3>ナレーション規約 (narration_style_guide)</h3>
    ${Object.keys(asRecord(p1_opening_directive_specific)).length > 0 ? `<section class="bib-section">
      <h3>P1 冒頭具体指示 (p1_opening_directive_specific)</h3>
      ${asKeyValueTableWithLists(asRecord(p1_opening_directive_specific))}
    </section>` : ""}
    ${ban_list_phrases !== undefined ? `<section class="bib-section">
      <h3>禁止フレーズ (ban_list_phrases)</h3>
      ${asList(ban_list_phrases)}
    </section>` : ""}
    ${monologue_signature_patterns !== undefined ? `<section class="bib-section">
      <h3>モノローグ定型 (monologue_signature_patterns)</h3>
      ${asList(monologue_signature_patterns)}
    </section>` : ""}
    ${Object.keys(rest).length > 0 ? `<section class="bib-section"><h3>その他</h3>${asKeyValueTable(rest)}</section>` : ""}
    ${detailsRaw("生 JSON", value)}
  </section>`;
}

function renderMetaReader(bible: BibleAssetView): string {
  const sections: string[] = [];
  if (Object.keys(asRecord(bible.meta)).length > 0) {
    sections.push(`<section class="nc-card bib-section">
      <h3>Bible メタ (meta)</h3>
      ${asKeyValueTable(asRecord(bible.meta))}
      ${detailsRaw("生 JSON", bible.meta)}
    </section>`);
  }
  if (Object.keys(asRecord(bible.narration_style_guide)).length > 0) {
    sections.push(renderNarrationStyleGuide(bible.narration_style_guide));
  }
  const provenance = {
    schema_version: bible.schema_version,
    generated_at: bible.generated_at,
    generated_from: bible.generated_from,
  };
  if (Object.values(provenance).some((value) => value !== undefined)) {
    sections.push(`<section class="nc-card bib-section">
      <h3>生成情報 (provenance)</h3>
      ${asKeyValueTable(provenance)}
      ${detailsRaw("生 JSON", provenance)}
    </section>`);
  }
  if (sections.length === 0) return `<div class="nc-empty">メタ情報はありません</div>`;
  return `<div class="bib-reader">${sections.join("")}</div>`;
}

function renderBibleContent(state: ViewState): string {
  const bible = state.bible;
  if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
  if (state.error && !bible) return `<div class="view-placeholder"><h2>Bible</h2><p>${escapeHtml(state.error)}</p></div>`;
  if (!bible) return `<div class="nc-empty">Bible snapshot は未作成です。「Bible 全体構築」から生成してください。</div>`;
  const jobRunning = state.imageJob !== null;
  if (state.tab === "characters") return renderAssetCards(state.slug, "characters", bible.characters, bible.refs.characters, bible.image_audit_characters, jobRunning, state.imageJob);
  if (state.tab === "locations") return renderAssetCards(state.slug, "locations", bible.locations, bible.refs.locations, bible.image_audit, jobRunning, state.imageJob);
  if (state.tab === "props") return renderAssetCards(state.slug, "props", bible.props, bible.refs.props, bible.image_audit_props, jobRunning, state.imageJob);
  if (state.tab === "world") {
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(bible.world)}</pre>` : renderWorldReader(bible.world)}`;
  }
  if (state.tab === "style") {
    const raw = {
      style_directives: bible.style_directives,
      visual_motifs: bible.visual_motifs,
      continuity_seeds: bible.continuity_seeds,
    };
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(raw)}</pre>` : renderStyleReader(bible)}`;
  }
  if (state.tab === "costumes") {
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(bible.costumes)}</pre>` : renderCostumesReader(bible)}`;
  }
  if (state.tab === "relations") {
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(bible.relations)}</pre>` : renderRelationsReader(bible)}`;
  }
  if (state.tab === "nav") {
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(bible.nav_full_spec)}</pre>` : renderNavReader(bible)}`;
  }
  if (state.tab === "synopsis") {
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(bible.volume_synopsis)}</pre>` : renderSynopsisReader(bible)}`;
  }
  if (state.tab === "meta") {
    const raw = {
      meta: bible.meta,
      narration_style_guide: bible.narration_style_guide,
      provenance: {
        schema_version: bible.schema_version,
        generated_at: bible.generated_at,
        generated_from: bible.generated_from,
      },
    };
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(raw)}</pre>` : renderMetaReader(bible)}`;
  }
  return `<pre class="nc-code-block">${jsonHtml(bible)}</pre>`;
}

function actionLabel(layer: ActionLayer): string {
  if (layer === "L01") return "世界観・キャラ設定 (Bible) を構築";
  if (layer === "L01b") return "Bible の文法チェック";
  return "Bible の深掘り";
}

function renderModal(state: ViewState): string {
  if (!state.modal) return "";
  const layer = state.modal;
  const disabled = state.runningLayer ? " disabled" : "";
  const fields = (() => {
    if (layer === "L01") {
      return `
        <label class="nc-field">
          <span class="nc-field__label">企画書ファイル (concept.json)</span>
          <input class="nc-field__input" name="concept" required placeholder="data/manga/...json">
        </label>
        <label class="nc-field">
          <span class="nc-field__label">画風 (art_style)</span>
          <input class="nc-field__input" name="artStyle" placeholder="manga_bw_seinen_urban">
        </label>`;
    }
    if (layer === "L01b") {
      return `
        <label class="nc-pill nc-pill--check"><input type="checkbox" name="skipLlm"> LLM チェックを省略 (--skip-llm)</label>
        <label class="nc-pill nc-pill--check"><input type="checkbox" name="failOnFatal"> 致命エラーで停止 (--fail-on-fatal)</label>`;
    }
    return `
      <label class="nc-field">
        <span class="nc-field__label">企画書ファイル (concept.json)</span>
        <input class="nc-field__input" name="concept" required placeholder="data/manga/...json">
      </label>
      <label class="nc-field">
        <span class="nc-field__label">画風参考メモ (style ref note)</span>
        <textarea class="nc-field__textarea" name="styleRefNote" rows="5"></textarea>
      </label>
      <label class="nc-pill nc-pill--check"><input type="checkbox" name="reLint" checked> 再 Lint (--re-lint)</label>`;
  })();

  return `
    <div class="nc-modal is-open" id="bib-modal">
      <form class="nc-modal__card nc-modal__card--md bib-modal-body" data-bib-form="${layer}">
        <div class="bib-modal-head">
          <h3 class="bib-modal-title">${escapeHtml(actionLabel(layer))}</h3>
          <span class="bib-info">${escapeHtml(state.slug)}</span>
          <span class="bib-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-close-modal${disabled}>閉じる</button>
        </div>
        ${fields}
        <div class="bib-actions">
          <button type="submit" class="nc-button nc-button--primary"${disabled}>${state.runningLayer ? "起動中" : "起動"}</button>
        </div>
        <pre class="nc-code-block bib-log">${escapeHtml(state.log.join("\n"))}</pre>
      </form>
    </div>`;
}

function refsForKind(bible: BibleAssetView, kind: AssetKind): BibleCharacterRef[] {
  if (kind === "characters") return bible.refs.characters;
  if (kind === "locations") return bible.refs.locations;
  return bible.refs.props;
}

function itemsForKind(bible: BibleAssetView, kind: AssetKind): unknown[] {
  if (kind === "characters") return bible.characters;
  if (kind === "locations") return bible.locations;
  return bible.props;
}

function openLightbox(state: ViewState, kind: AssetKind, id: string, index = 0): void {
  const bible = state.bible;
  if (!bible) return;
  const files = refMap(refsForKind(bible, kind)).get(id) ?? [];
  if (files.length === 0) return;
  const item = itemsForKind(bible, kind).find((entry) => idOf(entry) === id);
  const name = item ? nameOf(item) : id;
  state.lightbox = {
    kind,
    id,
    name,
    files,
    index: Math.max(0, Math.min(index, files.length - 1)),
  };
}

function navigateLightbox(state: ViewState, direction: -1 | 1): void {
  const lightbox = state.lightbox;
  if (!lightbox || lightbox.files.length <= 1) return;
  lightbox.index = (lightbox.index + direction + lightbox.files.length) % lightbox.files.length;
}

function renderLightbox(state: ViewState): string {
  const lightbox = state.lightbox;
  if (!lightbox) return "";
  const total = lightbox.files.length;
  const index = Math.max(0, Math.min(lightbox.index, total - 1));
  const file = lightbox.files[index] ?? "";
  const cacheQs = lightbox.cacheBust ? `?v=${lightbox.cacheBust}` : "";
  const src = refUrl(state.slug, lightbox.kind, lightbox.id, file) + cacheQs;
  const multi = total > 1;
  const variantStem = file.replace(/\.[^.]+$/, "");
  const jobRunning = state.imageJob !== null;
  // characters / locations / props 各タブで audit と actions を表示。
  // actions は audit panel の外 (常時可視) に置く。
  const { auditBlock, actionsBlock } = (() => {
    const bible = state.bible;
    if (!bible) return { auditBlock: "", actionsBlock: "" };
    const audit = getAuditForKind(bible, lightbox.kind);
    const entity = audit ? getEntityAudit(audit, lightbox.kind, lightbox.id) : null;
    const variant = entity ? getVariantAudit(entity, file) : null;
    const auditParts: string[] = [];
    if (variant) {
      auditParts.push(renderVariantAuditDetail(variant));
    } else if (audit) {
      auditParts.push(`<div class="bib-no-audit">この variant は監査未収録です</div>`);
    } else {
      auditParts.push(`<div class="bib-no-audit">画像監査未実施 (タブ上部の「監査実行」または CLI で L02b を起動)</div>`);
    }
    if (entity?.cross_variant_notes) {
      auditParts.push(`<div class="bib-cross-notes"><strong>cross-variant:</strong> ${escapeHtml(entity.cross_variant_notes)}</div>`);
    }
    const auditHtml = `<div class="bib-lightbox__audit">${auditParts.join("")}</div>`;
    const actionsHtml = `${renderImageJobStatus(state, lightbox.kind, lightbox.id, variantStem)}${renderImageActions(lightbox.kind, lightbox.id, variantStem, jobRunning)}`;
    return { auditBlock: auditHtml, actionsBlock: actionsHtml };
  })();
  return `
    <div class="nc-modal is-open bib-lightbox" id="bib-lightbox" data-bib-lightbox-overlay>
      <div class="bib-lightbox__card" role="dialog" aria-modal="true" aria-label="${escapeHtml(lightbox.name)}" data-bib-lightbox-card>
        <div class="bib-lightbox__head">
          <h3 class="bib-lightbox__title">${escapeHtml(lightbox.name)}</h3>
          <span class="bib-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm bib-lightbox__close" data-bib-lightbox-close aria-label="閉じる">×</button>
        </div>
        <div class="bib-lightbox__stage">
          ${multi ? `<button type="button" class="bib-lightbox__nav bib-lightbox__nav--prev" data-bib-lightbox-prev aria-label="Previous image">‹</button>` : ""}
          <img class="bib-lightbox__image" src="${escapeHtml(src)}" alt="${escapeHtml(lightbox.name)}">
          ${multi ? `<button type="button" class="bib-lightbox__nav bib-lightbox__nav--next" data-bib-lightbox-next aria-label="Next image">›</button>` : ""}
        </div>
        <div class="bib-lightbox__meta">
          <span class="bib-lightbox__file">${escapeHtml(file)}</span>
          ${multi ? `<span class="bib-lightbox__count">${index + 1} / ${total}</span>` : ""}
        </div>
        ${auditBlock}
        ${actionsBlock ? `<div class="bib-lightbox__bottom">${actionsBlock}</div>` : ""}
        ${multi ? `<div class="bib-lightbox__thumbs">${lightbox.files.map((thumbFile, thumbIndex) => {
          const thumb = refUrl(state.slug, lightbox.kind, lightbox.id, thumbFile);
          return `<button type="button" class="bib-lightbox__thumb${thumbIndex === index ? " is-active" : ""}" data-bib-lightbox-index="${thumbIndex}" aria-label="${escapeHtml(thumbFile)}">
            <img src="${escapeHtml(thumb)}" alt="${escapeHtml(thumbFile)}">
          </button>`;
        }).join("")}</div>` : ""}
      </div>
    </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  container.innerHTML = `
    <div class="bib-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">世界観・設定 (Bible)</h2>
        <span class="bib-info">${escapeHtml(state.slug)}</span>
        <span class="bib-spacer"></span>
        <button type="button" class="nc-button nc-button--primary" data-action="L01">Bible 全体構築 (再生成)</button>
        <button type="button" class="nc-button nc-button--secondary" data-action="L01b">文法チェック (Lint)</button>
        <button type="button" class="nc-button nc-button--secondary" data-action="L01c">深掘り (Deepen)</button>
        <button type="button" class="nc-button nc-button--ghost" data-ai-edit-layer="L01" title="AI 編集 view へ遷移し、L01 Bible の context を prefill します">L01 を AI で修正</button>
      </div>
      ${renderTabs(state.tab)}
      <div class="bib-content">${renderBibleContent(state)}</div>
    </div>
    ${renderModal(state)}
    ${renderLightbox(state)}
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.bible = await apiGetBible(state.slug);
  } catch (error) {
    state.bible = null;
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

function setToast(state: ViewState, container: HTMLElement, message: string, kind: NonNullable<ViewState["toast"]>["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

function formArgs(layer: ActionLayer, form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form);
  const args: Record<string, string> = {};
  if (layer === "L01") {
    args["--concept"] = String(data.get("concept") ?? "").trim();
    const artStyle = String(data.get("artStyle") ?? "").trim();
    if (artStyle) args["--art-style"] = artStyle;
  } else if (layer === "L01b") {
    if (data.get("skipLlm")) args["--skip-llm"] = "";
    if (data.get("failOnFatal")) args["--fail-on-fatal"] = "";
  } else {
    args["--concept"] = String(data.get("concept") ?? "").trim();
    const note = String(data.get("styleRefNote") ?? "").trim();
    if (note) args["--style-ref-note"] = note;
    if (data.get("reLint")) args["--re-lint"] = "";
  }
  return args;
}

export function mountBibleView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    bible: null,
    tab: "world",
    displayMode: "reader",
    loading: false,
    error: null,
    modal: null,
    runningLayer: null,
    log: [],
    lightbox: null,
    imageJob: null,
    toast: null,
  };
  let stream: { close: () => void } | null = null;
  let lightboxKeyListenerAttached = false;

  function onLightboxKeydown(event: KeyboardEvent): void {
    if (!state.lightbox) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigateLightbox(state, -1);
      render(container, state);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      navigateLightbox(state, 1);
      render(container, state);
    }
  }

  const detachLightboxKeys = (): void => {
    if (!lightboxKeyListenerAttached) return;
    document.removeEventListener("keydown", onLightboxKeydown);
    lightboxKeyListenerAttached = false;
  };

  const attachLightboxKeys = (): void => {
    if (lightboxKeyListenerAttached) return;
    document.addEventListener("keydown", onLightboxKeydown);
    lightboxKeyListenerAttached = true;
  };

  const closeLightbox = (): void => {
    state.lightbox = null;
    detachLightboxKeys();
    render(container, state);
  };

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-bib-lightbox-close]")) {
      closeLightbox();
      return;
    }
    if (target.closest("[data-bib-lightbox-prev]")) {
      navigateLightbox(state, -1);
      render(container, state);
      return;
    }
    if (target.closest("[data-bib-lightbox-next]")) {
      navigateLightbox(state, 1);
      render(container, state);
      return;
    }
    const lightboxIndex = target.closest<HTMLElement>("[data-bib-lightbox-index]")?.dataset.bibLightboxIndex;
    if (lightboxIndex !== undefined && state.lightbox) {
      const index = Number(lightboxIndex);
      if (Number.isInteger(index)) {
        state.lightbox.index = Math.max(0, Math.min(index, state.lightbox.files.length - 1));
        render(container, state);
      }
      return;
    }
    const lightboxOverlay = target.closest<HTMLElement>("[data-bib-lightbox-overlay]");
    if (lightboxOverlay && !target.closest("[data-bib-lightbox-card]")) {
      closeLightbox();
      return;
    }
    const lightboxTrigger = target.closest<HTMLElement>("[data-bib-lightbox]");
    const lightboxKind = lightboxTrigger?.dataset.bibKind;
    const lightboxId = lightboxTrigger?.dataset.bibId;
    if ((lightboxKind === "characters" || lightboxKind === "locations" || lightboxKind === "props") && lightboxId) {
      openLightbox(state, lightboxKind, lightboxId);
      if (state.lightbox) {
        attachLightboxKeys();
        render(container, state);
      }
      return;
    }
    const tab = target.closest<HTMLButtonElement>("[data-bible-tab]")?.dataset.bibleTab as BibleTab | undefined;
    if (tab && BIBLE_TABS.some((item) => item.id === tab)) {
      state.tab = tab;
      state.displayMode = "reader";
      render(container, state);
      return;
    }
    const mode = target.closest<HTMLButtonElement>("[data-display-mode]")?.dataset.displayMode as DisplayMode | undefined;
    if (mode === "reader" || mode === "raw") {
      state.displayMode = mode;
      render(container, state);
      return;
    }
    const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action as ActionLayer | undefined;
    if (action === "L01" || action === "L01b" || action === "L01c") {
      state.modal = action;
      state.log = [];
      render(container, state);
      return;
    }
    const aiLayer = target.closest<HTMLButtonElement>("[data-ai-edit-layer]")?.dataset.aiEditLayer;
    if (aiLayer) {
      navigateToAiEdit(aiLayer, { slug: state.slug, episode: store.state.currentEpisode || 1 });
      return;
    }
    if (target.closest("[data-close-modal]") && !state.runningLayer) {
      state.modal = null;
      state.log = [];
      render(container, state);
      return;
    }
    // タブヘッダ: 全 entity 監査実行
    const auditFullBtn = target.closest<HTMLElement>('[data-bib-audit-action="full"]');
    if (auditFullBtn) {
      if (state.imageJob) return;
      const headerKind = (auditFullBtn.dataset.bibKind as AssetKind | undefined) ?? "locations";
      startAuditJob({ entityKind: headerKind, targets: undefined });
      return;
    }
    // タブヘッダ: 一括再生成
    const bulkBtn = target.closest<HTMLElement>("[data-bib-bulk-regen]");
    if (bulkBtn) {
      if (state.imageJob) return;
      const headerKind = (bulkBtn.dataset.bibKind as AssetKind | undefined) ?? "locations";
      const mode = bulkBtn.dataset.bibBulkRegen;
      const severities: BibleAuditSeverity[] = mode === "critical_major" ? ["critical", "major"] : ["critical"];
      const confirmed = window.confirm(
        `${kindLabel(headerKind)}タブの ${severities.join("/")} variant を一括再生成します。\nL02 を entity ごとに順次起動 → 全完了後に L02_audit を 1 回実行。\n途中経過はタブ上部に表示されます。続行しますか?`
      );
      if (!confirmed) return;
      startBulkRegen({ entityKind: headerKind, severities });
      return;
    }
    // lightbox 内: variant 再生成 / 単独再監査
    const imgActionBtn = target.closest<HTMLElement>("[data-bib-img-action]");
    if (imgActionBtn) {
      if (state.imageJob) return;
      const action = imgActionBtn.dataset.bibImgAction;
      const entityKind = (imgActionBtn.dataset.bibKind as AssetKind | undefined) ?? "locations";
      const entityId = imgActionBtn.dataset.bibEntity ?? "";
      const variant = imgActionBtn.dataset.bibVariant ?? "";
      if (!entityId) return;
      if (action === "regen" && variant) {
        startRegenJob({ entityKind, entityId, variant });
      } else if (action === "audit") {
        startAuditJob({ entityKind, targets: [entityId], entityId });
      }
      return;
    }
  }, { signal: controller.signal });

  /**
   * kind に応じた L02 引数を組み立てる。
   *   locations -> --location-ids / --location-variants
   *   characters -> --character-ids / --variants (L02 既存)
   *   props -> --prop-ids / --prop-variants
   */
  function buildL02RegenArgs(entityKind: AssetKind, entityId: string, variant: string): Record<string, string> {
    const base: Record<string, string> = {
      "--kinds": entityKind,
      "--skip-existing": "false",
      "--concurrency": "1",
    };
    if (entityKind === "locations") {
      base["--location-ids"] = entityId;
      base["--location-variants"] = variant;
    } else if (entityKind === "characters") {
      base["--character-ids"] = entityId;
      base["--variants"] = variant;
    } else {
      base["--prop-ids"] = entityId;
      base["--prop-variants"] = variant;
    }
    return base;
  }

  /**
   * L02 単一 variant 再生成 → 完了後に L02_audit でその entity を再監査。
   */
  function startRegenJob(opts: { entityKind: AssetKind; entityId: string; variant: string }): void {
    const job: NonNullable<ViewState["imageJob"]> = {
      kind: "regen",
      entityKind: opts.entityKind,
      entityId: opts.entityId,
      variant: opts.variant,
      log: [`L02 開始: kind=${opts.entityKind} id=${opts.entityId} variant=${opts.variant}`],
    };
    state.imageJob = job;
    render(container, state);
    let regenStream: { close: () => void } | null = null;
    const args = buildL02RegenArgs(opts.entityKind, opts.entityId, opts.variant);
    void apiPostJob({ layer: "L02" as LayerId, slug: state.slug, args })
      .then((res) => {
        regenStream = openJobStream(res.job_id, {
          onEvent: (entry: JobEvent) => {
            job.log.push(`[L02:${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            regenStream?.close();
            regenStream = null;
            job.log.push(`[L02] done: ${info.state}`);
            if (info.state === "succeeded") {
              if (state.lightbox && state.lightbox.id === opts.entityId) {
                state.lightbox.cacheBust = Date.now();
              }
              chainAuditAfterRegen(opts.entityKind, opts.entityId, job);
            } else {
              state.imageJob = null;
              setToast(state, container, `L02 ${info.state}`, "danger");
              render(container, state);
            }
          },
          onError: (err) => {
            regenStream?.close();
            regenStream = null;
            state.imageJob = null;
            setToast(state, container, err.message, "danger");
            render(container, state);
          },
        });
      })
      .catch((err) => {
        state.imageJob = null;
        setToast(state, container, `L02 起動失敗: ${errorText(err)}`, "danger");
        render(container, state);
      });
  }

  function chainAuditAfterRegen(
    entityKind: AssetKind,
    entityId: string,
    prevJob: NonNullable<ViewState["imageJob"]>
  ): void {
    prevJob.log.push(`[L02_audit] 開始: --kinds=${entityKind} --targets=${entityId}`);
    render(container, state);
    let auditStream: { close: () => void } | null = null;
    void apiPostJob({
      layer: "L02_audit" as LayerId,
      slug: state.slug,
      args: {
        "--kinds": entityKind,
        "--targets": entityId,
        "--concurrency": "1",
      },
    })
      .then((res) => {
        auditStream = openJobStream(res.job_id, {
          onEvent: (entry: JobEvent) => {
            prevJob.log.push(`[audit:${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            auditStream?.close();
            auditStream = null;
            prevJob.log.push(`[audit] done: ${info.state}`);
            state.imageJob = null;
            render(container, state);
            void refresh(state, container);
            setToast(state, container, `再生成+再監査 完了 (${entityId})`, "success");
          },
          onError: (err) => {
            auditStream?.close();
            auditStream = null;
            state.imageJob = null;
            setToast(state, container, err.message, "danger");
            render(container, state);
          },
        });
      })
      .catch((err) => {
        state.imageJob = null;
        setToast(state, container, `L02_audit 起動失敗: ${errorText(err)}`, "danger");
        render(container, state);
      });
  }

  /**
   * 一括再生成: 現在の audit から指定 severities にマッチする (entity, [variants]) を抽出し、
   * entity 単位で L02 を順次実行 → 全完了後に L02_audit を該当 entity 群に走らせる。
   */
  function startBulkRegen(opts: { entityKind: AssetKind; severities: BibleAuditSeverity[] }): void {
    const bible = state.bible;
    if (!bible) return;
    const audit = getAuditForKind(bible, opts.entityKind);
    if (!audit) {
      setToast(state, container, "audit が無いため bulk 再生成できません", "warning");
      return;
    }
    const sevSet = new Set<BibleAuditSeverity>(opts.severities);
    const idField = getEntityIdField(opts.entityKind);
    const queue: Array<{ entityId: string; variants: string[] }> = [];
    for (const e of getAuditEntities(audit, opts.entityKind)) {
      const bad = e.variants.filter((v) => sevSet.has(v.severity)).map((v) => v.variant);
      if (bad.length === 0) continue;
      const id = String((e as Record<string, unknown>)[idField] ?? "");
      if (!id) continue;
      queue.push({ entityId: id, variants: bad });
    }
    if (queue.length === 0) {
      setToast(state, container, "対象がありません", "info");
      return;
    }
    const totalImages = queue.reduce((s, q) => s + q.variants.length, 0);
    const job: NonNullable<ViewState["imageJob"]> = {
      kind: "bulk_regen",
      entityKind: opts.entityKind,
      entityId: queue[0].entityId,
      variant: "",
      log: [
        `bulk_regen 開始: ${opts.severities.join("+")} の ${totalImages} variant / ${queue.length} entity を順次再生成`,
      ],
      bulkProgress: { total: queue.length, done: 0 },
    };
    state.imageJob = job;
    render(container, state);
    void runBulkQueue(job, queue, opts.entityKind);
  }

  async function runBulkQueue(
    job: NonNullable<ViewState["imageJob"]>,
    queue: Array<{ entityId: string; variants: string[] }>,
    entityKind: AssetKind
  ): Promise<void> {
    const completedIds: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      const { entityId, variants } = queue[i];
      job.entityId = entityId;
      job.bulkProgress = { total: queue.length, done: i };
      job.log.push(`[${i + 1}/${queue.length}] L02 開始: ${entityId} variants=${variants.join(",")}`);
      render(container, state);
      try {
        await runOneL02(entityKind, entityId, variants, job);
        completedIds.push(entityId);
        if (state.lightbox && state.lightbox.id === entityId) {
          state.lightbox.cacheBust = Date.now();
        }
      } catch (e) {
        job.log.push(`[${i + 1}/${queue.length}] L02 FAIL: ${(e as Error).message}`);
        // 失敗しても続行 (1 entity 失敗で全停止しない)
      }
      render(container, state);
    }
    job.log.push(`[bulk] L02 完了 ${completedIds.length}/${queue.length}。L02_audit を targets=${completedIds.length} 件で実行`);
    render(container, state);
    if (completedIds.length === 0) {
      state.imageJob = null;
      render(container, state);
      setToast(state, container, "bulk_regen: 全 entity 失敗", "danger");
      return;
    }
    try {
      await runOneAudit(entityKind, completedIds, job);
    } catch (e) {
      job.log.push(`[bulk] audit FAIL: ${(e as Error).message}`);
    }
    state.imageJob = null;
    render(container, state);
    void refresh(state, container);
    setToast(state, container, `一括再生成完了: ${completedIds.length}/${queue.length} entity`, "success");
  }

  function runOneL02(
    entityKind: AssetKind,
    entityId: string,
    variants: string[],
    sink: NonNullable<ViewState["imageJob"]>
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const args: Record<string, string> = {
        "--kinds": entityKind,
        "--skip-existing": "false",
        "--concurrency": "2",
      };
      if (entityKind === "locations") {
        args["--location-ids"] = entityId;
        args["--location-variants"] = variants.join(",");
      } else if (entityKind === "characters") {
        args["--character-ids"] = entityId;
        args["--variants"] = variants.join(",");
      } else {
        args["--prop-ids"] = entityId;
        args["--prop-variants"] = variants.join(",");
      }
      let s: { close: () => void } | null = null;
      void apiPostJob({ layer: "L02" as LayerId, slug: state.slug, args })
        .then((res) => {
          s = openJobStream(res.job_id, {
            onEvent: (entry: JobEvent) => {
              sink.log.push(`[L02:${entry.channel}] ${entry.line}`);
              render(container, state);
            },
            onDone: (info) => {
              s?.close();
              s = null;
              sink.log.push(`[L02] done: ${info.state}`);
              if (info.state === "succeeded") resolve();
              else reject(new Error(`L02 ${info.state}`));
            },
            onError: (err) => {
              s?.close();
              s = null;
              reject(err);
            },
          });
        })
        .catch((err) => reject(err));
    });
  }

  function runOneAudit(
    entityKind: AssetKind,
    entityIds: string[],
    sink: NonNullable<ViewState["imageJob"]>
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let s: { close: () => void } | null = null;
      void apiPostJob({
        layer: "L02_audit" as LayerId,
        slug: state.slug,
        args: {
          "--kinds": entityKind,
          "--targets": entityIds.join(","),
          "--concurrency": entityIds.length === 1 ? "1" : "3",
        },
      })
        .then((res) => {
          s = openJobStream(res.job_id, {
            onEvent: (entry: JobEvent) => {
              sink.log.push(`[audit:${entry.channel}] ${entry.line}`);
              render(container, state);
            },
            onDone: (info) => {
              s?.close();
              s = null;
              sink.log.push(`[audit] done: ${info.state}`);
              if (info.state === "succeeded") resolve();
              else reject(new Error(`audit ${info.state}`));
            },
            onError: (err) => {
              s?.close();
              s = null;
              reject(err);
            },
          });
        })
        .catch((err) => reject(err));
    });
  }

  /** L02_audit を単独実行。targets 省略時は全 entity (kind 単位)。 */
  function startAuditJob(opts: { entityKind: AssetKind; targets?: string[] | undefined; entityId?: string }): void {
    const job: NonNullable<ViewState["imageJob"]> = {
      kind: "audit",
      entityKind: opts.entityKind,
      entityId: opts.entityId ?? "",
      variant: "",
      log: [`L02_audit 開始: --kinds=${opts.entityKind}${opts.targets && opts.targets.length > 0 ? ` --targets=${opts.targets.join(",")}` : " (全 entity)"}`],
    };
    state.imageJob = job;
    render(container, state);
    let auditStream: { close: () => void } | null = null;
    const args: Record<string, string> = {
      "--kinds": opts.entityKind,
      "--concurrency": opts.targets && opts.targets.length === 1 ? "1" : "3",
    };
    if (opts.targets && opts.targets.length > 0) args["--targets"] = opts.targets.join(",");
    void apiPostJob({ layer: "L02_audit" as LayerId, slug: state.slug, args })
      .then((res) => {
        auditStream = openJobStream(res.job_id, {
          onEvent: (entry: JobEvent) => {
            job.log.push(`[audit:${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            auditStream?.close();
            auditStream = null;
            job.log.push(`[audit] done: ${info.state}`);
            state.imageJob = null;
            render(container, state);
            void refresh(state, container);
            setToast(state, container, info.state === "succeeded" ? "監査完了" : `監査 ${info.state}`, info.state === "succeeded" ? "success" : "warning");
          },
          onError: (err) => {
            auditStream?.close();
            auditStream = null;
            state.imageJob = null;
            setToast(state, container, err.message, "danger");
            render(container, state);
          },
        });
      })
      .catch((err) => {
        state.imageJob = null;
        setToast(state, container, `L02_audit 起動失敗: ${errorText(err)}`, "danger");
        render(container, state);
      });
  }

  container.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const layer = form.dataset.bibForm as ActionLayer | undefined;
    if (!(layer === "L01" || layer === "L01b" || layer === "L01c")) return;
    state.runningLayer = layer;
    state.log = [`starting ${layer}...`];
    render(container, state);
    void apiPostJob({ layer: layer as LayerId, slug: state.slug, args: formArgs(layer, form) })
      .then((job) => {
        stream = openJobStream(job.job_id, {
          onEvent: (entry: JobEvent) => {
            state.log.push(`[${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            state.log.push(`[system] done: ${info.state}`);
            state.runningLayer = null;
            stream?.close();
            stream = null;
            void refresh(state, container);
          },
          onError: (error) => {
            state.runningLayer = null;
            setToast(state, container, error.message, "danger");
          },
        });
      })
      .catch((error) => {
        state.runningLayer = null;
        setToast(state, container, `起動に失敗: ${errorText(error)}`, "danger");
      });
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    detachLightboxKeys();
    stream?.close();
    container.innerHTML = "";
  };
}
