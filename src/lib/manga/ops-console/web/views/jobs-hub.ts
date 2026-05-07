import { ApiError, apiAbortJob, apiGetJobs, apiPostJob, type JobSummary } from "../lib/api";
import {
  FAILURE_RECIPES,
  isFailureReason,
  type FailureCta,
  type FailureReason,
} from "../lib/failure-recipes";
import { store, type ViewName } from "../lib/store";
import { layerLabel } from "../labels";
import { openAiEditModal } from "../components/ai-edit-modal";

const CSS = `
.jobs-view { display: grid; gap: var(--space-3); }
.jobs-spacer { flex: 1 1 auto; }
.jobs-section { display: grid; gap: var(--space-2); }
.jobs-section h3 { margin: 0; font-size: var(--fs-lg); }
.jobs-grid { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.jobs-card { display: grid; gap: var(--space-2); }
.jobs-card__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.jobs-card h4 { margin: 0; font-size: var(--fs-md); }
.jobs-meta { color: var(--text-secondary); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.jobs-table-wrap { overflow: auto; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--surface-elevated); }
.jobs-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.jobs-table th,.jobs-table td { padding: var(--space-2); border-top: 1px solid var(--border-subtle); text-align: left; vertical-align: top; }
.jobs-table thead th { border-top: 0; color: var(--text-secondary); background: var(--surface-sunken); font-weight: var(--fw-bold); white-space: nowrap; }
.jobs-log { max-width: 360px; color: var(--text-tertiary); overflow-wrap: anywhere; }
.jobs-pattern { display: grid; gap: var(--space-1); }
.jobs-failure-list { display: grid; gap: var(--space-2); margin-top: var(--space-2); }
.jobs-failure-item { display: grid; gap: var(--space-1); padding: var(--space-2); border-top: 1px solid var(--border-subtle); }
.jobs-failure-actions { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.jobs-toast { position: fixed; top: 64px; right: 18px; z-index: 50; }
`;

type ViewState = {
  jobs: JobSummary[];
  loading: boolean;
  error: string | null;
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
  tick: number;
};

type FailureGroup = {
  key: string;
  reason: FailureReason;
  summary: string;
  jobs: JobSummary[];
};

function ensureStyles(): void {
  if (document.getElementById("jobs-hub-styles")) return;
  const style = document.createElement("style");
  style.id = "jobs-hub-styles";
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

function stateBadge(state: JobSummary["state"]): string {
  if (state === "succeeded") return "nc-badge--success";
  if (state === "failed") return "nc-badge--danger";
  if (state === "aborted") return "nc-badge--warning";
  return "nc-badge--info";
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function duration(job: JobSummary, now: number): string {
  const start = Date.parse(job.startedAt);
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "-";
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function scopeLabel(job: JobSummary): string {
  const parts = [job.scope.slug];
  if (job.scope.episode !== undefined) parts.push(`ep${String(job.scope.episode).padStart(2, "0")}`);
  if (job.scope.volume !== undefined) parts.push(`v${String(job.scope.volume).padStart(2, "0")}`);
  return parts.join(" / ");
}

function lastLog(job: JobSummary): string {
  const events = job.events ?? [];
  const event = [...events].reverse().find((item) => item.channel === "stderr") ?? events[events.length - 1];
  return event?.line ?? "";
}

function failurePattern(job: JobSummary): string {
  return (lastLog(job) || "(no stderr)").slice(0, 80);
}

function failureReason(job: JobSummary): FailureReason | null {
  return isFailureReason(job.failure_reason) ? job.failure_reason : null;
}

function fallbackFailureSummary(job: JobSummary): string {
  return failurePattern(job);
}

function failureGroupFor(job: JobSummary): { key: string; reason: FailureReason; summary: string } {
  const reason = failureReason(job);
  if (reason) return { key: `reason:${reason}`, reason, summary: FAILURE_RECIPES[reason].summary };
  const summary = fallbackFailureSummary(job);
  return { key: `fallback:${summary}`, reason: "unknown", summary };
}

function viewLabel(view: ViewName): string {
  const labels: Record<ViewName, string> = {
    index: "ホーム",
    "jobs-hub": "ジョブ",
    "quality-hub": "全作品品質",
    pipeline: "パイプライン",
    "name-gate": "ネーム",
    revision: "ページ承認",
    "revision-effects": "修正効果分析",
    quality: "品質監査",
    bible: "Bible",
    "volume-plot": "巻プロット",
    "kdp-metadata": "KDP メタ",
    "trademark-gate": "商標 / IP",
    improvements: "品質改善",
    "work-overview": "作品概要",
    volumes: "巻管理",
    layers: "レイヤー",
  };
  return labels[view];
}

function ctaLabel(cta: FailureCta): string {
  if (cta.kind === "open-view") return cta.label || viewLabel(cta.view);
  return cta.label;
}

function renderFailureCtas(job: JobSummary): string {
  const reason = failureReason(job) ?? "unknown";
  const recipe = FAILURE_RECIPES[reason];
  return `<div class="jobs-failure-actions">
    ${recipe.ctas.map((cta, index) => {
      const style = cta.kind === "rerun" ? "nc-button--primary" : cta.kind === "open-log" ? "nc-button--ghost" : "nc-button--secondary";
      return `<button type="button" class="nc-button ${style} nc-button--sm" data-failure-job="${escapeHtml(job.id)}" data-failure-cta="${index}">${escapeHtml(ctaLabel(cta))}</button>`;
    }).join("")}
  </div>`;
}

function renderRunning(jobs: JobSummary[], now: number): string {
  const running = jobs.filter((job) => job.state === "running");
  return `<section class="jobs-section">
    <h3>実行中 (${running.length} 件)</h3>
    ${running.length ? `<div class="jobs-grid">${running.map((job) => {
      const label = layerLabel(job.layer);
      return `<article class="nc-card jobs-card">
        <div class="jobs-card__head">
          <h4>${escapeHtml(label.title)}</h4>
          <span class="nc-badge nc-badge--info">${escapeHtml(label.subtitle || job.layer)}</span>
        </div>
        <div class="jobs-meta">${escapeHtml(scopeLabel(job))}</div>
        <div class="jobs-meta">経過 ${escapeHtml(duration(job, now))}</div>
        <button type="button" class="nc-button nc-button--danger nc-button--sm" data-abort-job="${escapeHtml(job.id)}">abort</button>
      </article>`;
    }).join("")}</div>` : '<div class="nc-empty">実行中の job はありません。</div>'}
  </section>`;
}

function renderHistory(jobs: JobSummary[], now: number): string {
  const recent = jobs.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 50);
  return `<section class="jobs-section">
    <h3>履歴 (直近 ${recent.length} 件)</h3>
    <div class="jobs-table-wrap">
      <table class="jobs-table">
        <thead><tr><th>時刻</th><th>作品</th><th>layer</th><th>state</th><th>duration</th><th>log</th></tr></thead>
        <tbody>
          ${recent.map((job) => {
            const label = layerLabel(job.layer);
            return `<tr>
              <td>${escapeHtml(fmtDate(job.startedAt))}</td>
              <td>${escapeHtml(scopeLabel(job))}</td>
              <td>${escapeHtml(label.title)} <span class="jobs-meta">${escapeHtml(label.subtitle || job.layer)}</span></td>
              <td><span class="nc-badge ${stateBadge(job.state)}">${escapeHtml(job.state)}</span></td>
              <td>${escapeHtml(duration(job, now))}</td>
              <td class="jobs-log">${escapeHtml(lastLog(job))}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderFailures(jobs: JobSummary[]): string {
  const groups = new Map<string, FailureGroup>();
  for (const job of jobs.filter((item) => item.state === "failed")) {
    const base = failureGroupFor(job);
    const group = groups.get(base.key) ?? { ...base, jobs: [] };
    group.jobs.push(job);
    groups.set(base.key, group);
  }
  const rows = Array.from(groups.values())
    .sort((a, b) => b.jobs.length - a.jobs.length)
    .map((group) => {
      const sorted = group.jobs.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      return `<tr>
      <td class="jobs-pattern">
        <strong>[${escapeHtml(group.reason)}] ${escapeHtml(group.summary)}</strong>
        <details><summary>jobs</summary>
          <div class="jobs-failure-list">
            ${sorted.map((job) => `<div class="jobs-failure-item">
              <div class="jobs-meta">${escapeHtml(job.id)} / ${escapeHtml(scopeLabel(job))} / ${escapeHtml(layerLabel(job.layer).title)} / ${escapeHtml(fmtDate(job.startedAt))}</div>
              ${renderFailureCtas(job)}
            </div>`).join("")}
          </div>
        </details>
      </td>
      <td>${group.jobs.length}</td>
      <td>${escapeHtml(fmtDate(sorted[0]?.startedAt))}</td>
    </tr>`;
    })
    .join("");
  return `<section class="jobs-section">
    <h3>失敗パターン (頻度降順)</h3>
    ${rows ? `<div class="jobs-table-wrap"><table class="jobs-table">
      <thead><tr><th>pattern</th><th>件数</th><th>最近時刻</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : '<div class="nc-empty">失敗 job はありません。</div>'}
  </section>`;
}

function openJobView(job: JobSummary, view: ViewName): void {
  store.update({
    currentSlug: job.scope.slug,
    currentEpisode: job.scope.episode ?? store.state.currentEpisode,
    currentView: view,
  });
}

function openAiEdit(job: JobSummary, cta: Extract<FailureCta, { kind: "ai-edit" }>): void {
  void openAiEditModal({
    scope: job.scope.slug,
    initialTarget: cta.target ?? "",
    initialPrompt: `${cta.prompt}\n\njob: ${job.id}\nkey: ${job.key}\nlast log: ${lastLog(job)}`,
    originLayer: job.layer,
    originView: "jobs-hub",
  });
}

function openLog(job: JobSummary): void {
  const lines = (job.events ?? []).slice(-40).map((event) => `[${event.channel}] ${event.line}`);
  window.alert(lines.join("\n") || "(log はありません)");
}

async function rerunJob(job: JobSummary): Promise<void> {
  await apiPostJob({
    layer: job.layer,
    slug: job.scope.slug,
    episode: job.scope.episode,
    volume: job.scope.volume,
    args: {},
  });
}

function failureCtaFor(job: JobSummary, indexRaw: string | undefined): FailureCta | null {
  if (indexRaw === undefined) return null;
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) return null;
  const reason = failureReason(job) ?? "unknown";
  return FAILURE_RECIPES[reason].ctas[index] ?? null;
}

function render(container: HTMLElement, state: ViewState): void {
  const now = Date.now() + state.tick * 0;
  const body = (() => {
    if (state.loading && state.jobs.length === 0) return '<div class="nc-empty">読み込み中...</div>';
    if (state.error && state.jobs.length === 0) return `<div class="view-placeholder"><h2>全作品ジョブ</h2><p>${escapeHtml(state.error)}</p></div>`;
    return `${renderRunning(state.jobs, now)}${renderHistory(state.jobs, now)}${renderFailures(state.jobs)}`;
  })();
  container.innerHTML = `
    <div class="jobs-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">全作品ジョブ</h2>
        <span class="jobs-meta">${state.jobs.length} jobs</span>
        <span class="jobs-spacer"></span>
        <button type="button" class="nc-button nc-button--secondary" data-action="reload" ${state.loading ? "disabled" : ""}>再読込</button>
      </div>
      ${body}
    </div>
    ${state.toast ? `<div class="jobs-toast nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    const result = await apiGetJobs({ all: true });
    state.jobs = result.jobs;
  } catch (error) {
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

function toast(state: ViewState, container: HTMLElement, message: string, kind: NonNullable<ViewState["toast"]>["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

export function mountJobsHubView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const state: ViewState = { jobs: [], loading: false, error: null, toast: null, tick: 0 };
  const interval = window.setInterval(() => {
    state.tick++;
    render(container, state);
  }, 1000);

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-action='reload']")) {
      void refresh(state, container);
      return;
    }
    const jobId = target.closest<HTMLElement>("[data-abort-job]")?.dataset.abortJob;
    if (jobId) {
      void apiAbortJob(jobId)
      .then(() => refresh(state, container))
      .catch((error) => toast(state, container, `abort に失敗: ${errorText(error)}`, "warning"));
      return;
    }
    const ctaButton = target.closest<HTMLElement>("[data-failure-job][data-failure-cta]");
    const ctaJobId = ctaButton?.dataset.failureJob;
    const job = ctaJobId ? state.jobs.find((item) => item.id === ctaJobId) : undefined;
    const cta = job ? failureCtaFor(job, ctaButton?.dataset.failureCta) : null;
    if (!job || !cta) return;
    if (cta.kind === "rerun") {
      void rerunJob(job)
        .then(() => {
          toast(state, container, `再実行を開始: ${job.key}`, "success");
          return refresh(state, container);
        })
        .catch((error) => toast(state, container, `再実行に失敗: ${errorText(error)}`, "warning"));
    } else if (cta.kind === "open-view") {
      openJobView(job, cta.view);
    } else if (cta.kind === "ai-edit") {
      openAiEdit(job, cta);
    } else {
      openLog(job);
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    window.clearInterval(interval);
    container.innerHTML = "";
  };
}
