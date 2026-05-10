/**
 * Phase X WX-5 Console UI: 商標 / IP 類似チェックの人間判定
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WX-5 + Console 必須拡張
 *   - docs/strategy/kdp_account_safety.md §3 商標 / IP 類似チェック
 *
 * MVP スコープ:
 *   - 検索URL一覧表示 (J-PlatPat / USPTO / Amazon JP/US)
 *   - 「すべての URL を新規タブで開く」一括ボタン
 *   - 全体判定 (trademarkPassed / ipSimilarityPassed) の checkbox
 *   - メモ入力 (notes)
 *   - 保存ボタン → kdp-release.json の rights_check を更新
 *
 * Phase Y 改善予定:
 *   - キーワード単位の passed/flagged 切替 UI
 *   - 自動 fetch 結果の表示
 *   - 出版社OS ダッシュボードとの統合
 */

import {
  ApiError,
  apiGetTrademarkCheck,
  apiPostTrademarkCheck,
  type RightsCheckClient,
  type TrademarkCheckGetResponse,
  type TrademarkSearchSourceClient,
} from "../lib/api";
import { store } from "../lib/store";

type Toast = {
  message: string;
  kind: "success" | "warning" | "danger" | "info";
};

type ViewState = {
  slug: string;
  volume: number;
  data: TrademarkCheckGetResponse | null;
  loading: boolean;
  saving: boolean;
  trademarkPassed: boolean;
  ipSimilarityPassed: boolean;
  notes: string;
  error: string | null;
  toast: Toast | null;
};

const CSS = `
.tmk-view { display: grid; gap: var(--space-3); max-width: 1100px; }
.tmk-head { display:flex; align-items:baseline; gap:var(--space-3); flex-wrap:wrap; }
.tmk-head h2 { margin:0; font-size: var(--fs-xl); }
.tmk-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.tmk-spacer { flex: 1 1 auto; }
.tmk-controls { display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap; }
.tmk-volume-input { width: 80px; }
.tmk-table { width:100%; border-collapse: collapse; background: var(--surface-base); border:1px solid var(--border-default); border-radius: 8px; overflow: hidden; }
.tmk-table th, .tmk-table td { padding: var(--space-2) var(--space-3); text-align: left; border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-sm); vertical-align: top; }
.tmk-table th { background: var(--surface-subtle); font-weight: 600; color: var(--text-secondary); }
.tmk-table td:last-child { white-space: normal; }
.tmk-target-kind { color: var(--text-secondary); font-size: var(--fs-xs); text-transform: uppercase; }
.tmk-target-keyword { font-weight: 600; }
.tmk-source-list { display:grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
.tmk-source-row { display:flex; gap: var(--space-2); align-items:center; }
.tmk-source-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: var(--fs-xs); width: 110px; color: var(--text-secondary); }
.tmk-source-link { color: var(--color-primary); text-decoration: none; }
.tmk-source-link:hover { text-decoration: underline; }
.tmk-source-intent { color: var(--text-tertiary); font-size: var(--fs-xs); }
.tmk-judgement { display:grid; gap: var(--space-3); padding: var(--space-3); background: var(--surface-subtle); border:1px solid var(--border-subtle); border-radius:8px; }
.tmk-judgement h3 { margin: 0 0 var(--space-2); font-size: var(--fs-lg); }
.tmk-checkrow { display:flex; gap: var(--space-2); align-items:center; }
.tmk-current { display:grid; gap: var(--space-1); padding: var(--space-2) var(--space-3); border-radius:6px; }
.tmk-current--passed { background: var(--surface-success-subtle, #ecfdf5); color: var(--text-success, #047857); }
.tmk-current--flagged { background: var(--surface-warning-subtle, #fef3c7); color: var(--text-warning, #92400e); }
.tmk-current--none { background: var(--surface-subtle); color: var(--text-secondary); }
.tmk-empty { padding: var(--space-4); text-align: center; color: var(--text-secondary); border: 1px dashed var(--border-subtle); border-radius: 8px; background: var(--surface-base); }
.tmk-error { padding: var(--space-3); border: 1px solid var(--color-danger); border-radius: 6px; background: var(--surface-danger-subtle, #fee2e2); color: var(--color-danger); }
`;

function ensureStyles(): void {
  if (document.getElementById("tmk-styles")) return;
  const style = document.createElement("style");
  style.id = "tmk-styles";
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

function sourceLabel(source: TrademarkSearchSourceClient["source"]): string {
  switch (source) {
    case "j_platpat":
      return "J-PlatPat (JP)";
    case "uspto_tess":
      return "USPTO (US)";
    case "amazon_jp":
      return "Amazon.co.jp";
    case "amazon_us":
      return "Amazon.com";
  }
}

function renderCurrent(rights: RightsCheckClient | null): string {
  if (!rights) {
    return `<div class="tmk-current tmk-current--none">未判定 (rights_check 未設定)</div>`;
  }
  const passed = rights.trademark_passed && rights.ip_similarity_passed;
  const cls = passed ? "tmk-current--passed" : "tmk-current--flagged";
  const label = passed ? "✅ passed" : "⚠️ flagged";
  return `
    <div class="tmk-current ${cls}">
      <strong>${label}</strong>
      <div>trademark_passed: ${rights.trademark_passed} / ip_similarity_passed: ${rights.ip_similarity_passed}</div>
      <div class="tmk-info">checked_at: ${escapeHtml(rights.checked_at)}</div>
      ${rights.notes ? `<div class="tmk-info">notes: ${escapeHtml(rights.notes)}</div>` : ""}
    </div>
  `;
}

function renderTable(state: ViewState): string {
  if (!state.data) return "";
  const searches = state.data.checkResult.searches;
  if (searches.length === 0) {
    return `<div class="tmk-empty">チェック対象キーワードが0件です。kdp-release.json の title/subtitle、bible のキャラクター情報、または phase-a-pen-names.json の labelName が空の可能性があります。</div>`;
  }
  const rows = searches
    .map((s) => {
      const sources = s.sources
        .map(
          (src) => `
        <li class="tmk-source-row">
          <span class="tmk-source-name">${sourceLabel(src.source)}</span>
          <a class="tmk-source-link" href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer">開く</a>
          <span class="tmk-source-intent">${escapeHtml(src.intent)}</span>
        </li>`,
        )
        .join("");
      return `
        <tr>
          <td>
            <div class="tmk-target-kind">${escapeHtml(s.target.kind)}</div>
            <div class="tmk-target-keyword">${escapeHtml(s.target.keyword)}</div>
          </td>
          <td>
            <ul class="tmk-source-list">${sources}</ul>
          </td>
        </tr>
      `;
    })
    .join("");
  return `
    <table class="tmk-table">
      <thead>
        <tr>
          <th style="width: 30%;">対象キーワード</th>
          <th>検索 URL (新規タブで開いて確認)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderJudgement(state: ViewState): string {
  const releaseExists = state.data?.releaseExists ?? false;
  const disabled = state.saving || !releaseExists;
  const tmChecked = state.trademarkPassed ? "checked" : "";
  const ipChecked = state.ipSimilarityPassed ? "checked" : "";
  return `
    <div class="tmk-judgement">
      <h3>人間判定</h3>
      ${
        releaseExists
          ? ""
          : `<div class="tmk-info">⚠️ KDP 入稿パッケージ (L13) をまだ生成していません。先に L13 を実行してから人間判定を保存してください。</div>`
      }
      <label class="tmk-checkrow">
        <input type="checkbox" data-tmk-toggle="trademark" ${tmChecked} ${state.saving ? "disabled" : ""}>
        <span>trademark_passed: 商標的に問題なし (J-PlatPat / USPTO で類似商標なし)</span>
      </label>
      <label class="tmk-checkrow">
        <input type="checkbox" data-tmk-toggle="ip" ${ipChecked} ${state.saving ? "disabled" : ""}>
        <span>ip_similarity_passed: 既存IPとの類似なし (Amazon search で同名/類似タイトルなし)</span>
      </label>
      <label class="nc-field">
        <span class="nc-field__label">notes (任意)</span>
        <textarea class="nc-field__input" data-tmk-notes rows="3" placeholder="flagged キーワードや判定理由をメモ" ${state.saving ? "disabled" : ""}>${escapeHtml(state.notes)}</textarea>
      </label>
      <div class="tmk-controls">
        <span class="tmk-spacer"></span>
        <button type="button" class="nc-button nc-button--ghost" data-action="open-all" ${state.data ? "" : "disabled"}>すべての URL を新規タブで開く</button>
        <button type="button" class="nc-button nc-button--primary" data-action="save" ${disabled ? "disabled" : ""}>${state.saving ? "保存中..." : "rights_check を保存"}</button>
      </div>
    </div>
  `;
}

function render(container: HTMLElement, state: ViewState): void {
  const head = `
    <div class="tmk-head">
      <h2>商標 / IP チェック</h2>
      <span class="tmk-info">slug: ${escapeHtml(state.slug || "(未選択)")} / vol: v${String(state.volume).padStart(2, "0")}</span>
      <span class="tmk-spacer"></span>
      <label class="nc-field" style="margin: 0;">
        <span class="nc-field__label">巻番号</span>
        <input type="number" min="1" max="99" class="nc-field__input tmk-volume-input" data-tmk-volume value="${state.volume}" ${state.saving ? "disabled" : ""}>
      </label>
      <button type="button" class="nc-button nc-button--ghost" data-action="reload" ${state.loading ? "disabled" : ""}>${state.loading ? "読込中..." : "再読込"}</button>
    </div>
  `;

  const body = state.error
    ? `<div class="tmk-error">${escapeHtml(state.error)}</div>`
    : state.data
      ? `
        ${renderCurrent(state.data.currentRightsCheck)}
        ${renderTable(state)}
        ${renderJudgement(state)}
      `
      : state.loading
        ? `<div class="tmk-empty">読み込み中...</div>`
        : `<div class="tmk-empty">slug / volume を指定して「再読込」を押してください。</div>`;

  container.innerHTML = `
    <div class="tmk-view">
      ${head}
      ${body}
    </div>
    ${state.toast ? `<div class="nc-toast nc-toast--${state.toast.kind}">${escapeHtml(state.toast.message)}</div>` : ""}
  `;
}

function setToast(state: ViewState, container: HTMLElement, message: string, kind: Toast["kind"]): void {
  state.toast = { message, kind };
  render(container, state);
  window.setTimeout(() => {
    if (state.toast?.message !== message) return;
    state.toast = null;
    render(container, state);
  }, 3000);
}

async function loadData(state: ViewState, container: HTMLElement): Promise<void> {
  if (!state.slug) {
    state.error = "slug が未設定です。作品一覧から作品を選んでください。";
    state.data = null;
    render(container, state);
    return;
  }
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    const data = await apiGetTrademarkCheck(state.slug, state.volume);
    state.data = data;
    if (data.currentRightsCheck) {
      state.trademarkPassed = data.currentRightsCheck.trademark_passed;
      state.ipSimilarityPassed = data.currentRightsCheck.ip_similarity_passed;
      state.notes = data.currentRightsCheck.notes ?? "";
    } else {
      state.trademarkPassed = false;
      state.ipSimilarityPassed = false;
      state.notes = "";
    }
    state.error = null;
  } catch (e) {
    state.error = errorText(e);
    state.data = null;
  } finally {
    state.loading = false;
    render(container, state);
  }
}

async function saveJudgement(state: ViewState, container: HTMLElement): Promise<void> {
  if (!state.slug || !state.data) return;
  state.saving = true;
  render(container, state);
  try {
    const result = await apiPostTrademarkCheck(state.slug, state.volume, {
      trademarkPassed: state.trademarkPassed,
      ipSimilarityPassed: state.ipSimilarityPassed,
      notes: state.notes.trim() || undefined,
    });
    setToast(state, container, result.message, "success");
    // 保存後再読込
    await loadData(state, container);
  } catch (e) {
    setToast(state, container, `保存失敗: ${errorText(e)}`, "danger");
  } finally {
    state.saving = false;
    render(container, state);
  }
}

function openAllUrls(state: ViewState): void {
  if (!state.data) return;
  // Codex レビュー mid: 大量タブ対策で件数表示 + 確認
  const totalUrls = state.data.checkResult.searches.reduce(
    (sum, s) => sum + s.sources.length,
    0,
  );
  if (totalUrls === 0) return;
  if (totalUrls > 8) {
    const ok = window.confirm(
      `${totalUrls} 個のタブを開きます (キーワード ${state.data.checkResult.searches.length} × 検索元 4)。\n\nブラウザのポップアップブロッカに引っかかる可能性があります。続行しますか?`,
    );
    if (!ok) return;
  }
  for (const s of state.data.checkResult.searches) {
    for (const src of s.sources) {
      window.open(src.url, "_blank", "noopener,noreferrer");
    }
  }
}

export function mountTrademarkGateView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const state: ViewState = {
    slug: store.state.currentSlug,
    volume: 1,
    data: null,
    loading: false,
    saving: false,
    trademarkPassed: false,
    ipSimilarityPassed: false,
    notes: "",
    error: null,
    toast: null,
  };

  const unsubscribe = store.subscribe((s) => {
    if (s.currentSlug !== state.slug) {
      state.slug = s.currentSlug;
      state.data = null;
      state.error = null;
      render(container, state);
    }
  });

  container.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
      if (action === "reload") {
        void loadData(state, container);
        return;
      }
      if (action === "save") {
        void saveJudgement(state, container);
        return;
      }
      if (action === "open-all") {
        openAllUrls(state);
        return;
      }
    },
    { signal: controller.signal },
  );

  container.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      if (target.dataset.tmkToggle === "trademark") {
        state.trademarkPassed = (target as HTMLInputElement).checked;
        return;
      }
      if (target.dataset.tmkToggle === "ip") {
        state.ipSimilarityPassed = (target as HTMLInputElement).checked;
        return;
      }
      if (target instanceof HTMLInputElement && target.dataset.tmkVolume !== undefined) {
        const v = Number(target.value);
        if (Number.isInteger(v) && v >= 1 && v <= 99) {
          state.volume = v;
        }
        return;
      }
    },
    { signal: controller.signal },
  );

  container.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement && target.dataset.tmkNotes !== undefined) {
        state.notes = target.value;
      }
    },
    { signal: controller.signal },
  );

  // 初期読込 (slug が設定されていれば)
  if (state.slug) {
    void loadData(state, container);
  } else {
    render(container, state);
  }

  return () => {
    controller.abort();
    unsubscribe();
    container.innerHTML = "";
  };
}
