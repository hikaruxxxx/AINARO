import {
  ApiError,
  apiGetNameApproval,
  apiGetNameManifest,
  apiPostNameApproval,
  type NameManifest,
} from "../lib/api";
import { store } from "../lib/store";
import { isRunnableLayer, navigateToAiEdit, spawnLayerWithModal } from "../lib/layer-actions";
import { openAiEditModal } from "../components/ai-edit-modal";
import type {
  NameAuditFindingLite,
  NamePageDecision,
  NamePageStatus,
  NameRejectReason,
  NameWarning,
} from "../../../name-preview/types";

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

const NAME_GATE_CSS = `
.name-gate-container { display: grid; grid-template-rows: auto auto 1fr; gap: 14px; }
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
        <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-run-layer="L04">L04 Storyboard 生成</button>
        <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-run-layer="L08.5">L08.5 Name Preview 生成</button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-ng-run-layer="L04_1">L04.1 Hook 提案</button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-ng-run-layer="L04_9">L04.9 Cliff 提案</button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-open-ai-edit>AI 編集</button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-layer-ai-edit="L04">L04 を AI で修正</button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-layer-ai-edit="L08.5">L08.5 を AI で修正</button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-layer-ai-edit="L08.6">L08.6 を AI で修正</button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-layer-ai-edit="L08.7">L08.7 を AI で修正</button>
      </div>
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
    const [manifest, approval] = await Promise.all([
      apiGetNameManifest(slug, episode),
      apiGetNameApproval(slug, episode),
    ]);
    if (signal.aborted) return;

    renderShell(container, manifest, slug, episode);
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

    const setRunningLayer = (runningLayer: string | null): void => {
      container.querySelectorAll<HTMLButtonElement>("[data-ng-run-layer]").forEach((button) => {
        button.disabled = Boolean(runningLayer) && button.dataset.ngRunLayer === runningLayer;
      });
    };

    container.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const runLayer = target.closest<HTMLButtonElement>("[data-ng-run-layer]")?.dataset.ngRunLayer;
        if (runLayer) {
          if (!isRunnableLayer(runLayer)) return;
          setRunningLayer(runLayer);
          void spawnLayerWithModal({
            layer: runLayer,
            status: "missing",
            slug,
            episode,
            callbacks: {
              onProgress: (running) => {
                setRunningLayer(running ? runLayer : null);
              },
              onSuccess: () => {
                if (runLayer === "L08.5") window.location.reload();
              },
              onError: () => setRunningLayer(null),
            },
          }).finally(() => setRunningLayer(null));
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
        if (target.closest<HTMLButtonElement>("[data-open-ai-edit]")) {
          void openAiEditModal({ scope: slug || "_console", originView: "name-gate" });
          return;
        }
        const layerAiEdit = target.closest<HTMLButtonElement>("[data-ng-layer-ai-edit]")?.dataset.ngLayerAiEdit;
        if (layerAiEdit) {
          navigateToAiEdit(layerAiEdit, { slug, episode });
        }
      },
      { signal }
    );

    document.addEventListener(
      "keydown",
      (event) => {
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
