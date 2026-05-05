import { apiGetBootstrap } from "./lib/api";
import { isViewName, store, type ViewName } from "./lib/store";
import { mountSidebar } from "./sidebar";
import { mountAssetsView } from "./views/assets";
import { mountLayersView } from "./views/layers";
import { mountNameGateView } from "./views/name-gate";
import { mountWorksView } from "./views/works";

type Unmount = () => void;

function parseRoute(): { slug: string | null; episode: number | null; view: ViewName } {
  const m = window.location.pathname.match(/^\/works\/([^/]+)\/episodes\/ep(\d+)\/?$/);
  const hashView = window.location.hash.replace(/^#/, "");
  return {
    slug: m ? decodeURIComponent(m[1]) : null,
    episode: m ? Number(m[2]) : null,
    view: isViewName(hashView) ? hashView : "name-gate",
  };
}

function routePath(slug: string, episode: number): string {
  return `/works/${encodeURIComponent(slug)}/episodes/ep${String(episode).padStart(2, "0")}/`;
}

function syncRoute(slug: string, episode: number, view: ViewName): void {
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
    if (state.currentView === "assets") unmount = mountAssetsView(main);
    else if (state.currentView === "layers") unmount = mountLayersView(main);
    else if (state.currentView === "works") unmount = mountWorksView(main);
    else unmount = mountNameGateView(main);
  });
}

/**
 * 表示テキストが変わったときだけ DOM 更新する。
 * 全 state 変更で textContent を書き換えると、Phase 2B 以降の選択状態に影響する場合があるため。
 */
function mountHeader(scopeEl: HTMLElement): () => void {
  let prev = "";
  return store.subscribe((state) => {
    const ep = `ep${String(state.currentEpisode).padStart(2, "0")}`;
    const next = state.currentSlug ? `${state.currentSlug} / ${ep}` : "loading...";
    if (next === prev) return;
    prev = next;
    scopeEl.textContent = next;
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
  const topScope = document.querySelector<HTMLElement>("#top-scope");
  if (!sidebar || !main || !topScope) throw new Error("ops console shell is incomplete");

  mountSidebar(sidebar);
  mountCurrentView(main);
  mountHeader(topScope);

  const boot = await loadBootstrap();
  const route = parseRoute();
  const currentSlug = route.slug ?? boot.default_slug;
  const currentEpisode = route.episode ?? boot.default_episode;

  store.update({
    works: boot.works,
    defaultSlug: boot.default_slug,
    defaultEpisode: boot.default_episode,
    currentSlug,
    currentEpisode,
    currentView: route.view,
  });
  syncRoute(currentSlug, currentEpisode, route.view);
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
