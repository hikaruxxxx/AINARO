import { ApiError, apiGetQualityOverview, type WorkQualityOverview } from "../lib/api";
import { store, type ViewName } from "../lib/store";

const CSS = `
.qh-view { display: grid; gap: var(--space-3); }
.qh-spacer { flex: 1 1 auto; }
.qh-totals { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.qh-total strong { display: block; margin-top: var(--space-1); font-size: 28px; line-height: 1; }
.qh-total span { color: var(--text-secondary); font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.qh-work { display: grid; gap: var(--space-2); }
.qh-work h3 { margin: 0; display: flex; gap: var(--space-2); align-items: baseline; flex-wrap: wrap; }
.qh-slug { color: var(--text-tertiary); font-size: var(--fs-sm); font-family: var(--font-mono); }
.qh-table-wrap { overflow: auto; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--surface-elevated); }
.qh-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.qh-table th,.qh-table td { padding: var(--space-2); border-top: 1px solid var(--border-subtle); text-align: left; vertical-align: middle; }
.qh-table thead th { border-top: 0; color: var(--text-secondary); background: var(--surface-sunken); font-weight: var(--fw-bold); white-space: nowrap; }
.qh-actions { display: flex; gap: var(--space-1); flex-wrap: wrap; }
`;

type ViewState = {
  data: WorkQualityOverview[];
  loading: boolean;
  error: string | null;
};

function ensureStyles(): void {
  if (document.getElementById("qh-styles")) return;
  const style = document.createElement("style");
  style.id = "qh-styles";
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

function epLabel(n: number): string {
  return `ep${String(n).padStart(2, "0")}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function gotoEpisode(slug: string, episode: number, view: ViewName): void {
  store.update({ currentSlug: slug, currentEpisode: episode, currentView: view });
}

function renderWork(work: WorkQualityOverview): string {
  const rows = work.episodes
    .slice()
    .sort((a, b) =>
      (b.audit_failed_count + b.revision_unresolved_count + b.adopted_pending_count) -
      (a.audit_failed_count + a.revision_unresolved_count + a.adopted_pending_count)
    )
    .map((ep) => `<tr>
      <td>${epLabel(ep.episode)}</td>
      <td><span class="nc-badge ${ep.audit_failed_count > 0 ? "nc-badge--danger" : "nc-badge--success"}">${ep.audit_failed_count}</span></td>
      <td>${ep.revision_unresolved_count}</td>
      <td>${ep.adopted_pending_count}</td>
      <td>${escapeHtml(fmtDate(ep.last_audit_at))}</td>
      <td><div class="qh-actions">
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-goto-view="name-gate" data-slug="${escapeHtml(work.slug)}" data-episode="${ep.episode}">ネーム判定</button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-goto-view="revision" data-slug="${escapeHtml(work.slug)}" data-episode="${ep.episode}">修正・採用</button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-goto-view="quality" data-slug="${escapeHtml(work.slug)}" data-episode="${ep.episode}">品質監査</button>
      </div></td>
    </tr>`)
    .join("");
  return `<section class="qh-work">
    <h3>${escapeHtml(work.title || work.slug)} <span class="qh-slug">${escapeHtml(work.slug)}</span></h3>
    <div class="qh-table-wrap">
      <table class="qh-table">
        <thead><tr><th>ep</th><th>audit failed</th><th>revision 未処理</th><th>未採用</th><th>最終 audit</th><th>actions</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">episode がありません</td></tr>'}</tbody>
      </table>
    </div>
  </section>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const totals = state.data.reduce(
    (acc, work) => {
      acc.audit_failed += work.totals.audit_failed;
      acc.revision_unresolved += work.totals.revision_unresolved;
      acc.adopted_pending += work.totals.adopted_pending;
      return acc;
    },
    { audit_failed: 0, revision_unresolved: 0, adopted_pending: 0 }
  );
  const body = (() => {
    if (state.loading && state.data.length === 0) return '<div class="nc-empty">読み込み中...</div>';
    if (state.error && state.data.length === 0) return `<div class="view-placeholder"><h2>全作品 品質ハブ</h2><p>${escapeHtml(state.error)}</p></div>`;
    const works = state.data
      .slice()
      .sort((a, b) =>
        (b.totals.audit_failed + b.totals.revision_unresolved + b.totals.adopted_pending) -
        (a.totals.audit_failed + a.totals.revision_unresolved + a.totals.adopted_pending)
      );
    return `
      <div class="qh-totals">
        <section class="nc-card qh-total"><span>failed panel 合計</span><strong>${totals.audit_failed}</strong></section>
        <section class="nc-card qh-total"><span>未処理 revision 合計</span><strong>${totals.revision_unresolved}</strong></section>
        <section class="nc-card qh-total"><span>未採用 panel 合計</span><strong>${totals.adopted_pending}</strong></section>
      </div>
      ${works.map(renderWork).join("") || '<div class="nc-empty">作品がありません。</div>'}`;
  })();
  container.innerHTML = `
    <div class="qh-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">全作品 品質ハブ</h2>
        <span class="qh-spacer"></span>
        <button type="button" class="nc-button nc-button--secondary" data-action="reload" ${state.loading ? "disabled" : ""}>再読込</button>
      </div>
      ${body}
    </div>`;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.data = (await apiGetQualityOverview()).works;
  } catch (error) {
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

export function mountQualityHubView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const state: ViewState = { data: [], loading: false, error: null };
  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-action='reload']")) {
      void refresh(state, container);
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-goto-view]");
    if (!button) return;
    const view = button.dataset.gotoView as ViewName | undefined;
    const slug = button.dataset.slug;
    const episode = Number(button.dataset.episode);
    if (!view || !slug || !Number.isInteger(episode) || episode <= 0) return;
    gotoEpisode(slug, episode, view);
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
