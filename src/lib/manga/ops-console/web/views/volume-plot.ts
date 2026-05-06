import {
  ApiError,
  apiGetVolumePlot,
  apiPostJob,
  openJobStream,
  type JobEvent,
  type VolumePlot,
} from "../lib/api";
import {
  asKeyValueTable,
  asRecord,
  detailsRaw,
  escapeHtml,
  jsonHtml,
} from "../lib/data-display";
import { store } from "../lib/store";

type DisplayMode = "reader" | "raw";

type ViewState = {
  slug: string;
  volume: number;
  plot: VolumePlot | null;
  displayMode: DisplayMode;
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
.vplot-body { display: grid; gap: var(--space-3); max-width: 980px; }
.vplot-section { display: grid; gap: var(--space-2); }
.vplot-section h3 { margin: 0; font-size: var(--fs-lg); }
.vplot-mode { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.vp-episodes { display: grid; gap: var(--space-3); }
.vp-episode-card { display: grid; gap: var(--space-3); }
.vp-episode-head { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.vp-episode-head h3 { margin: 0; font-size: var(--fs-lg); }
.vp-arc { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.vp-arc__step { border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-2); background: var(--surface-sunken); }
.vp-arc__label { display: block; color: var(--text-tertiary); font-size: var(--fs-sm); font-weight: var(--fw-bold); margin-bottom: var(--space-1); }
.vp-beats { display: grid; gap: var(--space-2); }
.vp-beat { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.vp-beat__head { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.vp-beat__summary { line-height: 1.6; color: var(--text-primary); }
.vp-beat__visual { color: var(--text-secondary); font-size: var(--fs-sm); }
.vp-intensity { height: 6px; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.vp-intensity__bar { height: 100%; border-radius: inherit; background: var(--color-primary); }
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

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function renderDisplayMode(active: DisplayMode): string {
  return `<div class="vplot-mode">
    <button type="button" class="nc-pill${active === "reader" ? " nc-pill--active" : ""}" data-display-mode="reader">Reader</button>
    <button type="button" class="nc-pill${active === "raw" ? " nc-pill--active" : ""}" data-display-mode="raw">生 JSON</button>
  </div>`;
}

function intensity(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function renderBeats(beats: unknown): string {
  const items = Array.isArray(beats) ? beats : [];
  if (items.length === 0) return `<div class="nc-empty">beat がありません。</div>`;
  return `<div class="vp-beats">${items.map((beat) => {
    const b = asRecord(beat);
    const value = intensity(b.emotional_intensity);
    return `<div class="vp-beat">
      <div class="vp-beat__head">
        <span class="nc-code">#${escapeHtml(String(b.beat_idx ?? "-"))}</span>
        ${b.label ? `<span class="nc-badge nc-badge--info">${escapeHtml(String(b.label))}</span>` : ""}
      </div>
      <div class="vp-beat__summary">${escapeHtml(String(b.summary ?? ""))}</div>
      <div class="vp-intensity" title="emotional_intensity ${value}"><div class="vp-intensity__bar" style="width:${Math.round(value * 100)}%"></div></div>
      ${b.key_visual ? `<div class="vp-beat__visual">絵の核: ${escapeHtml(String(b.key_visual))}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function renderEpisode(ep: unknown): string {
  const item = asRecord(ep);
  const episodeNo = Number(item.episode_no);
  const arc = asRecord(item.protagonist_arc);
  return `<article class="nc-card vp-episode-card">
    <div class="vp-episode-head">
      <span class="nc-badge nc-badge--neutral">ep${String(Number.isInteger(episodeNo) ? episodeNo : 0).padStart(2, "0")}</span>
      <h3>${escapeHtml(String(item.title_working ?? "タイトル未設定"))}</h3>
    </div>
    ${asKeyValueTable({
      "テーマ": item.theme,
      "ページ目安": item.page_target,
    })}
    <div class="vp-arc">
      <div class="vp-arc__step"><span class="vp-arc__label">start</span>${escapeHtml(String(arc.start ?? ""))}</div>
      <div class="vp-arc__step"><span class="vp-arc__label">turn</span>${escapeHtml(String(arc.turn ?? ""))}</div>
      <div class="vp-arc__step"><span class="vp-arc__label">end</span>${escapeHtml(String(arc.end ?? ""))}</div>
    </div>
    ${renderBeats(item.beats)}
    <details class="nc-card nc-card--sunken vplot-section">
      <summary>詳細 (must_include_events / cliffhanger_hook / brief_for_L3)</summary>
      ${asKeyValueTable({
        "必須イベント": item.must_include_events,
        "引き": item.cliffhanger_hook,
        "L3 入力ブリーフ": item.brief_for_L3,
      })}
    </details>
  </article>`;
}

function renderReader(plot: unknown): string {
  const obj = asRecord(plot);
  const episodes = Array.isArray(obj.episodes) ? obj.episodes : [];
  return `
    <div class="vplot-body">
      <section class="nc-card vplot-section">
        <h3>巻全体</h3>
        ${asKeyValueTable({
          "title (working)": obj.title_working,
          "テーマ": obj.volume_theme,
          "推定ページ数": obj.estimated_pages,
        })}
        ${obj.foreshadow_map ? detailsRaw("foreshadow_map", obj.foreshadow_map) : ""}
      </section>
      <section class="vp-episodes">
        <h3>エピソード一覧 (${episodes.length} 話)</h3>
        ${episodes.map(renderEpisode).join("")}
      </section>
    </div>`;
}

function renderModal(state: ViewState): string {
  if (!state.modalOpen) return "";
  const disabled = state.running ? " disabled" : "";
  return `
    <div class="nc-modal is-open" id="vplot-modal">
      <form class="nc-modal__card nc-modal__card--md vplot-modal-body" data-vplot-form="1">
        <div class="vplot-modal-head">
          <h3 class="vplot-modal-title">Volume Plot を構築</h3>
          <span class="vplot-info">${escapeHtml(state.slug)}</span>
          <span class="vplot-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-close-modal${disabled}>閉じる</button>
        </div>
        <label class="nc-field">
          <span class="nc-field__label">巻番号</span>
          <input class="nc-field__input" name="volume" type="number" min="1" step="1" value="${state.volume}" required>
        </label>
        <label class="nc-field">
          <span class="nc-field__label">企画書ファイル</span>
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
    if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
    if (state.plot) {
      return state.displayMode === "raw"
        ? `<pre class="nc-code-block">${jsonHtml(state.plot.plot)}</pre>`
        : renderReader(state.plot.plot);
    }
    if (state.error) return `<div class="nc-empty">Volume Plot は未作成です。「Volume Plot を構築」ボタンから生成してください。</div>`;
    return `<div class="nc-empty">Volume Plot は未作成です。「Volume Plot を構築」ボタンから生成してください。</div>`;
  })();
  container.innerHTML = `
    <div class="vplot-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">巻あらすじ・章構成 (Volume Plot)</h2>
        <span class="vplot-info">${escapeHtml(scope)}</span>
        <span class="vplot-spacer"></span>
        ${renderDisplayMode(state.displayMode)}
        <button type="button" class="nc-button nc-button--primary" data-open-modal>Volume Plot を構築</button>
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
    displayMode: "reader",
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
    const mode = target.closest<HTMLButtonElement>("[data-display-mode]")?.dataset.displayMode as DisplayMode | undefined;
    if (mode === "reader" || mode === "raw") {
      state.displayMode = mode;
      render(container, state);
      return;
    }
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
