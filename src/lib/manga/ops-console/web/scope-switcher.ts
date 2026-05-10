/**
 * Scope switcher widget
 *
 * ヘッダーに pin された「現在の操作対象 (slug + ep)」を表示し、
 * クリックでモーダルを開いて作品+話を選び直せる。
 *
 * 設計根拠:
 *   - 旧設計: CLI 引数 `--slug --episode` でしか scope を pin できず、別作品を編集するたびに
 *     console プロセスを再起動する必要があった。
 *   - 新設計: server 側に scope-store を持ち、UI から POST /api/scope で動的に切替。
 *   - 事故防止: 切替時に確認モーダルで「以後の write はこの作品に書き込まれます」と明示。
 *
 * 使用 API:
 *   - GET /api/scope → 現在 pin 値
 *   - POST /api/scope { slug, episode } → 切替 + 永続化
 *   - GET /api/works/{slug}/episodes → 話数候補
 */
import { apiGetWorkEpisodes, apiPostScope } from "./lib/api";
import { store } from "./lib/store";

const STYLES = `
.nc-scope-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  max-width: 280px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--surface-elevated);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-xs);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}
.nc-scope-chip:hover { background: var(--surface-sunken); }
.nc-scope-chip[data-empty="true"] {
  color: var(--color-warning);
  border-color: var(--color-warning);
  font-weight: 600;
}
.nc-scope-chip__label { color: var(--text-secondary); font-size: 11px; flex-shrink: 0; }
.nc-scope-chip__value {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nc-scope-modal__backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.nc-scope-modal {
  background: var(--surface-base);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 20px;
  min-width: 420px;
  max-width: 600px;
  display: grid;
  gap: 12px;
}
.nc-scope-modal h3 { margin: 0; font-size: var(--fs-lg); }
.nc-scope-modal__row { display: grid; gap: 4px; }
.nc-scope-modal__row label { font-size: var(--fs-xs); color: var(--text-secondary); }
.nc-scope-modal__row select,
.nc-scope-modal__row input { width: 100%; }
.nc-scope-modal__warn {
  padding: 10px 12px;
  border-left: 3px solid var(--color-warning);
  background: var(--surface-subtle);
  font-size: var(--fs-sm);
  color: var(--text-primary);
}
.nc-scope-modal__actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding-top: 8px;
}
.nc-scope-modal__error {
  color: var(--color-danger);
  font-size: var(--fs-sm);
}
`;

function ensureStyles(): void {
  if (document.getElementById("nc-scope-switcher-styles")) return;
  const style = document.createElement("style");
  style.id = "nc-scope-switcher-styles";
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type ModalState = {
  slug: string;
  episode: number;
  episodes: number[];
  loading: boolean;
  error: string | null;
};

async function openModal(initialSlug: string, initialEpisode: number): Promise<void> {
  const works = store.state.works;
  if (works.length === 0) {
    alert("作品一覧がまだ読み込まれていません。少し待って再試行してください。");
    return;
  }
  const state: ModalState = {
    slug: initialSlug || works[0].slug,
    episode: initialEpisode || 1,
    episodes: [],
    loading: true,
    error: null,
  };

  const backdrop = document.createElement("div");
  backdrop.className = "nc-scope-modal__backdrop";
  document.body.appendChild(backdrop);

  function close(): void {
    backdrop.remove();
  }

  function render(): void {
    const epOptions = state.episodes.length > 0
      ? state.episodes.map((e) => `<option value="${e}" ${e === state.episode ? "selected" : ""}>ep${String(e).padStart(2, "0")}</option>`).join("")
      : `<option value="${state.episode}">ep${String(state.episode).padStart(2, "0")}</option>`;
    backdrop.innerHTML = `
      <div class="nc-scope-modal" role="dialog" aria-labelledby="nc-scope-modal-title">
        <h3 id="nc-scope-modal-title">作業対象の切替</h3>
        <div class="nc-scope-modal__warn">
          切替後、以後の <strong>書き込み・ジョブ起動</strong> は新しい作業対象に対して行われます。誤った作品に書かないよう確認してください。
        </div>
        <div class="nc-scope-modal__row">
          <label for="nc-scope-modal-slug">作品 (slug)</label>
          <select id="nc-scope-modal-slug" data-role="slug">
            ${works.map((w) => `<option value="${escapeHtml(w.slug)}" ${w.slug === state.slug ? "selected" : ""}>${escapeHtml(w.title || w.slug)} <code>(${escapeHtml(w.slug)})</code></option>`).join("")}
          </select>
        </div>
        <div class="nc-scope-modal__row">
          <label for="nc-scope-modal-episode">話 (episode)</label>
          <select id="nc-scope-modal-episode" data-role="episode" ${state.loading ? "disabled" : ""}>
            ${epOptions}
          </select>
        </div>
        ${state.error ? `<div class="nc-scope-modal__error">${escapeHtml(state.error)}</div>` : ""}
        <div class="nc-scope-modal__actions">
          <button type="button" class="nc-button nc-button--ghost" data-role="cancel">キャンセル</button>
          <button type="button" class="nc-button nc-button--primary" data-role="confirm" ${state.loading ? "disabled" : ""}>切替えて適用</button>
        </div>
      </div>
    `;
  }

  async function loadEpisodes(slug: string): Promise<void> {
    state.loading = true;
    state.error = null;
    render();
    try {
      const res = await apiGetWorkEpisodes(slug);
      state.episodes = res.episodes;
      if (state.episodes.length > 0 && !state.episodes.includes(state.episode)) {
        state.episode = state.episodes[0];
      }
    } catch (e) {
      state.error = `話数の取得に失敗: ${e instanceof Error ? e.message : String(e)}`;
      state.episodes = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  render();
  await loadEpisodes(state.slug);

  backdrop.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target === backdrop) {
      close();
      return;
    }
    const role = target.dataset.role ?? target.closest<HTMLElement>("[data-role]")?.dataset.role;
    if (role === "cancel") {
      close();
      return;
    }
    if (role === "confirm") {
      try {
        const next = await apiPostScope({ slug: state.slug, episode: state.episode });
        // bootstrap が返す default_slug / default_episode と概念は同じ。store を更新して画面を再描画。
        store.update({
          defaultSlug: next.slug ?? "",
          defaultEpisode: next.episode ?? 0,
          currentSlug: next.slug ?? "",
          currentEpisode: next.episode ?? 0,
        });
        close();
      } catch (e) {
        state.error = `切替えに失敗: ${e instanceof Error ? e.message : String(e)}`;
        render();
      }
    }
  });

  backdrop.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.dataset.role === "slug") {
      state.slug = target.value;
      void loadEpisodes(state.slug);
    } else if (target.dataset.role === "episode") {
      state.episode = Number(target.value);
    }
  });

  // Esc で閉じる
  const escHandler = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      close();
      window.removeEventListener("keydown", escHandler);
    }
  };
  window.addEventListener("keydown", escHandler);
}

export function mountScopeSwitcher(root: HTMLElement): () => void {
  ensureStyles();

  function render(): void {
    const slug = store.state.defaultSlug;
    const episode = store.state.defaultEpisode;
    const isEmpty = !slug || !episode;
    const work = store.state.works.find((w) => w.slug === slug);
    const title = work?.title || slug;
    // chip 内には slug + ep のみ。タイトルは tooltip だけに留める (タイトルは長い日本語のことが多く header を圧迫する)。
    const label = isEmpty
      ? `<span class="nc-scope-chip__value">作業対象 未選択</span>`
      : `<span class="nc-scope-chip__label">作業中</span><span class="nc-scope-chip__value">${escapeHtml(slug)} / ep${String(episode).padStart(2, "0")}</span>`;
    const tooltip = isEmpty
      ? "クリックで作業対象を選択"
      : `${title}\nslug: ${slug} / ep${String(episode).padStart(2, "0")}\nクリックで作業対象を切替`;
    root.innerHTML = `<button type="button" class="nc-scope-chip" data-role="open-scope" data-empty="${isEmpty}" title="${escapeHtml(tooltip)}">${label}</button>`;
  }

  const unsubscribe = store.subscribe(() => render());

  const handler = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest<HTMLElement>('[data-role="open-scope"]');
    if (!btn) return;
    void openModal(store.state.defaultSlug, store.state.defaultEpisode);
  };
  root.addEventListener("click", handler);

  return () => {
    root.removeEventListener("click", handler);
    unsubscribe();
    root.innerHTML = "";
  };
}
