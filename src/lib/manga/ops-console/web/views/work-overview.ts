import { ApiError, apiGetManifest, apiGetWorkEpisodes, apiGetWorkMeta, type Manifest, type WorkMeta } from "../lib/api";
import { store, type ViewName } from "../lib/store";

const CSS = `
.wo-view { display: grid; gap: var(--space-3); }
.wo-spacer { flex: 1 1 auto; }
.wo-grid { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.wo-card { display: grid; gap: var(--space-2); }
.wo-card h3 { margin: 0; font-size: var(--fs-lg); }
.wo-dl { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-1) var(--space-3); margin: 0; }
.wo-dl dt { color: var(--text-secondary); font-weight: var(--fw-bold); }
.wo-dl dd { margin: 0; overflow-wrap: anywhere; }
.wo-table-wrap { overflow: auto; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--surface-elevated); }
.wo-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.wo-table th,.wo-table td { padding: var(--space-2); border-top: 1px solid var(--border-subtle); text-align: left; vertical-align: middle; }
.wo-table thead th { border-top: 0; color: var(--text-secondary); background: var(--surface-sunken); font-weight: var(--fw-bold); white-space: nowrap; }
.wo-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
`;

type EpisodeRow = {
  episode: number;
  title_working?: string;
  audit_failed: number;
  audit_status: "ready" | "missing" | "stale";
  revision_unresolved: number;
  adopted_count: number;
};

type ViewState = {
  slug: string;
  meta: WorkMeta | null;
  episodes: EpisodeRow[];
  loading: boolean;
  error: string | null;
};

function ensureStyles(): void {
  if (document.getElementById("wo-styles")) return;
  const style = document.createElement("style");
  style.id = "wo-styles";
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

function metaText(meta: WorkMeta | null, key: string): string {
  const value = meta?.[key];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "-";
}

function episodeTitle(manifest: Manifest): string | undefined {
  const storyboardTitle = manifest.storyboard as unknown as { title_working?: unknown; episode_title?: unknown };
  if (typeof storyboardTitle.title_working === "string") return storyboardTitle.title_working;
  if (typeof storyboardTitle.episode_title === "string") return storyboardTitle.episode_title;
  return undefined;
}

function toEpisodeRow(episode: number, manifest: Manifest | null): EpisodeRow {
  if (!manifest) return { episode, audit_failed: 0, audit_status: "missing", revision_unresolved: 0, adopted_count: 0 };
  return {
    episode,
    title_working: episodeTitle(manifest),
    audit_failed: manifest.audit?.failed_panel_ids?.length ?? 0,
    audit_status: manifest.audit ? "ready" : "missing",
    revision_unresolved: (manifest.revision_queue ?? []).filter((entry) => !entry.resolved_version).length,
    adopted_count: Object.keys(manifest.adopted?.panels ?? {}).length,
  };
}

async function loadEpisodeRow(slug: string, episode: number): Promise<EpisodeRow> {
  try {
    return toEpisodeRow(episode, await apiGetManifest(slug, episode));
  } catch {
    return toEpisodeRow(episode, null);
  }
}

function goto(slug: string, episode: number, view: ViewName): void {
  store.update({ currentSlug: slug, currentEpisode: episode, currentView: view });
}

function auditBadge(row: EpisodeRow): string {
  if (row.audit_status === "missing") return `<span class="nc-badge nc-badge--neutral">未実行</span>`;
  if (row.audit_status === "stale") return `<span class="nc-badge nc-badge--warning">${row.audit_failed} stale</span>`;
  if (row.audit_failed > 0) return `<span class="nc-badge nc-badge--danger">${row.audit_failed}</span>`;
  return `<span class="nc-badge nc-badge--success">0</span>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const title = state.meta?.title || state.slug;
  const body = (() => {
    if (state.loading && !state.meta) return '<div class="nc-empty">読み込み中...</div>';
    if (state.error && !state.meta) return `<div class="view-placeholder"><h2>作品概要</h2><p>${escapeHtml(state.error)}</p></div>`;
    return `
      <div class="wo-grid">
        <section class="nc-card wo-card">
          <h3>作品メタ</h3>
          <dl class="wo-dl">
            <dt>genre</dt><dd>${escapeHtml(metaText(state.meta, "genre"))}</dd>
            <dt>art_style</dt><dd>${escapeHtml(metaText(state.meta, "art_style"))}</dd>
            <dt>target</dt><dd>${escapeHtml(metaText(state.meta, "target_audience"))}</dd>
            <dt>phase</dt><dd>${escapeHtml(metaText(state.meta, "phase"))}</dd>
          </dl>
        </section>
        <section class="nc-card wo-card">
          <h3>クイックアクション</h3>
          <div class="wo-actions">
            <button type="button" class="nc-button nc-button--secondary" data-view="bible">Bible 全体構築 (L01)</button>
            <button type="button" class="nc-button nc-button--secondary" data-view="volume-plot">Volume Plot 構築 (L02b)</button>
            <button type="button" class="nc-button nc-button--primary" data-view="kdp-metadata">KDP メタ編集</button>
            <button type="button" class="nc-button nc-button--secondary" data-view="volumes">巻管理 (Volumes)</button>
          </div>
        </section>
      </div>
      <section class="wo-card">
        <h3>エピソード一覧</h3>
        <div class="wo-table-wrap">
          <table class="wo-table">
            <thead><tr><th>ep</th><th>title_working</th><th>audit failed</th><th>revision 未処理</th><th>採用済 panel</th><th>actions</th></tr></thead>
            <tbody>${state.episodes.map((row) => `<tr>
              <td>${epLabel(row.episode)}</td>
              <td>${escapeHtml(row.title_working ?? "-")}</td>
              <td>${auditBadge(row)}</td>
              <td>${row.revision_unresolved}</td>
              <td>${row.adopted_count}</td>
              <td><div class="wo-actions">
                <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-episode="${row.episode}" data-view="pipeline">パイプライン</button>
                <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-episode="${row.episode}" data-view="revision">ページ承認</button>
                <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-episode="${row.episode}" data-view="quality">品質監査</button>
              </div></td>
            </tr>`).join("") || '<tr><td colspan="6">episode がありません</td></tr>'}</tbody>
          </table>
        </div>
      </section>
      <section class="wo-card">
        <h3>巻一覧</h3>
        <div class="wo-table-wrap">
          <table class="wo-table">
            <thead><tr><th>v</th><th>episodes</th><th>KDP package</th><th>actions</th></tr></thead>
            <tbody><tr><td>v01</td><td>${state.episodes.map((row) => epLabel(row.episode)).join(", ") || "-"}</td><td>Wave 6</td><td><button type="button" class="nc-button nc-button--secondary nc-button--sm" data-view="volume-plot">巻プロット</button></td></tr></tbody>
          </table>
        </div>
      </section>`;
  })();
  container.innerHTML = `
    <div class="wo-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">${escapeHtml(title)}</h2>
        <span class="wo-spacer"></span>
        <span class="nc-badge nc-badge--neutral">phase: ${escapeHtml(metaText(state.meta, "phase"))}</span>
      </div>
      ${body}
    </div>`;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    const [meta, episodes] = await Promise.all([apiGetWorkMeta(state.slug), apiGetWorkEpisodes(state.slug)]);
    state.meta = meta;
    state.episodes = await Promise.all(episodes.episodes.map((episode) => loadEpisodeRow(state.slug, episode)));
  } catch (error) {
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

export function mountWorkOverviewView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    meta: null,
    episodes: [],
    loading: false,
    error: null,
  };
  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>("[data-view]");
    if (!button) return;
    const view = button.dataset.view as ViewName | undefined;
    if (!view) return;
    const episode = button.dataset.episode ? Number(button.dataset.episode) : store.state.currentEpisode || 1;
    goto(state.slug, episode || 1, view);
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
