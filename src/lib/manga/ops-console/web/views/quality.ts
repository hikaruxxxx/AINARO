import {
  ApiError,
  apiGetManifest,
  type Manifest,
} from "../lib/api";
import { store } from "../lib/store";

type AnyRecord = Record<string, unknown>;

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
`;

type ViewState = {
  slug: string;
  episode: number;
  manifest: Manifest | null;
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

function renderAudit(manifest: Manifest): string {
  const audit = manifest.audit;
  if (!audit) return `<div class="nc-empty">audit.json はまだ生成されていません</div>`;
  const obj = asRecord(audit);
  const panels = Array.isArray(obj.panels) ? obj.panels : [];
  const failed = Array.isArray(obj.failed_panel_ids) ? obj.failed_panel_ids : [];
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
    return renderAudit(state.manifest);
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
    loading: false,
    error: null,
  };

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-action='reload']")) void refresh(state, container);
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
