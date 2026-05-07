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
/* Phase C-1α: page card click → 精読 modal */
.sb-page { cursor: zoom-in; transition: box-shadow 120ms; }
.sb-page:hover { box-shadow: 0 0 0 2px rgba(37,99,235,0.35); }
.sb-modal { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,0.55); }
.sb-modal-card { width: min(1200px, 96vw); max-height: 96vh; overflow: auto; padding: 16px 20px; border-radius: 8px; background: var(--surface-elevated, #fff); box-shadow: 0 12px 42px rgba(15,23,42,0.32); display: grid; gap: 12px; direction: ltr; }
.sb-modal-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sb-modal-title { margin: 0; font-size: var(--fs-lg, 18px); }
.sb-modal-meta { color: var(--text-secondary, #64748b); font-size: 12px; flex: 1 1 auto; }
.sb-modal-close { background: var(--surface-elevated, #fff); border: 1px solid var(--border-subtle, #d1d5db); color: var(--text-primary, #111827); padding: 4px 10px; font-size: 12px; border-radius: 4px; cursor: pointer; }
.sb-modal-nav { display: flex; gap: 6px; }
.sb-modal-nav button { background: var(--surface-elevated, #fff); border: 1px solid var(--border-subtle, #d1d5db); padding: 4px 10px; font-size: 12px; border-radius: 4px; cursor: pointer; }
.sb-modal-nav button:disabled { opacity: 0.5; cursor: not-allowed; }
.sb-panel-grid {
  display: grid;
  gap: var(--space-2, 10px);
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}
.sb-panel-card { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--border-subtle, #d1d5db); border-radius: 6px; background: var(--surface-sunken, #f8fafc); }
.sb-panel-card h4 { margin: 0; font-size: var(--fs-md, 14px); }
.sb-panel-card .sb-meta { font-size: 11px; }
.sb-panel-card .sb-line { font-size: 13px; line-height: 1.5; color: var(--text-primary, #111827); padding: 2px 0; }
.sb-panel-card .sb-line--dialogue { color: #1e40af; }
.sb-panel-card .sb-line--monologue { color: #6d28d9; }
.sb-panel-card .sb-line--narration { color: #475569; }
.sb-panel-card .sb-line--sfx { color: #b45309; font-weight: 700; }
.sb-panel-card .sb-line--action { color: #047857; font-style: italic; }
.sb-modal-hint { color: var(--text-tertiary, #6b7280); font-size: 11px; }
`;

/** Phase C-1α: 各 page を modal で精読する。Tab/Shift+Tab で page 移動、Esc で閉じる。 */
type PageDetailModal = {
  /** どの tab から開いた modal か (storyboard | page-plan)。表示内容を切替える。 */
  source: "storyboard" | "page-plan";
  pageNo: number;
};

type ViewState = {
  slug: string;
  episode: number;
  tab: StoryboardTab;
  manifest: Manifest | null;
  loading: boolean;
  error: string | null;
  copied: string | null;
  pageModal: PageDetailModal | null;
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
    const pageNo = Number(page.page_no);
    const clickAttrs = Number.isFinite(pageNo)
      ? ` data-sb-page-modal="storyboard" data-sb-page-no="${pageNo}"`
      : "";
    return `
      <section class="nc-card sb-page"${clickAttrs}>
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

/** modal hero: 1 page を panel ごとに大きく展開、dialogue / monologue / narration / sfx / action を分類表示 */
function renderPageDetailModal(state: ViewState): string {
  const ctx = state.pageModal;
  const manifest = state.manifest;
  if (!ctx || !manifest) return "";
  const pages = ctx.source === "storyboard" ? (manifest.storyboard?.pages ?? []) : (manifest.page_plan?.pages ?? []);
  const page = (pages as any[]).find((p: any) => Number(p.page_no) === ctx.pageNo);
  if (!page) return "";
  const allPageNos = (pages as any[]).map((p: any) => Number(p.page_no)).filter((n) => Number.isFinite(n));
  const idx = allPageNos.indexOf(ctx.pageNo);
  const total = allPageNos.length;
  const role = page.role ?? page.page_role ?? "";
  const renderStrategy = page.render_strategy ?? "";
  const panels = Array.isArray(page.panels) ? page.panels : [];

  const panelHtml = panels.map((panel: any) => {
    const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
    const dialogue = arr(panel.dialogue).map((d: any) => typeof d === "string" ? d : `${d?.character_id ?? ""}: ${d?.text ?? ""}`).filter(Boolean);
    const monologue = arr(panel.monologue).map((m: any) => typeof m === "string" ? m : `${m?.character_id ?? ""}: ${m?.text ?? ""}`).filter(Boolean);
    const narration = arr(panel.narration).map((n: any) => typeof n === "string" ? n : (n?.text ?? "")).filter(Boolean);
    const sfx = arr(panel.sfx).map((s: any) => typeof s === "string" ? s : (s?.text ?? "")).filter(Boolean);
    const action = typeof panel.action === "string" ? panel.action : "";
    const keyVisual = typeof panel.key_visual === "string" ? panel.key_visual : "";
    const lines: string[] = [];
    if (action) lines.push(`<div class="sb-line sb-line--action">演出: ${escapeHtml(action)}</div>`);
    if (keyVisual) lines.push(`<div class="sb-line sb-line--action">key visual: ${escapeHtml(keyVisual)}</div>`);
    for (const t of dialogue) lines.push(`<div class="sb-line sb-line--dialogue">「${escapeHtml(t)}」</div>`);
    for (const t of monologue) lines.push(`<div class="sb-line sb-line--monologue">(M) ${escapeHtml(t)}</div>`);
    for (const t of narration) lines.push(`<div class="sb-line sb-line--narration">(N) ${escapeHtml(t)}</div>`);
    if (sfx.length > 0) lines.push(`<div class="sb-line sb-line--sfx">SFX: ${escapeHtml(sfx.join(" / "))}</div>`);
    if (panel.silence) lines.push(`<div class="sb-line">(silence)</div>`);
    if (lines.length === 0) lines.push(`<div class="sb-line sb-meta">(テキストなし)</div>`);
    return `
      <article class="sb-panel-card">
        <h4>${escapeHtml(String(panel.panel_id ?? "-"))}</h4>
        <div class="sb-meta">順序=${escapeHtml(String(panel.reading_order ?? "-"))} / ショット=${escapeHtml(String(panel.shot_type ?? "-"))}${panel.importance ? ` / 重要度=${escapeHtml(String(panel.importance))}` : ""}</div>
        ${lines.join("")}
      </article>`;
  }).join("");

  return `
    <div class="sb-modal" data-sb-modal-overlay>
      <div class="sb-modal-card" role="dialog" aria-modal="true" aria-labelledby="sb-modal-title">
        <div class="sb-modal-head">
          <h3 class="sb-modal-title" id="sb-modal-title">P.${escapeHtml(String(page.page_no))} ${role ? `<span class="nc-badge nc-badge--neutral">[${escapeHtml(String(role))}]</span>` : ""}${renderStrategy ? `<span class="nc-badge nc-badge--info">${escapeHtml(String(renderStrategy))}</span>` : ""}</h3>
          <span class="sb-modal-meta">${idx + 1} / ${total} · ${ctx.source === "storyboard" ? "ネーム原案" : "ページ配置"} · panel ${panels.length} 件</span>
          <div class="sb-modal-nav">
            <button type="button" data-sb-modal-prev${idx <= 0 ? " disabled" : ""}>← 前</button>
            <button type="button" data-sb-modal-next${idx < 0 || idx >= total - 1 ? " disabled" : ""}>次 →</button>
          </div>
          <button type="button" class="sb-modal-close" data-sb-modal-close>閉じる</button>
        </div>
        <div class="sb-panel-grid">${panelHtml || `<div class="nc-empty">panel データが空です</div>`}</div>
        <div class="sb-modal-hint">Tab で次の page · Shift+Tab で前の page · Esc で閉じる</div>
      </div>
    </div>`;
}

function renderPagePlan(manifest: Manifest): string {
  const pages = manifest.page_plan?.pages ?? [];
  if (pages.length === 0) return `<div class="nc-empty">ページ配置データが空です。</div>`;
  return `<div class="sb-list">${pages.map((page: any) => {
    const panels = Array.isArray(page.panels) ? page.panels : [];
    const pageNo = Number(page.page_no);
    const clickAttrs = Number.isFinite(pageNo)
      ? ` data-sb-page-modal="page-plan" data-sb-page-no="${pageNo}"`
      : "";
    return `
      <section class="nc-card sb-page"${clickAttrs}>
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
    </div>
    ${renderPageDetailModal(state)}`;
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
    pageModal: null,
  };

  void refresh(state, container);

  function navigatePageModal(dir: 1 | -1): void {
    const ctx = state.pageModal;
    const manifest = state.manifest;
    if (!ctx || !manifest) return;
    const pages = ctx.source === "storyboard" ? (manifest.storyboard?.pages ?? []) : (manifest.page_plan?.pages ?? []);
    const allPageNos = (pages as any[]).map((p: any) => Number(p.page_no)).filter((n) => Number.isFinite(n));
    if (allPageNos.length <= 1) return;
    const idx = allPageNos.indexOf(ctx.pageNo);
    if (idx < 0) return;
    const nextIdx = Math.max(0, Math.min(allPageNos.length - 1, idx + dir));
    if (nextIdx === idx) return;
    state.pageModal = { source: ctx.source, pageNo: allPageNos[nextIdx] };
    render(container, state);
  }

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    // Phase C-1α: page card click → 精読 modal
    if (target.closest("[data-sb-modal-close]")) {
      state.pageModal = null;
      render(container, state);
      return;
    }
    if (target.closest("[data-sb-modal-prev]")) {
      navigatePageModal(-1);
      return;
    }
    if (target.closest("[data-sb-modal-next]")) {
      navigatePageModal(1);
      return;
    }
    const overlay = target.closest<HTMLElement>("[data-sb-modal-overlay]");
    if (overlay && target === overlay) {
      state.pageModal = null;
      render(container, state);
      return;
    }
    const pageCard = target.closest<HTMLElement>("[data-sb-page-modal]");
    if (pageCard) {
      const source = pageCard.dataset.sbPageModal as "storyboard" | "page-plan" | undefined;
      const pageNo = Number(pageCard.dataset.sbPageNo);
      if ((source === "storyboard" || source === "page-plan") && Number.isFinite(pageNo)) {
        state.pageModal = { source, pageNo };
        render(container, state);
        return;
      }
    }

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
    // modal が開いている時は Tab / Esc を捕捉して page navigate
    if (state.pageModal) {
      if (event.key === "Escape") {
        state.pageModal = null;
        render(container, state);
        event.preventDefault();
        return;
      }
      if (event.key === "Tab") {
        navigatePageModal(event.shiftKey ? -1 : 1);
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowLeft") {
        navigatePageModal(-1);
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowRight") {
        navigatePageModal(1);
        event.preventDefault();
        return;
      }
      return;
    }
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
