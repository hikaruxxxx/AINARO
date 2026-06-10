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
import { store } from "../lib/store";
import { layerLabel } from "../labels";

export type AiEditModalConfig = {
  scope: string;
  initialTarget?: string;
  initialPrompt?: string;
  originLayer?: string;
  originView?: string;
};

export type AiEditModalResult =
  | { status: "committed"; sha?: string }
  | { status: "discarded" }
  | { status: "cancelled" };

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

type ModalState = {
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
  originLayer: string | null;
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

function loadDraft(): Partial<Pick<ModalState, "scope" | "target" | "prompt">> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Pick<ModalState, "scope" | "target" | "prompt">>;
  } catch {
    return {};
  }
}

function saveDraft(state: ModalState): void {
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

function pushHistory(state: ModalState): void {
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

function renderConfirm(state: ModalState): string {
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

function renderHistory(state: ModalState): string {
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

function render(root: HTMLElement, state: ModalState): void {
  const workOptions = store.state.works.map((work) => {
    const selected = state.scope === work.slug ? " selected" : "";
    const label = work.title ? `${work.title} (${work.slug})` : work.slug;
    return `<option value="${escapeHtml(work.slug)}"${selected}>作品: ${escapeHtml(label)}</option>`;
  }).join("");
  const layerBadge = state.originLayer
    ? `<span class="nc-badge nc-badge--info" title="${escapeHtml(layerLabel(state.originLayer).title)} の context が prefill されています">${escapeHtml(state.originLayer)} ${escapeHtml(layerLabel(state.originLayer).title)}</span>`
    : "";
  root.innerHTML = `
    <div class="nc-modal is-open" data-ai-edit-overlay>
      <div class="nc-modal__card nc-modal__card--lg ai-modal-body" role="dialog" aria-modal="true" aria-label="AI 編集">
        <div class="ai-view">
          <div class="nc-toolbar">
            <h2 class="nc-toolbar__title">AI 編集</h2>
            ${layerBadge}
            <span class="ai-spacer"></span>
            <span class="ai-info">Codex CLI 経由でリポジトリ全体を編集します</span>
            <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-action="cancel">閉じる</button>
          </div>
          <section class="ai-form">
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
      </div>
    </div>
    ${renderConfirm(state)}
    ${renderHistory(state)}
    ${state.toast ? `<div class="ai-toast nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

function syncForm(root: HTMLElement, state: ModalState): void {
  state.scope = root.querySelector<HTMLSelectElement>("#ai-scope")?.value || "_console";
  state.target = root.querySelector<HTMLInputElement>("#ai-target")?.value.trim() ?? "";
  state.prompt = root.querySelector<HTMLTextAreaElement>("#ai-prompt")?.value ?? "";
  saveDraft(state);
}

function toast(root: HTMLElement, state: ModalState, message: string, kind: NonNullable<ModalState["toast"]>["kind"]): void {
  state.toast = { message, kind };
  render(root, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(root, state);
  }, 3000);
}

async function refreshDiff(root: HTMLElement, state: ModalState): Promise<void> {
  try {
    const diff = await apiAiEditDiff();
    state.diffStat = diff.stat;
    state.diff = diff.diff;
  } catch (error) {
    state.logs.push(`diff 取得失敗: ${errorText(error)}`);
  }
  render(root, state);
}

async function runAiEdit(root: HTMLElement, state: ModalState, onStream: (stream: { close: () => void }) => void): Promise<void> {
  syncForm(root, state);
  if (!state.prompt.trim()) {
    toast(root, state, "prompt を入力してください", "warning");
    return;
  }
  state.running = true;
  state.state = "running";
  state.logs = [];
  state.diff = "";
  state.diffStat = "";
  render(root, state);
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
    render(root, state);
    const stream = openJobStream(result.job_id, {
      onEvent(event: JobEvent) {
        state.logs.push(`[${event.channel}] ${event.line}`);
        state.logs = state.logs.slice(-1000);
        render(root, state);
      },
      onDone(info) {
        state.running = false;
        state.state = info.state;
        state.logs.push(`done: ${info.state} exit=${info.exitCode ?? "-"}`);
        stream.close();
        void refreshDiff(root, state);
      },
      onError(error) {
        state.running = false;
        state.logs.push(`SSE error: ${error.message}`);
        render(root, state);
      },
    });
    onStream(stream);
  } catch (error) {
    state.running = false;
    state.logs.push(`起動失敗: ${errorText(error)}`);
    render(root, state);
  }
}

export function openAiEditModal(config: AiEditModalConfig): Promise<AiEditModalResult> {
  ensureStyles();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const controller = new AbortController();
  let stream: { close: () => void } | null = null;
  let settled = false;
  const draft = loadDraft();
  const state: ModalState = {
    scope: config.scope || draft.scope || store.state.currentSlug || "_console",
    target: config.initialTarget ?? draft.target ?? "",
    prompt: config.initialPrompt ?? draft.prompt ?? "",
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
    originLayer: config.originLayer ?? null,
  };

  return new Promise((resolve) => {
    const close = (result: AiEditModalResult): void => {
      if (settled) return;
      settled = true;
      controller.abort();
      stream?.close();
      root.remove();
      resolve(result);
    };

    render(root, state);

    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.matches("[data-ai-edit-overlay]")) {
        close({ status: "cancelled" });
        return;
      }
      const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "cancel") close({ status: "cancelled" });
      else if (action === "run") void runAiEdit(root, state, (nextStream) => { stream = nextStream; });
      else if (action === "history") {
        state.historyOpen = true;
        render(root, state);
      } else if (action === "close-history") {
        if (!target.matches("[data-action='close-history']")) return;
        state.historyOpen = false;
        render(root, state);
      } else if (action === "jobs") {
        store.update({ currentView: "jobs-hub", currentSlug: "", currentEpisode: 0 });
        close({ status: "cancelled" });
      }
      else if (action === "commit") {
        state.confirm = "commit";
        render(root, state);
      } else if (action === "discard") {
        state.confirm = "discard";
        render(root, state);
      } else if (action === "cancel-confirm") {
        state.confirm = null;
        render(root, state);
      } else if (action === "confirm-commit") {
        const message = root.querySelector<HTMLInputElement>("#ai-commit-message")?.value.trim() || "ai-edit: Console からの編集";
        void apiAiEditCommit(message)
          .then((result) => {
            pushHistory(state);
            close({ status: "committed", sha: result.sha });
          })
          .catch((error) => toast(root, state, `commit 失敗: ${errorText(error)}`, "danger"));
      } else if (action === "confirm-discard") {
        void apiAiEditDiscard()
          .then(() => close({ status: "discarded" }))
          .catch((error) => toast(root, state, `破棄に失敗: ${errorText(error)}`, "danger"));
      }
    }, { signal: controller.signal });

    root.addEventListener("input", () => syncForm(root, state), { signal: controller.signal });
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close({ status: "cancelled" });
    }, { signal: controller.signal });
  });
}
