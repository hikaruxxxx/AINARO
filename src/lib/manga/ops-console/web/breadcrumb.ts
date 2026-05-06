import { store, type AppState } from "./lib/store";
import { viewLabel } from "./nav";

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

function workLabel(state: AppState): string {
  const work = state.works.find((item) => item.slug === state.currentSlug);
  return work?.title || state.currentSlug;
}

function render(state: AppState): string {
  if (state.currentView === "index" || !state.currentSlug) {
    return `<span class="nc-breadcrumb__crumb nc-breadcrumb__crumb--current">Works</span>`;
  }
  const work = workLabel(state);
  if (state.currentView === "work-overview") {
    return `
      <button type="button" class="nc-breadcrumb__crumb" data-crumb="works">Works</button>
      <span class="nc-breadcrumb__sep">/</span>
      <span class="nc-breadcrumb__crumb nc-breadcrumb__crumb--current">${escapeHtml(work)}</span>
    `;
  }
  const ep = episodeLabel(state.currentEpisode);
  return `
    <button type="button" class="nc-breadcrumb__crumb" data-crumb="works">Works</button>
    <span class="nc-breadcrumb__sep">/</span>
    <button type="button" class="nc-breadcrumb__crumb" data-crumb="work">${escapeHtml(work)}</button>
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
