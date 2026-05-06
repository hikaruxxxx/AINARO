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
import { ApiError, apiCreateWork, apiGetWorks } from "../lib/api";
import { store, type WorkInfo } from "../lib/store";

const CSS = `
.idx-view { display:grid; gap:18px; max-width: 1100px; }
.idx-head { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
.idx-head h2 { margin:0; font-size:22px; }
.idx-head p { margin:0; color:#526076; font-size:13px; }
.idx-grid { display:grid; gap:14px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.idx-card { background:#fff; border:1px solid #dbe1ea; border-radius:10px; padding:14px; display:grid; gap:10px; }
.idx-card h3 { margin:0; font-size:16px; line-height:1.4; }
.idx-card .idx-slug { color:#64748b; font-size:12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.idx-eps { display:flex; gap:6px; flex-wrap:wrap; }
.idx-ep-btn { min-height:30px; border:1px solid #c7cfdb; border-radius:6px; background:#fff; color:#243044; padding:0 10px; font:inherit; font-size:13px; cursor:pointer; }
.idx-ep-btn:hover { background:#1f5eff; border-color:#1f5eff; color:#fff; }
.idx-empty-eps { color:#64748b; font-size:12px; }
.idx-empty { padding:32px; text-align:center; color:#526076; font-size:14px; background:#fff; border:1px dashed #c7cfdb; border-radius:10px; }
.idx-spacer { flex: 1 1 auto; }
.idx-modal-body { display:grid; gap:var(--space-3); padding:var(--space-4); }
.idx-modal-head { display:flex; align-items:center; gap:var(--space-2); }
.idx-modal-title { margin:0; font-size:var(--fs-xl); }
.idx-actions { display:flex; justify-content:flex-end; gap:var(--space-2); }
`;

type ViewState = {
  modalOpen: boolean;
  creating: boolean;
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

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function renderCard(work: WorkInfo): string {
  const title = work.title ? escapeHtml(work.title) : escapeHtml(work.slug);
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
      <h3>${title}</h3>
      <div class="idx-slug">${escapeHtml(work.slug)}</div>
      ${eps}
    </article>
  `;
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
  const head = `
    <div class="idx-head">
      <h2>作品一覧</h2>
      <span class="idx-spacer"></span>
      <button type="button" class="nc-button nc-button--primary" data-action="new-work">+ 新規作品</button>
    </div>`;
  if (works.length === 0) {
    container.innerHTML = `
      <div class="idx-view">
        ${head}
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
      <div class="idx-grid">
        ${works.map(renderCard).join("")}
      </div>
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
  const state: ViewState = { modalOpen: false, creating: false, toast: null };

  const renderFromState = () => render(container, store.state.works, state);
  const unsubscribe = store.subscribe(() => {
    renderFromState();
  });

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
      if (action === "close-new-work" && !state.creating) {
        state.modalOpen = false;
        renderFromState();
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
