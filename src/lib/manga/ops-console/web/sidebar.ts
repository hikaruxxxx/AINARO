import { isViewName, store, type AppState, type ViewName } from "./lib/store";

const MENU: Array<{ view: ViewName; label: string }> = [
  { view: "name-gate", label: "ネーム gate" },
  { view: "assets", label: "アセット" },
  { view: "layers", label: "生成 layer" },
  { view: "works", label: "作品管理" },
];

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

/**
 * Phase 2A は起動時 default scope 固定。
 * 旧実装は scope select を enable していて変更すると後続 API が 403 になる導線になっていた。
 * Phase 2B/3 で複数 slug/episode 切替を解禁するまで、disabled で表示のみとする。
 *
 * URL hash の同期は main.ts の syncRoute に一元化。ここでは pushState を呼ばない。
 *
 */
function rerender(root: HTMLElement, state: AppState): void {
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
      ${MENU.map(
        (item) =>
          `<button type="button" class="menu-button${item.view === state.currentView ? " is-active" : ""}" data-view="${item.view}">${escapeHtml(item.label)}</button>`
      ).join("")}
    </nav>
  `;

  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (!isViewName(view)) return;
      store.update({ currentView: view });
      // URL 同期は main.ts:syncRoute (store.subscribe 経由) に一元化。
    });
  });
}

export function mountSidebar(root: HTMLElement): () => void {
  return store.subscribe((state) => rerender(root, state));
}
