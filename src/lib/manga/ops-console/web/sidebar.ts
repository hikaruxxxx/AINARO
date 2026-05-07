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

function sectionTitle(group: MenuGroup, state: AppState): string {
  if (group === "work") {
    return `${GROUP_LABELS.work} <span class="sidebar__group-title-context">· ${escapeHtml(state.currentSlug)}</span>`;
  }
  if (group === "episode") {
    const ep = state.currentEpisode ? episodeLabel(state.currentEpisode) : "";
    const context = [state.currentSlug, ep].filter(Boolean).join(" / ");
    return `${GROUP_LABELS.episode} <span class="sidebar__group-title-context">· ${escapeHtml(context)}</span>`;
  }
  return GROUP_LABELS[group];
}

function menuButtonHtml(item: { view: ViewName; label: string }, currentView: ViewName): string {
  return `<button type="button" class="sidebar__menu-item${item.view === currentView ? " is-active" : ""}" data-view="${item.view}">${escapeHtml(item.label)}</button>`;
}

function groupItems(group: MenuGroup, includeAiEdit = false): Array<{ view: ViewName; label: string; group: MenuGroup }> {
  return MENU.filter((item) => item.group === group && (includeAiEdit || item.view !== "ai-edit"));
}

function menuSectionHtml(group: MenuGroup, state: AppState): string {
  const items = groupItems(group);
  if (items.length === 0) return "";
  const body = items
    .map((item) => {
      const divider = group === "work" && item.view === "volumes"
        ? `<div class="sidebar__subdivider" aria-hidden="true"><span>Publish</span></div>`
        : "";
      return `${divider}${menuButtonHtml(item, state.currentView)}`;
    })
    .join("");
  return `
    <div class="sidebar__group">
      <h3 class="sidebar__group-title">${sectionTitle(group, state)}</h3>
      ${body}
    </div>`;
}

function groupedMenuHtml(state: AppState): string {
  const sections = [
    menuSectionHtml("global", state),
    state.currentSlug ? menuSectionHtml("work", state) : "",
    state.currentSlug && state.currentEpisode ? menuSectionHtml("episode", state) : "",
    state.currentSlug ? menuSectionHtml("utility", state) : "",
  ];
  const aiEdit = MENU.find((item) => item.view === "ai-edit");
  if (aiEdit) {
    sections.push(`
      <div class="sidebar__group sidebar__group--tail">
        ${menuButtonHtml(aiEdit, state.currentView)}
      </div>`);
  }
  return sections.join("");
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
      </div>
      <nav class="menu" aria-label="ops views">
        ${groupedMenuHtml(state)}
      </nav>
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
      ${groupedMenuHtml(state)}
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
