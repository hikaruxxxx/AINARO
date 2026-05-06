import {
  ApiError,
  apiGetManifest,
  type Manifest,
} from "../lib/api";
import { store } from "../lib/store";
import { navigateToAiEdit } from "../lib/layer-actions";

type StoryboardTab = "storyboard" | "page-plan" | "resolved-refs" | "raw";
type AnyRecord = Record<string, unknown>;

const TABS: Array<{ id: StoryboardTab; label: string; key: string }> = [
  { id: "storyboard", label: "ネーム原案", key: "1" },
  { id: "page-plan", label: "ページ配置", key: "2" },
  { id: "resolved-refs", label: "参照画像 (Resolved Refs)", key: "3" },
  { id: "raw", label: "生 JSON", key: "4" },
];

const CSS = `
.sb-view { display: grid; gap: var(--space-3); }
.sb-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.sb-spacer { flex: 1 1 auto; }
.sb-tabs { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.sb-content { display: grid; gap: var(--space-3); }
.sb-list { display: grid; gap: var(--space-2); }
.sb-page { display: grid; gap: var(--space-2); }
.sb-page__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.sb-page__title { margin: 0; font-size: var(--fs-lg); }
.sb-panels { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.sb-panel { display: grid; gap: var(--space-2); }
.sb-panel h4 { margin: 0; font-size: var(--fs-md); }
.sb-meta { color: var(--text-tertiary); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.sb-text { color: var(--text-secondary); font-size: var(--fs-base); line-height: 1.55; }
.sb-details { display: grid; gap: var(--space-2); }
.sb-copy { justify-self: start; }
`;

type ViewState = {
  slug: string;
  episode: number;
  tab: StoryboardTab;
  manifest: Manifest | null;
  loading: boolean;
  error: string | null;
  copied: string | null;
};

function ensureStyles(): void {
  if (document.getElementById("sb-styles")) return;
  const style = document.createElement("style");
  style.id = "sb-styles";
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

function renderTabs(active: StoryboardTab): string {
  return `<div class="sb-tabs">${TABS.map((tab) => `<button type="button" class="nc-pill${tab.id === active ? " nc-pill--active" : ""}" data-sb-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
}

function renderStoryboard(manifest: Manifest): string {
  const pages = manifest.storyboard?.pages ?? [];
  if (pages.length === 0) return `<div class="nc-empty">ネーム原案のページが空です。</div>`;
  return `<div class="sb-list">${pages.map((page: any) => {
    const panels = Array.isArray(page.panels) ? page.panels : [];
    return `
      <section class="nc-card sb-page">
        <div class="sb-page__head">
          <h3 class="sb-page__title">ページ ${escapeHtml(String(page.page_no ?? "-"))}</h3>
          ${page.role ? `<span class="nc-badge nc-badge--neutral">${escapeHtml(String(page.role))}</span>` : ""}
        </div>
        <div class="sb-panels">
          ${panels.map((panel: any) => `
            <article class="nc-card nc-card--sunken sb-panel">
              <h4>${escapeHtml(String(panel.panel_id ?? "-"))}</h4>
              <div class="sb-meta">順序=${escapeHtml(String(panel.reading_order ?? "-"))} / ショット=${escapeHtml(String(panel.shot_type ?? "-"))}</div>
              <div class="sb-text">${escapeHtml((() => {
                const extract = (item: any): string => typeof item === "string" ? item : (item?.text ?? "");
                const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
                return [...arr(panel.dialogue), ...arr(panel.monologue), ...arr(panel.narration)]
                  .map(extract).filter(Boolean).join(" / ") || "(テキストなし)";
              })())}</div>
            </article>`).join("")}
        </div>
        <details class="sb-details">
          <summary>ページの生 JSON</summary>
          <pre class="nc-code-block">${jsonHtml(page)}</pre>
        </details>
      </section>`;
  }).join("")}</div>`;
}

function renderPagePlan(manifest: Manifest): string {
  const pages = manifest.page_plan?.pages ?? [];
  if (pages.length === 0) return `<div class="nc-empty">ページ配置データが空です。</div>`;
  return `<div class="sb-list">${pages.map((page: any) => {
    const panels = Array.isArray(page.panels) ? page.panels : [];
    return `
      <section class="nc-card sb-page">
        <div class="sb-page__head">
          <h3 class="sb-page__title">ページ ${escapeHtml(String(page.page_no ?? "-"))}</h3>
          ${page.render_strategy ? `<span class="nc-badge nc-badge--info">${escapeHtml(String(page.render_strategy))}</span>` : ""}
        </div>
        <div class="sb-panels">
          ${panels.map((panel: any) => `
            <article class="nc-card nc-card--sunken sb-panel">
              <h4>${escapeHtml(String(panel.panel_id ?? "-"))}</h4>
              <div class="sb-meta">順序=${escapeHtml(String(panel.reading_order ?? "-"))} / 重要度=${escapeHtml(String(panel.importance ?? "-"))} / rect=${escapeHtml(JSON.stringify(panel.rect ?? null))}</div>
              <div class="sb-meta">borderless=${escapeHtml(String(panel.is_borderless ?? false))} / bleed=${escapeHtml(String(panel.bleed_polygon ?? false))} / bg=${escapeHtml(String(panel.background_treatment ?? "-"))}</div>
            </article>`).join("")}
        </div>
        <details class="sb-details">
          <summary>ページ配置の生 JSON</summary>
          <pre class="nc-code-block">${jsonHtml(page)}</pre>
        </details>
      </section>`;
  }).join("")}</div>`;
}

function rawSection(id: string, label: string, value: unknown, copied: string | null): string {
  return `
    <details class="nc-card sb-details" open>
      <summary>${escapeHtml(label)}</summary>
      <button type="button" class="nc-button nc-button--sm sb-copy" data-copy-raw="${escapeHtml(id)}">${copied === id ? "コピー済み" : "コピー"}</button>
      <pre class="nc-code-block" data-raw="${escapeHtml(id)}">${jsonHtml(value)}</pre>
    </details>`;
}

function renderRaw(manifest: Manifest, copied: string | null): string {
  return `<div class="sb-list">
    ${rawSection("storyboard", "storyboard.json", manifest.storyboard, copied)}
    ${rawSection("page_plan", "page_plan.json", manifest.page_plan, copied)}
    ${rawSection("render_manifest", "render manifest", manifest.render_manifest, copied)}
  </div>`;
}

function renderContent(state: ViewState): string {
  if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
  if (state.error && !state.manifest) return `<div class="view-placeholder"><h2>ネーム原案・ページ配置</h2><p>${escapeHtml(state.error)}</p></div>`;
  const manifest = state.manifest;
  if (!manifest) return `<div class="nc-empty">manifest が読み込まれていません。</div>`;
  if (state.tab === "storyboard") return renderStoryboard(manifest);
  if (state.tab === "page-plan") return renderPagePlan(manifest);
  if (state.tab === "resolved-refs") {
    return `<div class="nc-empty">resolved_refs.json を直接見るには Pipeline view から L07 結果を確認してください。</div>`;
  }
  return renderRaw(manifest, state.copied);
}

function render(container: HTMLElement, state: ViewState): void {
  const scope = `${state.slug} / ep${String(state.episode).padStart(2, "0")}`;
  container.innerHTML = `
    <div class="sb-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">ネーム原案・ページ配置</h2>
        <span class="sb-info">${escapeHtml(scope)}</span>
        <span class="sb-spacer"></span>
        <select class="nc-field__select" data-sb-ai-layer aria-label="AI 編集対象 layer">
          <option value="L03">L03 Shotlist</option>
          <option value="L04">L04 Storyboard</option>
          <option value="L05" selected>L05 Page Plan</option>
          <option value="L06">L06 Continuity</option>
          <option value="L07">L07 Refs Resolution</option>
          <option value="L08">L08 Incremental Refs</option>
        </select>
        <button type="button" class="nc-button nc-button--ghost" data-sb-ai-edit title="選択した layer を AI 編集 view へ">AI で修正</button>
      </div>
      ${renderTabs(state.tab)}
      <div class="sb-content">${renderContent(state)}</div>
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

export function mountStoryboardView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    episode: app.currentEpisode || app.defaultEpisode,
    tab: "storyboard",
    manifest: null,
    loading: false,
    error: null,
    copied: null,
  };

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tab = target.closest<HTMLButtonElement>("[data-sb-tab]")?.dataset.sbTab as StoryboardTab | undefined;
    if (tab && TABS.some((item) => item.id === tab)) {
      state.tab = tab;
      state.copied = null;
      render(container, state);
      return;
    }
    if (target.closest<HTMLButtonElement>("[data-sb-ai-edit]")) {
      const select = container.querySelector<HTMLSelectElement>("[data-sb-ai-layer]");
      const layer = select?.value || "L05";
      navigateToAiEdit(layer, { slug: state.slug, episode: state.episode });
      return;
    }
    const copyId = target.closest<HTMLButtonElement>("[data-copy-raw]")?.dataset.copyRaw;
    if (copyId) {
      const raw = Array.from(container.querySelectorAll<HTMLElement>("[data-raw]")).find(
        (node) => node.dataset.raw === copyId
      );
      const text = raw?.textContent ?? "";
      void navigator.clipboard?.writeText(text);
      state.copied = copyId;
      render(container, state);
    }
  }, { signal: controller.signal });

  window.addEventListener("keydown", (event) => {
    const found = TABS.find((tab) => tab.key === event.key);
    if (!found) return;
    state.tab = found.id;
    render(container, state);
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
