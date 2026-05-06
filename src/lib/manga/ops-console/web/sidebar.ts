import { isViewName, store, type AppState, type ViewName } from "./lib/store";
import { GROUP_LABELS, MENU, type MenuGroup } from "./nav";

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
  const groups: MenuGroup[] = ["judge", "view", "exec"];
  return groups
    .map((group) => {
      const items = MENU.filter((item) => item.group === group);
      return `
        <div class="sidebar__group">
          <h3 class="sidebar__group-title">${escapeHtml(GROUP_LABELS[group])}</h3>
          ${items
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
 * Phase 2A は起動時 default scope 固定。
 * 旧実装は scope select を enable していて変更すると後続 API が 403 になる導線になっていた。
 * Phase 2B/3 で複数 slug/episode 切替を解禁するまで、disabled で表示のみとする。
 *
 * URL hash の同期は main.ts の syncRoute に一元化。ここでは pushState を呼ばない。
 *
 * 一覧モード (currentSlug が空) では scope select と MENU を出さず、案内だけ表示する。
 */
function rerender(root: HTMLElement, state: AppState): void {
  if (!state.currentSlug) {
    root.innerHTML = `
      <div class="scope-panel">
        <p class="scope-note">作品を選択してください。</p>
        <button type="button" class="sidebar__menu-item${state.currentView === "index" ? " is-active" : ""}" data-view="index">作品一覧</button>
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
  const lockTitle = "Phase 2A は default scope 固定。Phase 2B/3 で切替を解禁予定。";
  root.innerHTML = `
    <div class="scope-panel">
      <div class="field">
        <label for="scope-slug">work</label>
        <select id="scope-slug" disabled aria-disabled="true" title="${escapeHtml(lockTitle)}">
          ${renderOptions(
            state.works.map((w) => ({ value: w.slug, label: w.title ? `${w.title} (${w.slug})` : w.slug })),
            state.currentSlug
          )}
        </select>
      </div>
      <div class="field">
        <label for="scope-episode">episode</label>
        <select id="scope-episode" disabled aria-disabled="true" title="${escapeHtml(lockTitle)}">
          ${renderOptions(
            episodes.map((n) => ({ value: String(n), label: episodeLabel(n) })),
            String(state.currentEpisode)
          )}
        </select>
      </div>
      <p class="scope-note">Phase 2A は default scope 固定。切替は Phase 2B/3 で解禁予定。</p>
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
      store.update({ currentView: view });
      // URL 同期は main.ts:syncRoute (store.subscribe 経由) に一元化。
    });
  });
}

export function mountSidebar(root: HTMLElement): () => void {
  return store.subscribe((state) => rerender(root, state));
}
