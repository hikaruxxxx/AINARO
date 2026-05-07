import {
  ApiError,
  apiAiEditCommit,
  apiAiEditDiff,
  apiAiEditDiscard,
  apiPostJob,
  openJobStream,
  type JobEvent,
  type JobState,
} from "../lib/api";
import { isViewName, store, type ViewName } from "../lib/store";
import { layerLabel } from "../labels";

const CSS = `
.ai-view { display: grid; gap: var(--space-3); }
.ai-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.ai-spacer { flex: 1 1 auto; }
.ai-form { display: grid; gap: var(--space-3); max-width: 920px; }
.ai-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.ai-progress { display: grid; gap: var(--space-2); max-width: 1100px; }
.ai-diff { display: grid; gap: var(--space-2); }
.ai-diff h3 { margin: 0; font-size: var(--fs-lg); }
.ai-modal-body { display: grid; gap: var(--space-3); padding: var(--space-4); }
.ai-modal-body h3 { margin: 0; }
.ai-history-list { display: grid; gap: var(--space-2); max-height: 70vh; overflow: auto; }
.ai-history-item { display: grid; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.ai-warning { color: var(--color-danger); font-weight: var(--fw-bold); }
.ai-toast { position: fixed; top: 64px; right: 18px; z-index: 50; }
`;

type ConfirmAction = "commit" | "discard";
type HistoryItem = { ts: string; scope: string; target: string; prompt: string; diffStat: string };

type ViewState = {
  scope: string;
  target: string;
  prompt: string;
  running: boolean;
  jobId: string | null;
  state: JobState | null;
  logs: string[];
  diffStat: string;
  diff: string;
  confirm: ConfirmAction | null;
  historyOpen: boolean;
  history: HistoryItem[];
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
  /** preset 由来の出発点情報。完了後の「元の view へ戻る」用 */
  originLayer: string | null;
  originView: ViewName | null;
};

const STORAGE_KEY = "novelis.ai-edit.draft";
const HISTORY_KEY = "novelis.ai-edit.history";

function ensureStyles(): void {
  if (document.getElementById("ai-edit-styles")) return;
  const style = document.createElement("style");
  style.id = "ai-edit-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function renderConfirm(state: ViewState): string {
  if (!state.confirm) return "";
  const isDiscard = state.confirm === "discard";
  return `<div class="nc-modal is-open">
    <div class="nc-modal__card nc-modal__card--sm ai-modal-body">
      <h3>${isDiscard ? "変更を破棄" : "変更をコミット"}</h3>
      <p class="${isDiscard ? "ai-warning" : ""}">${isDiscard ? "破棄すると未コミット変更は戻せません。" : "現在の変更を git commit します。"}</p>
      ${isDiscard ? "" : `<label class="nc-field"><span class="nc-field__label">commit message</span><input class="nc-field__input" id="ai-commit-message" value="ai-edit: Console からの編集"></label>`}
      <div class="ai-actions">
        <button type="button" class="nc-button nc-button--secondary" data-action="cancel-confirm">キャンセル</button>
        <button type="button" class="nc-button ${isDiscard ? "nc-button--danger" : "nc-button--primary"}" data-action="${isDiscard ? "confirm-discard" : "confirm-commit"}">${isDiscard ? "破棄する" : "コミットする"}</button>
      </div>
    </div>
  </div>`;
}

function loadDraft(): Partial<Pick<ViewState, "scope" | "target" | "prompt">> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Pick<ViewState, "scope" | "target" | "prompt">>;
  } catch {
    return {};
  }
}

function saveDraft(state: ViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scope: state.scope, target: state.target, prompt: state.prompt }));
  } catch {
    // localStorage が使えない環境では復元なしで動かす。
  }
}

function loadHistory(): HistoryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryItem[];
    return Array.isArray(value) ? value.slice(0, 12) : [];
  } catch {
    return [];
  }
}

function pushHistory(state: ViewState): void {
  const item: HistoryItem = {
    ts: new Date().toISOString(),
    scope: state.scope,
    target: state.target,
    prompt: state.prompt,
    diffStat: state.diffStat,
  };
  state.history = [item, ...state.history].slice(0, 12);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  } catch {
    // TODO: server-side history source ができたら置き換える。
  }
}

function renderHistory(state: ViewState): string {
  if (!state.historyOpen) return "";
  return `<div class="nc-modal is-open" data-action="close-history">
    <div class="nc-modal__card nc-modal__card--md ai-modal-body">
      <h3>AI 編集履歴</h3>
      <div class="ai-history-list">
        ${state.history.map((item) => `<article class="ai-history-item">
          <div class="ai-info">${escapeHtml(new Date(item.ts).toLocaleString())} / ${escapeHtml(item.scope)}${item.target ? ` / ${escapeHtml(item.target)}` : ""}</div>
          <pre class="nc-code-block">${escapeHtml(item.prompt)}</pre>
          ${item.diffStat ? `<pre class="nc-code-block">${escapeHtml(item.diffStat)}</pre>` : ""}
        </article>`).join("") || '<div class="nc-empty">履歴はまだありません。</div>'}
      </div>
      <div class="ai-actions"><button type="button" class="nc-button nc-button--secondary" data-action="close-history">閉じる</button></div>
    </div>
  </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const workOptions = store.state.works.map((work) => {
    const selected = state.scope === work.slug ? " selected" : "";
    const label = work.title ? `${work.title} (${work.slug})` : work.slug;
    return `<option value="${escapeHtml(work.slug)}"${selected}>作品: ${escapeHtml(label)}</option>`;
  }).join("");
  const layerBadge = state.originLayer
    ? `<span class="nc-badge nc-badge--info" title="${escapeHtml(layerLabel(state.originLayer).title)} の context が prefill されています">${escapeHtml(state.originLayer)} ${escapeHtml(layerLabel(state.originLayer).title)}</span>`
    : "";
  const backLink = state.originView
    ? `<button type="button" class="nc-button nc-button--ghost nc-button--sm" data-action="back-origin" title="prefill 元の view に戻ります (preset は破棄)">← 元の view に戻る</button>`
    : "";
  container.innerHTML = `
    <div class="ai-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">AI 編集</h2>
        ${layerBadge}
        ${backLink}
        <span class="ai-spacer"></span>
        <span class="ai-info">Codex CLI 経由でリポジトリ全体を編集します</span>
      </div>
      <section class="nc-card ai-form">
        <label class="nc-field">
          <span class="nc-field__label">対象 scope</span>
          <select class="nc-field__select" id="ai-scope">
            <option value="_console"${state.scope === "_console" ? " selected" : ""}>_console (Console 自身)</option>
            ${workOptions}
          </select>
        </label>
        <label class="nc-field">
          <span class="nc-field__label">編集ヒント (target file path、任意)</span>
          <input class="nc-field__input" id="ai-target" value="${escapeHtml(state.target)}" placeholder="src/lib/manga/ops-console/web/views/volume-plot.ts">
        </label>
        <label class="nc-field">
          <span class="nc-field__label">指示 (prompt)</span>
          <textarea class="nc-field__textarea" id="ai-prompt" rows="12" placeholder="例: Volume Plot view の beat label の色を変えて...">${escapeHtml(state.prompt)}</textarea>
        </label>
        <div class="ai-actions">
          <button type="button" class="nc-button nc-button--primary" data-action="run" ${state.running ? "disabled" : ""}>実行 (Codex を起動)</button>
          <button type="button" class="nc-button nc-button--secondary" data-action="history">履歴を見る</button>
          <button type="button" class="nc-button nc-button--ghost" data-action="jobs">Jobs Hub</button>
        </div>
      </section>
      <section class="ai-progress">
        <details ${state.running || state.logs.length ? "open" : ""}>
          <summary>ログ</summary>
          <pre class="nc-code-block">${escapeHtml(state.logs.join("\n") || "log はここに表示されます")}</pre>
        </details>
        ${state.diffStat || state.diff ? `<div class="ai-diff">
          <h3>変更差分</h3>
          <pre class="nc-code-block">${escapeHtml(state.diffStat || "(diff stat なし)")}</pre>
          <pre class="nc-code-block">${escapeHtml(state.diff || "(diff preview なし)")}</pre>
          <div class="ai-actions">
            <button type="button" class="nc-button nc-button--primary" data-action="commit">コミット</button>
            <button type="button" class="nc-button nc-button--danger" data-action="discard">破棄</button>
          </div>
        </div>` : ""}
      </section>
    </div>
    ${renderConfirm(state)}
    ${renderHistory(state)}
    ${state.toast ? `<div class="ai-toast nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

function syncForm(container: HTMLElement, state: ViewState): void {
  state.scope = container.querySelector<HTMLSelectElement>("#ai-scope")?.value || "_console";
  state.target = container.querySelector<HTMLInputElement>("#ai-target")?.value.trim() ?? "";
  state.prompt = container.querySelector<HTMLTextAreaElement>("#ai-prompt")?.value ?? "";
  saveDraft(state);
}

function toast(container: HTMLElement, state: ViewState, message: string, kind: NonNullable<ViewState["toast"]>["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

async function refreshDiff(container: HTMLElement, state: ViewState): Promise<void> {
  try {
    const diff = await apiAiEditDiff();
    state.diffStat = diff.stat;
    state.diff = diff.diff;
  } catch (error) {
    state.logs.push(`diff 取得失敗: ${errorText(error)}`);
  }
  render(container, state);
}

async function runAiEdit(container: HTMLElement, state: ViewState): Promise<void> {
  syncForm(container, state);
  if (!state.prompt.trim()) {
    toast(container, state, "prompt を入力してください", "warning");
    return;
  }
  state.running = true;
  state.state = "running";
  state.logs = [];
  state.diff = "";
  state.diffStat = "";
  render(container, state);
  try {
    const result = await apiPostJob({
      layer: "L99",
      slug: state.scope === "_console" ? "_console" : state.scope,
      args: {
        "--prompt": state.prompt,
        ...(state.target ? { "--target": state.target } : {}),
      },
    });
    state.jobId = result.job_id;
    state.logs.push(`job started: ${result.job_id}`);
    render(container, state);
    const stream = openJobStream(result.job_id, {
      onEvent(event: JobEvent) {
        state.logs.push(`[${event.channel}] ${event.line}`);
        state.logs = state.logs.slice(-1000);
        render(container, state);
      },
      onDone(info) {
        state.running = false;
        state.state = info.state;
        state.logs.push(`done: ${info.state} exit=${info.exitCode ?? "-"}`);
        stream.close();
        void refreshDiff(container, state);
      },
      onError(error) {
        state.running = false;
        state.logs.push(`SSE error: ${error.message}`);
        render(container, state);
      },
    });
  } catch (error) {
    state.running = false;
    state.logs.push(`起動失敗: ${errorText(error)}`);
    render(container, state);
  }
}

export function mountAiEditView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  // pipeline / 各 layer view から渡された preset を消費する (1 回限り)。
  const preset = store.state.aiEditPreset;
  const draft = loadDraft();
  const state: ViewState = {
    scope: preset?.scope || draft.scope || store.state.currentSlug || "_console",
    target: preset?.target ?? draft.target ?? "",
    prompt: preset?.prompt ?? draft.prompt ?? "",
    running: false,
    jobId: null,
    state: null,
    logs: [],
    diffStat: "",
    diff: "",
    confirm: null,
    historyOpen: false,
    history: loadHistory(),
    toast: null,
    originLayer: preset?.originLayer ?? null,
    originView: preset?.originView && isViewName(preset.originView) ? preset.originView : null,
  };
  if (preset) {
    // 再 mount で残り続けないよう即クリア。subscribe 通知はループしないよう非破壊的に直接書き換え。
    store.state = { ...store.state, aiEditPreset: undefined };
  }
  render(container, state);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "run") void runAiEdit(container, state);
    else if (action === "back-origin") {
      if (state.originView) store.update({ currentView: state.originView });
    }
    else if (action === "history") {
      state.historyOpen = true;
      render(container, state);
    }
    else if (action === "close-history") {
      const card = target.closest(".nc-modal__card");
      if (card && !target.closest<HTMLElement>("[data-action='close-history']")) return;
      state.historyOpen = false;
      render(container, state);
    }
    else if (action === "jobs") store.update({ currentView: "jobs-hub", currentSlug: "", currentEpisode: 0 });
    else if (action === "commit") {
      state.confirm = "commit";
      render(container, state);
    } else if (action === "discard") {
      state.confirm = "discard";
      render(container, state);
    } else if (action === "cancel-confirm") {
      state.confirm = null;
      render(container, state);
    } else if (action === "confirm-commit") {
      const message = container.querySelector<HTMLInputElement>("#ai-commit-message")?.value.trim() || "ai-edit: Console からの編集";
      void apiAiEditCommit(message)
        .then((result) => {
          state.confirm = null;
          pushHistory(state);
          state.diff = "";
          state.diffStat = "";
          toast(container, state, `commit 完了: ${result.sha.slice(0, 8)}`, "success");
        })
        .catch((error) => toast(container, state, `commit 失敗: ${errorText(error)}`, "danger"));
    } else if (action === "confirm-discard") {
      void apiAiEditDiscard()
        .then(() => {
          state.confirm = null;
          state.diff = "";
          state.diffStat = "";
          toast(container, state, "変更を破棄しました", "success");
        })
        .catch((error) => toast(container, state, `破棄に失敗: ${errorText(error)}`, "danger"));
    }
  }, { signal: controller.signal });

  container.addEventListener("input", () => syncForm(container, state), { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
