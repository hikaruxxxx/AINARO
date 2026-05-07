import {
  ApiError,
  apiGetManifest,
  apiGetNameApproval,
  apiGetNameManifest,
  apiPostNameApproval,
  type Manifest,
  type NameManifest,
} from "../lib/api";
import { store } from "../lib/store";
import { isRunnableLayer, navigateToAiEdit, spawnLayerWithModal } from "../lib/layer-actions";
import type {
  NameAuditFindingLite,
  NamePageDecision,
  NamePageStatus,
  NameRejectReason,
  NameWarning,
} from "../../../name-preview/types";

type StoryboardTab = "storyboard" | "page-plan" | "resolved-refs" | "raw";

type PageDetailModal = {
  source: "storyboard" | "page-plan";
  pageNo: number;
};

type OriginalDraftState = {
  slug: string;
  episode: number;
  tab: StoryboardTab;
  manifest: Manifest | null;
  loading: boolean;
  error: string | null;
  copied: string | null;
  pageModal: PageDetailModal | null;
  runningLayer: string | null;
};

type DecisionDraft = {
  status: NamePageStatus;
  reasons: NameRejectReason[];
  note: string;
  persistFailed: boolean;
};

const REASONS: Array<{ key: NameRejectReason; label: string }> = [
  { key: "story_problem", label: "[1] story" },
  { key: "panel_problem", label: "[2] panel" },
  { key: "layout_problem", label: "[3] layout" },
  { key: "dialogue_problem", label: "[4] dialogue" },
  { key: "continuity_problem", label: "[5] continuity" },
  { key: "render_risk", label: "[6] render risk" },
];

const STORYBOARD_TABS: Array<{ id: StoryboardTab; label: string; key: string }> = [
  { id: "storyboard", label: "原案", key: "1" },
  { id: "page-plan", label: "ページ配置", key: "2" },
  { id: "resolved-refs", label: "参照画像", key: "3" },
  { id: "raw", label: "生 JSON", key: "4" },
];

const NAME_GATE_CSS = `
.name-gate-container { display: grid; grid-template-rows: auto auto auto 1fr; gap: 14px; }
.name-gate-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  row-gap: 8px;
  padding: 12px 14px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  background: var(--surface-elevated);
}
.name-gate-toolbar h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
.name-gate-toolbar .info { min-width: 0; max-inline-size: min(72ch, 100%); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #64748b; font-size: 13px; }
.name-gate-toolbar .summary { margin-left: auto; color: #334155; font-size: 13px; }
.ng-kpis { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.ng-kpi { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; font-size: var(--fs-sm); font-weight: 700; }
.ng-kpi--pending { background: #fef3c7; color: #92400e; }
.ng-kpi--approved { background: #d1fae5; color: #065f46; }
.ng-kpi--rejected { background: #fee2e2; color: #991b1b; }
.name-gate-toolbar strong { font-weight: 700; }
.name-gate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; }
.name-gate-container .page-card {
  background: #fff;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  outline: none;
  transition: border-color .12s, box-shadow .12s;
}
.name-gate-container .page-card:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.18); }
.name-gate-container .page-card.ng-page--focused { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.name-gate-container .page-card.approved { border-color: #16a34a; }
.name-gate-container .page-card.rejected { border-color: #dc2626; }
.name-gate-container .page-card header {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 8px;
  font-size: 14px;
}
.name-gate-container .page-no { font-weight: 700; font-size: 16px; }
.name-gate-container .page-role { color: #6b7280; }
.name-gate-container .panel-count { color: #6b7280; margin-left: auto; }
.name-gate-container .status {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
.name-gate-container .status-pending { background: #fef3c7; color: #92400e; }
.name-gate-container .status-approved { background: #d1fae5; color: #065f46; }
.name-gate-container .status-rejected { background: #fee2e2; color: #991b1b; }
.name-gate-container .persist-error { margin-left: 6px; color: #991b1b; font-size: 11px; text-transform: none; }
.name-gate-container .svg-wrap { aspect-ratio: 1748 / 2480; background: #fafafa; border: 1px solid #e5e7eb; }
.name-gate-container .svg-wrap img { display: block; width: 100%; height: 100%; pointer-events: none; }
.name-gate-container .warnings { padding: 8px 0; font-size: 12px; line-height: 1.5; }
.name-gate-container .warnings .ok { color: #16a34a; }
.name-gate-container .warnings .warn { display: block; }
.name-gate-container .warnings .sev-error { color: #991b1b; font-weight: 600; }
.name-gate-container .warnings .sev-warn { color: #b45309; }
.name-gate-container .warnings .sev-info { color: #6b7280; }
.name-gate-container .reasons { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 6px 0; font-size: 12px; }
.name-gate-container .reasons label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.name-gate-container .page-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 0 0; }
.name-gate-container textarea.note {
  width: 100%;
  min-height: 36px;
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-family: inherit;
  resize: vertical;
}
.name-gate-help { color: #64748b; font-size: 12px; line-height: 1.6; }
.name-gate-help code { background: #eef2f6; padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace; }
.ng-section { display: grid; gap: 12px; }
.ng-section-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0; font-size: 16px; }
.ng-original { display: grid; gap: var(--space-3); scroll-margin-top: 84px; }
.ng-original__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.ng-original__head h3 { margin: 0; font-size: 16px; }
.ng-original__spacer { flex: 1 1 auto; }
.ng-tabs { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.ng-original-content { display: grid; gap: var(--space-3); }
.sb-info { color: var(--text-secondary); font-size: var(--fs-sm); }
.sb-list { display: grid; gap: var(--space-2); }
.sb-page { display: grid; gap: var(--space-2); cursor: zoom-in; transition: box-shadow 120ms; }
.sb-page:hover { box-shadow: 0 0 0 2px rgba(37,99,235,0.35); }
.sb-page__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.sb-page__title { margin: 0; font-size: var(--fs-lg); }
.sb-panels { display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.sb-panel { display: grid; gap: var(--space-2); }
.sb-panel h4 { margin: 0; font-size: var(--fs-md); }
.sb-meta { color: var(--text-tertiary); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.sb-text { color: var(--text-secondary); font-size: var(--fs-base); line-height: 1.55; }
.sb-details { display: grid; gap: var(--space-2); }
.sb-copy { justify-self: start; }
.sb-modal { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,0.55); }
.sb-modal-card { width: min(1200px, 96vw); max-height: 96vh; overflow: auto; padding: 16px 20px; border-radius: 8px; background: var(--surface-elevated, #fff); box-shadow: 0 12px 42px rgba(15,23,42,0.32); display: grid; gap: 12px; direction: ltr; }
.sb-modal-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sb-modal-title { margin: 0; font-size: var(--fs-lg, 18px); }
.sb-modal-meta { color: var(--text-secondary, #64748b); font-size: 12px; flex: 1 1 auto; }
.sb-modal-close { background: var(--surface-elevated, #fff); border: 1px solid var(--border-subtle, #d1d5db); color: var(--text-primary, #111827); padding: 4px 10px; font-size: 12px; border-radius: 4px; cursor: pointer; }
.sb-modal-nav { display: flex; gap: 6px; }
.sb-modal-nav button { background: var(--surface-elevated, #fff); border: 1px solid var(--border-subtle, #d1d5db); padding: 4px 10px; font-size: 12px; border-radius: 4px; cursor: pointer; }
.sb-modal-nav button:disabled { opacity: 0.5; cursor: not-allowed; }
.sb-panel-grid { display: grid; gap: var(--space-2, 10px); grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.sb-panel-card { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--border-subtle, #d1d5db); border-radius: 6px; background: var(--surface-sunken, #f8fafc); }
.sb-panel-card h4 { margin: 0; font-size: var(--fs-md, 14px); }
.sb-panel-card .sb-meta { font-size: 11px; }
.sb-panel-card .sb-line { font-size: 13px; line-height: 1.5; color: var(--text-primary, #111827); padding: 2px 0; }
.sb-panel-card .sb-line--dialogue { color: #1e40af; }
.sb-panel-card .sb-line--monologue { color: #6d28d9; }
.sb-panel-card .sb-line--narration { color: #475569; }
.sb-panel-card .sb-line--sfx { color: #b45309; font-weight: 700; }
.sb-panel-card .sb-line--action { color: #047857; font-style: italic; }
.sb-modal-hint { color: var(--text-tertiary, #6b7280); font-size: 11px; }
.ng-modal-backdrop { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 18px; background: rgba(15, 23, 42, .38); }
.ng-modal { width: min(520px, 100%); display: grid; gap: 12px; padding: 16px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--surface-elevated); box-shadow: var(--shadow-3); }
.ng-modal h3 { margin: 0; font-size: 18px; }
.ng-modal .reasons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ng-modal .reasons label { display: flex; align-items: center; gap: 6px; padding: 8px; border: 1px solid var(--border-subtle); border-radius: 6px; cursor: pointer; }
.ng-modal textarea { width: 100%; min-height: 72px; padding: 8px; border: 1px solid var(--border-default); border-radius: 6px; font-family: inherit; }
.ng-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ng-help-panel { position: fixed; right: 18px; top: 76px; z-index: 31; width: min(360px, calc(100vw - 36px)); padding: 14px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--surface-elevated); box-shadow: var(--shadow-2); }
.ng-help-panel h3 { margin: 0 0 8px; font-size: 16px; }
.ng-help-panel dl { margin: 0; display: grid; grid-template-columns: 76px 1fr; gap: 6px 10px; font-size: 13px; }
.ng-help-panel dt { font-family: ui-monospace, monospace; font-weight: 700; color: var(--text-primary); }
.ng-help-panel dd { margin: 0; color: var(--text-secondary); }
`;

function ensureStyles(): void {
  if (document.getElementById("ng-styles")) return;
  const style = document.createElement("style");
  style.id = "ng-styles";
  style.textContent = NAME_GATE_CSS;
  document.head.appendChild(style);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonHtml(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  return error instanceof Error ? error.message : String(error);
}

function renderOriginalTabs(active: StoryboardTab): string {
  return `<div class="ng-tabs">${STORYBOARD_TABS.map((tab) => `<button type="button" class="nc-pill${tab.id === active ? " nc-pill--active" : ""}" data-ng-sb-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}</div>`;
}

function epLabel(episode: number): string {
  return `ep${String(episode).padStart(2, "0")}`;
}

function legacySvgPath(episode: number, svgFilename: string): string {
  if (svgFilename.startsWith("/")) return svgFilename;
  // SPA URL `/works/<slug>/episodes/<epNN>/` から相対解決させる (絶対パスだと slug が抜けて 404)
  void episode;
  return `name/${svgFilename}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isRejectReason(value: string | undefined): value is NameRejectReason {
  return REASONS.some((r) => r.key === value);
}

function renderStoryboard(manifest: Manifest): string {
  const pages = manifest.storyboard?.pages ?? [];
  if (pages.length === 0) return `<div class="nc-empty">ネーム原案のページが空です。</div>`;
  return `<div class="sb-list">${pages.map((page: any) => {
    const panels = Array.isArray(page.panels) ? page.panels : [];
    const pageNo = Number(page.page_no);
    const clickAttrs = Number.isFinite(pageNo)
      ? ` data-ng-sb-page-modal="storyboard" data-ng-sb-page-no="${pageNo}"`
      : "";
    return `
      <section class="nc-card sb-page"${clickAttrs}>
        <div class="sb-page__head">
          <h3 class="sb-page__title">ページ ${escapeHtml(String(page.page_no ?? "-"))}</h3>
          ${page.role ? `<span class="nc-badge nc-badge--neutral">${escapeHtml(String(page.role))}</span>` : ""}
        </div>
        <div class="sb-panels">
          ${panels.map((panel: any) => `
            <article class="nc-card nc-card--sunken sb-panel">
              <h4>${escapeHtml(String(panel.panel_id ?? "-"))}</h4>
              <div class="sb-meta">順序=${escapeHtml(String(panel.reading_order ?? "-"))} / ショット=${escapeHtml(String(panel.shot_type ?? "-"))}</div>
              <div class="sb-text">${escapeHtml((() => {
                const extract = (item: any): string => typeof item === "string" ? item : (item?.text ?? "");
                const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
                return [...arr(panel.dialogue), ...arr(panel.monologue), ...arr(panel.narration)]
                  .map(extract).filter(Boolean).join(" / ") || "(テキストなし)";
              })())}</div>
            </article>`).join("")}
        </div>
        <details class="sb-details">
          <summary>ページの生 JSON</summary>
          <pre class="nc-code-block">${jsonHtml(page)}</pre>
        </details>
      </section>`;
  }).join("")}</div>`;
}

function renderPagePlan(manifest: Manifest): string {
  const pages = manifest.page_plan?.pages ?? [];
  if (pages.length === 0) return `<div class="nc-empty">ページ配置データが空です。</div>`;
  return `<div class="sb-list">${pages.map((page: any) => {
    const panels = Array.isArray(page.panels) ? page.panels : [];
    const pageNo = Number(page.page_no);
    const clickAttrs = Number.isFinite(pageNo)
      ? ` data-ng-sb-page-modal="page-plan" data-ng-sb-page-no="${pageNo}"`
      : "";
    return `
      <section class="nc-card sb-page"${clickAttrs}>
        <div class="sb-page__head">
          <h3 class="sb-page__title">ページ ${escapeHtml(String(page.page_no ?? "-"))}</h3>
          ${page.render_strategy ? `<span class="nc-badge nc-badge--info">${escapeHtml(String(page.render_strategy))}</span>` : ""}
        </div>
        <div class="sb-panels">
          ${panels.map((panel: any) => `
            <article class="nc-card nc-card--sunken sb-panel">
              <h4>${escapeHtml(String(panel.panel_id ?? "-"))}</h4>
              <div class="sb-meta">順序=${escapeHtml(String(panel.reading_order ?? "-"))} / 重要度=${escapeHtml(String(panel.importance ?? "-"))} / rect=${escapeHtml(JSON.stringify(panel.rect ?? null))}</div>
              <div class="sb-meta">borderless=${escapeHtml(String(panel.is_borderless ?? false))} / bleed=${escapeHtml(String(panel.bleed_polygon ?? false))} / bg=${escapeHtml(String(panel.background_treatment ?? "-"))}</div>
            </article>`).join("")}
        </div>
        <details class="sb-details">
          <summary>ページ配置の生 JSON</summary>
          <pre class="nc-code-block">${jsonHtml(page)}</pre>
        </details>
      </section>`;
  }).join("")}</div>`;
}

function rawSection(id: string, label: string, value: unknown, copied: string | null): string {
  return `
    <details class="nc-card sb-details" open>
      <summary>${escapeHtml(label)}</summary>
      <button type="button" class="nc-button nc-button--sm sb-copy" data-ng-copy-raw="${escapeHtml(id)}">${copied === id ? "コピー済み" : "コピー"}</button>
      <pre class="nc-code-block" data-ng-raw="${escapeHtml(id)}">${jsonHtml(value)}</pre>
    </details>`;
}

function renderRaw(manifest: Manifest, copied: string | null): string {
  return `<div class="sb-list">
    ${rawSection("storyboard", "storyboard.json", manifest.storyboard, copied)}
    ${rawSection("page_plan", "page_plan.json", manifest.page_plan, copied)}
    ${rawSection("render_manifest", "render manifest", manifest.render_manifest, copied)}
  </div>`;
}

function renderResolvedRefs(): string {
  return `<div class="nc-empty">resolved_refs.json を直接見るには Pipeline view から L07 結果を確認してください。</div>`;
}

function renderOriginalContent(state: OriginalDraftState): string {
  if (state.loading) return `<div class="nc-empty">読み込み中...</div>`;
  if (state.error && !state.manifest) return `<div class="view-placeholder"><h2>原案</h2><p>${escapeHtml(state.error)}</p></div>`;
  const manifest = state.manifest;
  if (!manifest) return `<div class="nc-empty">manifest が読み込まれていません。</div>`;
  if (state.tab === "storyboard") return renderStoryboard(manifest);
  if (state.tab === "page-plan") return renderPagePlan(manifest);
  if (state.tab === "resolved-refs") return renderResolvedRefs();
  return renderRaw(manifest, state.copied);
}

function renderPageDetailModal(state: OriginalDraftState): string {
  const ctx = state.pageModal;
  const manifest = state.manifest;
  if (!ctx || !manifest) return "";
  const pages = ctx.source === "storyboard" ? (manifest.storyboard?.pages ?? []) : (manifest.page_plan?.pages ?? []);
  const page = (pages as any[]).find((p: any) => Number(p.page_no) === ctx.pageNo);
  if (!page) return "";
  const allPageNos = (pages as any[]).map((p: any) => Number(p.page_no)).filter((n) => Number.isFinite(n));
  const idx = allPageNos.indexOf(ctx.pageNo);
  const total = allPageNos.length;
  const role = page.role ?? page.page_role ?? "";
  const renderStrategy = page.render_strategy ?? "";
  const panels = Array.isArray(page.panels) ? page.panels : [];

  const panelHtml = panels.map((panel: any) => {
    const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
    const dialogue = arr(panel.dialogue).map((d: any) => typeof d === "string" ? d : `${d?.character_id ?? ""}: ${d?.text ?? ""}`).filter(Boolean);
    const monologue = arr(panel.monologue).map((m: any) => typeof m === "string" ? m : `${m?.character_id ?? ""}: ${m?.text ?? ""}`).filter(Boolean);
    const narration = arr(panel.narration).map((n: any) => typeof n === "string" ? n : (n?.text ?? "")).filter(Boolean);
    const sfx = arr(panel.sfx).map((s: any) => typeof s === "string" ? s : (s?.text ?? "")).filter(Boolean);
    const action = typeof panel.action === "string" ? panel.action : "";
    const keyVisual = typeof panel.key_visual === "string" ? panel.key_visual : "";
    const lines: string[] = [];
    if (action) lines.push(`<div class="sb-line sb-line--action">演出: ${escapeHtml(action)}</div>`);
    if (keyVisual) lines.push(`<div class="sb-line sb-line--action">key visual: ${escapeHtml(keyVisual)}</div>`);
    for (const t of dialogue) lines.push(`<div class="sb-line sb-line--dialogue">「${escapeHtml(t)}」</div>`);
    for (const t of monologue) lines.push(`<div class="sb-line sb-line--monologue">(M) ${escapeHtml(t)}</div>`);
    for (const t of narration) lines.push(`<div class="sb-line sb-line--narration">(N) ${escapeHtml(t)}</div>`);
    if (sfx.length > 0) lines.push(`<div class="sb-line sb-line--sfx">SFX: ${escapeHtml(sfx.join(" / "))}</div>`);
    if (panel.silence) lines.push(`<div class="sb-line">(silence)</div>`);
    if (lines.length === 0) lines.push(`<div class="sb-line sb-meta">(テキストなし)</div>`);
    return `
      <article class="sb-panel-card">
        <h4>${escapeHtml(String(panel.panel_id ?? "-"))}</h4>
        <div class="sb-meta">順序=${escapeHtml(String(panel.reading_order ?? "-"))} / ショット=${escapeHtml(String(panel.shot_type ?? "-"))}${panel.importance ? ` / 重要度=${escapeHtml(String(panel.importance))}` : ""}</div>
        ${lines.join("")}
      </article>`;
  }).join("");

  return `
    <div class="sb-modal" data-ng-sb-modal-overlay>
      <div class="sb-modal-card" role="dialog" aria-modal="true" aria-labelledby="sb-modal-title">
        <div class="sb-modal-head">
          <h3 class="sb-modal-title" id="sb-modal-title">P.${escapeHtml(String(page.page_no))} ${role ? `<span class="nc-badge nc-badge--neutral">[${escapeHtml(String(role))}]</span>` : ""}${renderStrategy ? `<span class="nc-badge nc-badge--info">${escapeHtml(String(renderStrategy))}</span>` : ""}</h3>
          <span class="sb-modal-meta">${idx + 1} / ${total} · ${ctx.source === "storyboard" ? "原案" : "ページ配置"} · panel ${panels.length} 件</span>
          <div class="sb-modal-nav">
            <button type="button" data-ng-sb-modal-prev${idx <= 0 ? " disabled" : ""}>← 前</button>
            <button type="button" data-ng-sb-modal-next${idx < 0 || idx >= total - 1 ? " disabled" : ""}>次 →</button>
          </div>
          <button type="button" class="sb-modal-close" data-ng-sb-modal-close>閉じる</button>
        </div>
        <div class="sb-panel-grid">${panelHtml || `<div class="nc-empty">panel データが空です</div>`}</div>
        <div class="sb-modal-hint">Tab で次の page · Shift+Tab で前の page · Esc で閉じる</div>
      </div>
    </div>`;
}

function renderOriginalSection(state: OriginalDraftState): string {
  const scope = `${state.slug} / ${epLabel(state.episode)}`;
  return `
    <section class="nc-card ng-original" id="original">
      <div class="ng-original__head">
        <h3>原案</h3>
        <span class="sb-info">${escapeHtml(scope)}</span>
        <span class="ng-original__spacer"></span>
        <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-run-layer="L04" ${state.runningLayer === "L04" ? "disabled" : ""}>L04 原案を生成</button>
        <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-run-layer="L08.5" ${state.runningLayer === "L08.5" ? "disabled" : ""}>ネーム preview を生成</button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-ng-run-layer="L04_1" ${state.runningLayer === "L04_1" ? "disabled" : ""}>Hook 提案を生成</button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-ng-run-layer="L04_9" ${state.runningLayer === "L04_9" ? "disabled" : ""}>Cliff 提案を生成</button>
        <select class="nc-field__select" data-ng-original-ai-layer aria-label="原案 AI 編集対象 layer">
          <option value="L03">L03 Shotlist</option>
          <option value="L04" selected>L04 Storyboard</option>
          <option value="L05">L05 Page Plan</option>
          <option value="L06">L06 Continuity</option>
          <option value="L07">L07 Refs Resolution</option>
          <option value="L08">L08 Incremental Refs</option>
        </select>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-original-ai-edit title="選択した layer を AI 編集 view へ">AI で修正</button>
      </div>
      ${renderOriginalTabs(state.tab)}
      <div class="ng-original-content">${renderOriginalContent(state)}</div>
    </section>
    ${renderPageDetailModal(state)}`;
}

function warningHtml(warnings: NameWarning[], findings: NameAuditFindingLite[]): string {
  if (findings.length > 0) {
    return findings
      .slice(0, 6)
      .map((f) => {
        const icon = f.severity === "error" ? "✖" : f.severity === "warn" ? "⚠" : "ⓘ";
        return `<span class="warn sev-${escapeHtml(f.severity)}" title="${escapeHtml(f.rule)}">${icon} ${escapeHtml(f.message)}</span>`;
      })
      .join("");
  }
  if (warnings.length === 0) return '<span class="ok">✓ 警告なし</span>';
  return warnings
    .slice(0, 5)
    .map(
      (w) =>
        `<span class="warn sev-warn" title="${escapeHtml(w.kind)}">⚠ ${escapeHtml(w.message)}</span>`
    )
    .join("");
}

function renderPageCards(manifest: NameManifest, episode: number): string {
  return manifest.pages
    .map((page) => {
      const reasons = REASONS.map(
        (reason) =>
          `<label><input type="checkbox" data-reason="${reason.key}"> ${escapeHtml(reason.label)}</label>`
      ).join("");
      return `<article class="page-card" data-page-no="${page.page_no}" tabindex="0" id="page-${page.page_no}">
  <header>
    <span class="page-no">P.${page.page_no}</span>
    <span class="page-role">[${escapeHtml(page.page_role)}]</span>
    <span class="panel-count">${page.panel_count}コマ</span>
    <span class="status status-pending" data-page-status="${page.page_no}">pending</span>
  </header>
  <div class="svg-wrap"><img src="${escapeHtml(legacySvgPath(episode, page.svg_filename))}" alt="page ${page.page_no} preview"></div>
  <div class="warnings">${warningHtml(page.warnings ?? [], page.audit_findings ?? [])}</div>
  <div class="reasons" data-page-reasons="${page.page_no}">${reasons}</div>
  <textarea class="note" placeholder="(任意) note" data-page-note="${page.page_no}"></textarea>
  <div class="page-actions">
    <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-status="approved" data-page="${page.page_no}">承認</button>
    <button type="button" class="nc-button nc-button--danger nc-button--sm" data-ng-status="rejected" data-page="${page.page_no}">却下</button>
    <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-status="pending" data-page="${page.page_no}">未判定</button>
  </div>
</article>`;
    })
    .join("");
}

function emptyDecision(): DecisionDraft {
  return { status: "pending", reasons: [], note: "", persistFailed: false };
}

function renderShell(
  container: HTMLElement,
  originalState: OriginalDraftState,
  manifest: NameManifest,
  slug: string,
  episode: number
): void {
  container.innerHTML = `
    <div class="name-gate-container">
      <div class="name-gate-toolbar">
        <h2>ネーム</h2>
        <span class="info">${escapeHtml(slug)} / ${epLabel(episode)} (${escapeHtml(manifest.episode_id)})</span>
        <span class="ng-kpis" aria-label="name gate KPI">
          <span class="ng-kpi ng-kpi--pending">未判定 <strong id="ng-cnt-pending">${manifest.pages.length}</strong></span>
          <span class="ng-kpi ng-kpi--approved">承認 <strong id="ng-cnt-approved">0</strong></span>
          <span class="ng-kpi ng-kpi--rejected">却下 <strong id="ng-cnt-rejected">0</strong></span>
        </span>
        <select class="nc-field__select" data-ng-ai-layer aria-label="AI 編集対象 layer" style="margin-left: 12px;">
          <option value="L08.5" selected>L08.5 Name Preview</option>
          <option value="L08.6">L08.6 Name Audit</option>
          <option value="L08.7">L08.7 Name Approval</option>
        </select>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-ai-edit title="選択した layer を AI 編集 view へ">AI で修正</button>
      </div>
      <div id="ng-original-root">${renderOriginalSection(originalState)}</div>
      <div class="name-gate-help">
        <code>a</code> approve <code>r</code> reject <code>p</code> pending
        <code>↑/k</code> 前ページ <code>↓/j</code> 次ページ <code>1..6</code> reject 理由
      </div>
      <section class="ng-section" aria-labelledby="ng-approval-title">
        <h3 class="ng-section-title" id="ng-approval-title">判定</h3>
      <div class="name-gate-grid" id="ng-grid">${renderPageCards(manifest, episode)}</div>
      </section>
      <div id="ng-overlay-root"></div>
    </div>
  `;
}

function setCounter(container: HTMLElement, id: string, value: number): void {
  const el = container.querySelector<HTMLElement>(id);
  if (el) el.textContent = String(value);
}

function refreshSummary(container: HTMLElement, decisions: Map<number, DecisionDraft>): void {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  for (const d of decisions.values()) {
    if (d.status === "approved") approved++;
    else if (d.status === "rejected") rejected++;
    else pending++;
  }
  setCounter(container, "#ng-cnt-approved", approved);
  setCounter(container, "#ng-cnt-rejected", rejected);
  setCounter(container, "#ng-cnt-pending", pending);
  setCounter(container, "#ng-cnt-total", decisions.size);
}

function refreshCard(container: HTMLElement, pageNo: number, decision: DecisionDraft): void {
  const card = container.querySelector<HTMLElement>(`[data-page-no="${pageNo}"]`);
  const status = container.querySelector<HTMLElement>(`[data-page-status="${pageNo}"]`);
  if (!card || !status) return;
  status.className = `status status-${decision.status}`;
  status.innerHTML = `${decision.status}${decision.persistFailed ? '<span class="persist-error">(persist failed)</span>' : ""}`;
  card.classList.toggle("approved", decision.status === "approved");
  card.classList.toggle("rejected", decision.status === "rejected");
}

function applyDecisionToInputs(
  container: HTMLElement,
  pageNo: number,
  decision: DecisionDraft
): void {
  container
    .querySelectorAll<HTMLInputElement>(`[data-page-reasons="${pageNo}"] input`)
    .forEach((input) => {
      input.checked = isRejectReason(input.dataset.reason)
        ? decision.reasons.includes(input.dataset.reason)
        : false;
    });
  const note = container.querySelector<HTMLTextAreaElement>(`[data-page-note="${pageNo}"]`);
  if (note) note.value = decision.note;
}

function readReasons(container: HTMLElement, pageNo: number): NameRejectReason[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>(`[data-page-reasons="${pageNo}"] input:checked`)
  )
    .map((input) => input.dataset.reason)
    .filter(isRejectReason);
}

function readNote(container: HTMLElement, pageNo: number): string {
  return container.querySelector<HTMLTextAreaElement>(`[data-page-note="${pageNo}"]`)?.value ?? "";
}

function overlayRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("#ng-overlay-root");
}

function renderHelp(container: HTMLElement, open: boolean): void {
  const root = overlayRoot(container);
  if (!root) return;
  root.querySelector("[data-ng-help]")?.remove();
  if (!open) return;
  root.insertAdjacentHTML(
    "beforeend",
    `<aside class="ng-help-panel" data-ng-help>
      <h3>キー操作</h3>
      <dl>
        <dt>a</dt><dd>承認</dd>
        <dt>r</dt><dd>却下 (理由を選ぶ)</dd>
        <dt>p</dt><dd>未判定に戻す</dd>
        <dt>j / k</dt><dd>次 / 前のページ</dd>
        <dt>Enter</dt><dd>次の未判定ページへ</dd>
        <dt>?</dt><dd>このヘルプ</dd>
      </dl>
    </aside>`
  );
}

function renderRejectModal(
  container: HTMLElement,
  pageNo: number,
  reasons: NameRejectReason[],
  note: string
): void {
  const root = overlayRoot(container);
  if (!root) return;
  root.querySelector("[data-ng-reject-modal]")?.remove();
  const reasonHtml = REASONS.map((reason, index) => {
    const checked = reasons.includes(reason.key) ? " checked" : "";
    const label = reason.label.replace(/^\[\d+\]\s*/, "");
    return `<label><input type="checkbox" data-ng-modal-reason="${reason.key}"${checked}> ${index + 1}. ${escapeHtml(label)}</label>`;
  }).join("");
  root.insertAdjacentHTML(
    "beforeend",
    `<div class="ng-modal-backdrop" data-ng-reject-modal>
      <div class="ng-modal" role="dialog" aria-modal="true" aria-labelledby="ng-reject-title">
        <h3 id="ng-reject-title">却下理由 - P.${pageNo}</h3>
        <div class="reasons">${reasonHtml}</div>
        <textarea data-ng-modal-note placeholder="(任意) note">${escapeHtml(note)}</textarea>
        <div class="ng-modal-actions">
          <button type="button" class="nc-button nc-button--ghost" data-ng-modal-cancel>Esc 閉じる</button>
          <button type="button" class="nc-button nc-button--danger" data-ng-modal-confirm>Enter 確定</button>
        </div>
      </div>
    </div>`
  );
}

function closeRejectModal(container: HTMLElement): void {
  overlayRoot(container)?.querySelector("[data-ng-reject-modal]")?.remove();
}

function modalReasons(container: HTMLElement): NameRejectReason[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>("[data-ng-modal-reason]:checked"))
    .map((input) => input.dataset.ngModalReason)
    .filter(isRejectReason);
}

function modalNote(container: HTMLElement): string {
  return container.querySelector<HTMLTextAreaElement>("[data-ng-modal-note]")?.value ?? "";
}

function setFocus(cards: HTMLElement[], pageNo: number): number {
  cards.forEach((card) => card.classList.toggle("ng-page--focused", Number(card.dataset.pageNo) === pageNo));
  const index = cards.findIndex((card) => Number(card.dataset.pageNo) === pageNo);
  if (index < 0) return pageNo;
  const card = cards[index];
  card.focus({ preventScroll: false });
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  return pageNo;
}

function firstPendingOrFirst(manifest: NameManifest, decisions: Map<number, DecisionDraft>): number {
  return manifest.pages.find((page) => decisions.get(page.page_no)?.status === "pending")?.page_no
    ?? manifest.pages[0]?.page_no
    ?? 1;
}

function nextPendingPage(cards: HTMLElement[], currentPageNo: number, decisions: Map<number, DecisionDraft>): number {
  const pageNos = cards.map((card) => Number(card.dataset.pageNo)).filter((pageNo) => Number.isInteger(pageNo));
  const currentIndex = pageNos.indexOf(currentPageNo);
  if (currentIndex < 0) return currentPageNo;
  for (let offset = 1; offset < pageNos.length; offset++) {
    const pageNo = pageNos[(currentIndex + offset) % pageNos.length];
    if (decisions.get(pageNo)?.status === "pending") return pageNo;
  }
  return currentPageNo;
}

function adjacentPage(cards: HTMLElement[], currentPageNo: number, delta: number): number {
  const index = cards.findIndex((card) => Number(card.dataset.pageNo) === currentPageNo);
  if (index < 0) return currentPageNo;
  const next = cards[index + delta];
  return next ? Number(next.dataset.pageNo) : currentPageNo;
}

function applyApproval(
  container: HTMLElement,
  decisions: Map<number, DecisionDraft>,
  pages: Record<string, NamePageDecision>
): void {
  for (const [key, value] of Object.entries(pages)) {
    const pageNo = Number(key);
    const decision = decisions.get(pageNo);
    if (!decision) continue;
    decision.status = value.status ?? "pending";
    decision.reasons = value.reasons ?? [];
    decision.note = value.note ?? "";
    decision.persistFailed = false;
    applyDecisionToInputs(container, pageNo, decision);
    refreshCard(container, pageNo, decision);
  }
  refreshSummary(container, decisions);
}

function renderError(container: HTMLElement, title: string, error: unknown): void {
  const detail =
    error instanceof ApiError ? `API ${error.status}: ${error.body}` : error instanceof Error ? error.message : String(error);
  container.innerHTML = `
    <div class="view-placeholder">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(detail)}</p>
    </div>
  `;
}

function originalRoot(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("#ng-original-root");
}

function renderOriginalRoot(container: HTMLElement, state: OriginalDraftState): void {
  const root = originalRoot(container);
  if (root) root.innerHTML = renderOriginalSection(state);
}

function navigateOriginalPageModal(state: OriginalDraftState, container: HTMLElement, dir: 1 | -1): void {
  const ctx = state.pageModal;
  const manifest = state.manifest;
  if (!ctx || !manifest) return;
  const pages = ctx.source === "storyboard" ? (manifest.storyboard?.pages ?? []) : (manifest.page_plan?.pages ?? []);
  const allPageNos = (pages as any[]).map((p: any) => Number(p.page_no)).filter((n) => Number.isFinite(n));
  if (allPageNos.length <= 1) return;
  const idx = allPageNos.indexOf(ctx.pageNo);
  if (idx < 0) return;
  const nextIdx = Math.max(0, Math.min(allPageNos.length - 1, idx + dir));
  if (nextIdx === idx) return;
  state.pageModal = { source: ctx.source, pageNo: allPageNos[nextIdx] };
  renderOriginalRoot(container, state);
}

/**
 * page 単位で persist を直列化する queue。
 * checkbox を高速 toggle すると並列 POST が走り、サーバ側の「last arrival wins」で
 * UI 状態と persist 結果が乖離する可能性があったため、(slug, episode, pageNo) で chain する。
 * 単一ブラウザタブ内の Map なので process 終了で消える。
 */
const pendingPersist = new Map<string, Promise<unknown>>();

async function doPersist(
  container: HTMLElement,
  slug: string,
  episode: number,
  pageNo: number,
  decisions: Map<number, DecisionDraft>
): Promise<void> {
  const decision = decisions.get(pageNo);
  if (!decision) return;
  decision.reasons = readReasons(container, pageNo);
  decision.note = readNote(container, pageNo);
  decision.persistFailed = false;
  refreshCard(container, pageNo, decision);

  try {
    await apiPostNameApproval(slug, episode, {
      page_no: pageNo,
      status: decision.status,
      reasons: decision.reasons,
      note: decision.note,
    });
  } catch (e) {
    decision.persistFailed = true;
    refreshCard(container, pageNo, decision);
    if (e instanceof ApiError) console.warn("name-gate persist failed", e.status, e.body);
    else console.warn("name-gate persist failed", e);
  }
}

function persistDecision(
  container: HTMLElement,
  slug: string,
  episode: number,
  pageNo: number,
  decisions: Map<number, DecisionDraft>
): Promise<void> {
  const key = `${slug}#${episode}#${pageNo}`;
  const prev = pendingPersist.get(key) ?? Promise.resolve();
  // 前段が throw しても次の persist を実行する (直列維持)。
  const next = prev.then(
    () => doPersist(container, slug, episode, pageNo, decisions),
    () => doPersist(container, slug, episode, pageNo, decisions)
  );
  const tracked: Promise<unknown> = next.catch(() => undefined);
  pendingPersist.set(key, tracked);
  tracked.then(() => {
    if (pendingPersist.get(key) === tracked) pendingPersist.delete(key);
  });
  return next;
}

async function loadNameGate(
  container: HTMLElement,
  slug: string,
  episode: number,
  signal: AbortSignal
): Promise<void> {
  if (!slug || !episode) return;
  container.innerHTML = `<div class="view-placeholder"><h2>ネーム</h2><p>loading...</p></div>`;

  try {
    const originalState: OriginalDraftState = {
      slug,
      episode,
      tab: "storyboard",
      manifest: null,
      loading: true,
      error: null,
      copied: null,
      pageModal: null,
      runningLayer: null,
    };
    const [manifest, approval, originalManifestResult] = await Promise.all([
      apiGetNameManifest(slug, episode),
      apiGetNameApproval(slug, episode),
      apiGetManifest(slug, episode).then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error })
      ),
    ]);
    if (signal.aborted) return;
    originalState.loading = false;
    if (originalManifestResult.ok) originalState.manifest = originalManifestResult.value;
    else originalState.error = errorText(originalManifestResult.error);

    renderShell(container, originalState, manifest, slug, episode);
    const decisions = new Map<number, DecisionDraft>();
    for (const page of manifest.pages) decisions.set(page.page_no, emptyDecision());
    const cards = Array.from(container.querySelectorAll<HTMLElement>("article.page-card"));
    let focusedPageNo = cards[0] ? Number(cards[0].dataset.pageNo) : 1;
    let helpOpen = false;
    let rejectPageNo: number | null = null;

    applyApproval(container, decisions, approval.pages ?? {});
    refreshSummary(container, decisions);

    const focusPage = (pageNo: number): void => {
      focusedPageNo = setFocus(cards, pageNo);
    };

    const advanceToNextPending = (): void => {
      const next = nextPendingPage(cards, focusedPageNo, decisions);
      if (next !== focusedPageNo) focusPage(next);
    };

    const persistAndAdvance = (pageNo: number): void => {
      const decision = decisions.get(pageNo);
      if (!decision) return;
      refreshCard(container, pageNo, decision);
      refreshSummary(container, decisions);
      void persistDecision(container, slug, episode, pageNo, decisions);
      advanceToNextPending();
    };

    const setStatus = (pageNo: number, status: NamePageStatus): void => {
      const decision = decisions.get(pageNo);
      if (!decision) return;
      decision.status = status;
      if (status !== "rejected") decision.reasons = [];
      decision.persistFailed = false;
      applyDecisionToInputs(container, pageNo, decision);
      persistAndAdvance(pageNo);
    };

    const openRejectModal = (pageNo: number): void => {
      const decision = decisions.get(pageNo);
      if (!decision) return;
      rejectPageNo = pageNo;
      focusPage(pageNo);
      renderRejectModal(container, pageNo, decision.reasons, decision.note);
    };

    const confirmRejectModal = (): void => {
      if (rejectPageNo === null) return;
      const pageNo = rejectPageNo;
      const decision = decisions.get(pageNo);
      if (!decision) return;
      decision.status = "rejected";
      decision.reasons = modalReasons(container);
      decision.note = modalNote(container);
      decision.persistFailed = false;
      applyDecisionToInputs(container, pageNo, decision);
      closeRejectModal(container);
      rejectPageNo = null;
      persistAndAdvance(pageNo);
    };

    const cancelRejectModal = (): void => {
      closeRejectModal(container);
      rejectPageNo = null;
    };

    const toggleHelp = (): void => {
      helpOpen = !helpOpen;
      renderHelp(container, helpOpen);
    };

    cards.forEach((card) => {
      card.addEventListener(
        "focus",
        () => {
          focusedPageNo = Number(card.dataset.pageNo);
          cards.forEach((row) => row.classList.toggle("ng-page--focused", row === card));
        },
        { signal }
      );
      card.addEventListener(
        "click",
        (event) => {
          if (isEditableTarget(event.target)) return;
          card.focus();
        },
        { signal }
      );
      const pageNo = Number(card.dataset.pageNo);
      card
        .querySelectorAll<HTMLInputElement>(`[data-page-reasons="${pageNo}"] input`)
        .forEach((input) => {
          input.addEventListener(
            "change",
            () => {
              const decision = decisions.get(pageNo);
              if (!decision) return;
              if (decision.status === "pending") decision.status = "rejected";
              void persistDecision(container, slug, episode, pageNo, decisions);
              refreshCard(container, pageNo, decision);
              refreshSummary(container, decisions);
            },
            { signal }
          );
        });
      card
        .querySelector<HTMLTextAreaElement>(`[data-page-note="${pageNo}"]`)
        ?.addEventListener(
          "change",
          () => void persistDecision(container, slug, episode, pageNo, decisions),
          { signal }
        );
    });

    // toolbar の「AI で修正」ボタン: 選択中の L08.5/L08.6/L08.7 を ai-edit へ。
    container.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest("[data-ng-sb-modal-close]")) {
          originalState.pageModal = null;
          renderOriginalRoot(container, originalState);
          return;
        }
        if (target.closest("[data-ng-sb-modal-prev]")) {
          navigateOriginalPageModal(originalState, container, -1);
          return;
        }
        if (target.closest("[data-ng-sb-modal-next]")) {
          navigateOriginalPageModal(originalState, container, 1);
          return;
        }
        const originalOverlay = target.closest<HTMLElement>("[data-ng-sb-modal-overlay]");
        if (originalOverlay && target === originalOverlay) {
          originalState.pageModal = null;
          renderOriginalRoot(container, originalState);
          return;
        }
        const originalPageCard = target.closest<HTMLElement>("[data-ng-sb-page-modal]");
        if (originalPageCard) {
          const source = originalPageCard.dataset.ngSbPageModal as "storyboard" | "page-plan" | undefined;
          const pageNo = Number(originalPageCard.dataset.ngSbPageNo);
          if ((source === "storyboard" || source === "page-plan") && Number.isFinite(pageNo)) {
            originalState.pageModal = { source, pageNo };
            renderOriginalRoot(container, originalState);
            return;
          }
        }
        const originalTab = target.closest<HTMLButtonElement>("[data-ng-sb-tab]")?.dataset.ngSbTab as StoryboardTab | undefined;
        if (originalTab && STORYBOARD_TABS.some((item) => item.id === originalTab)) {
          originalState.tab = originalTab;
          originalState.copied = null;
          renderOriginalRoot(container, originalState);
          return;
        }
        const copyId = target.closest<HTMLButtonElement>("[data-ng-copy-raw]")?.dataset.ngCopyRaw;
        if (copyId) {
          const raw = Array.from(container.querySelectorAll<HTMLElement>("[data-ng-raw]")).find(
            (node) => node.dataset.ngRaw === copyId
          );
          const text = raw?.textContent ?? "";
          void navigator.clipboard?.writeText(text);
          originalState.copied = copyId;
          renderOriginalRoot(container, originalState);
          return;
        }
        const originalAiButton = target.closest<HTMLButtonElement>("[data-ng-original-ai-edit]");
        if (originalAiButton) {
          const select = container.querySelector<HTMLSelectElement>("[data-ng-original-ai-layer]");
          const layer = select?.value || "L04";
          navigateToAiEdit(layer, { slug, episode });
          return;
        }
        const runLayer = target.closest<HTMLButtonElement>("[data-ng-run-layer]")?.dataset.ngRunLayer;
        if (runLayer) {
          if (!isRunnableLayer(runLayer)) return;
          originalState.runningLayer = runLayer;
          renderOriginalRoot(container, originalState);
          void spawnLayerWithModal({
            layer: runLayer,
            status: "missing",
            slug,
            episode,
            callbacks: {
              onProgress: (running) => {
                originalState.runningLayer = running ? runLayer : null;
                renderOriginalRoot(container, originalState);
              },
              onSuccess: async () => {
                if (runLayer === "L08.5") {
                  window.location.reload();
                  return;
                }
                try {
                  originalState.manifest = await apiGetManifest(slug, episode);
                  originalState.error = null;
                } catch (error) {
                  originalState.error = errorText(error);
                }
                renderOriginalRoot(container, originalState);
              },
              onError: (message) => {
                originalState.error = message;
                renderOriginalRoot(container, originalState);
              },
            },
          });
          return;
        }
        const modalReason = target.closest<HTMLInputElement>("[data-ng-modal-reason]");
        if (modalReason) return;
        if (target.closest("[data-ng-modal-confirm]")) {
          confirmRejectModal();
          return;
        }
        if (target.closest("[data-ng-modal-cancel]")) {
          cancelRejectModal();
          return;
        }
        const statusButton = target.closest<HTMLButtonElement>("[data-ng-status]");
        if (statusButton) {
          const pageNo = Number(statusButton.dataset.page);
          const status = statusButton.dataset.ngStatus as NamePageStatus | undefined;
          if (!Number.isInteger(pageNo) || !status) return;
          if (status === "rejected") openRejectModal(pageNo);
          else setStatus(pageNo, status);
          return;
        }
        if (target.closest("[data-ng-ai-edit]")) {
          const select = container.querySelector<HTMLSelectElement>("[data-ng-ai-layer]");
          const layer = select?.value || "L08.5";
          navigateToAiEdit(layer, { slug, episode });
        }
      },
      { signal }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (originalState.pageModal) {
          if (event.key === "Escape") {
            originalState.pageModal = null;
            renderOriginalRoot(container, originalState);
            event.preventDefault();
            return;
          }
          if (event.key === "Tab") {
            navigateOriginalPageModal(originalState, container, event.shiftKey ? -1 : 1);
            event.preventDefault();
            return;
          }
          if (event.key === "ArrowLeft") {
            navigateOriginalPageModal(originalState, container, -1);
            event.preventDefault();
            return;
          }
          if (event.key === "ArrowRight") {
            navigateOriginalPageModal(originalState, container, 1);
            event.preventDefault();
            return;
          }
          return;
        }
        if (rejectPageNo !== null) {
          if (/^[1-6]$/.test(event.key)) {
            const input = container.querySelectorAll<HTMLInputElement>("[data-ng-modal-reason]")[Number(event.key) - 1];
            if (input) input.checked = !input.checked;
            event.preventDefault();
            return;
          }
          if (event.key === "Enter") {
            confirmRejectModal();
            event.preventDefault();
            return;
          }
          if (event.key === "Escape") {
            cancelRejectModal();
            event.preventDefault();
            return;
          }
          return;
        }
        if (event.key === "?") {
          toggleHelp();
          event.preventDefault();
          return;
        }
        if (isEditableTarget(event.target)) return;
        if (!decisions.has(focusedPageNo)) return;

        if (event.key === "a" || event.key === "A") {
          setStatus(focusedPageNo, "approved");
          event.preventDefault();
        } else if (event.key === "r" || event.key === "R") {
          openRejectModal(focusedPageNo);
          event.preventDefault();
        } else if (event.key === "p" || event.key === "P") {
          setStatus(focusedPageNo, "pending");
          event.preventDefault();
        } else if (event.key === "ArrowDown" || event.key === "j") {
          focusPage(adjacentPage(cards, focusedPageNo, 1));
          event.preventDefault();
          return;
        } else if (event.key === "ArrowUp" || event.key === "k") {
          focusPage(adjacentPage(cards, focusedPageNo, -1));
          event.preventDefault();
          return;
        } else if (event.key === "Enter") {
          advanceToNextPending();
          event.preventDefault();
          return;
        } else {
          return;
        }
      },
      { signal }
    );

    focusedPageNo = firstPendingOrFirst(manifest, decisions);
    if (cards[0]) {
      requestAnimationFrame(() => {
        if (!signal.aborted) focusPage(focusedPageNo);
      });
    }
  } catch (e) {
    if (!signal.aborted) renderError(container, "ネーム 読み込みエラー", e);
  }
}

export function mountNameGateView(container: HTMLElement): () => void {
  ensureStyles();
  let activeController = new AbortController();
  let activeScope = "";

  const unsubscribe = store.subscribe((state) => {
    const nextScope = `${state.currentSlug}#${state.currentEpisode}`;
    if (nextScope === activeScope) return;
    activeScope = nextScope;
    activeController.abort();
    activeController = new AbortController();
    void loadNameGate(container, state.currentSlug, state.currentEpisode, activeController.signal);
  });

  return () => {
    unsubscribe();
    activeController.abort();
    container.innerHTML = "";
  };
}
