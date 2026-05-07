import {
  ApiError,
  apiGetVolumePlot,
  apiPostJob,
  apiPutVolumePlot,
  openJobStream,
  type JobEvent,
  type VolumePlot,
} from "../lib/api";
import {
  asKeyValueTable,
  asRecord,
  detailsRaw,
  escapeHtml,
  jsonHtml,
} from "../lib/data-display";
import { store } from "../lib/store";
import { navigateToAiEdit } from "../lib/layer-actions";

type DisplayMode = "reader" | "edit" | "raw";

type ViewState = {
  slug: string;
  volume: number;
  plot: VolumePlot | null;
  displayMode: DisplayMode;
  loading: boolean;
  error: string | null;
  modalOpen: boolean;
  running: boolean;
  log: string[];
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
  /** edit モードで draft を保持。dirty 判定に使う。 */
  editDraft: unknown | null;
  saving: boolean;
};

const CSS = `
.vplot-view { display: grid; gap: var(--space-3); }
.vplot-spacer { flex: 1 1 auto; }
.vplot-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.vplot-body { display: grid; gap: var(--space-3); max-width: 980px; }
.vplot-section { display: grid; gap: var(--space-2); }
.vplot-section h3 { margin: 0; font-size: var(--fs-lg); }
.vplot-mode { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.vp-volume-card { display: grid; gap: var(--space-3); }
.vp-volume-head { display: flex; gap: var(--space-2); align-items: baseline; flex-wrap: wrap; }
.vp-volume-head h3 { margin: 0; font-size: var(--fs-xl); }
.vp-chapters { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-2); }
.vp-chapter { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.vp-chapter__label { font-weight: var(--fw-bold); color: var(--text-primary); }
.vp-chapter__summary { color: var(--text-secondary); line-height: 1.5; }
.vp-episodes { display: grid; gap: var(--space-3); }
.vp-episode-card { display: grid; gap: var(--space-3); }
.vp-episode-head { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.vp-episode-head h3 { margin: 0; font-size: var(--fs-lg); }
.vp-arc { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.vp-arc__step { border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-2); background: var(--surface-sunken); }
.vp-arc__label { display: block; color: var(--text-tertiary); font-size: var(--fs-sm); font-weight: var(--fw-bold); margin-bottom: var(--space-1); }
.vp-beats { display: grid; gap: var(--space-2); }
.vp-beat { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.vp-beat__head { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.vp-beat__summary { line-height: 1.6; color: var(--text-primary); }
.vp-beat__visual { color: var(--text-secondary); font-size: var(--fs-sm); }
.vp-beat__episodes { color: var(--text-tertiary); font-size: var(--fs-sm); }
.vp-intensity { height: 6px; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.vp-intensity__bar { height: 100%; border-radius: inherit; background: var(--color-primary); }
.vplot-modal-body { display: grid; gap: var(--space-3); padding: var(--space-4); }
.vplot-modal-head { display: flex; align-items: center; gap: var(--space-2); }
.vplot-modal-title { margin: 0; font-size: var(--fs-xl); }
.vplot-actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
.vplot-log { min-height: 160px; white-space: pre-wrap; }
.vp-edit-form { display: grid; gap: var(--space-3); }
.vp-edit-card { display: grid; gap: var(--space-2); }
.vp-edit-row { display: grid; grid-template-columns: 110px 1fr; gap: var(--space-2); align-items: start; }
.vp-edit-row > label { color: var(--text-secondary); font-size: var(--fs-sm); padding-top: 6px; }
.vp-edit-beat { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); }
.vp-edit-beat__head { display: flex; gap: var(--space-2); align-items: center; }
.vp-edit-save-bar { position: sticky; top: 0; z-index: 5; padding: var(--space-2); background: var(--surface-elevated); border-bottom: 1px solid var(--border-default); display: flex; gap: var(--space-2); align-items: center; }
.vp-edit-save-bar__hint { color: var(--text-tertiary); font-size: var(--fs-xs); margin-left: auto; }
.vp-edit-dirty { color: var(--color-warning); font-weight: var(--fw-medium); }
`;

function ensureStyles(): void {
  if (document.getElementById("vplot-styles")) return;
  const style = document.createElement("style");
  style.id = "vplot-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function renderDisplayMode(active: DisplayMode): string {
  return `<div class="vplot-mode">
    <button type="button" class="nc-pill${active === "reader" ? " nc-pill--active" : ""}" data-display-mode="reader">Reader</button>
    <button type="button" class="nc-pill${active === "edit" ? " nc-pill--active" : ""}" data-display-mode="edit" title="文言・emotional_intensity を inline 編集">編集</button>
    <button type="button" class="nc-pill${active === "raw" ? " nc-pill--active" : ""}" data-display-mode="raw">生 JSON</button>
  </div>`;
}

function intensity(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function renderBeats(beats: unknown): string {
  const items = Array.isArray(beats) ? beats : [];
  if (items.length === 0) return `<div class="nc-empty">beat がありません。</div>`;
  return `<div class="vp-beats">${items.map((beat) => {
    const b = asRecord(beat);
    const value = intensity(b.emotional_intensity);
    const related = Array.isArray(b.episodes) ? b.episodes : Array.isArray(b.related_episodes) ? b.related_episodes : [];
    return `<div class="vp-beat">
      <div class="vp-beat__head">
        <span class="nc-code">#${escapeHtml(String(b.beat_idx ?? "-"))}</span>
        ${b.label ? `<span class="nc-badge nc-badge--info">${escapeHtml(String(b.label))}</span>` : ""}
      </div>
      <div class="vp-beat__summary">${escapeHtml(String(b.summary ?? ""))}</div>
      ${related.length > 0 ? `<div class="vp-beat__episodes">関連 episode: ${escapeHtml(related.map(String).join(", "))}</div>` : ""}
      <div class="vp-intensity" title="emotional_intensity ${value}"><div class="vp-intensity__bar" style="width:${Math.round(value * 100)}%"></div></div>
      ${b.key_visual ? `<div class="vp-beat__visual">絵の核: ${escapeHtml(String(b.key_visual))}</div>` : ""}
      <details><summary>raw</summary><pre class="nc-code-block">${jsonHtml(beat)}</pre></details>
    </div>`;
  }).join("")}</div>`;
}

function renderChapters(value: unknown): string {
  const chapters = Array.isArray(value) ? value : [];
  if (chapters.length === 0) return "";
  return `<section class="vplot-section">
    <h3>章構成</h3>
    <div class="vp-chapters">${chapters.map((chapter, index) => {
      const c = asRecord(chapter);
      const label = c.label ?? c.title ?? c.name ?? `chapter ${index + 1}`;
      const summary = c.summary ?? c.description ?? c.role ?? "";
      return `<article class="vp-chapter">
        <div class="vp-chapter__label">${escapeHtml(String(label))}</div>
        ${summary ? `<div class="vp-chapter__summary">${escapeHtml(String(summary))}</div>` : ""}
        <details><summary>raw</summary><pre class="nc-code-block">${jsonHtml(chapter)}</pre></details>
      </article>`;
    }).join("")}</div>
  </section>`;
}

function renderEpisode(ep: unknown): string {
  const item = asRecord(ep);
  const episodeNo = Number(item.episode_no);
  const arc = asRecord(item.protagonist_arc);
  return `<article class="nc-card vp-episode-card">
    <div class="vp-episode-head">
      <span class="nc-badge nc-badge--neutral">ep${String(Number.isInteger(episodeNo) ? episodeNo : 0).padStart(2, "0")}</span>
      <h3>${escapeHtml(String(item.title_working ?? "タイトル未設定"))}</h3>
    </div>
    ${asKeyValueTable({
      "テーマ": item.theme,
      "ページ目安": item.page_target,
    })}
    <div class="vp-arc">
      <div class="vp-arc__step"><span class="vp-arc__label">start</span>${escapeHtml(String(arc.start ?? ""))}</div>
      <div class="vp-arc__step"><span class="vp-arc__label">turn</span>${escapeHtml(String(arc.turn ?? ""))}</div>
      <div class="vp-arc__step"><span class="vp-arc__label">end</span>${escapeHtml(String(arc.end ?? ""))}</div>
    </div>
    ${renderBeats(item.beats)}
    <details class="nc-card nc-card--sunken vplot-section">
      <summary>詳細 (must_include_events / cliffhanger_hook / brief_for_L3)</summary>
      ${asKeyValueTable({
        "必須イベント": item.must_include_events,
        "引き": item.cliffhanger_hook,
        "L3 入力ブリーフ": item.brief_for_L3,
      })}
    </details>
  </article>`;
}

function renderReader(plot: unknown): string {
  const obj = asRecord(plot);
  const episodes = Array.isArray(obj.episodes) ? obj.episodes : [];
  const chapters = obj.chapter_structure ?? obj.chapters ?? obj.acts;
  const summary = obj.summary ?? obj.volume_summary ?? obj.synopsis ?? obj.volume_theme;
  return `
    <div class="vplot-body">
      <section class="nc-card vp-volume-card">
        <div class="vp-volume-head">
          <span class="nc-badge nc-badge--neutral">v${String(Number(obj.volume_no ?? obj.volume ?? 1)).padStart(2, "0")}</span>
          <h3>${escapeHtml(String(obj.title_working ?? "巻プロット"))}</h3>
          <span class="nc-badge nc-badge--info">${episodes.length} episodes</span>
        </div>
        ${asKeyValueTable({
          "巻あらすじ": summary,
          "テーマ": obj.volume_theme,
          "推定ページ数": obj.estimated_pages,
        })}
        ${renderChapters(chapters)}
        <section class="vp-episodes">
          <h3>beat list / エピソード一覧</h3>
          ${episodes.map(renderEpisode).join("") || '<div class="nc-empty">episode がありません。</div>'}
        </section>
        <details class="vplot-section">
          <summary>巻プロット raw</summary>
          <pre class="nc-code-block">${jsonHtml(plot)}</pre>
        </details>
      </section>
    </div>`;
}

function escapeAttr(value: unknown): string {
  return escapeHtml(String(value ?? ""));
}

/**
 * Edit mode: 巻全体 + 各 episode の theme/title + beats (label/summary/intensity/key_visual) を
 * inline で編集できる form。draft はクライアント側 state に保持し、保存ボタンで PUT する。
 * 編集対象は文言と数値のみ。新規 beat 追加・削除は AI で修正 or 全体再生成に委ねる。
 */
function renderEditForm(plot: unknown): string {
  const obj = asRecord(plot);
  const episodes = Array.isArray(obj.episodes) ? obj.episodes : [];
  const epForms = episodes
    .map((ep, epIdx) => {
      const epObj = asRecord(ep);
      const epNo = Number(epObj.episode_no ?? epIdx + 1);
      const beats = Array.isArray(epObj.beats) ? epObj.beats : [];
      const beatForms = beats
        .map((beat, beatIdx) => {
          const b = asRecord(beat);
          return `<div class="vp-edit-beat">
            <div class="vp-edit-beat__head">
              <span class="nc-code">#${escapeHtml(String(b.beat_idx ?? beatIdx))}</span>
              <input class="nc-field__input" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.label" value="${escapeAttr(b.label)}" placeholder="label" style="max-width: 200px;">
            </div>
            <textarea class="nc-field__textarea" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.summary" rows="2" placeholder="summary">${escapeHtml(String(b.summary ?? ""))}</textarea>
            <div class="vp-edit-row">
              <label>emotional_intensity</label>
              <input class="nc-field__input" type="number" min="0" max="1" step="0.05" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.emotional_intensity" value="${escapeAttr(intensity(b.emotional_intensity))}">
            </div>
            <div class="vp-edit-row">
              <label>key_visual</label>
              <input class="nc-field__input" data-vp-path="episodes.${epIdx}.beats.${beatIdx}.key_visual" value="${escapeAttr(b.key_visual)}" placeholder="(任意)">
            </div>
          </div>`;
        })
        .join("");
      return `<section class="nc-card vp-edit-card">
        <h3 style="margin: 0;">ep${String(epNo).padStart(2, "0")}</h3>
        <div class="vp-edit-row">
          <label>title (working)</label>
          <input class="nc-field__input" data-vp-path="episodes.${epIdx}.title_working" value="${escapeAttr(epObj.title_working)}">
        </div>
        <div class="vp-edit-row">
          <label>テーマ</label>
          <input class="nc-field__input" data-vp-path="episodes.${epIdx}.theme" value="${escapeAttr(epObj.theme)}">
        </div>
        <div class="vp-edit-row">
          <label>cliffhanger_hook</label>
          <input class="nc-field__input" data-vp-path="episodes.${epIdx}.cliffhanger_hook" value="${escapeAttr(epObj.cliffhanger_hook)}">
        </div>
        ${beats.length > 0 ? `<div style="margin-top: var(--space-2);">beats</div><div class="vp-edit-form">${beatForms}</div>` : ""}
      </section>`;
    })
    .join("");
  return `<div class="vp-edit-form">
    <section class="nc-card vp-edit-card">
      <h3 style="margin: 0;">巻全体</h3>
      <div class="vp-edit-row">
        <label>title (working)</label>
        <input class="nc-field__input" data-vp-path="title_working" value="${escapeAttr(obj.title_working)}">
      </div>
      <div class="vp-edit-row">
        <label>volume_theme</label>
        <textarea class="nc-field__textarea" data-vp-path="volume_theme" rows="2">${escapeHtml(String(obj.volume_theme ?? ""))}</textarea>
      </div>
      <div class="vp-edit-row">
        <label>estimated_pages</label>
        <input class="nc-field__input" type="number" min="1" data-vp-path="estimated_pages" value="${escapeAttr(obj.estimated_pages)}">
      </div>
    </section>
    ${epForms}
  </div>`;
}

function renderModal(state: ViewState): string {
  if (!state.modalOpen) return "";
  const disabled = state.running ? " disabled" : "";
  return `
    <div class="nc-modal is-open" id="vplot-modal">
      <form class="nc-modal__card nc-modal__card--md vplot-modal-body" data-vplot-form="1">
        <div class="vplot-modal-head">
          <h3 class="vplot-modal-title">Volume Plot を構築</h3>
          <span class="vplot-info">${escapeHtml(state.slug)}</span>
          <span class="vplot-spacer"></span>
          <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-close-modal${disabled}>閉じる</button>
        </div>
        <label class="nc-field">
          <span class="nc-field__label">巻番号</span>
          <input class="nc-field__input" name="volume" type="number" min="1" step="1" value="${state.volume}" required>
        </label>
        <label class="nc-field">
          <span class="nc-field__label">企画書ファイル</span>
          <input class="nc-field__input" name="concept" required placeholder="data/manga/...json">
        </label>
        <div class="vplot-actions">
          <button type="submit" class="nc-button nc-button--primary"${disabled}>${state.running ? "起動中" : "起動"}</button>
        </div>
        <pre class="nc-code-block vplot-log">${escapeHtml(state.log.join("\n"))}</pre>
      </form>
    </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const scope = `${state.slug} / v${String(state.volume).padStart(2, "0")}`;
  const dirty = state.editDraft !== null;
  const body = (() => {
    if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
    if (state.plot) {
      if (state.displayMode === "raw") return `<pre class="nc-code-block">${jsonHtml(state.plot.plot)}</pre>`;
      if (state.displayMode === "edit") {
        const source = state.editDraft ?? state.plot.plot;
        const saveBar = `<div class="vp-edit-save-bar">
          <button type="button" class="nc-button nc-button--primary nc-button--sm" data-vp-save ${state.saving || !dirty ? "disabled" : ""}>${state.saving ? "保存中..." : "変更を保存"}</button>
          <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-vp-revert ${state.saving || !dirty ? "disabled" : ""}>変更を破棄</button>
          <span class="vp-edit-save-bar__hint">${dirty ? '<span class="vp-edit-dirty">未保存の変更があります</span>' : "編集なし"}</span>
        </div>`;
        return `${saveBar}${renderEditForm(source)}`;
      }
      return renderReader(state.plot.plot);
    }
    if (state.error) return `<div class="nc-empty">Volume Plot は未作成です。「Volume Plot を構築」ボタンから生成してください。</div>`;
    return `<div class="nc-empty">Volume Plot は未作成です。「Volume Plot を構築」ボタンから生成してください。</div>`;
  })();
  container.innerHTML = `
    <div class="vplot-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">巻あらすじ・章構成 (Volume Plot)</h2>
        <span class="vplot-info">${escapeHtml(scope)}</span>
        <span class="vplot-spacer"></span>
        ${renderDisplayMode(state.displayMode)}
        <button type="button" class="nc-button nc-button--primary" data-open-modal>Volume Plot を構築 (再生成)</button>
        <button type="button" class="nc-button nc-button--ghost" data-ai-edit-layer="L02b" title="AI 編集 view へ遷移し、L02b Volume Plot の context を prefill します">L02b を AI で修正</button>
      </div>
      ${body}
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
    state.plot = await apiGetVolumePlot(state.slug, state.volume);
  } catch (error) {
    state.plot = null;
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

export function mountVolumePlotView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    volume: 1,
    plot: null,
    displayMode: "reader",
    loading: false,
    error: null,
    modalOpen: false,
    running: false,
    log: [],
    toast: null,
    editDraft: null,
    saving: false,
  };

  /**
   * data-vp-path で指定されたドット区切り path に基づき、editDraft の対応 field を更新する。
   * draft が空なら現在の plot をディープコピーして起点にする。
   */
  const setDraftValue = (pathStr: string, raw: string, isNumber: boolean): void => {
    if (state.editDraft === null && state.plot) {
      state.editDraft = JSON.parse(JSON.stringify(state.plot.plot));
    }
    if (!state.editDraft) return;
    const segments = pathStr.split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s));
    let cursor: any = state.editDraft;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      if (cursor[key] === undefined || cursor[key] === null) {
        const nextKey = segments[i + 1];
        cursor[key] = typeof nextKey === "number" ? [] : {};
      }
      cursor = cursor[key];
    }
    const lastKey = segments[segments.length - 1];
    if (isNumber) {
      const n = Number(raw);
      cursor[lastKey] = Number.isFinite(n) ? n : raw;
    } else {
      cursor[lastKey] = raw;
    }
  };
  let stream: { close: () => void } | null = null;

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const mode = target.closest<HTMLButtonElement>("[data-display-mode]")?.dataset.displayMode as DisplayMode | undefined;
    if (mode === "reader" || mode === "edit" || mode === "raw") {
      // 編集モードを離れる時、未保存変更があれば確認。
      if (state.displayMode === "edit" && mode !== "edit" && state.editDraft !== null) {
        if (!window.confirm("未保存の変更があります。破棄してモード切替えしますか？")) return;
        state.editDraft = null;
      }
      state.displayMode = mode;
      render(container, state);
      return;
    }
    if (target.closest<HTMLButtonElement>("[data-vp-revert]")) {
      state.editDraft = null;
      render(container, state);
      return;
    }
    if (target.closest<HTMLButtonElement>("[data-vp-save]")) {
      if (!state.editDraft) return;
      state.saving = true;
      render(container, state);
      void apiPutVolumePlot(state.slug, state.volume, state.editDraft)
        .then((result) => {
          state.plot = { slug: result.slug, volume: result.volume, plot: result.plot };
          state.editDraft = null;
          state.saving = false;
          setToast(state, container, "Volume Plot を保存しました", "success");
        })
        .catch((error) => {
          state.saving = false;
          setToast(state, container, `保存に失敗: ${errorText(error)}`, "danger");
        });
      return;
    }
    const aiLayer = target.closest<HTMLButtonElement>("[data-ai-edit-layer]")?.dataset.aiEditLayer;
    if (aiLayer) {
      navigateToAiEdit(aiLayer, { slug: state.slug, episode: store.state.currentEpisode || 1, volume: state.volume });
      return;
    }
    if (target.closest("[data-open-modal]")) {
      state.modalOpen = true;
      state.log = [];
      render(container, state);
      return;
    }
    if (target.closest("[data-close-modal]") && !state.running) {
      state.modalOpen = false;
      state.log = [];
      render(container, state);
    }
  }, { signal: controller.signal });

  // edit モードの input change を draft へ反映。再 render はせず draft state のみ書き換える
  // (フォーカスが外れないように)。 dirty 表示は次回 render で更新される。
  const onFieldInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    const path = target.dataset.vpPath;
    if (!path) return;
    const isNumber = target instanceof HTMLInputElement && target.type === "number";
    setDraftValue(path, target.value, isNumber);
    // 保存ボタンの disabled 状態だけ更新したいので局所的に DOM を触る。
    const saveBtn = container.querySelector<HTMLButtonElement>("[data-vp-save]");
    const revertBtn = container.querySelector<HTMLButtonElement>("[data-vp-revert]");
    const hint = container.querySelector<HTMLElement>(".vp-edit-save-bar__hint");
    if (saveBtn) saveBtn.disabled = state.saving === true;
    if (revertBtn) revertBtn.disabled = state.saving === true;
    if (hint) hint.innerHTML = '<span class="vp-edit-dirty">未保存の変更があります</span>';
  };
  container.addEventListener("input", onFieldInput, { signal: controller.signal });
  container.addEventListener("change", onFieldInput, { signal: controller.signal });

  container.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.vplotForm) return;
    const data = new FormData(form);
    const volume = Number(data.get("volume"));
    const concept = String(data.get("concept") ?? "").trim();
    state.volume = Number.isInteger(volume) && volume > 0 ? volume : 1;
    state.running = true;
    state.log = ["starting L02b..."];
    render(container, state);
    void apiPostJob({ layer: "L02b", slug: state.slug, volume: state.volume, args: { "--concept": concept } })
      .then((job) => {
        stream = openJobStream(job.job_id, {
          onEvent: (entry: JobEvent) => {
            state.log.push(`[${entry.channel}] ${entry.line}`);
            render(container, state);
          },
          onDone: (info) => {
            state.log.push(`[system] done: ${info.state}`);
            state.running = false;
            stream?.close();
            stream = null;
            void refresh(state, container);
          },
          onError: (error) => {
            state.running = false;
            setToast(state, container, error.message, "danger");
          },
        });
      })
      .catch((error) => {
        state.running = false;
        setToast(state, container, `起動に失敗: ${errorText(error)}`, "danger");
      });
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    stream?.close();
    container.innerHTML = "";
  };
}
