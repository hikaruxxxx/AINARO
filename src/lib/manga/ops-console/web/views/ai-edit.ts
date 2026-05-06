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
.ai-warning { color: var(--color-danger); font-weight: var(--fw-bold); }
.ai-toast { position: fixed; top: 64px; right: 18px; z-index: 50; }
`;

type ConfirmAction = "commit" | "discard";

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
  toast: { message: string; kind: "success" | "warning" | "danger" | "info" } | null;
};

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

function render(container: HTMLElement, state: ViewState): void {
  const workOptions = store.state.works.map((work) => {
    const selected = state.scope === work.slug ? " selected" : "";
    const label = work.title ? `${work.title} (${work.slug})` : work.slug;
    return `<option value="${escapeHtml(work.slug)}"${selected}>作品: ${escapeHtml(label)}</option>`;
  }).join("");
  container.innerHTML = `
    <div class="ai-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">AI 編集</h2>
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
          <button type="button" class="nc-button nc-button--secondary" data-action="jobs">履歴を見る</button>
        </div>
      </section>
      <section class="ai-progress">
        <pre class="nc-code-block">${escapeHtml(state.logs.join("\n") || "log はここに表示されます")}</pre>
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
    ${state.toast ? `<div class="ai-toast nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

function syncForm(container: HTMLElement, state: ViewState): void {
  state.scope = container.querySelector<HTMLSelectElement>("#ai-scope")?.value || "_console";
  state.target = container.querySelector<HTMLInputElement>("#ai-target")?.value.trim() ?? "";
  state.prompt = container.querySelector<HTMLTextAreaElement>("#ai-prompt")?.value ?? "";
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
  const state: ViewState = {
    scope: store.state.currentSlug || "_console",
    target: "",
    prompt: "",
    running: false,
    jobId: null,
    state: null,
    logs: [],
    diffStat: "",
    diff: "",
    confirm: null,
    toast: null,
  };
  render(container, state);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "run") void runAiEdit(container, state);
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
