import {
  ApiError,
  apiGetManifest,
  apiGetNameApproval,
  apiGetPipelineStatus,
  type LayerId,
  type PipelineStatus,
  type PipelineStatusLayer,
} from "../lib/api";
import { isViewName, store } from "../lib/store";
import { layerLabel, resolveAiEditHint } from "../labels";
import { isRunnableLayer, navigateToAiEdit, spawnLayerWithModal } from "../lib/layer-actions";

type HintMap = Map<string, string>;

type ViewState = {
  slug: string;
  episode: number;
  status: PipelineStatus | null;
  hints: HintMap;
  running: Set<string>;
  streams: Map<string, { close: () => void }>;
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
  loading: boolean;
  error: string | null;
  scopeKey: string;
};

const CSS = `
.pipe-steps { display: grid; gap: var(--space-2); padding: 0; margin: var(--space-3) 0 0; list-style: none; }
.pipe-step { display: grid; gap: var(--space-1); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-elevated); }
.pipe-step--current { border-color: var(--color-primary); box-shadow: var(--shadow-1); }
.pipe-step__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.pipe-step__id-block { min-width: 92px; }
.pipe-step__id { color: var(--text-tertiary); font-family: var(--font-mono); font-size: var(--fs-xs); }
.pipe-step__label-block { display: grid; gap: 2px; min-width: min(320px, 100%); }
.pipe-step__label { color: var(--text-primary); font-size: var(--fs-base); font-weight: var(--fw-medium); }
.pipe-step__ts { color: var(--text-tertiary); font-size: var(--fs-sm); margin-left: auto; }
.pipe-step__actions { display: flex; gap: var(--space-1); }
.pipe-step__hint { color: var(--color-warning); font-size: var(--fs-sm); padding-left: 56px; }
.pipe-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.pipe-spacer { flex: 1 1 auto; }
.pipe-loading { margin-top: var(--space-3); }
.pipe-step__actions .nc-button[disabled] { opacity: 0.45; cursor: not-allowed; }
.pipe-step__actions .nc-button[data-locked="cli"] { color: var(--text-tertiary); border-style: dashed; }
`;

function ensureStyles(): void {
  if (document.getElementById("pipe-styles")) return;
  const style = document.createElement("style");
  style.id = "pipe-styles";
  style.textContent = CSS;
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

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function episodeLabel(episode: number): string {
  return `ep${String(episode).padStart(2, "0")}`;
}

function formatTs(ts: string | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeClass(layer: PipelineStatusLayer, running: boolean): string {
  if (running) return "nc-badge--info";
  if (layer.status === "ready") return "nc-badge--success";
  if (layer.status === "stale") return "nc-badge--warning";
  return "nc-badge--neutral";
}

function badgeLabel(layer: PipelineStatusLayer, running: boolean): string {
  if (running) return "起動中";
  if (layer.status === "ready") return "生成済み";
  if (layer.status === "stale") return "要更新";
  return "未生成";
}


async function buildHints(status: PipelineStatus): Promise<HintMap> {
  const hints = new Map<string, string>();
  const firstMissing = status.layers.find((layer) => layer.status === "missing");
  if (firstMissing) hints.set(firstMissing.id, "ここから始められます");

  const nameApproval = status.layers.find((layer) => layer.id === "L08.7");
  if (nameApproval?.status === "ready") {
    try {
      const approval = await apiGetNameApproval(status.slug, status.episode);
      const pages = Object.values(approval.pages);
      if (pages.length > 0 && pages.every((page) => page.status === "pending")) {
        hints.set("L08.7", "ネーム判定が残っています");
      }
    } catch {
      // status endpoint remains the source of truth for this view; auxiliary hints are best-effort.
    }
  }

  const audit = status.layers.find((layer) => layer.id === "L11");
  if (audit?.status === "ready") {
    try {
      const manifest = await apiGetManifest(status.slug, status.episode);
      if ((manifest.audit?.failed_panel_ids?.length ?? 0) > 0) {
        hints.set("L11", "修正指示が必要です");
      }
    } catch {
      // Missing manifest inputs should not prevent the pipeline overview from rendering.
    }
  }
  return hints;
}

function renderLayer(layer: PipelineStatusLayer, state: ViewState): string {
  const running = state.running.has(layer.id);
  const hint = state.hints.get(layer.id);
  const current = hint ? " pipe-step--current" : "";
  const nextView = layer.next_view && isViewName(layer.next_view) ? layer.next_view : "";
  // server 側の next_layer_id は「同じ row の layer 自身」が runnable な場合のみ値を持つ。
  // L03-L08 等は null なので、Console から再実行できず CLI へ案内する。
  const runnable = isRunnableLayer(layer.next_layer_id ?? null) ? layer.next_layer_id : "";
  const ts = formatTs(layer.last_modified);
  const label = layerLabel(layer.id);
  const aiHint = resolveAiEditHint(layer.id, { slug: state.slug, episode: state.episode });
  const rerunLabel = layer.status === "ready" ? "再実行" : "生成";
  const rerunBtn = runnable
    ? `<button type="button" class="nc-button nc-button--primary nc-button--sm" data-rerun-layer="${escapeHtml(runnable)}" data-current-status="${escapeHtml(layer.status)}" ${running ? "disabled" : ""}>${running ? "起動中" : rerunLabel}</button>`
    : `<button type="button" class="nc-button nc-button--sm" data-locked="cli" disabled title="${escapeHtml(`${layer.id} は CLI から起動してください (例: npx tsx scripts/manga/layers/${layer.id}-...ts --slug ${state.slug} --episode ${state.episode})`)}">CLI のみ</button>`;
  const openBtn = nextView
    ? `<button type="button" class="nc-button nc-button--secondary nc-button--sm" data-next-view="${escapeHtml(nextView)}">開く</button>`
    : "";
  const aiBtn = aiHint
    ? `<button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ai-edit-layer="${escapeHtml(layer.id)}" title="AI 編集 view へ遷移し、${escapeHtml(layer.id)} の context を prefill します">AI で修正</button>`
    : "";
  return `
    <li class="pipe-step${current}">
      <div class="pipe-step__head">
        <div class="pipe-step__id-block">
          <span class="pipe-step__id">${escapeHtml(label.subtitle)}</span>
        </div>
        <div class="pipe-step__label-block">
          <span class="pipe-step__label">${escapeHtml(label.title)}</span>
        </div>
        <span class="nc-badge ${badgeClass(layer, running)}">${escapeHtml(badgeLabel(layer, running))}</span>
        ${ts ? `<span class="pipe-step__ts">${escapeHtml(ts)}</span>` : `<span class="pipe-step__ts"></span>`}
        <div class="pipe-step__actions">
          ${rerunBtn}
          ${openBtn}
          ${aiBtn}
        </div>
      </div>
      ${hint ? `<div class="pipe-step__hint">${escapeHtml(hint)}</div>` : ""}
    </li>
  `;
}

function render(container: HTMLElement, state: ViewState): void {
  if (state.error && !state.status) {
    container.innerHTML = `<div class="view-placeholder"><h2>パイプライン進捗</h2><p>${escapeHtml(state.error)}</p></div>`;
    return;
  }
  const scope = `${state.slug} / ${episodeLabel(state.episode)}`;
  const body = state.status
    ? `<ol class="pipe-steps">${state.status.layers.map((layer) => renderLayer(layer, state)).join("")}</ol>`
    : `<div class="nc-empty pipe-loading">読み込み中...</div>`;
  container.innerHTML = `
    <div class="nc-toolbar">
      <h2 class="nc-toolbar__title">パイプライン進捗</h2>
      <span class="pipe-info">${escapeHtml(scope)}</span>
      <span class="pipe-spacer"></span>
      <button type="button" class="nc-button nc-button--ghost nc-button--sm" disabled title="L01 (--concept パス) や L02b (--volume + --concept) は引数指定が必要なため、各 layer の「起動」ボタンから個別に起動してください。完全自動化は将来対応 (作品の auto_run_args 定義が前提)">全自動 run は未対応</button>
    </div>
    ${body}
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  const status = await apiGetPipelineStatus(state.slug, state.episode);
  state.status = status;
  state.hints = await buildHints(status);
  state.loading = false;
  render(container, state);
}

function setToast(
  state: ViewState,
  container: HTMLElement,
  message: string,
  kind: NonNullable<ViewState["toast"]>["kind"]
): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

export function mountPipelineView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    episode: app.currentEpisode || app.defaultEpisode,
    status: null,
    hints: new Map(),
    running: new Set(),
    streams: new Map(),
    toast: null,
    loading: false,
    error: null,
    scopeKey: `${app.currentSlug || app.defaultSlug}:${app.currentEpisode || app.defaultEpisode}`,
  };

  void refresh(state, container).catch((error) => {
    state.loading = false;
    state.error = errorText(error);
    render(container, state);
  });

  const unsubscribe = store.subscribe((next) => {
    const slug = next.currentSlug || next.defaultSlug;
    const episode = next.currentEpisode || next.defaultEpisode;
    const scopeKey = `${slug}:${episode}`;
    if (next.currentView !== "pipeline" || scopeKey === state.scopeKey) return;
    state.slug = slug;
    state.episode = episode;
    state.scopeKey = scopeKey;
    state.status = null;
    state.hints = new Map();
    state.error = null;
    for (const stream of state.streams.values()) stream.close();
    state.streams.clear();
    state.running.clear();
    void refresh(state, container).catch((error) => {
      state.loading = false;
      state.error = errorText(error);
      render(container, state);
    });
  });

  container.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      // 「開く」: 関連 view へ遷移。
      const view = target.closest<HTMLButtonElement>("[data-next-view]")?.dataset.nextView;
      if (view && isViewName(view)) {
        store.update({ currentView: view });
        return;
      }

      // 「AI で修正」: per-layer hint を preset として ai-edit へ。
      const aiLayer = target.closest<HTMLButtonElement>("[data-ai-edit-layer]")?.dataset.aiEditLayer;
      if (aiLayer) {
        navigateToAiEdit(aiLayer, { slug: state.slug, episode: state.episode });
        return;
      }

      // 「再実行」: 共通 launch modal を経由する。
      const rerunBtn = target.closest<HTMLButtonElement>("[data-rerun-layer]");
      const layer = rerunBtn?.dataset.rerunLayer;
      if (!isRunnableLayer(layer)) return;
      const status = (rerunBtn?.dataset.currentStatus ?? "missing") as PipelineStatusLayer["status"];
      void spawnLayerWithModal({
        layer,
        status,
        slug: state.slug,
        episode: state.episode,
        callbacks: {
          onProgress: (running) => {
            if (running) state.running.add(layer);
            else state.running.delete(layer);
            render(container, state);
          },
          onSuccess: () => {
            void refresh(state, container).catch((error) => {
              state.error = errorText(error);
              render(container, state);
            });
          },
          onError: (msg) => setToast(state, container, msg, "danger"),
        },
      });
    },
    { signal: controller.signal }
  );

  return () => {
    controller.abort();
    unsubscribe();
    for (const stream of state.streams.values()) stream.close();
    container.innerHTML = "";
  };
}
