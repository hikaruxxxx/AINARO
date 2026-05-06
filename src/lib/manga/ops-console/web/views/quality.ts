import {
  ApiError,
  apiGetAuditOverrides,
  apiGetManifest,
  apiPostAuditOverride,
  type AuditOverrideAction,
  type AuditOverrideEntry,
  type Manifest,
} from "../lib/api";
import { store } from "../lib/store";
import { navigateToAiEdit, spawnLayerWithModal } from "../lib/layer-actions";

type AnyRecord = Record<string, unknown>;
type AuditFinding = {
  check_kind: string;
  panel_id: string;
  severity: string;
  message: string;
  passed?: boolean;
};

const CSS = `
.q-view { display: grid; gap: var(--space-3); }
.q-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.q-spacer { flex: 1 1 auto; }
.q-content { display: grid; gap: var(--space-3); }
.q-list { display: grid; gap: var(--space-2); }
.q-card { display: grid; gap: var(--space-2); }
.q-card__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.q-card h3,.q-card h4 { margin: 0; }
.q-meta { color: var(--text-tertiary); font-size: var(--fs-sm); overflow-wrap: anywhere; word-break: break-all; min-width: 0; }
.q-filters { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.q-findings { display: grid; gap: var(--space-2); }
.q-finding { display: grid; gap: 4px; padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.q-finding--override { opacity: 0.55; border-style: dashed; }
.q-finding__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.q-finding__actions { display: flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }
.q-finding__override-tag { font-size: var(--fs-xs); color: var(--text-tertiary); padding: 2px 6px; border-radius: var(--radius-sm); background: var(--surface-elevated); }
.q-panel-actions { margin-left: auto; }
.q-finding__reason { font-size: var(--fs-xs); color: var(--text-secondary); font-style: italic; }
`;

type ViewState = {
  slug: string;
  episode: number;
  manifest: Manifest | null;
  /** panel_id + check_kind 単位の最新 override (append-only JSONL を reduce した結果) */
  overrides: Map<string, AuditOverrideEntry>;
  selectedKinds: Set<string>;
  loading: boolean;
  error: string | null;
  /** override 入力中の対象 (panel_id, check_kind, action) */
  overridePrompt: { panelId: string; checkKind: string; action: AuditOverrideAction } | null;
};

function overrideKey(panelId: string, checkKind: string): string {
  return `${panelId}::${checkKind}`;
}

/** entries は append-only なので、同 panel_id + check_kind の最新行を取り、 clear なら削除する。 */
function reduceOverrides(entries: AuditOverrideEntry[]): Map<string, AuditOverrideEntry> {
  const map = new Map<string, AuditOverrideEntry>();
  for (const entry of entries) {
    const key = overrideKey(entry.panel_id, entry.check_kind);
    if (entry.action === "clear") map.delete(key);
    else map.set(key, entry);
  }
  return map;
}

function ensureStyles(): void {
  if (document.getElementById("q-styles")) return;
  const style = document.createElement("style");
  style.id = "q-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function jsonHtml(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function badgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "failed" || s === "error") return "nc-badge--danger";
  if (s === "passed" || s === "ok") return "nc-badge--success";
  return "nc-badge--neutral";
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function collectFindings(audit: unknown): AuditFinding[] {
  const obj = asRecord(audit);
  const result: AuditFinding[] = [];
  if (Array.isArray(obj.checks)) {
    for (const raw of obj.checks) {
      const check = asRecord(raw);
      result.push({
        check_kind: stringValue(check.check_kind, "unknown"),
        panel_id: stringValue(check.panel_id, "-"),
        severity: stringValue(check.severity, check.passed === false ? "error" : "warning"),
        message: stringValue(check.message, stringValue(check.detail, JSON.stringify(check))),
        passed: typeof check.passed === "boolean" ? check.passed : undefined,
      });
    }
  }
  if (Array.isArray(obj.panels)) {
    for (const rawPanel of obj.panels) {
      const panel = asRecord(rawPanel);
      const panelId = stringValue(panel.panel_id, stringValue(panel.id, "-"));
      const findings = Array.isArray(panel.findings) ? panel.findings : [];
      for (const rawFinding of findings) {
        const finding = asRecord(rawFinding);
        result.push({
          check_kind: stringValue(finding.check_kind, stringValue(finding.kind, "panel")),
          panel_id: panelId,
          severity: stringValue(finding.severity, stringValue(panel.status, "warning")),
          message: stringValue(finding.message, stringValue(finding.detail, JSON.stringify(finding))),
        });
      }
    }
  }
  return result;
}

function renderKindFilters(findings: AuditFinding[], selectedKinds: Set<string>): string {
  const kinds = Array.from(new Set(findings.map((finding) => finding.check_kind))).sort();
  if (kinds.length === 0) return "";
  return `<div class="q-filters">
    ${kinds.map((kind) => {
      const active = selectedKinds.has(kind);
      return `<button type="button" class="nc-pill${active ? " nc-pill--active" : ""}" data-q-kind="${escapeHtml(kind)}">${escapeHtml(kind)}</button>`;
    }).join("")}
  </div>`;
}

function renderAudit(
  manifest: Manifest,
  selectedKinds: Set<string>,
  overrides: Map<string, AuditOverrideEntry>
): string {
  const audit = manifest.audit;
  if (!audit) return `<div class="nc-empty">audit.json はまだ生成されていません</div>`;
  const obj = asRecord(audit);
  const panels = Array.isArray(obj.panels) ? obj.panels : [];
  const failed = Array.isArray(obj.failed_panel_ids) ? obj.failed_panel_ids : [];
  const findings = collectFindings(audit);
  const visibleFindings = findings.filter((finding) => selectedKinds.size === 0 || selectedKinds.has(finding.check_kind));
  const byPanel = new Map<string, AuditFinding[]>();
  for (const finding of visibleFindings) {
    const list = byPanel.get(finding.panel_id) ?? [];
    list.push(finding);
    byPanel.set(finding.panel_id, list);
  }
  // 自動カウント: override 適用後の真の failed 数を表示する。
  const overriddenCount = findings.filter((finding) => {
    const ov = overrides.get(overrideKey(finding.panel_id, finding.check_kind));
    return ov?.action === "ignore" || ov?.action === "fixed";
  }).length;

  const drilldown = Array.from(byPanel.entries()).map(([panelId, panelFindings]) => {
    const hasError = panelFindings.some((finding) => {
      if (finding.severity.toLowerCase() !== "error" && finding.passed !== false) return false;
      const ov = overrides.get(overrideKey(finding.panel_id, finding.check_kind));
      return !(ov?.action === "ignore" || ov?.action === "fixed");
    });
    return `<section class="nc-card q-card">
      <div class="q-card__head">
        <h4>${escapeHtml(panelId)}</h4>
        <span class="nc-badge ${hasError ? "nc-badge--danger" : "nc-badge--warning"}">${panelFindings.length} findings</span>
        <span class="q-panel-actions"><button type="button" class="nc-button nc-button--secondary nc-button--sm" data-q-revision-panel="${escapeHtml(panelId)}">修正指示する</button></span>
      </div>
      <div class="q-findings">
        ${panelFindings.map((finding) => {
          const ov = overrides.get(overrideKey(finding.panel_id, finding.check_kind));
          const isOverridden = ov?.action === "ignore" || ov?.action === "fixed";
          const overrideTag = ov?.action === "ignore"
            ? `<span class="q-finding__override-tag" title="${escapeHtml(ov.reason)}">false positive 扱い</span>`
            : ov?.action === "fixed"
              ? `<span class="q-finding__override-tag" title="${escapeHtml(ov.reason)}">対応済み</span>`
              : "";
          const reasonLine = isOverridden && ov?.reason
            ? `<div class="q-finding__reason">理由: ${escapeHtml(ov.reason)}</div>`
            : "";
          const actions = isOverridden
            ? `<button type="button" class="nc-button nc-button--ghost nc-button--sm" data-q-override="clear" data-q-panel="${escapeHtml(finding.panel_id)}" data-q-kind-id="${escapeHtml(finding.check_kind)}">override 解除</button>`
            : `<button type="button" class="nc-button nc-button--secondary nc-button--sm" data-q-override="ignore" data-q-panel="${escapeHtml(finding.panel_id)}" data-q-kind-id="${escapeHtml(finding.check_kind)}">false positive</button>
               <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-q-override="fixed" data-q-panel="${escapeHtml(finding.panel_id)}" data-q-kind-id="${escapeHtml(finding.check_kind)}">対応済み</button>`;
          return `<div class="q-finding${isOverridden ? " q-finding--override" : ""}">
            <div class="q-finding__head">
              <span class="nc-badge ${badgeClass(finding.severity)}">${escapeHtml(finding.severity)}</span>
              <span class="q-meta">${escapeHtml(finding.check_kind)}</span>
              ${overrideTag}
              <div class="q-finding__actions">${actions}</div>
            </div>
            <div>${escapeHtml(finding.message)}</div>
            ${reasonLine}
          </div>`;
        }).join("")}
      </div>
    </section>`;
  }).join("");
  return `
    <div class="q-content">
      <section class="nc-card q-card">
        <div class="q-card__head">
          <h3>サマリ</h3>
          <span class="nc-badge ${failed.length > 0 ? "nc-badge--danger" : "nc-badge--success"}">失敗 ${failed.length} 件</span>
          ${overriddenCount > 0 ? `<span class="nc-badge nc-badge--neutral">override 済 ${overriddenCount} 件</span>` : ""}
        </div>
        <pre class="nc-code-block">${jsonHtml(obj.summary ?? {})}</pre>
        <div class="q-meta">失敗 panel ID 一覧: ${escapeHtml(JSON.stringify(failed))}</div>
      </section>
      ${renderKindFilters(findings, selectedKinds)}
      <div class="q-list">
        ${drilldown || '<div class="nc-empty">選択中の check_kind に該当する所見はありません。</div>'}
      </div>
      <div class="q-list">
        ${panels.map((panel) => {
          const p = asRecord(panel);
          const status = String(p.status ?? "unknown");
          const id = String(p.panel_id ?? p.id ?? "-");
          return `<section class="nc-card q-card">
            <div class="q-card__head">
              <h4>${escapeHtml(id)}</h4>
              <span class="nc-badge ${badgeClass(status)}">${escapeHtml(status)}</span>
            </div>
            <div class="q-meta">理由・所見: ${escapeHtml(JSON.stringify(p.reasons ?? p.findings ?? []))}</div>
          </section>`;
        }).join("")}
      </div>
      <details class="nc-card q-card">
        <summary>監査結果の生 JSON</summary>
        <pre class="nc-code-block">${jsonHtml(audit)}</pre>
      </details>
    </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const scope = `${state.slug} / ep${String(state.episode).padStart(2, "0")}`;
  const body = (() => {
    if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
    if (state.error && !state.manifest) return `<div class="view-placeholder"><h2>品質監査 (Audit)</h2><p>${escapeHtml(state.error)}</p></div>`;
    if (!state.manifest) return `<div class="nc-empty">manifest が読み込まれていません。</div>`;
    return renderAudit(state.manifest, state.selectedKinds, state.overrides);
  })();
  const promptModal = state.overridePrompt
    ? `<div class="nc-modal is-open"><div class="nc-modal__card nc-modal__card--sm" style="padding: var(--space-4); display: grid; gap: var(--space-3);">
        <h3 style="margin: 0;">${state.overridePrompt.action === "ignore" ? "false positive 扱いにする" : state.overridePrompt.action === "fixed" ? "対応済みにする" : "override を解除する"}</h3>
        <div class="q-meta">panel ${escapeHtml(state.overridePrompt.panelId)} / ${escapeHtml(state.overridePrompt.checkKind)}</div>
        <label class="nc-field"><span class="nc-field__label">理由 (audit_overrides.jsonl に残ります)</span>
          <input class="nc-field__input" id="q-override-reason" placeholder="例: 実画像は問題なし、検出側のしきい値ミス">
        </label>
        <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
          <button type="button" class="nc-button nc-button--secondary" data-q-override-cancel>キャンセル</button>
          <button type="button" class="nc-button nc-button--primary" data-q-override-confirm>確定</button>
        </div>
      </div></div>`
    : "";
  container.innerHTML = `
    <div class="q-view">
      <div class="nc-toolbar">
        <h2 class="nc-toolbar__title">品質監査 (Audit)</h2>
        <span class="q-info">${escapeHtml(scope)}</span>
        <span class="q-spacer"></span>
        <button type="button" class="nc-button nc-button--secondary" data-action="reload" ${state.loading ? "disabled" : ""}>再読込</button>
        <button type="button" class="nc-button nc-button--secondary" data-action="rerun-L11" title="L11 Audit を再実行">L11 を再実行</button>
        <button type="button" class="nc-button nc-button--ghost" data-ai-edit-layer="L11" title="AI 編集 view へ遷移し、L11 Audit の context を prefill します">L11 を AI で修正</button>
      </div>
      <div class="q-content">${body}</div>
    </div>${promptModal}`;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    state.manifest = await apiGetManifest(state.slug, state.episode);
  } catch (error) {
    state.manifest = null;
    state.error = errorText(error);
  }
  try {
    const result = await apiGetAuditOverrides(state.slug, state.episode);
    state.overrides = reduceOverrides(result.entries);
  } catch {
    // override は補助情報なので、取得失敗時は空でも UI は描画する。
    state.overrides = new Map();
  }
  state.loading = false;
  render(container, state);
}

export function mountQualityView(container: HTMLElement): () => void {
  ensureStyles();
  const controller = new AbortController();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    episode: app.currentEpisode || app.defaultEpisode,
    manifest: null,
    overrides: new Map(),
    selectedKinds: new Set(),
    loading: false,
    error: null,
    overridePrompt: null,
  };

  void refresh(state, container);

  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-action='reload']")) void refresh(state, container);
    const aiLayer = target.closest<HTMLButtonElement>("[data-ai-edit-layer]")?.dataset.aiEditLayer;
    if (aiLayer) {
      navigateToAiEdit(aiLayer, { slug: state.slug, episode: state.episode });
      return;
    }
    if (target.closest("[data-action='rerun-L11']")) {
      void spawnLayerWithModal({
        layer: "L11",
        status: state.manifest?.audit ? "ready" : "missing",
        slug: state.slug,
        episode: state.episode,
        callbacks: {
          onSuccess: () => void refresh(state, container),
          onError: (msg) => alert(msg),
        },
      });
      return;
    }
    const kind = target.closest<HTMLElement>("[data-q-kind]")?.dataset.qKind;
    if (kind) {
      if (state.selectedKinds.has(kind)) state.selectedKinds.delete(kind);
      else state.selectedKinds.add(kind);
      render(container, state);
      return;
    }
    // override 入力 modal を開く / キャンセル / 確定。
    const overrideBtn = target.closest<HTMLButtonElement>("[data-q-override]");
    if (overrideBtn) {
      const action = overrideBtn.dataset.qOverride as AuditOverrideAction | undefined;
      const panelId = overrideBtn.dataset.qPanel ?? "";
      const checkKind = overrideBtn.dataset.qKindId ?? "";
      if (!action || !panelId || !checkKind) return;
      // clear は即時反映 (理由不要)。ignore / fixed は modal を出す。
      if (action === "clear") {
        void apiPostAuditOverride(state.slug, state.episode, {
          panel_id: panelId,
          check_kind: checkKind,
          action: "clear",
          reason: "",
        })
          .then(() => refresh(state, container))
          .catch((error) => alert(`override 解除に失敗: ${errorText(error)}`));
        return;
      }
      state.overridePrompt = { panelId, checkKind, action };
      render(container, state);
      return;
    }
    if (target.closest("[data-q-override-cancel]")) {
      state.overridePrompt = null;
      render(container, state);
      return;
    }
    if (target.closest("[data-q-override-confirm]") && state.overridePrompt) {
      const reason = container.querySelector<HTMLInputElement>("#q-override-reason")?.value.trim() ?? "";
      const { panelId, checkKind, action } = state.overridePrompt;
      state.overridePrompt = null;
      void apiPostAuditOverride(state.slug, state.episode, {
        panel_id: panelId,
        check_kind: checkKind,
        action,
        reason,
      })
        .then(() => refresh(state, container))
        .catch((error) => alert(`override 保存に失敗: ${errorText(error)}`));
      return;
    }
    if (target.closest("[data-q-revision-panel]")) {
      store.update({ currentView: "revision" });
    }
  }, { signal: controller.signal });

  return () => {
    controller.abort();
    container.innerHTML = "";
  };
}
