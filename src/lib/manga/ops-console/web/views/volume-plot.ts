import {
  ApiError,
  apiGetVolumePlot,
  apiPostJob,
  openJobStream,
  type JobEvent,
  type VolumePlot,
} from "../lib/api";
import { store } from "../lib/store";

type ViewState = {
  slug: string;
  volume: number;
  plot: VolumePlot | null;
  loading: boolean;
  error: string | null;
  modalOpen: boolean;
  running: boolean;
  log: string[];
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
};

const CSS = `
.vplot-view { display: grid; gap: var(--space-3); }
.vplot-spacer { flex: 1 1 auto; }
.vplot-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.vplot-body { display: grid; gap: var(--space-3); }
.vplot-section { display: grid; gap: var(--space-2); }
.vplot-section h3 { margin: 0; font-size: var(--fs-lg); }
.vplot-modal-body { display: grid; gap: var(--space-3); padding: var(--space-4); }
.vplot-modal-head { display: flex; align-items: center; gap: var(--space-2); }
.vplot-modal-title { margin: 0; font-size: var(--fs-xl); }
.vplot-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.vplot-log { min-height: 160px; white-space: pre-wrap; }
`;

function ensureStyles(): void {
  if (document.getElementById("vplot-styles")) return;
  const style = document.createElement("style");
  style.id = "vplot-styles";
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function renderPlot(plot: unknown): string {
  const obj = asRecord(plot);
  return `
    <div class="vplot-body">
      <section class="nc-card vplot-section">
        <h3>synopsis</h3>
        <pre class="nc-code-block">${jsonHtml(obj.synopsis ?? obj.volume_synopsis ?? null)}</pre>
      </section>
      <section class="nc-card vplot-section">
        <h3>chapters</h3>
        <pre class="nc-code-block">${jsonHtml(obj.chapters ?? obj.episodes ?? [])}</pre>
      </section>
      <section class="nc-card vplot-section">
        <h3>characters</h3>
        <pre class="nc-code-block">${jsonHtml(obj.characters ?? obj.character_arcs ?? [])}</pre>
      </section>
      <details class="nc-card vplot-section">
        <summary>raw</summary>
        <pre class="nc-code-block">${jsonHtml(plot)}</pre>
      </details>
    </div>`;
}

function renderModal(state: ViewState): string {
  if (!state.modalOpen) return "";
  const disabled = state.running ? " disabled" : "";
  return `
    <div class="nc-modal is-open" id="vplot-modal">
      <form class="nc-modal__card nc-modal__card--md vplot-modal-body" data-vplot-form="1">
        <div class="vplot-modal-head">
          <h3 class="vplot-modal-title">Volume Plot 構築</h3>
          <span class="vplot-info">${escapeHtml(state.slug)}</span>
          <span class="vplot-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-close-modal${disabled}>閉じる</button>
        </div>
        <label class="nc-field">
          <span class="nc-field__label">volume</span>
          <input class="nc-field__input" name="volume" type="number" min="1" step="1" value="${state.volume}" required>
        </label>
        <label class="nc-field">
          <span class="nc-field__label">concept</span>
          <input class="nc-field__input" name="concept" required placeholder="data/manga/...json">
        </label>
        <div class="vplot-actions">
          <button type="submit" class="nc-button nc-button--primary"${disabled}>${state.running ? "起動中" : "起動"}</button>
        </div>
        <pre class="nc-code-block vplot-log">${escapeHtml(state.log.join("\n"))}</pre>
      </form>
    </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const scope = `${state.slug} / v${String(state.volume).padStart(2, "0")}`;
  const body = (() => {
    if (state.loading) return `<div class="nc-empty">loading...</div>`;
    if (state.plot) return renderPlot(state.plot.plot);
    if (state.error) return `<div class="nc-empty">Volume Plot は未作成です。「構築」ボタンから生成してください。</div>`;
    return `<div class="nc-empty">Volume Plot は未作成です。「構築」ボタンから生成してください。</div>`;
  })();
  container.innerHTML = `
    <div class="vplot-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">Volume Plot</h2>
        <span class="vplot-info">${escapeHtml(scope)}</span>
        <span class="vplot-spacer"></span>
        <button type="button" class="nc-button nc-button--primary" data-open-modal>Volume Plot 構築</button>
      </div>
      ${body}
    </div>
    ${renderModal(state)}
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.plot = await apiGetVolumePlot(state.slug, state.volume);
  } catch (error) {
    state.plot = null;
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

export function mountVolumePlotView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    volume: 1,
    plot: null,
    loading: false,
    error: null,
    modalOpen: false,
    running: false,
    log: [],
    toast: null,
  };
  let stream: { close: () => void } | null = null;

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-open-modal]")) {
      state.modalOpen = true;
      state.log = [];
      render(container, state);
      return;
    }
    if (target.closest("[data-close-modal]") && !state.running) {
      state.modalOpen = false;
      state.log = [];
      render(container, state);
    }
  }, { signal: controller.signal });

  container.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.vplotForm) return;
    const data = new FormData(form);
    const volume = Number(data.get("volume"));
    const concept = String(data.get("concept") ?? "").trim();
    state.volume = Number.isInteger(volume) && volume > 0 ? volume : 1;
    state.running = true;
    state.log = ["starting L02b..."];
    render(container, state);
    void apiPostJob({ layer: "L02b", slug: state.slug, volume: state.volume, args: { "--concept": concept } })
      .then((job) => {
        stream = openJobStream(job.job_id, {
          onEvent: (entry: JobEvent) => {
            state.log.push(`[${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            state.log.push(`[system] done: ${info.state}`);
            state.running = false;
            stream?.close();
            stream = null;
            void refresh(state, container);
          },
          onError: (error) => {
            state.running = false;
            setToast(state, container, error.message, "danger");
          },
        });
      })
      .catch((error) => {
        state.running = false;
        setToast(state, container, `起動に失敗: ${errorText(error)}`, "danger");
      });
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    stream?.close();
    container.innerHTML = "";
  };
}
