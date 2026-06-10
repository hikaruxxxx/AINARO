/**
 * 各 layer の「再実行」「生成」ボタンから呼ばれる共通起動 modal。
 * 確認 + 必要に応じた引数入力 (例: L13 の --volume) を 1 か所に集約する。
 *
 * 設計:
 *   - promise ベース (await openLaunchModal({...})) で呼び出し側がシンプル
 *   - キャンセル時は null を解決、確定時は { argKey: value } を返す
 *   - DOM は呼び出しごとに body 直下に挿入し、解決後に剥がす
 */

export type LaunchArgSpec = {
  /** form input id 兼 result key (例: "volume") */
  key: string;
  /** 表示ラベル (例: "巻番号") */
  label: string;
  type?: "text" | "number";
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  min?: number;
  hint?: string;
};

export type LaunchModalConfig = {
  title: string;
  description?: string;
  /** 既に成果物がある場合の警告文。色は danger 系で表示される。 */
  warning?: string;
  args?: LaunchArgSpec[];
  confirmLabel?: string;
  cancelLabel?: string;
};

export type LaunchModalResult = Record<string, string>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureStyles(): void {
  if (document.getElementById("launch-modal-styles")) return;
  const style = document.createElement("style");
  style.id = "launch-modal-styles";
  style.textContent = `
    .nc-launch-modal__body { display: grid; gap: var(--space-3); padding: var(--space-4); }
    .nc-launch-modal__warning { color: var(--color-danger); font-weight: var(--fw-medium); margin: 0; }
    .nc-launch-modal__desc { color: var(--text-secondary); font-size: var(--fs-sm); margin: 0; }
    .nc-launch-modal__hint { color: var(--text-tertiary); font-size: var(--fs-xs); margin-top: 2px; }
    .nc-launch-modal__actions { display: flex; gap: var(--space-2); justify-content: flex-end; }
  `;
  document.head.appendChild(style);
}

function renderArgField(arg: LaunchArgSpec): string {
  const id = `nc-launch-arg-${arg.key}`;
  const type = arg.type ?? "text";
  const min = type === "number" && arg.min !== undefined ? ` min="${arg.min}"` : "";
  const required = arg.required ? " required" : "";
  const placeholder = arg.placeholder ? ` placeholder="${escapeHtml(arg.placeholder)}"` : "";
  const value = arg.defaultValue !== undefined ? ` value="${escapeHtml(arg.defaultValue)}"` : "";
  return `
    <label class="nc-field">
      <span class="nc-field__label">${escapeHtml(arg.label)}</span>
      <input class="nc-field__input" id="${id}" data-arg-key="${escapeHtml(arg.key)}" type="${type}"${value}${placeholder}${min}${required}>
      ${arg.hint ? `<span class="nc-launch-modal__hint">${escapeHtml(arg.hint)}</span>` : ""}
    </label>
  `;
}

export function openLaunchModal(config: LaunchModalConfig): Promise<LaunchModalResult | null> {
  ensureStyles();
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "nc-modal is-open";
    const argsHtml = (config.args ?? []).map(renderArgField).join("");
    root.innerHTML = `
      <div class="nc-modal__card nc-modal__card--sm">
        <div class="nc-launch-modal__body">
          <h3>${escapeHtml(config.title)}</h3>
          ${config.warning ? `<p class="nc-launch-modal__warning">${escapeHtml(config.warning)}</p>` : ""}
          ${config.description ? `<p class="nc-launch-modal__desc">${escapeHtml(config.description)}</p>` : ""}
          ${argsHtml}
          <div class="nc-launch-modal__actions">
            <button type="button" class="nc-button nc-button--secondary" data-action="cancel">${escapeHtml(config.cancelLabel ?? "キャンセル")}</button>
            <button type="button" class="nc-button nc-button--primary" data-action="confirm">${escapeHtml(config.confirmLabel ?? "実行")}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const dispose = (result: LaunchModalResult | null): void => {
      root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeydown);
      root.remove();
      resolve(result);
    };

    const collect = (): LaunchModalResult => {
      const out: LaunchModalResult = {};
      const inputs = root.querySelectorAll<HTMLInputElement>("[data-arg-key]");
      inputs.forEach((input) => {
        const key = input.dataset.argKey;
        if (!key) return;
        out[key] = input.value;
      });
      return out;
    };

    const onClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "cancel") dispose(null);
      else if (action === "confirm") dispose(collect());
      else if (target === root) dispose(null);
    };

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") dispose(null);
      else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) dispose(collect());
    };

    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);

    // 最初の入力欄に focus、なければ confirm に focus。
    const firstInput = root.querySelector<HTMLInputElement>("[data-arg-key]");
    if (firstInput) firstInput.focus();
    else root.querySelector<HTMLButtonElement>('[data-action="confirm"]')?.focus();
  });
}
