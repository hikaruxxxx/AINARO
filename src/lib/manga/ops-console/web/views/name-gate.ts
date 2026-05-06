import {
  ApiError,
  apiGetNameApproval,
  apiGetNameManifest,
  apiPostNameApproval,
  type NameManifest,
} from "../lib/api";
import { store } from "../lib/store";
import { navigateToAiEdit } from "../lib/layer-actions";
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
.name-gate-container { display: grid; gap: 14px; }
.name-gate-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  background: #fff;
}
.name-gate-toolbar h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
.name-gate-toolbar .info { color: #64748b; font-size: 13px; }
.name-gate-toolbar .summary { margin-left: auto; color: #334155; font-size: 13px; }
.ng-kpi { color: var(--text-secondary); font-size: var(--fs-sm); margin-left: auto; }
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
.name-gate-container .svg-wrap object { width: 100%; height: 100%; pointer-events: none; }
.name-gate-container .warnings { padding: 8px 0; font-size: 12px; line-height: 1.5; }
.name-gate-container .warnings .ok { color: #16a34a; }
.name-gate-container .warnings .warn { display: block; }
.name-gate-container .warnings .sev-error { color: #991b1b; font-weight: 600; }
.name-gate-container .warnings .sev-warn { color: #b45309; }
.name-gate-container .warnings .sev-info { color: #6b7280; }
.name-gate-container .reasons { display: flex; flex-wrap: wrap; gap: 8px 12px; padding: 6px 0; font-size: 12px; }
.name-gate-container .reasons label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
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
  return `/episodes/${epLabel(episode)}/name/${svgFilename}`;
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
  <div class="svg-wrap"><object data="${escapeHtml(legacySvgPath(episode, page.svg_filename))}" type="image/svg+xml" aria-label="page ${page.page_no} preview"></object></div>
  <div class="warnings">${warningHtml(page.warnings ?? [], page.audit_findings ?? [])}</div>
  <div class="reasons" data-page-reasons="${page.page_no}">${reasons}</div>
  <textarea class="note" placeholder="(任意) note" data-page-note="${page.page_no}"></textarea>
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
        <h2>ネーム gate</h2>
        <span class="info">${escapeHtml(slug)} / ${epLabel(episode)} (${escapeHtml(manifest.episode_id)})</span>
        <span class="summary ng-kpi">pending <strong id="ng-cnt-pending">${manifest.pages.length}</strong> / approved <strong id="ng-cnt-approved">0</strong> / rejected <strong id="ng-cnt-rejected">0</strong> / total <strong id="ng-cnt-total">${manifest.pages.length}</strong></span>
        <select class="nc-field__select" data-ng-ai-layer aria-label="AI 編集対象 layer" style="margin-left: 12px;">
          <option value="L08.5" selected>L08.5 Name Preview</option>
          <option value="L08.6">L08.6 Name Audit</option>
          <option value="L08.7">L08.7 Name Approval</option>
        </select>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-ai-edit title="選択した layer を AI 編集 view へ">AI で修正</button>
      </div>
      <div class="name-gate-help">
        <code>a</code> approve <code>r</code> reject <code>p</code> pending
        <code>↑/k</code> 前ページ <code>↓/j</code> 次ページ <code>1..6</code> reject 理由
      </div>
      <div class="name-gate-grid" id="ng-grid">${renderPageCards(manifest, episode)}</div>
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

function setFocus(cards: HTMLElement[], pageNo: number): number {
  const index = cards.findIndex((card) => Number(card.dataset.pageNo) === pageNo);
  if (index < 0) return pageNo;
  const card = cards[index];
  card.focus({ preventScroll: false });
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  return pageNo;
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
  container.innerHTML = `<div class="view-placeholder"><h2>ネーム gate</h2><p>loading...</p></div>`;

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

    applyApproval(container, decisions, approval.pages ?? {});
    refreshSummary(container, decisions);

    cards.forEach((card) => {
      card.addEventListener(
        "focus",
        () => {
          focusedPageNo = Number(card.dataset.pageNo);
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
        if (!target.closest("[data-ng-ai-edit]")) return;
        const select = container.querySelector<HTMLSelectElement>("[data-ng-ai-layer]");
        const layer = select?.value || "L08.5";
        navigateToAiEdit(layer, { slug, episode });
      },
      { signal }
    );

    container.addEventListener(
      "keydown",
      (event) => {
        if (isEditableTarget(event.target)) return;
        if (!decisions.has(focusedPageNo)) return;
        const decision = decisions.get(focusedPageNo);
        if (!decision) return;

        if (event.key === "a" || event.key === "A") {
          decision.status = "approved";
          void persistDecision(container, slug, episode, focusedPageNo, decisions);
          event.preventDefault();
        } else if (event.key === "r" || event.key === "R") {
          decision.status = "rejected";
          void persistDecision(container, slug, episode, focusedPageNo, decisions);
          event.preventDefault();
        } else if (event.key === "p" || event.key === "P") {
          decision.status = "pending";
          void persistDecision(container, slug, episode, focusedPageNo, decisions);
          event.preventDefault();
        } else if (event.key === "ArrowDown" || event.key === "j") {
          focusedPageNo = setFocus(cards, adjacentPage(cards, focusedPageNo, 1));
          event.preventDefault();
          // focus 移動だけなので、共通経路の refreshCard は走らせない。
          // (旧実装は decision = old focusedPageNo の値を新ページに描画する bug があった)
          return;
        } else if (event.key === "ArrowUp" || event.key === "k") {
          focusedPageNo = setFocus(cards, adjacentPage(cards, focusedPageNo, -1));
          event.preventDefault();
          return;
        } else if (/^[1-6]$/.test(event.key)) {
          const index = Number(event.key) - 1;
          const input = container.querySelectorAll<HTMLInputElement>(
            `[data-page-reasons="${focusedPageNo}"] input`
          )[index];
          if (input) {
            input.checked = !input.checked;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
          event.preventDefault();
          // checkbox の change handler 側で refreshCard/refreshSummary が走るので共通経路は skip。
          return;
        } else {
          return;
        }

        refreshCard(container, focusedPageNo, decision);
        refreshSummary(container, decisions);
      },
      { signal }
    );

    if (cards[0]) {
      requestAnimationFrame(() => {
        if (!signal.aborted) cards[0].focus();
      });
    }
  } catch (e) {
    if (!signal.aborted) renderError(container, "ネーム gate 読み込みエラー", e);
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
