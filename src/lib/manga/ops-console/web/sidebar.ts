import { isViewName, store, type AppState, type ViewName } from "./lib/store";
import { GROUP_LABELS, MENU, requiresEpisode, type MenuGroup } from "./nav";

function renderOptions(values: Array<{ value: string; label: string }>, selected: string): string {
  return values
    .map((item) => {
      const isSelected = item.value === selected ? " selected" : "";
      return `<option value="${escapeHtml(item.value)}"${isSelected}>${escapeHtml(item.label)}</option>`;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function episodeLabel(n: number): string {
  return `ep${String(n).padStart(2, "0")}`;
}

function groupedMenuHtml(currentView: ViewName): string {
  const groups: MenuGroup[] = ["home", "inventory", "judge", "browse", "publish"];
  return groups
    .map((group) => {
      const items = MENU.filter((item) => item.group === group);
      const homeButton =
        group === "home"
          ? `<button type="button" class="sidebar__menu-item${currentView === "index" ? " is-active" : ""}" data-view="index">ホーム</button>`
          : "";
      return `
        <div class="sidebar__group">
          <h3 class="sidebar__group-title">${escapeHtml(GROUP_LABELS[group])}</h3>
          ${homeButton}${items
            .map(
              (item) =>
                `<button type="button" class="sidebar__menu-item${item.view === currentView ? " is-active" : ""}" data-view="${item.view}">${escapeHtml(item.label)}</button>`
            )
            .join("")}
        </div>`;
    })
    .join("");
}

/**
 * scope select は閲覧対象の切替だけを行う。URL 同期は main.ts の syncRoute に一元化。
 * 書き込み系 API は server 側で起動時 default scope に制限する。
 */
function rerender(root: HTMLElement, state: AppState): void {
  if (!state.currentSlug) {
    root.innerHTML = `
      <div class="nc-scope-panel">
        <p class="nc-scope-note">作品を選択してください。</p>
        <div class="sidebar__group">
          <h3 class="sidebar__group-title">全体</h3>
          <button type="button" class="sidebar__menu-item${state.currentView === "index" ? " is-active" : ""}" data-view="index">作品一覧</button>
          <button type="button" class="sidebar__menu-item${state.currentView === "jobs-hub" ? " is-active" : ""}" data-view="jobs-hub">全作品ジョブ</button>
          <button type="button" class="sidebar__menu-item${state.currentView === "quality-hub" ? " is-active" : ""}" data-view="quality-hub">全作品品質</button>
          <button type="button" class="sidebar__menu-item${state.currentView === "ai-edit" ? " is-active" : ""}" data-view="ai-edit">AI 編集</button>
        </div>
      </div>
    `;
    root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        const view = button.dataset.view;
        if (!isViewName(view)) return;
        store.update({ currentView: view });
      });
    });
    return;
  }
  const currentWork = state.works.find((w) => w.slug === state.currentSlug);
  const episodes = currentWork?.episodes.length ? currentWork.episodes : [state.currentEpisode];
  const scopeTitle = "scope 切替で別作品の閲覧ができます。書き込みは起動時 default scope に限定。";
  root.innerHTML = `
    <div class="nc-scope-panel">
      <div class="nc-field-legacy">
        <label for="scope-slug">work</label>
        <select id="scope-slug" title="${escapeHtml(scopeTitle)}">
          ${renderOptions(
            state.works.map((w) => ({ value: w.slug, label: w.title ? `${w.title} (${w.slug})` : w.slug })),
            state.currentSlug
          )}
        </select>
      </div>
      <div class="nc-field-legacy">
        <label for="scope-episode">episode</label>
        <select id="scope-episode" title="${escapeHtml(scopeTitle)}">
          ${renderOptions(
            episodes.map((n) => ({ value: String(n), label: episodeLabel(n) })),
            String(state.currentEpisode)
          )}
        </select>
      </div>
      <p class="nc-scope-note">scope 切替は閲覧専用 (read)。承認・起動は起動時 default scope に限定。</p>
    </div>
    <nav class="menu" aria-label="ops views">
      ${groupedMenuHtml(state.currentView)}
    </nav>
  `;

  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (!isViewName(view)) return;
      // 「作品一覧へ戻る」を押したら currentSlug/Episode をクリアして scope 解除。
      if (view === "index") {
        store.update({ currentView: "index", currentSlug: "", currentEpisode: 0 });
        return;
      }
      // work-scope (currentEpisode=0) から episode-scope view へ遷移する場合は episode を補完。
      // これをしないと loadXxx 系が `if (!episode) return` で空画面になる。
      if (requiresEpisode(view) && !store.state.currentEpisode) {
        const work = store.state.works.find((w) => w.slug === store.state.currentSlug);
        const episode = work?.episodes.includes(store.state.defaultEpisode)
          ? store.state.defaultEpisode
          : work?.episodes[0] ?? 1;
        store.update({ currentView: view, currentEpisode: episode });
        return;
      }
      store.update({ currentView: view });
      // URL 同期は main.ts:syncRoute (store.subscribe 経由) に一元化。
    });
  });
  const slugSelect = root.querySelector<HTMLSelectElement>("#scope-slug");
  slugSelect?.addEventListener("change", () => {
    const slug = slugSelect.value;
    const work = state.works.find((w) => w.slug === slug);
    const episode = work?.episodes.includes(state.currentEpisode)
      ? state.currentEpisode
      : work?.episodes[0] ?? 1;
    store.update({ currentSlug: slug, currentEpisode: episode });
  });
  const episodeSelect = root.querySelector<HTMLSelectElement>("#scope-episode");
  episodeSelect?.addEventListener("change", () => {
    const episode = Number(episodeSelect.value);
    if (!Number.isInteger(episode) || episode <= 0) return;
    store.update({ currentEpisode: episode });
  });
}

export function mountSidebar(root: HTMLElement): () => void {
  return store.subscribe((state) => rerender(root, state));
}
