import {
  ApiError,
  apiAbortJob,
  apiGetJobs,
  apiPostJob,
  openJobStream,
  type JobState,
  type JobSummary,
  type LayerId,
} from "../lib/api";
import { store } from "../lib/store";

const WORK_LAYERS: LayerId[] = ["kdp-dry-run", "scrape-bsr"];

const CSS = `
.wk-view { display:grid; grid-template-columns:minmax(320px, 0.8fr) minmax(420px, 1.2fr); gap:16px; align-items:start; }
.wk-actions { display:grid; gap:10px; }
.wk-card { background:#fff; border:1px solid #dbe1ea; border-radius:8px; padding:12px; display:grid; gap:10px; }
.wk-card-head { display:flex; align-items:center; gap:8px; }
.wk-card h3 { margin:0; font-size:15px; }
.wk-card p { margin:0; color:#64748b; font-size:13px; }
.wk-field { display:grid; gap:4px; color:#526076; font-size:12px; font-weight:700; max-width:160px; }
.wk-field input { min-height:32px; border:1px solid #c7cfdb; border-radius:6px; padding:0 8px; font:inherit; font-size:13px; }
.wk-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.wk-btn { min-height:32px; border:1px solid #c7cfdb; border-radius:6px; background:#fff; color:#243044; padding:0 10px; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.wk-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; }
.wk-btn.danger { border-color:#dc2626; color:#dc2626; }
.wk-btn:disabled { opacity:.55; cursor:not-allowed; }
.wk-badge { display:inline-flex; align-items:center; min-height:22px; border-radius:999px; padding:0 8px; font-size:12px; font-weight:700; background:#eef2f6; color:#475569; }
.wk-badge.running { background:#dbeafe; color:#1d4ed8; }
.wk-badge.succeeded { background:#dcfce7; color:#166534; }
.wk-badge.failed,.wk-badge.aborted { background:#fee2e2; color:#991b1b; }
.wk-side { background:#fff; border:1px solid #dbe1ea; border-radius:8px; min-height:480px; display:grid; grid-template-rows:auto auto minmax(0,1fr); }
.wk-side-head { padding:12px; border-bottom:1px solid #e5e7eb; display:flex; gap:8px; align-items:center; }
.wk-side-head h3 { margin:0; font-size:15px; }
.wk-jobs { display:flex; gap:6px; padding:10px 12px; border-bottom:1px solid #e5e7eb; overflow:auto; }
.wk-job-tab { white-space:nowrap; border:1px solid #c7cfdb; background:#fff; border-radius:999px; padding:4px 9px; font-size:12px; cursor:pointer; }
.wk-job-tab.active { background:#2563eb; color:#fff; border-color:#2563eb; }
.wk-log { padding:10px 12px; overflow:auto; max-height:620px; background:#0f172a; color:#e2e8f0; font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.wk-line { white-space:pre-wrap; overflow-wrap:anywhere; border-bottom:1px solid rgba(148,163,184,.12); padding:2px 0; }
.wk-line.stderr { color:#fca5a5; }
.wk-line.system { color:#94a3b8; }
.wk-empty { padding:24px; color:#64748b; font-size:14px; }
.wk-error { color:#991b1b; font-size:12px; }
@media (max-width: 980px) { .wk-view { grid-template-columns:1fr; } }
`;

type ViewState = {
  slug: string;
  volume: number;
  jobs: JobSummary[];
  selectedJobId: string | null;
  streams: Map<string, { close: () => void }>;
  error: string | null;
};

function ensureStyles(): void {
  if (document.getElementById("wk-styles")) return;
  const style = document.createElement("style");
  style.id = "wk-styles";
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
  return `<span class="wk-badge ${state}">${state}</span>`;
}

function latestJob(jobs: JobSummary[], layer: LayerId): JobSummary | null {
  return jobs.find((job) => job.layer === layer) ?? null;
}

function render(container: HTMLElement, state: ViewState): void {
  const kdp = latestJob(state.jobs, "kdp-dry-run");
  const bsr = latestJob(state.jobs, "scrape-bsr");
  const selected = state.jobs.find((job) => job.id === state.selectedJobId) ?? state.jobs[0] ?? null;
  if (selected && state.selectedJobId !== selected.id) state.selectedJobId = selected.id;
  const tabs = state.jobs.map((job) => `<button type="button" class="wk-job-tab ${job.id === state.selectedJobId ? "active" : ""}" data-select-job="${job.id}">${escapeHtml(job.layer)} ${escapeHtml(job.state)}</button>`).join("");
  const lines = selected?.events?.map((event) => `<div class="wk-line ${event.channel}">[${escapeHtml(event.channel)}] ${escapeHtml(event.line)}</div>`).join("") ?? "";

  container.innerHTML = `
    <div class="wk-view">
      <div class="wk-actions">
        <section class="wk-card">
          <div class="wk-card-head"><h3>KDP preflight</h3>${kdp ? statusBadge(kdp.state) : ""}</div>
          <p>volume 単位の dry-run を jobs API 経由で起動します。</p>
          <label class="wk-field">volume<input type="number" min="1" value="${String(state.volume)}" data-volume></label>
          <div class="wk-row">
            <button type="button" class="wk-btn primary" data-start-work="kdp-dry-run" ${kdp?.state === "running" ? "disabled" : ""}>${kdp?.state === "running" ? "実行中" : "起動"}</button>
            ${kdp?.state === "running" ? `<button type="button" class="wk-btn danger" data-abort="${kdp.id}">abort</button>` : ""}
            ${kdp ? `<button type="button" class="wk-btn" data-select-job="${kdp.id}">log</button>` : ""}
          </div>
        </section>
        <section class="wk-card">
          <div class="wk-card-head"><h3>BSR scrape</h3>${bsr ? statusBadge(bsr.state) : ""}</div>
          <p>作品 scope の BSR scrape を jobs API 経由で起動します。</p>
          <div class="wk-row">
            <button type="button" class="wk-btn primary" data-start-work="scrape-bsr" ${bsr?.state === "running" ? "disabled" : ""}>${bsr?.state === "running" ? "実行中" : "起動"}</button>
            ${bsr?.state === "running" ? `<button type="button" class="wk-btn danger" data-abort="${bsr.id}">abort</button>` : ""}
            ${bsr ? `<button type="button" class="wk-btn" data-select-job="${bsr.id}">log</button>` : ""}
          </div>
        </section>
      </div>
      <aside class="wk-side">
        <div class="wk-side-head"><h3>Jobs</h3>${state.error ? `<span class="wk-error">${escapeHtml(state.error)}</span>` : ""}</div>
        <div class="wk-jobs">${tabs || '<span class="wk-empty">履歴なし</span>'}</div>
        <div class="wk-log" id="wk-log">${lines || '<div class="wk-empty">job を選択してください</div>'}</div>
      </aside>
    </div>`;
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
      // 同 jobId に対する再接続が skip されて復帰不能になるため必ず削除する。
      state.streams.delete(job.id);
      rerenderLog();
    },
  });
  state.streams.set(job.id, stream);
}

async function refreshJobs(state: ViewState, rerender: () => void): Promise<void> {
  const results = await Promise.all(WORK_LAYERS.map((layer) => apiGetJobs({ slug: state.slug, layer })));
  state.jobs = results.flatMap((result) => result.jobs).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const job of state.jobs) connectJob(state, job, rerender);
  if (!state.selectedJobId && state.jobs[0]) state.selectedJobId = state.jobs[0].id;
}

export function mountWorksView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    // Phase 2A は currentSlug = defaultSlug 固定だが、Phase 2B/3 で multi-slug が解禁
    // されたとき current 優先で動くよう、currentSlug を先に評価する。
    // TODO(Phase 2B): store.subscribe で scope 変化を検知し refetch + reconnect する。
    slug: app.currentSlug || app.defaultSlug,
    volume: 1,
    jobs: [],
    selectedJobId: null,
    streams: new Map(),
    error: null,
  };

  const rerender = () => {
    const log = container.querySelector<HTMLElement>("#wk-log");
    const shouldScroll = !log || log.scrollTop + log.clientHeight >= log.scrollHeight - 24;
    render(container, state);
    const nextLog = container.querySelector<HTMLElement>("#wk-log");
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
    const start = target.closest<HTMLButtonElement>("[data-start-work]");
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
    if (!start?.dataset.startWork) return;
    const volumeInput = container.querySelector<HTMLInputElement>("[data-volume]");
    const volume = Number(volumeInput?.value || "1");
    state.volume = Number.isFinite(volume) && volume > 0 ? volume : 1;
    const layer = start.dataset.startWork as LayerId;
    const req = layer === "kdp-dry-run"
      ? { layer, slug: state.slug, volume: state.volume, args: {} }
      : { layer, slug: state.slug, args: {} };
    void apiPostJob(req).then((result) => {
      state.selectedJobId = result.job_id;
      state.error = null;
      return refreshJobs(state, rerender);
    }).then(rerender).catch((e) => {
      state.error = errorText(e);
      rerender();
    });
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    for (const stream of state.streams.values()) stream.close();
    container.innerHTML = "";
  };
}
