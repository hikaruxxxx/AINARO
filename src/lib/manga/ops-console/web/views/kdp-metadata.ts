import {
  ApiError,
  apiGetWorkMeta,
  apiPutKdpMetadata,
  type KeywordValidationIssue,
  type KeywordValidationResult,
  type WorkKdpMetadataBlock,
  type WorkMeta,
} from "../lib/api";
import { store } from "../lib/store";
import { navigateToAiEdit, spawnLayerWithModal } from "../lib/layer-actions";

type Toast = { message: string; kind: "success" | "warning" | "danger" | "info" };

type ViewState = {
  slug: string;
  meta: WorkMeta | null;
  validation: KeywordValidationResult | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  toast: Toast | null;
};

const CSS = `
.kdp-view { display: grid; gap: var(--space-3); }
.kdp-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.kdp-spacer { flex: 1 1 auto; }
.kdp-form { display: grid; gap: var(--space-4); max-width: 980px; }
.kdp-section { display: grid; gap: var(--space-3); }
.kdp-section h3 { margin: 0; font-size: var(--fs-lg); }
.kdp-keywords,.kdp-categories { display: grid; gap: var(--space-2); }
.kdp-keyword-row { display: grid; gap: var(--space-1); }
.kdp-keyword-issue { margin: 0; font-size: var(--fs-sm); line-height: 1.45; }
.kdp-keyword-issue--error { color: var(--color-danger); }
.kdp-keyword-issue--warning { color: var(--color-warning); }
.kdp-keywords__summary { color: var(--text-secondary); font-size: var(--fs-sm); }
`;

function ensureStyles(): void {
  if (document.getElementById("kdp-meta-styles")) return;
  const style = document.createElement("style");
  style.id = "kdp-meta-styles";
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

function lines(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

function pretty(value: unknown): string {
  if (value === undefined) return "{\n}";
  return JSON.stringify(value, null, 2);
}

function keywordIssues(validation: KeywordValidationResult | null, index: number): KeywordValidationIssue[] {
  if (!validation) return [];
  return [...validation.errors, ...validation.warnings].filter((issue) => issue.index === index);
}

function issueClass(validation: KeywordValidationResult, issue: KeywordValidationIssue): string {
  return validation.errors.includes(issue) ? "kdp-keyword-issue--error" : "kdp-keyword-issue--warning";
}

function renderKeywords(kdp: WorkKdpMetadataBlock, validation: KeywordValidationResult | null): string {
  const picks = kdp.keyword_picks_7 ?? [];
  const rows = Array.from({ length: 7 }, (_, i) => {
    const issues = keywordIssues(validation, i);
    return `
      <div class="kdp-keyword-row">
        <label class="nc-field">
          <span class="nc-field__label">検索キーワード ${i + 1}</span>
          <input class="nc-field__input" name="keyword_${i}" value="${escapeHtml(picks[i] ?? "")}">
        </label>
        ${validation ? issues.map((issue) => `<p class="kdp-keyword-issue ${issueClass(validation, issue)}">${escapeHtml(issue.message)}</p>`).join("") : ""}
      </div>`;
  }).join("");
  const summary = validation
    ? `${validation.ok ? "OK" : "NG"} / エラー ${validation.errors.length} / 警告 ${validation.warnings.length} / 索引語数 ${validation.unique_word_count}`
    : "未検証";
  const globalIssues = validation
    ? [...validation.errors, ...validation.warnings]
        .filter((issue) => issue.index === undefined)
        .map((issue) => `<p class="kdp-keyword-issue ${issueClass(validation, issue)}">${escapeHtml(issue.message)}</p>`)
        .join("")
    : "";
  return `<div class="kdp-keywords">${rows}<div class="kdp-keywords__summary">${escapeHtml(summary)}</div>${globalIssues}</div>`;
}

function renderCategories(kdp: WorkKdpMetadataBlock): string {
  const categories = kdp.categories_validated ?? [];
  return `<div class="kdp-categories">${Array.from({ length: 3 }, (_, i) => `
    <label class="nc-field">
      <span class="nc-field__label">カテゴリ ${i + 1}</span>
      <input class="nc-field__input" name="category_${i}" value="${escapeHtml(categories[i] ?? "")}">
    </label>`).join("")}</div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const kdp = state.meta?.kdp_metadata ?? {};
  const body = (() => {
    if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
    if (state.error && !state.meta) return `<div class="view-placeholder"><h2>KDP メタデータ</h2><p>${escapeHtml(state.error)}</p></div>`;
    return `
      <form class="kdp-form" data-kdp-form>
        <section class="nc-card kdp-section">
          <h3>タイトル候補</h3>
          <label class="nc-field">
            <span class="nc-field__label">タイトル候補 (改行区切り)</span>
            <textarea class="nc-field__textarea" name="title_candidates" rows="6">${escapeHtml(lines(kdp.title_candidates))}</textarea>
          </label>
          <label class="nc-field">
            <span class="nc-field__label">シリーズ名 (KDP 表記)</span>
            <input class="nc-field__input" name="series_name_canonical" value="${escapeHtml(kdp.series_name_canonical ?? "")}">
          </label>
        </section>
        <section class="nc-card kdp-section">
          <h3>キーワード 7 枠</h3>
          ${renderKeywords(kdp, state.validation)}
        </section>
        <section class="nc-card kdp-section">
          <h3>カテゴリ 3 枠</h3>
          ${renderCategories(kdp)}
        </section>
        <section class="nc-card kdp-section">
          <h3>商品説明文 (description_seed JSON)</h3>
          <label class="nc-field">
            <span class="nc-field__label">商品説明文 (description_seed JSON)</span>
            <textarea class="nc-field__textarea" name="description_seed" rows="14">${escapeHtml(pretty(kdp.description_seed))}</textarea>
          </label>
        </section>
      </form>`;
  })();
  container.innerHTML = `
    <div class="kdp-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">KDP メタデータ</h2>
        <span class="kdp-info">${escapeHtml(state.slug)}</span>
        <span class="kdp-spacer"></span>
        <button type="button" class="nc-button nc-button--secondary" data-action="reload" ${state.loading || state.saving ? "disabled" : ""}>再読込</button>
        <button type="button" class="nc-button nc-button--primary" data-action="save" ${state.loading || state.saving ? "disabled" : ""}>${state.saving ? "保存中" : "保存"}</button>
        <button type="button" class="nc-button nc-button--secondary" data-action="rerun-L13" title="L13 KDP package を再生成 (manuscript.pdf / cover.pdf)">L13 を再実行</button>
        <button type="button" class="nc-button nc-button--ghost" data-ai-edit-layer="L13" title="AI 編集 view へ遷移し、L13 KDP の context を prefill します">L13 を AI で修正</button>
      </div>
      ${body}
    </div>
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

async function load(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.meta = await apiGetWorkMeta(state.slug);
  } catch (error) {
    state.error = errorText(error);
  }
  state.loading = false;
  render(container, state);
}

function setToast(state: ViewState, container: HTMLElement, message: string, kind: Toast["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

function listFromTextarea(form: HTMLFormElement, name: string): string[] {
  const value = String(new FormData(form).get(name) ?? "");
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function inputList(form: HTMLFormElement, prefix: string, count: number): string[] {
  const data = new FormData(form);
  return Array.from({ length: count }, (_, i) => String(data.get(`${prefix}_${i}`) ?? "").trim()).filter(Boolean);
}

function draftFromForm(form: HTMLFormElement): WorkKdpMetadataBlock {
  const data = new FormData(form);
  const descriptionRaw = String(data.get("description_seed") ?? "").trim();
  let description_seed: unknown;
  if (descriptionRaw) {
    description_seed = JSON.parse(descriptionRaw);
  }
  return {
    title_candidates: listFromTextarea(form, "title_candidates"),
    series_name_canonical: String(data.get("series_name_canonical") ?? "").trim(),
    keyword_picks_7: inputList(form, "keyword", 7),
    categories_validated: inputList(form, "category", 3),
    description_seed,
  };
}

export function mountKdpMetadataView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    meta: null,
    validation: null,
    loading: false,
    saving: false,
    error: null,
    toast: null,
  };

  void load(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const aiLayer = target.closest<HTMLButtonElement>("[data-ai-edit-layer]")?.dataset.aiEditLayer;
    if (aiLayer) {
      navigateToAiEdit(aiLayer, { slug: state.slug, episode: store.state.currentEpisode || 1 });
      return;
    }
    const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
    if (action === "reload") {
      void load(state, container);
      return;
    }
    if (action === "rerun-L13") {
      void spawnLayerWithModal({
        layer: "L13",
        status: state.meta?.kdp_metadata ? "ready" : "missing",
        slug: state.slug,
        episode: store.state.currentEpisode || 1,
        callbacks: {
          onSuccess: () => {
            setToast(state, container, "L13 KDP package 完了", "success");
            void load(state, container);
          },
          onError: (msg) => setToast(state, container, msg, "danger"),
        },
      });
      return;
    }
    if (action !== "save") return;
    const form = container.querySelector<HTMLFormElement>("[data-kdp-form]");
    if (!form) return;
    let draft: WorkKdpMetadataBlock;
    try {
      draft = draftFromForm(form);
    } catch (error) {
      setToast(state, container, `商品説明文 JSON エラー: ${errorText(error)}`, "warning");
      return;
    }
    state.meta = { ...(state.meta ?? { schema_version: 1, slug: state.slug }), kdp_metadata: draft };
    state.saving = true;
    render(container, state);
    void apiPutKdpMetadata(state.slug, draft)
      .then((result) => {
        state.meta = { ...(state.meta ?? { schema_version: 1, slug: state.slug }), kdp_metadata: result.kdp_metadata };
        state.validation = result.validation?.keywords ?? null;
        state.saving = false;
        setToast(state, container, "保存しました", result.validation?.keywords?.ok === false ? "warning" : "success");
      })
      .catch((error) => {
        state.saving = false;
        setToast(state, container, `保存に失敗: ${errorText(error)}`, "danger");
      });
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
