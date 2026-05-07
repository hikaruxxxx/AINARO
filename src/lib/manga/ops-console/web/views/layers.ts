import {
  ApiError,
  apiAbortJob,
  apiGetJobs,
  apiPostJob,
  openJobStream,
  type JobStartRequest,
  type JobState,
  type JobSummary,
  type LayerId,
} from "../lib/api";
import { store } from "../lib/store";

type LayerCard = {
  id: LayerId;
  label: string;
  scope: "work" | "episode" | "volume";
  fields: Array<{ name: string; label: string; type: "text" | "number" | "select"; options?: string[]; required?: boolean; placeholder?: string }>;
};

const LAYERS: LayerCard[] = [
  {
    id: "L02",
    label: "L02 Bible Images",
    scope: "work",
    fields: [
      { name: "--only", label: "only", type: "text", placeholder: "char_id,loc_id" },
      { name: "--kinds", label: "kinds", type: "select", options: ["", "characters", "locations", "props", "characters,locations,props"] },
      { name: "--concurrency", label: "concurrency", type: "number", placeholder: "1" },
    ],
  },
  {
    id: "L09",
    label: "L09 Render",
    scope: "episode",
    fields: [
      { name: "--pages", label: "pages", type: "text", placeholder: "1,2" },
      { name: "--version", label: "version", type: "text", placeholder: "v2" },
      { name: "--revision-id", label: "revision id", type: "text" },
    ],
  },
  { id: "L11", label: "L11 Audit", scope: "episode", fields: [] },
  {
    id: "L12",
    label: "L12 Repair",
    scope: "episode",
    fields: [
      { name: "--mode", label: "mode", type: "select", options: ["", "audit", "revision-queue"] },
      { name: "--max-attempts", label: "max attempts", type: "number", placeholder: "3" },
    ],
  },
  {
    id: "L13",
    label: "L13 KDP",
    scope: "volume",
    fields: [
      { name: "volume", label: "volume", type: "number", required: true, placeholder: "1" },
      { name: "--episodes", label: "episodes", type: "text", required: true, placeholder: "1,2" },
      { name: "--title", label: "title", type: "text" },
      { name: "--series-name", label: "series", type: "text" },
      { name: "--keywords", label: "keywords", type: "text" },
      { name: "--author", label: "author", type: "text" },
      { name: "--publication-date", label: "publication date", type: "text", placeholder: "2026-05-06" },
    ],
  },
  { id: "kdp-dry-run", label: "KDP Dry Run", scope: "volume", fields: [{ name: "volume", label: "volume", type: "number", required: true, placeholder: "1" }] },
  { id: "scrape-bsr", label: "Scrape BSR", scope: "work", fields: [] },
];

const CSS = `
.lyr-view { display:grid; grid-template-columns:minmax(360px, 0.9fr) minmax(420px, 1.1fr); gap:16px; align-items:start; }
.lyr-cards { display:grid; gap:10px; }
.lyr-card { background:var(--surface-elevated); border:1px solid var(--border-default); border-radius:8px; padding:12px; display:grid; gap:10px; }
.lyr-card-head { display:flex; align-items:center; gap:8px; }
.lyr-card h3 { margin:0; font-size:15px; }
.lyr-scope { color:#64748b; font-size:12px; margin-left:auto; }
.lyr-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; }
.lyr-field { display:grid; gap:4px; color:#526076; font-size:12px; font-weight:700; }
.lyr-field input,.lyr-field select { min-height:32px; border:1px solid #c7cfdb; border-radius:6px; padding:0 8px; font:inherit; font-size:13px; }
.lyr-actions { display:flex; gap:8px; align-items:center; }
.lyr-btn { min-height:32px; border:1px solid #c7cfdb; border-radius:6px; background:#fff; color:#243044; padding:0 10px; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.lyr-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.lyr-btn.danger { border-color:#dc2626; color:#dc2626; }
.lyr-btn:disabled { opacity:.55; cursor:not-allowed; }
.lyr-badge { display:inline-flex; align-items:center; min-height:22px; border-radius:999px; padding:0 8px; font-size:12px; font-weight:700; background:#eef2f6; color:#475569; }
.lyr-badge.running { background:#dbeafe; color:#1d4ed8; }
.lyr-badge.succeeded { background:#dcfce7; color:#166534; }
.lyr-badge.failed,.lyr-badge.aborted { background:#fee2e2; color:#991b1b; }
.lyr-side { background:var(--surface-base); border:1px solid var(--border-default); border-radius:8px; min-height:520px; display:grid; grid-template-rows:auto auto minmax(0,1fr); }
.lyr-side-head { padding:12px; border-bottom:1px solid #e5e7eb; display:flex; gap:8px; align-items:center; }
.lyr-side-head h3 { margin:0; font-size:15px; }
.lyr-jobs { display:flex; gap:6px; padding:10px 12px; border-bottom:1px solid #e5e7eb; overflow:auto; }
.lyr-job-tab { white-space:nowrap; border:1px solid #c7cfdb; background:#fff; border-radius:999px; padding:4px 9px; font-size:12px; cursor:pointer; }
.lyr-job-tab.active { background:#2563eb; color:#fff; border-color:#2563eb; }
.lyr-log { padding:10px 12px; overflow:auto; max-height:620px; background:#0f172a; color:#e2e8f0; font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.lyr-line { white-space:pre-wrap; overflow-wrap:anywhere; border-bottom:1px solid rgba(148,163,184,.12); padding:2px 0; }
.lyr-line.stderr { color:#fca5a5; }
.lyr-line.system { color:#94a3b8; }
.lyr-empty { padding:24px; color:#64748b; font-size:14px; }
.lyr-error { color:#991b1b; font-size:12px; }
@media (max-width: 980px) { .lyr-view { grid-template-columns:1fr; } }
`;

type ViewState = {
  slug: string;
  episode: number;
  jobs: JobSummary[];
  selectedJobId: string | null;
  streams: Map<string, { close: () => void }>;
  error: string | null;
};

function ensureStyles(): void {
  if (document.getElementById("lyr-styles")) return;
  const style = document.createElement("style");
  style.id = "lyr-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "実行中なので待ってください";
    return `API ${error.status}: ${error.body}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function statusBadge(state: JobState): string {
  return `<span class="lyr-badge ${state}">${state}</span>`;
}

function fieldHtml(layer: LayerCard, field: LayerCard["fields"][number]): string {
  const id = `lyr-${layer.id}-${field.name}`;
  const label = `${field.label}${field.required ? " *" : ""}`;
  if (field.type === "select") {
    const options = (field.options ?? []).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value || "-")}</option>`).join("");
    return `<label class="lyr-field">${escapeHtml(label)}<select data-layer="${layer.id}" data-field="${escapeHtml(field.name)}" id="${escapeHtml(id)}">${options}</select></label>`;
  }
  return `<label class="lyr-field">${escapeHtml(label)}<input data-layer="${layer.id}" data-field="${escapeHtml(field.name)}" id="${escapeHtml(id)}" type="${field.type}" placeholder="${escapeHtml(field.placeholder ?? "")}"></label>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const latestByLayer = new Map<LayerId, JobSummary>();
  for (const job of state.jobs) {
    if (!latestByLayer.has(job.layer)) latestByLayer.set(job.layer, job);
  }
  const cards = LAYERS.map((layer) => {
    const job = latestByLayer.get(layer.id);
    const running = job?.state === "running";
    return `
      <section class="lyr-card lyr-card-${layer.id}">
        <div class="lyr-card-head">
          <h3>${escapeHtml(layer.label)}</h3>
          <span class="lyr-scope">${escapeHtml(layer.scope)}</span>
          ${job ? statusBadge(job.state) : ""}
        </div>
        ${layer.fields.length > 0 ? `<div class="lyr-fields">${layer.fields.map((f) => fieldHtml(layer, f)).join("")}</div>` : ""}
        <div class="lyr-actions">
          <button type="button" class="lyr-btn primary" data-start="${layer.id}" ${running ? "disabled" : ""}>${running ? "実行中" : "起動"}</button>
          ${running && job ? `<button type="button" class="lyr-btn danger" data-abort="${job.id}">abort</button>` : ""}
          ${job ? `<button type="button" class="lyr-btn" data-select-job="${job.id}">log</button>` : ""}
        </div>
      </section>`;
  }).join("");
  const selected = state.jobs.find((job) => job.id === state.selectedJobId) ?? state.jobs[0] ?? null;
  if (selected && state.selectedJobId !== selected.id) state.selectedJobId = selected.id;
  const tabs = state.jobs.map((job) => `<button type="button" class="lyr-job-tab ${job.id === state.selectedJobId ? "active" : ""}" data-select-job="${job.id}">${escapeHtml(job.layer)} ${escapeHtml(job.state)}</button>`).join("");
  const lines = selected?.events?.map((event) => `<div class="lyr-line ${event.channel}">[${escapeHtml(event.channel)}] ${escapeHtml(event.line)}</div>`).join("") ?? "";
  container.innerHTML = `
    <div class="lyr-view">
      <div class="lyr-cards">${cards}</div>
      <aside class="lyr-side">
        <div class="lyr-side-head"><h3>Jobs</h3>${state.error ? `<span class="lyr-error">${escapeHtml(state.error)}</span>` : ""}</div>
        <div class="lyr-jobs">${tabs || '<span class="lyr-empty">履歴なし</span>'}</div>
        <div class="lyr-log" id="lyr-log">${lines || '<div class="lyr-empty">job を選択してください</div>'}</div>
      </aside>
    </div>`;
}

function readStartRequest(root: HTMLElement, layer: LayerCard, slug: string, episode: number): JobStartRequest {
  const args: Record<string, string> = {};
  let volume: number | undefined;
  for (const field of layer.fields) {
    const input = Array.from(
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-layer="${layer.id}"]`)
    ).find((el) => el.dataset.field === field.name);
    const value = input?.value.trim() ?? "";
    if (field.required && !value) throw new Error(`${field.label} is required`);
    if (!value) continue;
    if (field.name === "volume") volume = Number(value);
    else args[field.name] = value;
  }
  const req: JobStartRequest = { layer: layer.id, slug, args };
  if (layer.scope === "episode") req.episode = episode;
  if (layer.scope === "volume") req.volume = volume ?? 1;
  return req;
}

function connectJob(state: ViewState, job: JobSummary, rerenderLog: () => void): void {
  if (job.state !== "running" || state.streams.has(job.id)) return;
  const stream = openJobStream(job.id, {
    onEvent: (event) => {
      const target = state.jobs.find((j) => j.id === job.id);
      if (!target) return;
      target.events = [...(target.events ?? []), event].slice(-1000);
      rerenderLog();
    },
    onDone: (info) => {
      const target = state.jobs.find((j) => j.id === job.id);
      if (target) {
        target.state = info.state;
        target.exitCode = info.exitCode ?? undefined;
      }
      state.streams.get(job.id)?.close();
      state.streams.delete(job.id);
      rerenderLog();
    },
    onError: (error) => {
      state.error = error.message;
      // openJobStream の onerror で source.close() 済み。streams Map に残ったままだと
      // 同 jobId に対する再接続が `state.streams.has(job.id)` で skip されて復帰不能。
      state.streams.delete(job.id);
      rerenderLog();
    },
  });
  state.streams.set(job.id, stream);
}

async function refreshJobs(state: ViewState, rerender: () => void): Promise<void> {
  const result = await apiGetJobs({ slug: state.slug, episode: state.episode });
  state.jobs = result.jobs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const job of state.jobs) connectJob(state, job, rerender);
  if (!state.selectedJobId && state.jobs[0]) state.selectedJobId = state.jobs[0].id;
}

export function mountLayersView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    // Phase 2A は currentSlug = defaultSlug 固定だが、Phase 2B/3 で multi-slug が解禁
    // されたとき current 優先で動くよう、currentSlug を先に評価する。
    // TODO(Phase 2B): store.subscribe で scope 変化を検知し refetch + reconnect する。
    slug: app.currentSlug || app.defaultSlug,
    episode: app.currentEpisode || app.defaultEpisode,
    jobs: [],
    selectedJobId: null,
    streams: new Map(),
    error: null,
  };

  const rerender = () => {
    const log = container.querySelector<HTMLElement>("#lyr-log");
    const shouldScroll = !log || log.scrollTop + log.clientHeight >= log.scrollHeight - 24;
    render(container, state);
    const nextLog = container.querySelector<HTMLElement>("#lyr-log");
    if (nextLog && shouldScroll) nextLog.scrollTop = nextLog.scrollHeight;
  };
  rerender();
  void refreshJobs(state, rerender).then(rerender).catch((e) => {
    state.error = errorText(e);
    rerender();
  });

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const start = target.closest<HTMLButtonElement>("[data-start]");
    const abort = target.closest<HTMLButtonElement>("[data-abort]");
    const select = target.closest<HTMLButtonElement>("[data-select-job]");
    if (select) {
      state.selectedJobId = select.dataset.selectJob ?? null;
      rerender();
      return;
    }
    if (abort?.dataset.abort) {
      void apiAbortJob(abort.dataset.abort).then(() => refreshJobs(state, rerender)).then(rerender).catch((e) => {
        state.error = errorText(e);
        rerender();
      });
      return;
    }
    if (start?.dataset.start) {
      const layer = LAYERS.find((item) => item.id === start.dataset.start);
      if (!layer) return;
      try {
        const req = readStartRequest(container, layer, state.slug, state.episode);
        void apiPostJob(req).then((result) => {
          state.selectedJobId = result.job_id;
          state.error = null;
          return refreshJobs(state, rerender);
        }).then(rerender).catch((e) => {
          state.error = errorText(e);
          rerender();
        });
      } catch (e) {
        state.error = errorText(e);
        rerender();
      }
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    for (const stream of state.streams.values()) stream.close();
    container.innerHTML = "";
  };
}
