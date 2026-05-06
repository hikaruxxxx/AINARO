import {
  ApiError,
  apiGetBible,
  apiGetManifest,
  type BibleAssetView,
  type BibleCharacterRef,
  type Manifest,
} from "../lib/api";
import { store } from "../lib/store";

type TopTab = "bible" | "storyboard" | "page-plan" | "audit" | "raw";
type BibleTab = "characters" | "locations" | "props" | "world" | "style" | "raw";
type AnyRecord = Record<string, unknown>;

const TOP_TABS: Array<{ id: TopTab; label: string }> = [
  { id: "bible", label: "Bible" },
  { id: "storyboard", label: "Storyboard" },
  { id: "page-plan", label: "Page plan" },
  { id: "audit", label: "Audit" },
  { id: "raw", label: "Raw JSON" },
];

const BIBLE_TABS: Array<{ id: BibleTab; label: string }> = [
  { id: "characters", label: "Characters" },
  { id: "locations", label: "Locations" },
  { id: "props", label: "Props" },
  { id: "world", label: "World" },
  { id: "style", label: "Style" },
  { id: "raw", label: "Raw" },
];

const CSS = `
.ast-view { display:grid; gap:12px; }
.ast-tabs,.ast-subtabs { display:flex; gap:6px; flex-wrap:wrap; }
.ast-tab { min-height:32px; border:1px solid #c7cfdb; border-radius:6px; background:#fff; color:#243044; padding:0 10px; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.ast-tab-active { background:#2563eb; border-color:#2563eb; color:#fff; }
.ast-panel { display:grid; gap:12px; }
.ast-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
.ast-card { background:#fff; border:1px solid #dbe1ea; border-radius:8px; padding:10px; display:grid; gap:8px; }
.ast-card h3 { margin:0; font-size:14px; }
.ast-meta { color:#64748b; font-size:12px; overflow-wrap:anywhere; }
.ast-summary { color:#334155; font-size:13px; line-height:1.45; display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
.ast-thumb { width:100%; aspect-ratio:4/3; object-fit:cover; border:1px solid #e5e7eb; border-radius:6px; background:#f8fafc; cursor:pointer; }
.ast-list { display:grid; gap:8px; }
.ast-row { background:#fff; border:1px solid #dbe1ea; border-radius:8px; padding:10px; display:grid; gap:6px; }
.ast-row-head { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.ast-badge { display:inline-flex; align-items:center; min-height:22px; border-radius:999px; padding:0 8px; font-size:12px; font-weight:700; background:#eef2f6; color:#475569; }
.ast-badge.failed,.ast-badge.error { background:#fee2e2; color:#991b1b; }
.ast-badge.ok,.ast-badge.passed { background:#dcfce7; color:#166534; }
.ast-panel-list { display:grid; gap:6px; padding-left:12px; }
.ast-pre { margin:0; padding:10px; border-radius:8px; background:#0f172a; color:#e2e8f0; overflow:auto; max-height:560px; font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space:pre-wrap; overflow-wrap:anywhere; }
.ast-details { background:#fff; border:1px solid #dbe1ea; border-radius:8px; padding:10px; }
.ast-copy { justify-self:start; min-height:30px; border:1px solid #c7cfdb; border-radius:6px; background:#fff; padding:0 9px; font:inherit; font-size:12px; font-weight:700; cursor:pointer; }
.ast-loading,.ast-error,.ast-empty { padding:18px; background:#fff; border:1px solid #dbe1ea; border-radius:8px; color:#64748b; }
.ast-error { color:#991b1b; }
.ast-lightbox { position:fixed; inset:0; z-index:1000; background:rgba(15,23,42,.82); display:grid; place-items:center; padding:24px; }
.ast-lightbox-inner { max-width:min(1100px,96vw); max-height:92vh; display:grid; gap:8px; color:#fff; }
.ast-lightbox img { max-width:100%; max-height:84vh; object-fit:contain; background:#fff; border-radius:6px; }
.ast-lightbox button { justify-self:end; min-height:32px; border:1px solid rgba(255,255,255,.5); border-radius:6px; color:#fff; background:rgba(15,23,42,.6); padding:0 10px; font:inherit; cursor:pointer; }
`;

type ViewState = {
  slug: string;
  episode: number;
  topTab: TopTab;
  bibleTab: BibleTab;
  bible: BibleAssetView | null;
  manifest: Manifest | null;
  loading: boolean;
  error: string | null;
  lightbox: { src: string; caption: string } | null;
  copied: string | null;
  loadSeq: number;
};

function ensureStyles(): void {
  if (document.getElementById("ast-styles")) return;
  const style = document.createElement("style");
  style.id = "ast-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

function textField(item: unknown, keys: string[]): string {
  const obj = asRecord(item);
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function idOf(item: unknown): string {
  return textField(item, ["id", "panel_id", "page_id"]) || "(no id)";
}

function nameOf(item: unknown): string {
  return textField(item, ["name", "title", "label"]) || idOf(item);
}

function summaryOf(item: unknown): string {
  const obj = asRecord(item);
  const candidates = [
    obj.summary,
    obj.description,
    obj.appearance_notes,
    obj.location_type,
    obj.role,
    obj.spec,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") return JSON.stringify(value);
  }
  return "";
}

function refMap(refs: BibleCharacterRef[]): Map<string, string[]> {
  return new Map(refs.map((ref) => [ref.id, ref.files]));
}

function refUrl(kind: "characters" | "locations" | "props", id: string, file: string): string {
  return `/bible/refs/${kind}/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;
}

function renderTopTabs(active: TopTab): string {
  return `<div class="ast-tabs">${TOP_TABS.map((tab) => `<button type="button" class="ast-tab ${tab.id === active ? "ast-tab-active" : ""}" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
}

function renderBibleTabs(active: BibleTab): string {
  return `<div class="ast-subtabs">${BIBLE_TABS.map((tab) => `<button type="button" class="ast-tab ${tab.id === active ? "ast-tab-active" : ""}" data-bible-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
}

function renderAssetCards(
  kind: "characters" | "locations" | "props",
  items: unknown[],
  refs: BibleCharacterRef[]
): string {
  const byId = refMap(refs);
  if (items.length === 0) return `<div class="ast-empty">No ${kind}</div>`;
  return `<div class="ast-grid">${items.map((item) => {
    const id = idOf(item);
    const files = byId.get(id) ?? [];
    const thumb = files[0] ? refUrl(kind, id, files[0]) : "";
    const caption = `${nameOf(item)} / ${id}`;
    return `
      <article class="ast-card">
        ${thumb ? `<img class="ast-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(caption)}" data-lightbox-src="${escapeHtml(thumb)}" data-lightbox-caption="${escapeHtml(caption)}">` : ""}
        <h3>${escapeHtml(nameOf(item))}</h3>
        <div class="ast-meta">${escapeHtml(id)}</div>
        <div class="ast-summary">${escapeHtml(summaryOf(item))}</div>
        ${files.length > 1 ? `<div class="ast-meta">${files.length} refs</div>` : ""}
      </article>`;
  }).join("")}</div>`;
}

function renderBible(state: ViewState): string {
  const bible = state.bible;
  if (!bible) return `<div class="ast-empty">Bible snapshot is not loaded.</div>`;
  const body = (() => {
    if (state.bibleTab === "characters") return renderAssetCards("characters", bible.characters, bible.refs.characters);
    if (state.bibleTab === "locations") return renderAssetCards("locations", bible.locations, bible.refs.locations);
    if (state.bibleTab === "props") return renderAssetCards("props", bible.props, bible.refs.props);
    if (state.bibleTab === "world") return `<pre class="ast-pre">${jsonHtml(bible.world)}</pre>`;
    if (state.bibleTab === "style") {
      return `<pre class="ast-pre">${jsonHtml({
        style_directives: bible.style_directives,
        visual_motifs: bible.visual_motifs,
        continuity_seeds: bible.continuity_seeds,
      })}</pre>`;
    }
    return `<details class="ast-details" open><summary>snapshot.json</summary><pre class="ast-pre">${jsonHtml(bible)}</pre></details>`;
  })();
  return `<div class="ast-panel">${renderBibleTabs(state.bibleTab)}${body}</div>`;
}

function renderStoryboard(manifest: Manifest | null): string {
  const pages = manifest?.storyboard?.pages ?? [];
  if (!manifest) return `<div class="ast-empty">Manifest is not loaded.</div>`;
  return `
    <div class="ast-list">
      ${pages.map((page: any) => `
        <section class="ast-row">
          <div class="ast-row-head"><strong>Page ${escapeHtml(String(page.page_no ?? "-"))}</strong><span class="ast-badge">${escapeHtml(String(page.role ?? ""))}</span></div>
          <div class="ast-panel-list">${(page.panels ?? []).map((panel: any) => `
            <div>
              <strong>${escapeHtml(String(panel.panel_id ?? "-"))}</strong>
              <span class="ast-meta"> order=${escapeHtml(String(panel.reading_order ?? "-"))} shot=${escapeHtml(String(panel.shot_type ?? "-"))}</span>
              <div class="ast-meta">${escapeHtml([panel.dialogue, panel.monologue, panel.narration].filter(Boolean).join(" / "))}</div>
            </div>`).join("")}</div>
        </section>`).join("")}
      <details class="ast-details"><summary>Raw storyboard</summary><pre class="ast-pre">${jsonHtml(manifest.storyboard)}</pre></details>
    </div>`;
}

function renderPagePlan(manifest: Manifest | null): string {
  const pages = manifest?.page_plan?.pages ?? [];
  if (!manifest) return `<div class="ast-empty">Manifest is not loaded.</div>`;
  return `
    <div class="ast-list">
      ${pages.map((page: any) => `
        <section class="ast-row">
          <div class="ast-row-head"><strong>Page ${escapeHtml(String(page.page_no ?? "-"))}</strong><span class="ast-badge">${escapeHtml(String(page.render_strategy ?? ""))}</span></div>
          <div class="ast-panel-list">${(page.panels ?? []).map((panel: any) => `
            <div>
              <strong>${escapeHtml(String(panel.panel_id ?? "-"))}</strong>
              <span class="ast-meta"> order=${escapeHtml(String(panel.reading_order ?? "-"))} bbox=${escapeHtml(JSON.stringify(panel.bbox ?? null))}</span>
              <div class="ast-meta">refs: ${escapeHtml(JSON.stringify(panel.ref_ids ?? []))}</div>
            </div>`).join("")}</div>
        </section>`).join("")}
      <details class="ast-details"><summary>Raw page_plan</summary><pre class="ast-pre">${jsonHtml(manifest.page_plan)}</pre></details>
    </div>`;
}

function renderAudit(manifest: Manifest | null): string {
  if (!manifest) return `<div class="ast-empty">Manifest is not loaded.</div>`;
  const audit = manifest.audit;
  if (!audit) return `<div class="ast-empty">audit.json is missing.</div>`;
  const obj = asRecord(audit);
  const panels = Array.isArray(obj.panels) ? obj.panels : [];
  return `
    <div class="ast-list">
      <section class="ast-row">
        <div class="ast-row-head"><strong>Summary</strong></div>
        <pre class="ast-pre">${jsonHtml(obj.summary ?? {})}</pre>
        <div class="ast-meta">failed_panel_ids: ${escapeHtml(JSON.stringify(obj.failed_panel_ids ?? []))}</div>
      </section>
      ${panels.map((panel) => {
        const p = asRecord(panel);
        const status = String(p.status ?? "unknown");
        return `<section class="ast-row">
          <div class="ast-row-head"><strong>${escapeHtml(String(p.panel_id ?? p.id ?? "-"))}</strong><span class="ast-badge ${escapeHtml(status)}">${escapeHtml(status)}</span></div>
          <div class="ast-meta">${escapeHtml(JSON.stringify(p.reasons ?? p.findings ?? []))}</div>
        </section>`;
      }).join("")}
      <details class="ast-details"><summary>Raw audit</summary><pre class="ast-pre">${jsonHtml(audit)}</pre></details>
    </div>`;
}

function rawSection(id: string, label: string, value: unknown, copied: string | null): string {
  return `
    <details class="ast-details" open>
      <summary>${escapeHtml(label)}</summary>
      <button type="button" class="ast-copy" data-copy="${escapeHtml(id)}">${copied === id ? "copied" : "copy"}</button>
      <pre class="ast-pre" data-raw="${escapeHtml(id)}">${jsonHtml(value)}</pre>
    </details>`;
}

function renderRaw(state: ViewState): string {
  return `<div class="ast-list">
    ${rawSection("bible", "Bible", state.bible, state.copied)}
    ${rawSection("storyboard", "Storyboard", state.manifest?.storyboard ?? null, state.copied)}
    ${rawSection("page-plan", "Page plan", state.manifest?.page_plan ?? null, state.copied)}
    ${rawSection("audit", "Audit", state.manifest?.audit ?? null, state.copied)}
  </div>`;
}

function renderBody(state: ViewState): string {
  if (state.loading) return `<div class="ast-loading">Loading assets...</div>`;
  if (state.error) return `<div class="ast-error">${escapeHtml(state.error)}</div>`;
  if (state.topTab === "bible") return renderBible(state);
  if (state.topTab === "storyboard") return renderStoryboard(state.manifest);
  if (state.topTab === "page-plan") return renderPagePlan(state.manifest);
  if (state.topTab === "audit") return renderAudit(state.manifest);
  return renderRaw(state);
}

function render(container: HTMLElement, state: ViewState): void {
  container.innerHTML = `
    <div class="ast-view" tabindex="0">
      ${renderTopTabs(state.topTab)}
      ${renderBody(state)}
    </div>
    ${state.lightbox ? `
      <div class="ast-lightbox" data-lightbox>
        <div class="ast-lightbox-inner">
          <button type="button" data-close-lightbox>close</button>
          <img src="${escapeHtml(state.lightbox.src)}" alt="${escapeHtml(state.lightbox.caption)}">
          <div>${escapeHtml(state.lightbox.caption)}</div>
        </div>
      </div>` : ""}`;
}

async function loadAssets(state: ViewState, rerender: () => void): Promise<void> {
  const seq = ++state.loadSeq;
  state.loading = true;
  state.error = null;
  rerender();
  try {
    const [bible, manifest] = await Promise.all([
      apiGetBible(state.slug),
      apiGetManifest(state.slug, state.episode),
    ]);
    if (seq !== state.loadSeq) return;
    state.bible = bible;
    state.manifest = manifest;
  } catch (e) {
    if (seq !== state.loadSeq) return;
    state.error = errorText(e);
  } finally {
    if (seq === state.loadSeq) {
      state.loading = false;
      rerender();
    }
  }
}

function topTabByKey(key: string): TopTab | null {
  if (key === "1") return "bible";
  if (key === "2") return "storyboard";
  if (key === "3") return "page-plan";
  if (key === "4") return "audit";
  if (key === "5") return "raw";
  return null;
}

export function mountAssetsView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.defaultSlug || app.currentSlug,
    episode: app.currentEpisode || app.defaultEpisode,
    topTab: "bible",
    bibleTab: "characters",
    bible: null,
    manifest: null,
    loading: false,
    error: null,
    lightbox: null,
    copied: null,
    loadSeq: 0,
  };

  const rerender = () => render(container, state);
  void loadAssets(state, rerender);

  const unsubscribe = store.subscribe((next) => {
    const slug = next.defaultSlug || next.currentSlug;
    const episode = next.currentEpisode || next.defaultEpisode;
    if (slug === state.slug && episode === state.episode) return;
    state.slug = slug;
    state.episode = episode;
    void loadAssets(state, rerender);
  });
  controller.signal.addEventListener("abort", unsubscribe, { once: true });

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tab = target.closest<HTMLButtonElement>("[data-tab]");
    const bibleTab = target.closest<HTMLButtonElement>("[data-bible-tab]");
    const thumb = target.closest<HTMLElement>("[data-lightbox-src]");
    const close = target.closest<HTMLElement>("[data-close-lightbox]");
    const copy = target.closest<HTMLButtonElement>("[data-copy]");
    if (tab?.dataset.tab) {
      state.topTab = tab.dataset.tab as TopTab;
      rerender();
      return;
    }
    if (bibleTab?.dataset.bibleTab) {
      state.bibleTab = bibleTab.dataset.bibleTab as BibleTab;
      rerender();
      return;
    }
    if (thumb?.dataset.lightboxSrc) {
      state.lightbox = {
        src: thumb.dataset.lightboxSrc,
        caption: thumb.dataset.lightboxCaption ?? "",
      };
      rerender();
      return;
    }
    if (close || target.dataset.lightbox !== undefined) {
      state.lightbox = null;
      rerender();
      return;
    }
    if (copy?.dataset.copy) {
      const id = copy.dataset.copy;
      const raw = container.querySelector<HTMLElement>(`[data-raw="${id}"]`)?.textContent ?? "";
      void navigator.clipboard?.writeText(raw).then(() => {
        state.copied = id;
        rerender();
      }).catch((e) => {
        state.error = errorText(e);
        rerender();
      });
    }
  }, { signal: controller.signal });

  container.addEventListener("keydown", (event) => {
    const tab = topTabByKey(event.key);
    if (tab) {
      state.topTab = tab;
      event.preventDefault();
      rerender();
      return;
    }
    if (event.key === "Escape" && state.lightbox) {
      state.lightbox = null;
      event.preventDefault();
      rerender();
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
