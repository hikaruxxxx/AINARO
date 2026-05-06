import { apiGetBootstrap } from "./lib/api";
import { loadFavorites, loadRecent, pushRecent } from "./lib/persistence";
import { isViewName, store, type ViewName } from "./lib/store";
import { mountBreadcrumb } from "./breadcrumb";
import { mountRestartButton } from "./restart-button";
import { mountScopeSwitcher } from "./scope-switcher";
import { mountSidebar } from "./sidebar";
import { mountThemeToggle } from "./theme-toggle";
import { mountAiEditView } from "./views/ai-edit";
import { mountBibleView } from "./views/bible";
import { mountIndexView } from "./views/index";
import { mountJobsHubView } from "./views/jobs-hub";
import { mountKdpMetadataView } from "./views/kdp-metadata";
import { mountLayersView } from "./views/layers";
import { mountNameGateView } from "./views/name-gate";
import { mountPipelineView } from "./views/pipeline";
import { mountQualityView } from "./views/quality";
import { mountQualityHubView } from "./views/quality-hub";
import { mountRevisionView } from "./views/revision";
import { mountImprovementsView } from "./views/improvements";
import { mountStoryboardView } from "./views/storyboard";
import { mountTrademarkGateView } from "./views/trademark-gate";
import { mountVolumePlotView } from "./views/volume-plot";
import { mountVolumesView } from "./views/volumes";
import { mountWorkOverviewView } from "./views/work-overview";

type Unmount = () => void;

function parseRoute(): { slug: string | null; episode: number | null; view: ViewName } {
  if (window.location.pathname === "/jobs") {
    return { slug: null, episode: null, view: "jobs-hub" };
  }
  if (window.location.pathname === "/ai-edit") {
    return { slug: null, episode: null, view: "ai-edit" };
  }
  if (window.location.pathname === "/quality") {
    return { slug: null, episode: null, view: "quality-hub" };
  }
  const workMatch = window.location.pathname.match(/^\/works\/([^/]+)\/?$/);
  if (workMatch) {
    return { slug: decodeURIComponent(workMatch[1]), episode: 0, view: "work-overview" };
  }
  const m = window.location.pathname.match(/^\/works\/([^/]+)\/episodes\/ep(\d+)\/?$/);
  const hashView = window.location.hash.replace(/^#/, "");
  // / (or 不明 path) の場合は scope なし → index view を初期表示。
  if (!m) {
    return { slug: null, episode: null, view: "index" };
  }
  return {
    slug: decodeURIComponent(m[1]),
    episode: Number(m[2]),
    view: isViewName(hashView) && hashView !== "index" ? hashView : "pipeline",
  };
}

function routePath(slug: string, episode: number): string {
  return `/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/`;
}

function syncRoute(slug: string, episode: number, view: ViewName): void {
  // index view は scope を持たない (URL は "/")。
  if (view === "index") {
    const next = "/";
    const current = `${window.location.pathname}${window.location.hash}`;
    if (current === next) return;
    history.pushState(null, "", next);
    return;
  }
  if (view === "jobs-hub") {
    const next = "/jobs";
    const current = `${window.location.pathname}${window.location.hash}`;
    if (current === next) return;
    history.pushState(null, "", next);
    return;
  }
  if (view === "ai-edit") {
    const next = "/ai-edit";
    const current = `${window.location.pathname}${window.location.hash}`;
    if (current === next) return;
    history.pushState(null, "", next);
    return;
  }
  if (view === "quality-hub") {
    const next = "/quality";
    const current = `${window.location.pathname}${window.location.hash}`;
    if (current === next) return;
    history.pushState(null, "", next);
    return;
  }
  if (view === "work-overview") {
    if (!slug) return;
    const next = `/works/${encodeURIComponent(slug)}/`;
    const current = `${window.location.pathname}${window.location.hash}`;
    if (current === next) return;
    history.pushState(null, "", next);
    return;
  }
  if (!slug || !episode) return;
  const next = `${routePath(slug, episode)}#${view}`;
  const current = `${window.location.pathname}${window.location.hash}`;
  if (current === next) return;
  history.pushState(null, "", next);
}

/**
 * view の差分検知付き mount。
 * scope 切替時は各 view の read API を新 scope で取り直すため、view / slug / episode の
 * いずれかが変わった場合に remount する。
 */
function mountCurrentView(main: HTMLElement): () => void {
  let unmount: Unmount | null = null;
  let prevKey: string | null = null;
  return store.subscribe((state) => {
    const key = `${state.currentView}#${state.currentSlug}#${state.currentEpisode}`;
    if (key === prevKey) return;
    if (unmount) unmount();
    prevKey = key;
    if (state.currentView === "index") unmount = mountIndexView(main);
    else if (state.currentView === "ai-edit") unmount = mountAiEditView(main);
    else if (state.currentView === "jobs-hub") unmount = mountJobsHubView(main);
    else if (state.currentView === "quality-hub") unmount = mountQualityHubView(main);
    else if (state.currentView === "work-overview") unmount = mountWorkOverviewView(main);
    else if (state.currentView === "pipeline") unmount = mountPipelineView(main);
    else if (state.currentView === "storyboard") unmount = mountStoryboardView(main);
    else if (state.currentView === "quality") unmount = mountQualityView(main);
    else if (state.currentView === "bible") unmount = mountBibleView(main);
    else if (state.currentView === "volume-plot") unmount = mountVolumePlotView(main);
    else if (state.currentView === "kdp-metadata") unmount = mountKdpMetadataView(main);
    else if (state.currentView === "trademark-gate") unmount = mountTrademarkGateView(main);
    else if (state.currentView === "improvements") unmount = mountImprovementsView(main);
    else if (state.currentView === "volumes") unmount = mountVolumesView(main);
    else if (state.currentView === "layers") unmount = mountLayersView(main);
    else if (state.currentView === "revision") unmount = mountRevisionView(main);
    else unmount = mountNameGateView(main);
  });
}

/**
 * bootstrap 取得失敗時はエラーを throw する。
 * 旧実装の `apiGetWorks` フォールバックは server 起動引数 (--slug --episode) と無関係に
 * 「最初に見つかった作品」を default に置く危険な挙動だった。
 * server scope と乖離した値を SPA に持たせると後続 write API が常時 403 になるため、
 * fallback せずユーザに起動エラーを見せる。
 */
async function loadBootstrap() {
  return apiGetBootstrap();
}

async function start(): Promise<void> {
  const sidebar = document.querySelector<HTMLElement>("#sidebar");
  const main = document.querySelector<HTMLElement>("#main");
  const topBreadcrumb = document.querySelector<HTMLElement>("#top-breadcrumb");
  const themeToggle = document.querySelector<HTMLElement>("#nc-theme-toggle");
  const scopeSwitcher = document.querySelector<HTMLElement>("#nc-scope-switcher");
  const restartButton = document.querySelector<HTMLElement>("#nc-restart-button");
  if (!sidebar || !main || !topBreadcrumb || !themeToggle || !scopeSwitcher || !restartButton) {
    throw new Error("Novelis Console shell is incomplete");
  }

  mountSidebar(sidebar);
  mountCurrentView(main);
  mountBreadcrumb(topBreadcrumb);
  mountThemeToggle(themeToggle);
  mountScopeSwitcher(scopeSwitcher);
  mountRestartButton(restartButton);

  const boot = await loadBootstrap();
  const route = parseRoute();
  // 一覧モード (server scope なし & URL /) なら currentSlug="" として scope なし表示。
  // 各 view は currentSlug が空の間は呼ばれない (mountCurrentView は index へ)。
  const currentSlug = route.slug ?? boot.default_slug ?? "";
  const currentEpisode = route.episode ?? boot.default_episode ?? 0;
  const currentView: ViewName = route.view === "jobs-hub" || route.view === "quality-hub" || route.view === "ai-edit"
    ? route.view
    : route.slug
      ? route.view
      : "index";

  store.update({
    works: boot.works,
    defaultSlug: boot.default_slug ?? "",
    defaultEpisode: boot.default_episode ?? 0,
    currentSlug,
    currentEpisode,
      currentView,
      recent: loadRecent(),
      favorites: loadFavorites(),
    });
  syncRoute(currentSlug, currentEpisode, currentView);
  store.subscribe((state) => syncRoute(state.currentSlug, state.currentEpisode, state.currentView));
  let prevScopeKey = "";
  store.subscribe((state) => {
    const slug = state.currentSlug;
    const episode = state.currentEpisode;
    if (!slug || !episode) {
      prevScopeKey = "";
      return;
    }
    const key = `${slug}#${episode}`;
    if (key === prevScopeKey) return;
    prevScopeKey = key;
    store.update({ recent: pushRecent(slug, episode) });
  });

  window.addEventListener("popstate", () => {
    const next = parseRoute();
    store.update({
      currentSlug: next.slug ?? store.state.defaultSlug,
      currentEpisode: next.episode ?? store.state.defaultEpisode,
      currentView: next.view,
    });
  });

  window.addEventListener("hashchange", () => {
    const hashView = window.location.hash.replace(/^#/, "");
    if (isViewName(hashView)) store.update({ currentView: hashView });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  start().catch((e) => {
    const main = document.querySelector<HTMLElement>("#main");
    if (main) {
      main.innerHTML = `<div class="view-placeholder"><h2>起動エラー</h2><p>${String(e)}</p></div>`;
    }
  });
});
