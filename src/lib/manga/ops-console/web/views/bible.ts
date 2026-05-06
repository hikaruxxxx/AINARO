import {
  ApiError,
  apiGetBible,
  apiPostJob,
  openJobStream,
  type BibleAssetView,
  type BibleCharacterRef,
  type JobEvent,
  type LayerId,
} from "../lib/api";
import {
  asKeyValueTable,
  asList,
  asRecord,
  asText,
  detailsRaw,
} from "../lib/data-display";
import { store } from "../lib/store";
import { navigateToAiEdit } from "../lib/layer-actions";

type BibleTab = "world" | "characters" | "locations" | "props" | "style" | "raw";
type ActionLayer = "L01" | "L01b" | "L01c";
type DisplayMode = "reader" | "raw";
type AnyRecord = Record<string, unknown>;

const BIBLE_TABS: Array<{ id: BibleTab; label: string }> = [
  { id: "world", label: "世界観" },
  { id: "characters", label: "キャラクター" },
  { id: "locations", label: "場所" },
  { id: "props", label: "小道具" },
  { id: "style", label: "画風指示" },
  { id: "raw", label: "生 JSON" },
];

const CSS = `
.bib-view { display: grid; gap: var(--space-3); }
.bib-tabs { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.bib-content { display: grid; gap: var(--space-3); }
.bib-reader { display: grid; gap: var(--space-3); max-width: 980px; }
.bib-mode { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.bib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-2); }
.bib-card { display: grid; gap: var(--space-2); }
.bib-section { display: grid; gap: var(--space-2); }
.bib-section h3 { margin: 0; font-size: var(--fs-lg); }
.bib-factions,.bib-style-overrides { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-2); }
.bib-card h3 { margin: 0; font-size: var(--fs-md); }
.bib-meta { color: var(--text-tertiary); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.bib-summary { color: var(--text-secondary); font-size: var(--fs-base); line-height: 1.5; }
.bib-thumb { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-sunken); }
.bib-modal-body { display: grid; gap: var(--space-3); padding: var(--space-4); }
.bib-modal-head { display: flex; align-items: center; gap: var(--space-2); }
.bib-modal-title { margin: 0; font-size: var(--fs-xl); }
.bib-spacer { flex: 1 1 auto; }
.bib-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.bib-log { min-height: 160px; white-space: pre-wrap; }
.bib-info { color: var(--text-secondary); font-size: var(--fs-sm); }
`;

type ViewState = {
  slug: string;
  bible: BibleAssetView | null;
  tab: BibleTab;
  displayMode: DisplayMode;
  loading: boolean;
  error: string | null;
  modal: ActionLayer | null;
  runningLayer: ActionLayer | null;
  log: string[];
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
};

function ensureStyles(): void {
  if (document.getElementById("bib-styles")) return;
  const style = document.createElement("style");
  style.id = "bib-styles";
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
  for (const value of [obj.summary, obj.description, obj.appearance_notes, obj.location_type, obj.role, obj.spec]) {
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object") return JSON.stringify(value);
  }
  return "";
}

function refMap(refs: BibleCharacterRef[]): Map<string, string[]> {
  return new Map(refs.map((ref) => [ref.id, ref.files]));
}

function refUrl(slug: string, kind: "characters" | "locations" | "props", id: string, file: string): string {
  return `/works/${encodeURIComponent(slug)}/bible/refs/${kind}/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;
}

function renderAssetCards(
  slug: string,
  kind: "characters" | "locations" | "props",
  items: unknown[],
  refs: BibleCharacterRef[]
): string {
  if (items.length === 0) return `<div class="nc-empty">No ${kind}</div>`;
  const byId = refMap(refs);
  return `<div class="bib-grid">${items.map((item) => {
    const id = idOf(item);
    const files = byId.get(id) ?? [];
    const thumb = files[0] ? refUrl(slug, kind, id, files[0]) : "";
    return `
      <article class="nc-card nc-card--default bib-card">
        ${thumb ? `<img class="bib-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(nameOf(item))}">` : ""}
        <h3>${escapeHtml(nameOf(item))}</h3>
        <div class="bib-meta">${escapeHtml(id)}</div>
        <div class="bib-summary">${escapeHtml(summaryOf(item))}</div>
        ${files.length > 1 ? `<div class="bib-meta">${files.length} refs</div>` : ""}
      </article>`;
  }).join("")}</div>`;
}

function renderTabs(active: BibleTab): string {
  return `<div class="bib-tabs">${BIBLE_TABS.map((tab) => `<button type="button" class="nc-pill${tab.id === active ? " nc-pill--active" : ""}" data-bible-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
}

function renderDisplayMode(active: DisplayMode): string {
  return `<div class="bib-mode">
    <button type="button" class="nc-pill${active === "reader" ? " nc-pill--active" : ""}" data-display-mode="reader">Reader</button>
    <button type="button" class="nc-pill${active === "raw" ? " nc-pill--active" : ""}" data-display-mode="raw">生 JSON</button>
  </div>`;
}

function renderWorldReader(world: unknown): string {
  const obj = asRecord(world);
  const factions = Array.isArray(obj.factions) ? obj.factions : [];
  return `<div class="bib-reader">
    <section class="nc-card bib-section">
      <h3>前提 (Premise)</h3>
      <p>${escapeHtml(asText(obj.premise))}</p>
      ${detailsRaw("生 JSON", obj.premise)}
    </section>
    <section class="nc-card bib-section">
      <h3>ルール (Rules)</h3>
      ${asList(obj.rules)}
      ${detailsRaw("生 JSON", obj.rules)}
    </section>
    <section class="nc-card bib-section">
      <h3>システム (System)</h3>
      ${typeof obj.system === "object" && obj.system !== null ? asKeyValueTable(asRecord(obj.system)) : `<p>${escapeHtml(asText(obj.system))}</p>`}
      ${detailsRaw("生 JSON", obj.system)}
    </section>
    <section class="nc-card bib-section">
      <h3>年表 (Timeline)</h3>
      ${Array.isArray(obj.timeline) ? `<ol>${obj.timeline.map((item) => `<li>${escapeHtml(asText(item))}</li>`).join("")}</ol>` : `<p>${escapeHtml(asText(obj.timeline))}</p>`}
      ${detailsRaw("生 JSON", obj.timeline)}
    </section>
    <section class="nc-card bib-section">
      <h3>勢力 (Factions)</h3>
      <div class="bib-factions">${factions.map((item) => {
        const faction = asRecord(item);
        return `<article class="nc-card nc-card--sunken bib-card">
          <h3>${escapeHtml(asText(faction.name ?? "名称未設定"))}</h3>
          <div class="bib-summary">${escapeHtml(asText(faction.summary ?? faction.description ?? item))}</div>
        </article>`;
      }).join("")}</div>
      ${detailsRaw("生 JSON", obj.factions)}
    </section>
  </div>`;
}

function renderStyleReader(bible: BibleAssetView): string {
  const directives = asRecord(bible.style_directives);
  const overrides = asRecord(directives.scene_overrides);
  return `<div class="bib-reader">
    <section class="nc-card bib-section">
      <h3>全体指示 (global)</h3>
      ${typeof directives.global === "object" && directives.global !== null ? asKeyValueTable(asRecord(directives.global)) : `<p>${escapeHtml(asText(directives.global))}</p>`}
      ${detailsRaw("生 JSON", directives.global)}
    </section>
    <section class="nc-card bib-section">
      <h3>シーン別指示 (scene_overrides)</h3>
      <div class="bib-style-overrides">${Object.entries(overrides).map(([key, value]) => `<article class="nc-card nc-card--sunken bib-card">
        <h3>${escapeHtml(key)}</h3>
        <div class="bib-summary">${escapeHtml(asText(value))}</div>
      </article>`).join("")}</div>
      ${detailsRaw("生 JSON", directives.scene_overrides)}
    </section>
    <section class="nc-card bib-section">
      <h3>合成・オーバーレイ規則 (overlay_rules)</h3>
      ${asList(directives.overlay_rules)}
      ${detailsRaw("生 JSON", directives.overlay_rules)}
    </section>
    <section class="nc-card bib-section">
      <h3>視覚モチーフ / 継続性 seed</h3>
      ${asKeyValueTable({
        "visual_motifs": Array.isArray(bible.visual_motifs) ? `${bible.visual_motifs.length} 件` : bible.visual_motifs,
        "continuity_seeds": Array.isArray(bible.continuity_seeds) ? `${bible.continuity_seeds.length} 件` : bible.continuity_seeds,
      })}
      ${detailsRaw("visual_motifs", bible.visual_motifs)}
      ${detailsRaw("continuity_seeds", bible.continuity_seeds)}
    </section>
  </div>`;
}

function renderBibleContent(state: ViewState): string {
  const bible = state.bible;
  if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
  if (state.error && !bible) return `<div class="view-placeholder"><h2>Bible</h2><p>${escapeHtml(state.error)}</p></div>`;
  if (!bible) return `<div class="nc-empty">Bible snapshot は未作成です。「Bible 全体構築」から生成してください。</div>`;
  if (state.tab === "characters") return renderAssetCards(state.slug, "characters", bible.characters, bible.refs.characters);
  if (state.tab === "locations") return renderAssetCards(state.slug, "locations", bible.locations, bible.refs.locations);
  if (state.tab === "props") return renderAssetCards(state.slug, "props", bible.props, bible.refs.props);
  if (state.tab === "world") {
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(bible.world)}</pre>` : renderWorldReader(bible.world)}`;
  }
  if (state.tab === "style") {
    const raw = {
      style_directives: bible.style_directives,
      visual_motifs: bible.visual_motifs,
      continuity_seeds: bible.continuity_seeds,
    };
    return `${renderDisplayMode(state.displayMode)}${state.displayMode === "raw" ? `<pre class="nc-code-block">${jsonHtml(raw)}</pre>` : renderStyleReader(bible)}`;
  }
  return `<pre class="nc-code-block">${jsonHtml(bible)}</pre>`;
}

function actionLabel(layer: ActionLayer): string {
  if (layer === "L01") return "世界観・キャラ設定 (Bible) を構築";
  if (layer === "L01b") return "Bible の文法チェック";
  return "Bible の深掘り";
}

function renderModal(state: ViewState): string {
  if (!state.modal) return "";
  const layer = state.modal;
  const disabled = state.runningLayer ? " disabled" : "";
  const fields = (() => {
    if (layer === "L01") {
      return `
        <label class="nc-field">
          <span class="nc-field__label">企画書ファイル (concept.json)</span>
          <input class="nc-field__input" name="concept" required placeholder="data/manga/...json">
        </label>
        <label class="nc-field">
          <span class="nc-field__label">画風 (art_style)</span>
          <input class="nc-field__input" name="artStyle" placeholder="manga_bw_seinen_urban">
        </label>`;
    }
    if (layer === "L01b") {
      return `
        <label class="nc-pill nc-pill--check"><input type="checkbox" name="skipLlm"> LLM チェックを省略 (--skip-llm)</label>
        <label class="nc-pill nc-pill--check"><input type="checkbox" name="failOnFatal"> 致命エラーで停止 (--fail-on-fatal)</label>`;
    }
    return `
      <label class="nc-field">
        <span class="nc-field__label">企画書ファイル (concept.json)</span>
        <input class="nc-field__input" name="concept" required placeholder="data/manga/...json">
      </label>
      <label class="nc-field">
        <span class="nc-field__label">画風参考メモ (style ref note)</span>
        <textarea class="nc-field__textarea" name="styleRefNote" rows="5"></textarea>
      </label>
      <label class="nc-pill nc-pill--check"><input type="checkbox" name="reLint" checked> 再 Lint (--re-lint)</label>`;
  })();

  return `
    <div class="nc-modal is-open" id="bib-modal">
      <form class="nc-modal__card nc-modal__card--md bib-modal-body" data-bib-form="${layer}">
        <div class="bib-modal-head">
          <h3 class="bib-modal-title">${escapeHtml(actionLabel(layer))}</h3>
          <span class="bib-info">${escapeHtml(state.slug)}</span>
          <span class="bib-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-close-modal${disabled}>閉じる</button>
        </div>
        ${fields}
        <div class="bib-actions">
          <button type="submit" class="nc-button nc-button--primary"${disabled}>${state.runningLayer ? "起動中" : "起動"}</button>
        </div>
        <pre class="nc-code-block bib-log">${escapeHtml(state.log.join("\n"))}</pre>
      </form>
    </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  container.innerHTML = `
    <div class="bib-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">世界観・設定 (Bible)</h2>
        <span class="bib-info">${escapeHtml(state.slug)}</span>
        <span class="bib-spacer"></span>
        <button type="button" class="nc-button nc-button--primary" data-action="L01">Bible 全体構築 (再生成)</button>
        <button type="button" class="nc-button nc-button--secondary" data-action="L01b">文法チェック (Lint)</button>
        <button type="button" class="nc-button nc-button--secondary" data-action="L01c">深掘り (Deepen)</button>
        <button type="button" class="nc-button nc-button--ghost" data-ai-edit-layer="L01" title="AI 編集 view へ遷移し、L01 Bible の context を prefill します">L01 を AI で修正</button>
      </div>
      ${renderTabs(state.tab)}
      <div class="bib-content">${renderBibleContent(state)}</div>
    </div>
    ${renderModal(state)}
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.bible = await apiGetBible(state.slug);
  } catch (error) {
    state.bible = null;
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

function setToast(state: ViewState, container: HTMLElement, message: string, kind: NonNullable<ViewState["toast"]>["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

function formArgs(layer: ActionLayer, form: HTMLFormElement): Record<string, string> {
  const data = new FormData(form);
  const args: Record<string, string> = {};
  if (layer === "L01") {
    args["--concept"] = String(data.get("concept") ?? "").trim();
    const artStyle = String(data.get("artStyle") ?? "").trim();
    if (artStyle) args["--art-style"] = artStyle;
  } else if (layer === "L01b") {
    if (data.get("skipLlm")) args["--skip-llm"] = "";
    if (data.get("failOnFatal")) args["--fail-on-fatal"] = "";
  } else {
    args["--concept"] = String(data.get("concept") ?? "").trim();
    const note = String(data.get("styleRefNote") ?? "").trim();
    if (note) args["--style-ref-note"] = note;
    if (data.get("reLint")) args["--re-lint"] = "";
  }
  return args;
}

export function mountBibleView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    bible: null,
    tab: "world",
    displayMode: "reader",
    loading: false,
    error: null,
    modal: null,
    runningLayer: null,
    log: [],
    toast: null,
  };
  let stream: { close: () => void } | null = null;

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tab = target.closest<HTMLButtonElement>("[data-bible-tab]")?.dataset.bibleTab as BibleTab | undefined;
    if (tab && BIBLE_TABS.some((item) => item.id === tab)) {
      state.tab = tab;
      state.displayMode = "reader";
      render(container, state);
      return;
    }
    const mode = target.closest<HTMLButtonElement>("[data-display-mode]")?.dataset.displayMode as DisplayMode | undefined;
    if (mode === "reader" || mode === "raw") {
      state.displayMode = mode;
      render(container, state);
      return;
    }
    const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action as ActionLayer | undefined;
    if (action === "L01" || action === "L01b" || action === "L01c") {
      state.modal = action;
      state.log = [];
      render(container, state);
      return;
    }
    const aiLayer = target.closest<HTMLButtonElement>("[data-ai-edit-layer]")?.dataset.aiEditLayer;
    if (aiLayer) {
      navigateToAiEdit(aiLayer, { slug: state.slug, episode: store.state.currentEpisode || 1 });
      return;
    }
    if (target.closest("[data-close-modal]") && !state.runningLayer) {
      state.modal = null;
      state.log = [];
      render(container, state);
    }
  }, { signal: controller.signal });

  container.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const layer = form.dataset.bibForm as ActionLayer | undefined;
    if (!(layer === "L01" || layer === "L01b" || layer === "L01c")) return;
    state.runningLayer = layer;
    state.log = [`starting ${layer}...`];
    render(container, state);
    void apiPostJob({ layer: layer as LayerId, slug: state.slug, args: formArgs(layer, form) })
      .then((job) => {
        stream = openJobStream(job.job_id, {
          onEvent: (entry: JobEvent) => {
            state.log.push(`[${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            state.log.push(`[system] done: ${info.state}`);
            state.runningLayer = null;
            stream?.close();
            stream = null;
            void refresh(state, container);
          },
          onError: (error) => {
            state.runningLayer = null;
            setToast(state, container, error.message, "danger");
          },
        });
      })
      .catch((error) => {
        state.runningLayer = null;
        setToast(state, container, `起動に失敗: ${errorText(error)}`, "danger");
      });
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    stream?.close();
    container.innerHTML = "";
  };
}
