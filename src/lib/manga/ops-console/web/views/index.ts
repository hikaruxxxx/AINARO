/**
 * Novelis Console index view (作品一覧)
 *
 * 引数なしで `npm run console` を起動した一覧モードで初期表示される。
 * `data/manga/works/` 配下の slug を /api/bootstrap 経由で受け取り、
 * 各作品カードからエピソードを選んで scope 固定 view (name-gate / revision / layers / works) へ遷移する。
 *
 * 一覧モードでは Server に scope が無いため、エピソードを選んだ瞬間に scope を SPA state に乗せる。
 * Phase 1 では legacy / scope-fixed write API は引き続き 400 を返すので、Phase 2 で
 * 横断 write を解禁するまでは「scope 選択 → 別ターミナルで `npm run console -- --slug X --episode N`」が必要。
 * ただし bootstrap や enumerate は scope なしでも動くので、一覧 → 確認系 (manifest 読み取り等) までは可能。
 */
import {
  ApiError,
  apiCreateWork,
  apiGetDashboard,
  apiGetWorks,
  type DashboardData,
  type NextActionItem,
  type WorkSnapshot,
} from "../lib/api";
import { toggleFavorite } from "../lib/persistence";
import { store, type ViewName, type WorkInfo } from "../lib/store";

const CSS = `
.idx-view { display:grid; gap:18px; max-width: 1100px; }
.idx-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
.idx-head h2 { margin:0; font-size:22px; }
.idx-head p { margin:0; color:#526076; font-size:13px; }
.idx-section { display:grid; gap:var(--space-2); }
.idx-section-title { margin: 0 0 var(--space-2); font-size: var(--fs-lg); }
.idx-grid { display:grid; gap:14px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.idx-card { position:relative; background:#fff; border:1px solid #dbe1ea; border-radius:10px; padding:14px; display:grid; gap:10px; }
.idx-card h3 { margin:0; font-size:16px; line-height:1.4; }
.idx-card .idx-slug { color:#64748b; font-size:12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.idx-eps { display:flex; gap:6px; flex-wrap:wrap; }
.idx-ep-btn { min-height:30px; border:1px solid #c7cfdb; border-radius:6px; background:#fff; color:#243044; padding:0 10px; font:inherit; font-size:13px; cursor:pointer; }
.idx-ep-btn:hover { background:#1f5eff; border-color:#1f5eff; color:#fff; }
.idx-fav-btn { position:absolute; top:8px; right:8px; background:transparent; border:0; cursor:pointer; font-size:18px; color:var(--text-tertiary); line-height:1; }
.idx-fav-btn.is-favorited { color:var(--color-warning); }
.idx-empty-eps { color:#64748b; font-size:12px; }
.idx-empty { padding:32px; text-align:center; color:#526076; font-size:14px; background:#fff; border:1px dashed #c7cfdb; border-radius:10px; }
.idx-spacer { flex: 1 1 auto; }
.idx-modal-body { display:grid; gap:var(--space-3); padding:var(--space-4); }
.idx-modal-head { display:flex; align-items:center; gap:var(--space-2); }
.idx-modal-title { margin:0; font-size:var(--fs-xl); }
.idx-actions { display:flex; justify-content:flex-end; gap:var(--space-2); }
.idx-next-actions { display:grid; gap:var(--space-2); }
.idx-next-list { display:grid; gap:10px; }
.idx-next-card { display:grid; grid-template-columns:auto minmax(0, 1fr) auto; gap:12px; align-items:center; padding:14px; border:1px solid var(--border-subtle); background:var(--surface-elevated); border-radius:8px; }
.idx-next-icon { width:36px; height:36px; display:grid; place-items:center; border-radius:8px; background:var(--surface-sunken); font-size:18px; }
.idx-next-body { min-width:0; display:grid; gap:4px; }
.idx-next-body h3 { margin:0; font-size:15px; line-height:1.45; color:var(--text-primary); overflow-wrap:anywhere; }
.idx-next-body p { margin:0; color:var(--text-secondary); font-size:13px; line-height:1.45; overflow-wrap:anywhere; }
.idx-next-meta { display:flex; flex-wrap:wrap; gap:6px; }
.idx-tag { display:inline-flex; align-items:center; min-height:22px; padding:0 8px; border-radius:999px; background:var(--surface-sunken); color:var(--text-secondary); font-size:12px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; }
.idx-next-action { display:flex; justify-content:flex-end; }
.idx-next-empty { padding:14px; color:var(--text-secondary); border:1px dashed var(--border-subtle); border-radius:8px; background:var(--surface-elevated); font-size:13px; }
.idx-snapshot { display:grid; gap:var(--space-2); }
.idx-snapshot-wrap { overflow:auto; border:1px solid var(--border-subtle); border-radius:8px; background:var(--surface-elevated); }
.idx-snapshot-table { width:100%; min-width:860px; border-collapse:collapse; font-size:13px; }
.idx-snapshot-table th, .idx-snapshot-table td { padding:10px 12px; text-align:left; border-bottom:1px solid var(--border-subtle); vertical-align:middle; }
.idx-snapshot-table th { color:var(--text-secondary); font-weight:600; background:var(--surface-sunken); white-space:nowrap; }
.idx-snapshot-table tr:last-child td { border-bottom:0; }
.idx-snapshot-table tbody tr { cursor:pointer; }
.idx-snapshot-table tbody tr:hover { background:var(--surface-sunken); }
.idx-snapshot-title { display:grid; gap:2px; min-width:220px; }
.idx-snapshot-title strong { color:var(--text-primary); font-weight:600; overflow-wrap:anywhere; }
.idx-snapshot-title span { color:var(--text-tertiary); font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
.idx-badge { display:inline-flex; align-items:center; min-height:22px; padding:0 8px; border-radius:999px; font-size:12px; font-weight:600; white-space:nowrap; background:var(--surface-sunken); color:var(--text-secondary); }
.idx-badge--ok { background:rgba(22, 163, 74, .12); color:#15803d; }
.idx-badge--warn { background:rgba(217, 119, 6, .14); color:#b45309; }
.idx-badge--danger { background:rgba(220, 38, 38, .12); color:#b91c1c; }
.idx-badge--muted { background:var(--surface-sunken); color:var(--text-secondary); }
`;

type ViewState = {
  modalOpen: boolean;
  creating: boolean;
  dashboard: DashboardData | null;
  dashboardLoading: boolean;
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
};

function ensureStyles(): void {
  if (document.getElementById("idx-styles")) return;
  const style = document.createElement("style");
  style.id = "idx-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function episodeLabel(n: number): string {
  return `ep${String(n).padStart(2, "0")}`;
}

function volumeLabel(n: number): string {
  return `v${String(n).padStart(2, "0")}`;
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function isFavorited(slug: string, episode: number): boolean {
  return store.state.favorites.some((entry) => entry.slug === slug && entry.episode === episode);
}

function workTitle(slug: string): string {
  const work = store.state.works.find((item) => item.slug === slug);
  return work?.title || slug;
}

function favoriteButton(slug: string, episode: number, label?: string): string {
  const active = isFavorited(slug, episode);
  return `<button type="button" class="idx-fav-btn${active ? " is-favorited" : ""}" data-fav-toggle data-slug="${escapeHtml(slug)}" data-episode="${episode}" data-label="${escapeHtml(label ?? "")}" title="${active ? "お気に入り解除" : "お気に入りに追加"}">★</button>`;
}

function renderCard(work: WorkInfo): string {
  const title = work.title ? escapeHtml(work.title) : escapeHtml(work.slug);
  const favEpisode = work.episodes[0] ?? 1;
  const eps = work.episodes.length
    ? `<div class="idx-eps">${work.episodes
        .map(
          (n) =>
            `<button type="button" class="idx-ep-btn" data-slug="${escapeHtml(work.slug)}" data-episode="${n}">${episodeLabel(n)}</button>`
        )
        .join("")}</div>`
    : `<p class="idx-empty-eps">エピソードがまだありません。</p>`;
  return `
    <article class="idx-card">
      ${favoriteButton(work.slug, favEpisode, work.title ?? work.slug)}
      <h3>${title}</h3>
      <div class="idx-slug">${escapeHtml(work.slug)}</div>
      ${eps}
    </article>
  `;
}

function renderScopeCard(slug: string, episode: number, label?: string, meta?: string): string {
  const title = label || workTitle(slug);
  return `
    <article class="idx-card">
      ${favoriteButton(slug, episode, title)}
      <h3>${escapeHtml(title)}</h3>
      <div class="idx-slug">${escapeHtml(slug)} / ${episodeLabel(episode)}${meta ? ` / ${escapeHtml(meta)}` : ""}</div>
      <div class="idx-eps">
        <button type="button" class="idx-ep-btn" data-slug="${escapeHtml(slug)}" data-episode="${episode}">${episodeLabel(episode)} を開く</button>
      </div>
    </article>
  `;
}

function renderSection(title: string, html: string): string {
  if (!html) return "";
  return `<section class="idx-section"><h3 class="idx-section-title">${escapeHtml(title)}</h3><div class="idx-grid">${html}</div></section>`;
}

function actionIcon(kind: NextActionItem["kind"]): string {
  switch (kind) {
    case "job_failed":
      return "!";
    case "pending_name":
      return "?";
    case "audit_failed":
      return "A";
    case "kdp_meta_missing":
      return "K";
    case "new_work":
      return "+";
  }
}

function renderNextMeta(item: NextActionItem): string {
  const tags = [
    item.slug,
    item.episode !== undefined ? episodeLabel(item.episode) : null,
    item.volume !== undefined ? volumeLabel(item.volume) : null,
  ].filter((value): value is string => Boolean(value));
  if (tags.length === 0) return "";
  return `<div class="idx-next-meta">${tags.map((tag) => `<span class="idx-tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function renderNextActions(state: ViewState): string {
  const actions = state.dashboard?.next_actions ?? [];
  const body = state.dashboardLoading && actions.length === 0
    ? `<div class="idx-next-empty">次の一手を読み込み中です。</div>`
    : actions.length === 0
      ? `<div class="idx-next-empty">今すぐ対応が必要な項目はありません。</div>`
      : `<div class="idx-next-list">${actions
          .map(
            (item, index) => `
              <article class="nc-card idx-next-card">
                <div class="idx-next-icon">${escapeHtml(actionIcon(item.kind))}</div>
                <div class="idx-next-body">
                  <h3>${escapeHtml(item.message)}</h3>
                  ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}
                  ${renderNextMeta(item)}
                </div>
                <div class="idx-next-action">
                  <button type="button" class="nc-button nc-button--primary nc-button--sm" data-action="next-action" data-i="${index}">${escapeHtml(item.cta_label)}</button>
                </div>
              </article>`
          )
          .join("")}</div>`;
  return `
    <section class="idx-next-actions">
      <h3 class="idx-section-title">次の一手</h3>
      ${body}
    </section>`;
}

function ageBadgeClass(date: string | undefined): string {
  if (!date) return "idx-badge--muted";
  const ageMs = Date.now() - Date.parse(date);
  if (!Number.isFinite(ageMs)) return "idx-badge--muted";
  if (ageMs < 14 * 24 * 60 * 60 * 1000) return "idx-badge--ok";
  if (ageMs < 30 * 24 * 60 * 60 * 1000) return "idx-badge--warn";
  return "idx-badge--danger";
}

function stateBadgeClass(state: WorkSnapshot["state"]): string {
  switch (state) {
    case "failed":
      return "idx-badge--danger";
    case "stale":
      return "idx-badge--warn";
    case "not_started":
      return "idx-badge--muted";
    case "ok":
      return "idx-badge--ok";
  }
}

function jobBadgeClass(state: NonNullable<WorkSnapshot["last_job"]>["state"] | undefined): string {
  switch (state) {
    case "succeeded":
      return "idx-badge--ok";
    case "failed":
    case "aborted":
      return "idx-badge--danger";
    case "running":
      return "idx-badge--warn";
    default:
      return "idx-badge--muted";
  }
}

function formatDate(date: string | undefined): string {
  if (!date) return "-";
  const ms = Date.parse(date);
  if (!Number.isFinite(ms)) return date;
  return new Date(ms).toLocaleString();
}

function renderSnapshot(state: ViewState): string {
  const rows = state.dashboard?.works_snapshot ?? [];
  const body = state.dashboardLoading && rows.length === 0
    ? `<tr><td colspan="7">全作品スナップショットを読み込み中です。</td></tr>`
    : rows.length === 0
      ? `<tr><td colspan="7">表示できる作品がありません。</td></tr>`
      : rows
          .map((row) => {
            const title = row.title || row.slug;
            const firstEpisode = row.episodes[0]?.episode ?? 1;
            return `
              <tr data-snapshot-slug="${escapeHtml(row.slug)}" data-snapshot-episode="${firstEpisode}">
                <td>
                  <div class="idx-snapshot-title">
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(row.slug)}</span>
                  </div>
                </td>
                <td>${escapeHtml(row.phase ?? "-")}</td>
                <td><span class="idx-badge ${row.audit_failed_total > 0 ? "idx-badge--danger" : "idx-badge--ok"}">${row.audit_failed_total}</span></td>
                <td><span class="idx-badge ${row.pending_name_total > 0 ? "idx-badge--warn" : "idx-badge--muted"}">${row.pending_name_total}</span></td>
                <td><span class="idx-badge ${jobBadgeClass(row.last_job?.state)}">${escapeHtml(row.last_job ? `${row.last_job.state} ${row.last_job.layer}` : "-")}</span></td>
                <td><span class="idx-badge ${ageBadgeClass(row.last_modified_at)}">${escapeHtml(formatDate(row.last_modified_at))}</span></td>
                <td><span class="idx-badge ${stateBadgeClass(row.state)}">${escapeHtml(row.state)}</span></td>
              </tr>`;
          })
          .join("");
  return `
    <section class="idx-snapshot">
      <h3 class="idx-section-title">全作品スナップショット</h3>
      <div class="idx-snapshot-wrap">
        <table class="idx-snapshot-table">
          <thead>
            <tr>
              <th>title</th>
              <th>phase</th>
              <th>audit failed</th>
              <th>pending name</th>
              <th>直近 job</th>
              <th>最終更新</th>
              <th>state</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}

function renderModal(state: ViewState): string {
  if (!state.modalOpen) return "";
  const disabled = state.creating ? " disabled" : "";
  return `
    <div class="nc-modal is-open" id="idx-new-work-modal">
      <form class="nc-modal__card nc-modal__card--md idx-modal-body" data-new-work-form="1">
        <div class="idx-modal-head">
          <h3 class="idx-modal-title">新規作品</h3>
          <span class="idx-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-action="close-new-work"${disabled}>閉じる</button>
        </div>
        <label class="nc-field">
          <span class="nc-field__label">slug</span>
          <input class="nc-field__input" name="slug" required pattern="[a-z0-9][a-z0-9_-]*" placeholder="my-new-work">
        </label>
        <label class="nc-field">
          <span class="nc-field__label">title</span>
          <input class="nc-field__input" name="title" required maxlength="200">
        </label>
        <label class="nc-field">
          <span class="nc-field__label">genre</span>
          <input class="nc-field__input" name="genre" placeholder="modern_dungeon">
        </label>
        <label class="nc-field">
          <span class="nc-field__label">art_style</span>
          <input class="nc-field__input" name="art_style" placeholder="manga_bw_seinen_urban">
        </label>
        <label class="nc-field">
          <span class="nc-field__label">target_audience</span>
          <input class="nc-field__input" name="target_audience">
        </label>
        <div class="idx-actions">
          <button type="submit" class="nc-button nc-button--primary"${disabled}>${state.creating ? "作成中" : "作成"}</button>
        </div>
      </form>
    </div>`;
}

function render(container: HTMLElement, works: WorkInfo[], state: ViewState): void {
  const favorites = store.state.favorites
    .map((entry) => renderScopeCard(entry.slug, entry.episode, entry.label || workTitle(entry.slug)))
    .join("");
  const recent = store.state.recent
    .slice(0, 5)
    .map((entry) => renderScopeCard(entry.slug, entry.episode, workTitle(entry.slug), new Date(entry.ts).toLocaleString()))
    .join("");
  const head = `
    <div class="idx-head">
      <h2>ホーム</h2>
      <span class="idx-spacer"></span>
      <button type="button" class="nc-button nc-button--ghost" data-action="reload-dashboard">更新</button>
      <button type="button" class="nc-button nc-button--primary" data-action="new-work">+ 新規作品</button>
    </div>`;
  if (works.length === 0) {
    container.innerHTML = `
      <div class="idx-view">
        ${head}
        ${renderNextActions(state)}
        ${renderSnapshot(state)}
        <div class="idx-empty">data/manga/works/ 配下に作品がありません。</div>
      </div>
      ${renderModal(state)}
      ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
    `;
    return;
  }
  container.innerHTML = `
    <div class="idx-view">
      ${head}
      <div class="idx-head">
        <p>エピソードを選んで操作 view (name-gate / revision / layers) に遷移します。</p>
      </div>
      ${renderNextActions(state)}
      ${renderSnapshot(state)}
      ${renderSection("お気に入り", favorites)}
      ${renderSection("最近開いた", recent)}
      <section class="idx-section">
        <h3 class="idx-section-title">すべての作品</h3>
        <div class="idx-grid">
          ${works.map(renderCard).join("")}
        </div>
      </section>
    </div>
    ${renderModal(state)}
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

function setToast(state: ViewState, container: HTMLElement, message: string, kind: NonNullable<ViewState["toast"]>["kind"]): void {
  state.toast = { message, kind };
  render(container, store.state.works, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, store.state.works, state);
  }, 3000);
}

export function mountIndexView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const state: ViewState = { modalOpen: false, creating: false, dashboard: null, dashboardLoading: false, toast: null };

  const renderFromState = () => render(container, store.state.works, state);
  const loadDashboard = () => {
    state.dashboardLoading = true;
    renderFromState();
    void apiGetDashboard(3)
      .then((dashboard) => {
        state.dashboard = dashboard;
        state.dashboardLoading = false;
        renderFromState();
      })
      .catch((error) => {
        state.dashboardLoading = false;
        setToast(state, container, `ダッシュボード取得に失敗: ${errorText(error)}`, "danger");
      });
  };
  const unsubscribe = store.subscribe(() => {
    renderFromState();
  });
  loadDashboard();

  container.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
      if (action === "new-work") {
        state.modalOpen = true;
        renderFromState();
        return;
      }
      if (action === "reload-dashboard") {
        loadDashboard();
        return;
      }
      if (action === "next-action") {
        const button = target.closest<HTMLButtonElement>("[data-action='next-action']");
        const index = Number(button?.dataset.i);
        const item = Number.isInteger(index) ? state.dashboard?.next_actions[index] : undefined;
        if (!item) return;
        if (item.kind === "new_work") {
          state.modalOpen = true;
          renderFromState();
          return;
        }
        if (!item.slug) return;
        const work = state.dashboard?.works_snapshot.find((row) => row.slug === item.slug);
        const episode = item.episode ?? work?.episodes[0]?.episode ?? 1;
        const view = (item.cta_view ?? "pipeline") as ViewName;
        store.update({
          currentSlug: item.slug,
          currentEpisode: episode,
          currentView: view,
        });
        return;
      }
      if (action === "close-new-work" && !state.creating) {
        state.modalOpen = false;
        renderFromState();
        return;
      }
      const fav = target.closest<HTMLButtonElement>("[data-fav-toggle]");
      if (fav) {
        const slug = fav.dataset.slug;
        const episode = Number(fav.dataset.episode);
        if (!slug || !Number.isInteger(episode) || episode <= 0) return;
        store.update({ favorites: toggleFavorite(slug, episode, fav.dataset.label || workTitle(slug)) });
        return;
      }
      const snapshot = target.closest<HTMLTableRowElement>("[data-snapshot-slug]");
      if (snapshot) {
        const slug = snapshot.dataset.snapshotSlug;
        const episode = Number(snapshot.dataset.snapshotEpisode ?? 1);
        if (!slug || !Number.isInteger(episode) || episode <= 0) return;
        store.update({
          currentSlug: slug,
          currentEpisode: episode,
          currentView: "pipeline",
        });
        return;
      }
      const btn = target.closest<HTMLButtonElement>("[data-slug][data-episode]");
      if (!btn) return;
      const slug = btn.dataset.slug;
      const episode = Number(btn.dataset.episode);
      if (!slug || !Number.isInteger(episode) || episode <= 0) return;
      // scope を SPA state に乗せる。URL は main.ts の syncRoute が
      // /works/{slug}/episodes/epNN/#name-gate に書き換える。
      store.update({
        currentSlug: slug,
        currentEpisode: episode,
        currentView: "name-gate",
      });
    },
    { signal: controller.signal }
  );

  container.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.newWorkForm) return;
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      state.creating = true;
      renderFromState();
      void apiCreateWork({
        slug: String(data.get("slug") ?? "").trim(),
        title: String(data.get("title") ?? "").trim(),
        genre: String(data.get("genre") ?? "").trim() || undefined,
        art_style: String(data.get("art_style") ?? "").trim() || undefined,
        target_audience: String(data.get("target_audience") ?? "").trim() || undefined,
      })
        .then(async (created) => {
          const works = await apiGetWorks();
          store.update({
            works: works.works,
            currentSlug: created.slug,
            currentEpisode: 1,
            currentView: "pipeline",
          });
        })
        .catch((error) => {
          state.creating = false;
          setToast(state, container, `作成に失敗: ${errorText(error)}`, "danger");
        });
    },
    { signal: controller.signal }
  );

  return () => {
    controller.abort();
    unsubscribe();
    container.innerHTML = "";
  };
}
