import {
  ApiError,
  apiGetManifest,
  type Manifest,
} from "../lib/api";
import { store } from "../lib/store";

type AnyRecord = Record<string, unknown>;
type AuditFinding = {
  check_kind: string;
  panel_id: string;
  severity: string;
  message: string;
  passed?: boolean;
};

const CSS = `
.q-view { display: grid; gap: var(--space-3); }
.q-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.q-spacer { flex: 1 1 auto; }
.q-content { display: grid; gap: var(--space-3); }
.q-list { display: grid; gap: var(--space-2); }
.q-card { display: grid; gap: var(--space-2); }
.q-card__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.q-card h3,.q-card h4 { margin: 0; }
.q-meta { color: var(--text-tertiary); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.q-filters { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.q-findings { display: grid; gap: var(--space-2); }
.q-finding { display: grid; gap: 4px; padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.q-finding__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.q-panel-actions { margin-left: auto; }
`;

type ViewState = {
  slug: string;
  episode: number;
  manifest: Manifest | null;
  selectedKinds: Set<string>;
  loading: boolean;
  error: string | null;
};

function ensureStyles(): void {
  if (document.getElementById("q-styles")) return;
  const style = document.createElement("style");
  style.id = "q-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
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

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function badgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "failed" || s === "error") return "nc-badge--danger";
  if (s === "passed" || s === "ok") return "nc-badge--success";
  return "nc-badge--neutral";
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function collectFindings(audit: unknown): AuditFinding[] {
  const obj = asRecord(audit);
  const result: AuditFinding[] = [];
  if (Array.isArray(obj.checks)) {
    for (const raw of obj.checks) {
      const check = asRecord(raw);
      result.push({
        check_kind: stringValue(check.check_kind, "unknown"),
        panel_id: stringValue(check.panel_id, "-"),
        severity: stringValue(check.severity, check.passed === false ? "error" : "warning"),
        message: stringValue(check.message, stringValue(check.detail, JSON.stringify(check))),
        passed: typeof check.passed === "boolean" ? check.passed : undefined,
      });
    }
  }
  if (Array.isArray(obj.panels)) {
    for (const rawPanel of obj.panels) {
      const panel = asRecord(rawPanel);
      const panelId = stringValue(panel.panel_id, stringValue(panel.id, "-"));
      const findings = Array.isArray(panel.findings) ? panel.findings : [];
      for (const rawFinding of findings) {
        const finding = asRecord(rawFinding);
        result.push({
          check_kind: stringValue(finding.check_kind, stringValue(finding.kind, "panel")),
          panel_id: panelId,
          severity: stringValue(finding.severity, stringValue(panel.status, "warning")),
          message: stringValue(finding.message, stringValue(finding.detail, JSON.stringify(finding))),
        });
      }
    }
  }
  return result;
}

function renderKindFilters(findings: AuditFinding[], selectedKinds: Set<string>): string {
  const kinds = Array.from(new Set(findings.map((finding) => finding.check_kind))).sort();
  if (kinds.length === 0) return "";
  return `<div class="q-filters">
    ${kinds.map((kind) => {
      const active = selectedKinds.has(kind);
      return `<button type="button" class="nc-pill${active ? " nc-pill--active" : ""}" data-q-kind="${escapeHtml(kind)}">${escapeHtml(kind)}</button>`;
    }).join("")}
  </div>`;
}

function renderAudit(manifest: Manifest, selectedKinds: Set<string>): string {
  const audit = manifest.audit;
  if (!audit) return `<div class="nc-empty">audit.json はまだ生成されていません</div>`;
  const obj = asRecord(audit);
  const panels = Array.isArray(obj.panels) ? obj.panels : [];
  const failed = Array.isArray(obj.failed_panel_ids) ? obj.failed_panel_ids : [];
  const findings = collectFindings(audit);
  const visibleFindings = findings.filter((finding) => selectedKinds.size === 0 || selectedKinds.has(finding.check_kind));
  const byPanel = new Map<string, AuditFinding[]>();
  for (const finding of visibleFindings) {
    const list = byPanel.get(finding.panel_id) ?? [];
    list.push(finding);
    byPanel.set(finding.panel_id, list);
  }
  const drilldown = Array.from(byPanel.entries()).map(([panelId, panelFindings]) => {
    const hasError = panelFindings.some((finding) => finding.severity.toLowerCase() === "error" || finding.passed === false);
    return `<section class="nc-card q-card">
      <div class="q-card__head">
        <h4>${escapeHtml(panelId)}</h4>
        <span class="nc-badge ${hasError ? "nc-badge--danger" : "nc-badge--warning"}">${panelFindings.length} findings</span>
        <span class="q-panel-actions"><button type="button" class="nc-button nc-button--secondary nc-button--sm" data-q-revision-panel="${escapeHtml(panelId)}">修正指示する</button></span>
      </div>
      <div class="q-findings">
        ${panelFindings.map((finding) => `<div class="q-finding">
          <div class="q-finding__head">
            <span class="nc-badge ${badgeClass(finding.severity)}">${escapeHtml(finding.severity)}</span>
            <span class="q-meta">${escapeHtml(finding.check_kind)}</span>
          </div>
          <div>${escapeHtml(finding.message)}</div>
        </div>`).join("")}
      </div>
    </section>`;
  }).join("");
  return `
    <div class="q-content">
      <section class="nc-card q-card">
        <div class="q-card__head">
          <h3>サマリ</h3>
          <span class="nc-badge ${failed.length > 0 ? "nc-badge--danger" : "nc-badge--success"}">失敗 ${failed.length} 件</span>
        </div>
        <pre class="nc-code-block">${jsonHtml(obj.summary ?? {})}</pre>
        <div class="q-meta">失敗 panel ID 一覧: ${escapeHtml(JSON.stringify(failed))}</div>
      </section>
      ${renderKindFilters(findings, selectedKinds)}
      <div class="q-list">
        ${drilldown || '<div class="nc-empty">選択中の check_kind に該当する所見はありません。</div>'}
      </div>
      <div class="q-list">
        ${panels.map((panel) => {
          const p = asRecord(panel);
          const status = String(p.status ?? "unknown");
          const id = String(p.panel_id ?? p.id ?? "-");
          return `<section class="nc-card q-card">
            <div class="q-card__head">
              <h4>${escapeHtml(id)}</h4>
              <span class="nc-badge ${badgeClass(status)}">${escapeHtml(status)}</span>
            </div>
            <div class="q-meta">理由・所見: ${escapeHtml(JSON.stringify(p.reasons ?? p.findings ?? []))}</div>
          </section>`;
        }).join("")}
      </div>
      <details class="nc-card q-card">
        <summary>監査結果の生 JSON</summary>
        <pre class="nc-code-block">${jsonHtml(audit)}</pre>
      </details>
    </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const scope = `${state.slug} / ep${String(state.episode).padStart(2, "0")}`;
  const body = (() => {
    if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
    if (state.error && !state.manifest) return `<div class="view-placeholder"><h2>品質監査 (Audit)</h2><p>${escapeHtml(state.error)}</p></div>`;
    if (!state.manifest) return `<div class="nc-empty">manifest が読み込まれていません。</div>`;
    return renderAudit(state.manifest, state.selectedKinds);
  })();
  container.innerHTML = `
    <div class="q-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">品質監査 (Audit)</h2>
        <span class="q-info">${escapeHtml(scope)}</span>
        <span class="q-spacer"></span>
        <button type="button" class="nc-button nc-button--secondary" data-action="reload" ${state.loading ? "disabled" : ""}>再読込</button>
      </div>
      <div class="q-content">${body}</div>
    </div>`;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.manifest = await apiGetManifest(state.slug, state.episode);
  } catch (error) {
    state.manifest = null;
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

export function mountQualityView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    episode: app.currentEpisode || app.defaultEpisode,
    manifest: null,
    selectedKinds: new Set(),
    loading: false,
    error: null,
  };

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-action='reload']")) void refresh(state, container);
    const kind = target.closest<HTMLElement>("[data-q-kind]")?.dataset.qKind;
    if (kind) {
      if (state.selectedKinds.has(kind)) state.selectedKinds.delete(kind);
      else state.selectedKinds.add(kind);
      render(container, state);
      return;
    }
    if (target.closest("[data-q-revision-panel]")) {
      store.update({ currentView: "revision" });
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
