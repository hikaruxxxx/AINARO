import { store, type AppState } from "./lib/store";
import { viewLabel } from "./nav";

const WORK_SCOPE_VIEWS = new Set([
  "bible",
  "volume-plot",
  "kdp-metadata",
  "trademark-gate",
  "volumes",
  "work-overview",
]);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function episodeLabel(n: number): string {
  return `ep${String(n).padStart(2, "0")}`;
}

/** 長い日本語タイトルは header を圧迫するので、breadcrumb 表示用に 24 字で truncate する。 */
function truncate(value: string, max = 24): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}

function workLabel(state: AppState): { display: string; full: string } {
  const work = state.works.find((item) => item.slug === state.currentSlug);
  const full = work?.title || state.currentSlug;
  return { display: truncate(full), full };
}

function render(state: AppState): string {
  if (state.currentView === "index" || !state.currentSlug) {
    return `<span class="nc-breadcrumb__crumb nc-breadcrumb__crumb--current">Works</span>`;
  }
  const work = workLabel(state);
  if (WORK_SCOPE_VIEWS.has(state.currentView)) {
    const current = state.currentView === "work-overview";
    return `
      <button type="button" class="nc-breadcrumb__crumb" data-crumb="works">Works</button>
      <span class="nc-breadcrumb__sep">/</span>
      ${current
        ? `<span class="nc-breadcrumb__crumb nc-breadcrumb__crumb--title nc-breadcrumb__crumb--current" title="${escapeHtml(work.full)}">${escapeHtml(work.display)}</span>`
        : `<button type="button" class="nc-breadcrumb__crumb nc-breadcrumb__crumb--title" data-crumb="work" title="${escapeHtml(work.full)}">${escapeHtml(work.display)}</button>
           <span class="nc-breadcrumb__sep">/</span>
           <span class="nc-breadcrumb__crumb nc-breadcrumb__crumb--current">${escapeHtml(viewLabel(state.currentView))}</span>`}
    `;
  }
  const ep = episodeLabel(state.currentEpisode);
  return `
    <button type="button" class="nc-breadcrumb__crumb" data-crumb="works">Works</button>
    <span class="nc-breadcrumb__sep">/</span>
    <button type="button" class="nc-breadcrumb__crumb nc-breadcrumb__crumb--title" data-crumb="work" title="${escapeHtml(work.full)}">${escapeHtml(work.display)}</button>
    <span class="nc-breadcrumb__sep">/</span>
    <button type="button" class="nc-breadcrumb__crumb" data-crumb="episode">${escapeHtml(ep)}</button>
    <span class="nc-breadcrumb__sep">/</span>
    <span class="nc-breadcrumb__crumb nc-breadcrumb__crumb--current">${escapeHtml(viewLabel(state.currentView))}</span>
  `;
}

export function mountBreadcrumb(root: HTMLElement): () => void {
  let prev = "";
  const controller = new AbortController();
  const unsubscribe = store.subscribe((state) => {
    const next = render(state);
    if (next === prev) return;
    prev = next;
    root.innerHTML = next;
  });

  root.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const crumb = target.closest<HTMLButtonElement>("[data-crumb]")?.dataset.crumb;
      if (!crumb) return;
      if (crumb === "episode") {
        store.update({ currentView: "pipeline" });
        return;
      }
      store.update({ currentView: "index", currentSlug: "", currentEpisode: 0 });
    },
    { signal: controller.signal }
  );

  return () => {
    controller.abort();
    unsubscribe();
    root.innerHTML = "";
  };
}
