import {
  ApiError,
  apiGetVolumes,
  apiPostJob,
  openJobStream,
  type JobEvent,
  type JobState,
  type VolumeInfo,
} from "../lib/api";
import { store } from "../lib/store";

const CSS = `
.vol-view { display: grid; gap: var(--space-3); }
.vol-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.vol-spacer { flex: 1 1 auto; }
.vol-list { display: grid; gap: var(--space-3); }
.vol-card { display: grid; gap: var(--space-3); }
.vol-card__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.vol-card__head h3 { margin: 0; font-size: var(--fs-xl); }
.vol-status { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.vol-file { border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-2); display: grid; gap: var(--space-1); background: var(--surface-sunken); }
.vol-file strong { font-size: var(--fs-sm); }
.vol-meta { color: var(--text-secondary); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.vol-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.vol-preview { display: grid; gap: var(--space-3); grid-template-columns: minmax(180px, 240px) minmax(280px, 520px); align-items: start; }
.vol-preview embed { width: 100%; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-elevated); }
.vol-preview__links { grid-column: 1 / -1; display: flex; gap: var(--space-2); flex-wrap: wrap; }
.vol-log { max-height: 420px; }
.vol-modal-body { display: grid; gap: var(--space-3); padding: var(--space-4); }
.vol-modal-body h3 { margin: 0; }
@media (max-width: 860px) { .vol-preview { grid-template-columns: 1fr; } }
`;

type ModalState = {
  volume: number;
  episodes: string;
  author: string;
  publicationDate: string;
  coverFront: string;
  isbn: string;
};

type ViewState = {
  slug: string;
  volumes: VolumeInfo[];
  loading: boolean;
  error: string | null;
  modal: ModalState | null;
  log: string[];
  running: boolean;
};

function ensureStyles(): void {
  if (document.getElementById("vol-styles")) return;
  const style = document.createElement("style");
  style.id = "vol-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function vLabel(volume: number): string {
  return `v${String(volume).padStart(2, "0")}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function fmtSize(size: number | undefined): string {
  if (size === undefined) return "-";
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function fileCard(label: string, file: { exists: boolean; mtime?: string; size?: number }): string {
  return `<div class="vol-file">
    <strong>${escapeHtml(label)}</strong>
    <span class="nc-badge ${file.exists ? "nc-badge--success" : "nc-badge--neutral"}">${file.exists ? "ready" : "missing"}</span>
    <span class="vol-meta">mtime: ${escapeHtml(fmtDate(file.mtime))}</span>
    ${file.size !== undefined ? `<span class="vol-meta">size: ${escapeHtml(fmtSize(file.size))}</span>` : ""}
  </div>`;
}

function pdfUrl(slug: string, volume: number, file: string): string {
  return `/works/${encodeURIComponent(slug)}/volumes/${vLabel(volume)}/kdp/${encodeURIComponent(file)}`;
}

function renderPreview(slug: string, volume: VolumeInfo): string {
  const cover = volume.kdp_status.cover_pdf.exists;
  const manuscript = volume.kdp_status.manuscript_pdf.exists;
  if (!cover && !manuscript) return "";
  return `<div class="vol-preview">
    ${cover ? `<embed src="${escapeHtml(pdfUrl(slug, volume.volume, "cover.pdf"))}#toolbar=0" type="application/pdf" height="320">` : ""}
    ${manuscript ? `<embed src="${escapeHtml(pdfUrl(slug, volume.volume, "manuscript.pdf"))}#toolbar=0" type="application/pdf" height="520">` : ""}
    <div class="vol-preview__links">
      ${manuscript ? `<a class="nc-button nc-button--secondary nc-button--sm" href="${escapeHtml(pdfUrl(slug, volume.volume, "manuscript.pdf"))}" target="_blank" rel="noreferrer">manuscript.pdf を新規タブで開く</a>` : ""}
      ${cover ? `<a class="nc-button nc-button--secondary nc-button--sm" href="${escapeHtml(pdfUrl(slug, volume.volume, "cover.pdf"))}" target="_blank" rel="noreferrer">cover.pdf を新規タブで開く</a>` : ""}
    </div>
  </div>`;
}

function renderModal(state: ViewState): string {
  if (!state.modal) return "";
  const m = state.modal;
  return `<div class="nc-modal is-open">
    <form class="nc-modal__card nc-modal__card--md vol-modal-body" data-l13-form>
      <h3>L13 KDP package 起動 (${vLabel(m.volume)})</h3>
      <label class="nc-field"><span class="nc-field__label">episodes</span><input class="nc-field__input" name="episodes" required value="${escapeHtml(m.episodes)}"></label>
      <label class="nc-field"><span class="nc-field__label">author</span><input class="nc-field__input" name="author" required value="${escapeHtml(m.author)}"></label>
      <label class="nc-field"><span class="nc-field__label">publication-date</span><input class="nc-field__input" name="publication-date" required type="date" value="${escapeHtml(m.publicationDate)}"></label>
      <label class="nc-field"><span class="nc-field__label">cover-front (optional)</span><input class="nc-field__input" name="cover-front" value="${escapeHtml(m.coverFront)}" placeholder="data/manga/works/.../cover-front.png"></label>
      <label class="nc-field"><span class="nc-field__label">isbn (optional)</span><input class="nc-field__input" name="isbn" value="${escapeHtml(m.isbn)}"></label>
      <div class="vol-actions">
        <button type="button" class="nc-button nc-button--secondary" data-action="close-modal">キャンセル</button>
        <button type="submit" class="nc-button nc-button--primary" ${state.running ? "disabled" : ""}>起動</button>
      </div>
    </form>
  </div>`;
}

function renderVolume(slug: string, volume: VolumeInfo, running: boolean): string {
  const episodes = volume.episodes.join(",") || "1";
  return `<section class="nc-card vol-card">
    <div class="vol-card__head">
      <h3>${vLabel(volume.volume)}</h3>
      <span class="nc-badge nc-badge--info">${volume.episodes.length} エピソード</span>
      <span class="vol-meta">episodes: ${escapeHtml(episodes)}</span>
    </div>
    <div class="vol-status">
      ${fileCard("manuscript.pdf", volume.kdp_status.manuscript_pdf)}
      ${fileCard("cover.pdf", volume.kdp_status.cover_pdf)}
      ${fileCard("metadata.json", volume.kdp_status.metadata_json)}
      ${fileCard("kdp-input.md", volume.kdp_status.kdp_input_md)}
    </div>
    <div class="vol-actions">
      <button type="button" class="nc-button nc-button--primary" data-l13-volume="${volume.volume}" ${running ? "disabled" : ""}>L13 起動 (production)</button>
      <button type="button" class="nc-button nc-button--secondary" data-start-layer="kdp-dry-run" data-volume="${volume.volume}" ${running ? "disabled" : ""}>dry-run</button>
      <button type="button" class="nc-button nc-button--secondary" data-start-layer="scrape-bsr" data-volume="${volume.volume}" ${running ? "disabled" : ""}>BSR 取得</button>
    </div>
    ${renderPreview(slug, volume)}
  </section>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const body = (() => {
    if (state.loading && state.volumes.length === 0) return `<div class="nc-empty">読み込み中...</div>`;
    if (state.error && state.volumes.length === 0) return `<div class="view-placeholder"><h2>巻管理</h2><p>${escapeHtml(state.error)}</p></div>`;
    return `<div class="vol-list">${state.volumes.map((volume) => renderVolume(state.slug, volume, state.running)).join("") || '<div class="nc-empty">volume がありません。</div>'}</div>`;
  })();
  container.innerHTML = `
    <div class="vol-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">巻管理 (Volumes / KDP)</h2>
        <span class="vol-info">${escapeHtml(state.slug)} / 全 ${state.volumes.length} 巻</span>
        <span class="vol-spacer"></span>
        <button type="button" class="nc-button nc-button--secondary" data-action="reload" ${state.loading ? "disabled" : ""}>再読込</button>
      </div>
      ${body}
      ${state.log.length ? `<pre class="nc-code-block vol-log">${escapeHtml(state.log.join("\n"))}</pre>` : ""}
    </div>
    ${renderModal(state)}
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.volumes = (await apiGetVolumes(state.slug)).volumes;
  } catch (error) {
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

function appendLog(state: ViewState, event: JobEvent | string): void {
  state.log.push(typeof event === "string" ? event : `[${event.channel}] ${event.line}`);
  state.log = state.log.slice(-1000);
}

async function startJob(state: ViewState, container: HTMLElement, layer: "L13" | "kdp-dry-run" | "scrape-bsr", volume: number, args: Record<string, string> = {}): Promise<void> {
  state.running = true;
  state.log = [];
  render(container, state);
  try {
    const result = await apiPostJob({ layer, slug: state.slug, volume, args });
    appendLog(state, `job started: ${result.job_id}`);
    render(container, state);
    const stream = openJobStream(result.job_id, {
      onEvent: (event) => {
        appendLog(state, event);
        render(container, state);
      },
      onDone: (info: { state: JobState; exitCode: number | null }) => {
        appendLog(state, `done: ${info.state} exit=${info.exitCode ?? "-"}`);
        state.running = false;
        stream.close();
        void refresh(state, container);
      },
      onError: (error) => {
        appendLog(state, `SSE error: ${error.message}`);
        state.running = false;
        render(container, state);
      },
    });
  } catch (error) {
    appendLog(state, `起動失敗: ${errorText(error)}`);
    state.running = false;
    render(container, state);
  }
}

export function mountVolumesView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    volumes: [],
    loading: false,
    error: null,
    modal: null,
    log: [],
    running: false,
  };
  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-action='reload']")) {
      void refresh(state, container);
      return;
    }
    if (target.closest("[data-action='close-modal']")) {
      state.modal = null;
      render(container, state);
      return;
    }
    const l13 = target.closest<HTMLButtonElement>("[data-l13-volume]");
    if (l13) {
      const volumeNo = Number(l13.dataset.l13Volume);
      const volume = state.volumes.find((item) => item.volume === volumeNo);
      state.modal = {
        volume: volumeNo,
        episodes: (volume?.episodes.length ? volume.episodes : [1]).join(","),
        author: "AINARO",
        publicationDate: today(),
        coverFront: "",
        isbn: "",
      };
      render(container, state);
      return;
    }
    const start = target.closest<HTMLButtonElement>("[data-start-layer]");
    if (start) {
      const layer = start.dataset.startLayer as "kdp-dry-run" | "scrape-bsr";
      const volume = Number(start.dataset.volume || "1");
      void startJob(state, container, layer, volume);
    }
  }, { signal: controller.signal });

  container.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !state.modal) return;
    const data = new FormData(form);
    const args: Record<string, string> = {
      "--episodes": String(data.get("episodes") ?? "").trim(),
      "--author": String(data.get("author") ?? "").trim(),
      "--publication-date": String(data.get("publication-date") ?? "").trim(),
    };
    const coverFront = String(data.get("cover-front") ?? "").trim();
    const isbn = String(data.get("isbn") ?? "").trim();
    if (coverFront) args["--cover-front"] = coverFront;
    if (isbn) args["--isbn"] = isbn;
    const volume = state.modal.volume;
    state.modal = null;
    void startJob(state, container, "L13", volume, args);
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
