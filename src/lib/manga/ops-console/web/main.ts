import { apiGetBootstrap } from "./lib/api";
import { isViewName, store, type ViewName } from "./lib/store";
import { mountBreadcrumb } from "./breadcrumb";
import { mountSidebar } from "./sidebar";
import { mountAssetsView } from "./views/assets";
import { mountIndexView } from "./views/index";
import { mountLayersView } from "./views/layers";
import { mountNameGateView } from "./views/name-gate";
import { mountPipelineView } from "./views/pipeline";
import { mountRevisionView } from "./views/revision";
import { mountWorksView } from "./views/works";

type Unmount = () => void;

function parseRoute(): { slug: string | null; episode: number | null; view: ViewName } {
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
  if (!slug || !episode) return;
  const next = `${routePath(slug, episode)}#${view}`;
  const current = `${window.location.pathname}${window.location.hash}`;
  if (current === next) return;
  history.pushState(null, "", next);
}

/**
 * view の差分検知付き mount。
 * 旧実装は store.subscribe で全 state 変更時に unmount→remount していたため、
 * Phase 2B 以降に view 内で保持する状態 (フォーム入力、選択中ページ等) が毎更新で破棄されていた。
 * currentView が変わったときだけ remount するように変更。
 */
function mountCurrentView(main: HTMLElement): () => void {
  let unmount: Unmount | null = null;
  let prevView: ViewName | null = null;
  return store.subscribe((state) => {
    if (state.currentView === prevView) return;
    if (unmount) unmount();
    prevView = state.currentView;
    if (state.currentView === "index") unmount = mountIndexView(main);
    else if (state.currentView === "pipeline") unmount = mountPipelineView(main);
    else if (state.currentView === "assets") unmount = mountAssetsView(main);
    else if (state.currentView === "layers") unmount = mountLayersView(main);
    else if (state.currentView === "revision") unmount = mountRevisionView(main);
    else if (state.currentView === "works") unmount = mountWorksView(main);
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
  if (!sidebar || !main || !topBreadcrumb) throw new Error("Novelis Console shell is incomplete");

  mountSidebar(sidebar);
  mountCurrentView(main);
  mountBreadcrumb(topBreadcrumb);

  const boot = await loadBootstrap();
  const route = parseRoute();
  // 一覧モード (server scope なし & URL /) なら currentSlug="" として scope なし表示。
  // 各 view は currentSlug が空の間は呼ばれない (mountCurrentView は index へ)。
  const currentSlug = route.slug ?? boot.default_slug ?? "";
  const currentEpisode = route.episode ?? boot.default_episode ?? 0;
  const currentView: ViewName = route.slug ? route.view : "index";

  store.update({
    works: boot.works,
    defaultSlug: boot.default_slug ?? "",
    defaultEpisode: boot.default_episode ?? 0,
    currentSlug,
    currentEpisode,
    currentView,
  });
  syncRoute(currentSlug, currentEpisode, currentView);
  store.subscribe((state) => syncRoute(state.currentSlug, state.currentEpisode, state.currentView));

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
