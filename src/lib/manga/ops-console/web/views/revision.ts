import {
  ApiError,
  apiGetManifest,
  apiPostAdopted,
  apiPostRevisionQueue,
  type Manifest,
  type RevisionEntry,
} from "../lib/api";
import { store } from "../lib/store";
import { isRunnableLayer, navigateToAiEdit, spawnLayerWithModal } from "../lib/layer-actions";
import {
  REVISION_TAGS,
  isRevisionTag,
  type AdoptedVersions,
  type EngagementAuditPageScore,
  type RevisionTag,
} from "../../../revision-ui/types";
import type { PagePlanPage, PanelV2 } from "../../../schemas-v2";

type Filters = {
  failed: boolean;
  revised: boolean;
  notAdopted: boolean;
};

type RevisionTab = "adoption" | "effects";

type EffectsStats = {
  totalQueued: number;
  resolved: number;
  adoptedNonV1: number;
  resolutionRate: number;
  adoptionRate: number;
  byTag: Map<RevisionTag, { queued: number; resolved: number; adopted: number }>;
  panelStats: Array<{ panel_id: string; instructionCount: number; adoptedVersion: string | null; rounds: number }>;
};

type PanelView = {
  pageNo: number;
  pageRole: string;
  renderStrategy: string;
  rawPanelId: string;
  queueKey: string;
  panelNo?: number;
  readingOrder: number;
  importance?: number;
  shotType?: string;
  /** page_one_shot 用 overlay 描画情報 (page_plan.panels[].rect) */
  rect?: { x: number; y: number; w: number; h: number };
  /** hover tooltip 用 (storyboard 由来) */
  dialogue?: string[];
  monologue?: string[];
  narration?: string[];
  sfx?: string[];
  silence?: boolean;
};

type VersionView = {
  version: string;
  image_path: string;
  ts: string;
  origin?: string;
};

type ModalContext = {
  panel_id: string;
  page_no: number;
  panel_no?: number;
  image_path: string;
  for_version: string;
};

type AdoptModalContext = {
  panel_id: string;
  chosen_version: string;
  image_path: string;
  current_note: string;
};

type VersionsModalContext = {
  panel_id: string;
  page_no: number;
  current_image_path: string;
  current_for_version: string;
  /** modal 内 hero に表示中の version。
   *  versions 配列の idx で保持する (同 version 文字列・同 image_path が複数並ぶケース対応)。 */
  viewingIdx?: number;
};

type ViewState = {
  manifest: Manifest | null;
  tab: RevisionTab;
  filters: Filters;
  modal: ModalContext | null;
  adoptModal: AdoptModalContext | null;
  versionsModal: VersionsModalContext | null;
};

const RV_CSS = `
.rv-container { display: grid; gap: 12px; }
.rv-tabs { display: flex; gap: var(--space-1, 4px); flex-wrap: wrap; }
.rv-tab-panel[hidden] { display: none; }
.rv-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  background: #fff;
}
.rv-toolbar h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
.rv-info { color: #64748b; font-size: 13px; }
.rv-summary { color: #334155; font-size: 13px; margin-left: auto; }
.rv-summary strong { font-weight: 700; }
.rv-resolved-badge { display: none; margin-left: 6px; padding: 1px 8px; border-radius: 10px; background: #16a34a; color: #fff; font-size: 11px; font-weight: 700; }
.rv-resolved-badge.is-visible { display: inline-block; }
.rv-controls { display: flex; gap: 6px; flex-wrap: wrap; }
.rv-button, .rv-pill {
  min-height: 30px;
  border: 1px solid #c7cfdb;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.rv-button.is-active, .rv-pill.is-active { background: #2563eb; border-color: #2563eb; color: #fff; }
.rv-button:disabled {
  background: var(--surface-sunken, #f3f4f6);
  border-color: var(--border-default, #d1d5db);
  color: var(--text-tertiary, #9ca3af);
  cursor: not-allowed;
}
.rv-button-attention {
  background: var(--color-primary, #2563eb);
  border-color: var(--color-primary, #2563eb);
  color: var(--color-primary-fg, #fff);
}
.rv-button--sm { min-height: 24px; padding: 0 6px; font-size: 11px; margin-left: 8px; font-weight: 500; }
.rv-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #64748b; font-size: 12px; }
.rv-filter-check {
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  border: 1px solid #c7cfdb;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.rv-filter-check:has(input:checked) { background: #2563eb; border-color: #2563eb; color: #fff; }
.rv-main { min-height: 240px; }
.rv-grid {
  display: grid;
  /* 見開き表示: 2 列固定。row-gap で見開きペアの間を空け、column-gap=0 で本のノドを密着させる。
     direction: rtl で奇数 page (P.1, P.3, ...) を右、偶数 page (P.2, P.4, ...) を左に配置。 */
  grid-template-columns: 1fr 1fr;
  column-gap: 0;
  row-gap: 24px;
  direction: rtl;
  max-width: 1200px;
  margin: 0 auto;
}
.rv-page-card { background: var(--surface-elevated); border: 2px solid var(--border-subtle); border-radius: 8px; padding: 10px; direction: ltr; }
/* 見開きペアの本ノド側 (内側) は border を細く、外側を強調しない（ペア感の表現） */
.rv-page-card--shot { padding: 6px; border-radius: 4px; }
.rv-page-card h3 { margin: 0 0 8px; font-size: 14px; display: flex; gap: 8px; align-items: center; }
.rv-page-role { color: #6b7280; font-weight: 400; font-size: 12px; }
.rv-audit-fail { color: #dc2626; font-size: 11px; font-weight: 700; margin-left: auto; }
.rv-panel-grid { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
.rv-panel {
  position: relative;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: var(--surface-sunken);
  aspect-ratio: 1;
}
.rv-panel:focus { outline: 3px solid rgba(37,99,235,0.22); border-color: #2563eb; }
.rv-panel.rv-failed { border-color: #dc2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.22); }
.rv-panel.rv-has-revision { border-color: #f59e0b; }
.rv-panel.rv-adopted-v2plus { border-color: #16a34a; }
.rv-panel img { width: 100%; height: 100%; object-fit: contain; display: block; }
.rv-label, .rv-version, .rv-rev-badge {
  position: absolute;
  border-radius: 3px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.rv-label { left: 4px; top: 4px; background: rgba(31,41,55,0.86); padding: 1px 6px; }
.rv-version { right: 4px; top: 4px; background: rgba(37,99,235,0.88); padding: 1px 6px; }
.rv-rev-badge { right: 4px; bottom: 4px; min-width: 18px; padding: 1px 7px; border-radius: 10px; background: rgba(245,158,11,0.95); text-align: center; }
.rv-miss { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 11px; pointer-events: none; }
.rv-empty { padding: 40px; text-align: center; color: #6b7280; font-size: 14px; }
.rv-progress { display: grid; grid-template-columns: minmax(180px, 1fr) auto; align-items: center; gap: 10px; width: 100%; }
.rv-progress-bar { display: flex; min-width: 0; height: 12px; overflow: hidden; border: 1px solid var(--border-default, #d1d5db); border-radius: 999px; background: var(--surface-sunken, #f3f4f6); }
.rv-progress-seg { flex: 1 1 0; min-width: 8px; border: 0; border-right: 1px solid rgba(255,255,255,0.55); padding: 0; }
.rv-progress-seg:last-child { border-right: 0; }
.rv-progress-seg--ng { background: #dc2626; }
.rv-progress-seg--pending { background: #f59e0b; }
.rv-progress-seg--ok { background: #16a34a; }
.rv-progress-seg--idle { background: var(--surface-sunken, #e5e7eb); }
.rv-progress-summary { white-space: nowrap; color: var(--text-secondary, #64748b); font-size: 12px; font-weight: 700; }
.rv-help { color: #64748b; font-size: 12px; line-height: 1.6; }
.rv-help code { background: #eef2f6; padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, monospace; }
.rv-modal {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15,23,42,0.42);
}
.rv-modal.is-open { display: flex; }
.rv-modal-card { width: min(680px, 92vw); max-height: 92vh; overflow: auto; border-radius: 8px; background: #fff; box-shadow: 0 12px 42px rgba(15,23,42,0.32); }
.rv-modal-body { padding: 16px 20px; }
.rv-modal-body h3 { margin: 0 0 8px; font-size: 15px; }
.rv-modal-meta { color: #6b7280; font-size: 12px; margin-bottom: 12px; }
.rv-modal-body img { max-width: 100%; max-height: 50vh; border: 1px solid #d1d5db; border-radius: 4px; display: block; margin-bottom: 12px; }
.rv-tags { display: flex; flex-wrap: wrap; gap: 6px 10px; margin-bottom: 10px; font-size: 12px; }
.rv-tags label { display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 3px 8px; border: 1px solid #d1d5db; border-radius: 4px; }
.rv-modal-body textarea { width: 100%; min-height: 80px; padding: 8px; font-size: 13px; border: 1px solid #d1d5db; border-radius: 4px; font-family: inherit; resize: vertical; }
.rv-modal-hint { color: var(--text-secondary, #6b7280); font-size: 12px; margin: 8px 0 0; }
.rv-adopt-note-label { display: grid; gap: 4px; margin-bottom: 10px; }
.rv-adopt-note-label span { color: var(--text-secondary); font-size: 12px; font-weight: 700; }
.rv-adopt-note-label textarea { width: 100%; min-height: 60px; padding: 8px; font-size: 13px; border: 1px solid #d1d5db; border-radius: 4px; font-family: inherit; resize: vertical; }
.rv-modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.rv-primary { background: #2563eb; color: #fff; border: 0; border-radius: 4px; padding: 7px 16px; font-size: 13px; cursor: pointer; font-weight: 700; }
.rv-secondary { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 4px; padding: 7px 16px; font-size: 13px; cursor: pointer; }
.rv-message { min-height: 18px; margin-top: 8px; color: #b45309; font-size: 12px; }
.rv-toast { position: fixed; top: 64px; right: 18px; z-index: 50; padding: 10px 14px; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.rv-toast-ok { background: #16a34a; }
.rv-toast-warn { background: #f59e0b; }
.rv-toast-error { background: #dc2626; }
/* --- page_one_shot: page 全体を 1 つの click target にする (overlay 廃止) --- */
.rv-page-card--shot h3 { margin: 0 0 6px; padding: 0 4px; }
.rv-page-shot {
  position: relative;
  width: 100%;
  height: auto;
  /* aspect-ratio は inline style で page_plan canvas (1748/2480 等) を指定 */
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  overflow: hidden;
  padding: 0;
}
.rv-page-shot:focus { outline: 3px solid rgba(37,99,235,0.35); border-color: #2563eb; }
.rv-page-shot.rv-failed { border-color: #dc2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.22); }
.rv-page-shot.rv-has-revision { border-color: #f59e0b; }
.rv-page-shot.rv-adopted-v2plus { border-color: #16a34a; }
.rv-page-shot-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #fff;
}
.rv-page-version-badge {
  position: absolute;
  right: 6px;
  top: 6px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(37,99,235,0.92);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  pointer-events: none;
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
}
.rv-page-risk {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  margin-left: 4px;
}
.rv-page-risk-ok { background: #ecfdf5; color: #047857; border: 1px solid #6ee7b7; }
.rv-page-risk-warn { background: #fff7ed; color: #b45309; border: 1px solid #fdba74; }
.rv-page-risk-critical { background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; }
.rv-page-boring {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  font-size: 11px;
  font-weight: 700;
  margin-left: 4px;
}
/* page 詳細 modal (拡大 hero + version サムネ列) */
.rv-versions-card { width: min(1400px, 96vw); max-height: 96vh; overflow: auto; }
.rv-versions-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
/* 汎用 .rv-modal-body img の max-height: 50vh を上書きするため selector を強める */
.rv-modal-body .rv-versions-hero-img,
.rv-versions-hero-img {
  display: block;
  max-width: 100%;
  max-height: 86vh;
  width: auto;
  height: auto;
  object-fit: contain;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  margin-bottom: 0;
}
.rv-versions-hero-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: #374151;
  font-size: 12px;
}
.rv-versions-hero-version {
  font-size: 16px;
  font-weight: 700;
  background: rgba(37,99,235,0.92);
  color: #fff;
  padding: 3px 12px;
  border-radius: 12px;
}
.rv-versions-hero-adopt {
  margin-left: 8px;
}
.rv-version-origin { color: #6b7280; font-size: 11px; }
.rv-version-adopted-badge {
  background: #16a34a;
  color: #fff;
  border-radius: 8px;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 700;
}
.rv-version-note {
  align-self: stretch;
  padding: 6px 10px;
  background: #f0fdf4;
  border: 1px solid #16a34a;
  border-radius: 4px;
  color: #166534;
  font-size: 12px;
  line-height: 1.5;
}
.rv-versions-thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px;
  margin-bottom: 8px;
  scrollbar-width: thin;
}
.rv-versions-thumb {
  flex-shrink: 0;
  width: 96px;
  border: 2px solid #e5e7eb;
  border-radius: 4px;
  padding: 4px;
  background: #fafafa;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.rv-versions-thumb img {
  width: 100%;
  aspect-ratio: 1748/2480;
  object-fit: contain;
  background: #fff;
  border: 1px solid #d1d5db;
  display: block;
}
.rv-versions-thumb span {
  font-size: 11px;
  font-weight: 700;
  color: #374151;
  text-align: center;
}
.rv-versions-thumb.rv-viewing { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.22); }
.rv-versions-thumb.rv-adopted { background: #f0fdf4; border-color: #16a34a; }
.rv-versions-thumb.rv-adopted span { color: #166534; }
.rv-effects { display: grid; gap: 14px; }
.rv-effects-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.rv-effects-card {
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 8px;
  background: var(--surface-elevated, #fff);
  padding: 12px;
}
.rv-effects-card span { display: block; color: var(--text-secondary, #64748b); font-size: 12px; font-weight: 700; }
.rv-effects-card strong { display: block; margin-top: 4px; color: var(--text-default, #111827); font-size: 26px; line-height: 1; }
.rv-effects-section {
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 8px;
  background: var(--surface-elevated, #fff);
  padding: 12px;
}
.rv-effects-section h3 { margin: 0 0 10px; font-size: 14px; }
.rv-effects-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.rv-effects-table th, .rv-effects-table td { border-top: 1px solid var(--border-default, #e5e7eb); padding: 7px 8px; text-align: left; }
.rv-effects-table th { color: var(--text-secondary, #64748b); font-weight: 700; background: var(--surface-sunken, #f8fafc); }
.rv-effects-empty { padding: 40px; text-align: center; color: var(--text-secondary, #6b7280); font-size: 14px; }
`;

const TAG_LABELS: Record<RevisionTag, string> = {
  face: "顔",
  composition: "構図",
  tone: "トーン",
  ref: "ref不一致",
  anatomy: "体格/手足",
  background: "背景",
  other: "その他",
};

function ensureStyles(): void {
  if (document.getElementById("rv-styles")) return;
  const style = document.createElement("style");
  style.id = "rv-styles";
  style.textContent = RV_CSS;
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

function parseVersion(version: string): number {
  const m = version.match(/^v(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function assetUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("/")) return path;
  // SPA モード (URL に /works/{slug}/... が含まれる) では画像も /works/{slug}/ プレフィックスが必要。
  // scope 固定モードでは currentSlug が空 or default と一致 / server 側が default_slug 解決を担う。
  const slug = store.state.currentSlug;
  if (slug && !path.startsWith("works/")) {
    return `/works/${encodeURIComponent(slug)}/${path}`;
  }
  return `/${path}`;
}

function defaultImagePath(episode: number, pageNo: number): string {
  const ep = epLabel(episode);
  const page = String(pageNo).padStart(2, "0");
  return `episodes/${ep}/renders/p${page}.png`;
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function renderError(root: HTMLElement, title: string, error: unknown): void {
  const html = `
    <div class="view-placeholder">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(errorText(error))}</p>
    </div>`;
  // shell が存在する場合は listener を維持したまま main だけ差し替える。
  const main = root.querySelector<HTMLElement>("#rv-main");
  if (main) main.innerHTML = html;
  else root.innerHTML = html;
}

function renderShell(container: HTMLElement, slug: string, episode: number): void {
  const tags = REVISION_TAGS.map(
    (tag) =>
      `<label><input type="checkbox" data-rv-tag="${escapeHtml(tag)}"> ${escapeHtml(TAG_LABELS[tag])}</label>`
  ).join("");
  container.innerHTML = `
    <div class="rv-container" tabindex="-1">
      <div class="rv-toolbar">
        <h2>ページ修正</h2>
        <span class="rv-info">${escapeHtml(slug)} / ${epLabel(episode)}</span>
        <span class="rv-summary">
          修正待ち <strong id="rv-cnt-queue">0</strong> / 採用済 <strong id="rv-cnt-adopted">0</strong> / 監査NG <strong id="rv-cnt-failed">0</strong>
          <span class="rv-resolved-badge" id="rv-badge-resolved"></span>
        </span>
        <div class="rv-controls">
          <button type="button" class="rv-button" data-rv-rerun="L09" title="L09 Render を name gate skip + 新 version 採番で全 22 ページ再 render">全頁再生成</button>
          <button type="button" class="rv-button" id="rv-btn-l12-apply" data-rv-rerun="L12" title="L12 Repair で revision_queue を適用" disabled>修正を反映</button>
          <button type="button" class="rv-button" data-rv-ai-edit="L09" title="L09 (Render) を AI 編集 view へ">AI 編集</button>
        </div>
        <div class="rv-progress" id="rv-progress"></div>
      </div>
      <div class="rv-tabs" role="tablist" aria-label="ページ修正">
        <button type="button" class="nc-pill nc-pill--active" data-rv-tab="adoption" role="tab" aria-selected="true">採択</button>
        <button type="button" class="nc-pill" data-rv-tab="effects" role="tab" aria-selected="false">効果分析</button>
      </div>
      <section class="rv-tab-panel" id="rv-tab-adoption" data-rv-tab-panel="adoption" role="tabpanel">
        <div class="rv-filters">
          <label class="rv-filter-check"><input type="checkbox" data-rv-filter="failed"> 監査NGのみ</label>
          <label class="rv-filter-check"><input type="checkbox" data-rv-filter="revised"> 修正済のみ</label>
          <label class="rv-filter-check"><input type="checkbox" data-rv-filter="notAdopted"> 採用済を隠す</label>
          <span id="rv-filter-summary"></span>
        </div>
        <div class="rv-help"><code>j/k</code> panel 移動 <code>Tab</code> page 移動 <code>esc</code> close</div>
        <div class="rv-main" id="rv-main"><div class="rv-empty">読み込み中...</div></div>
      </section>
      <section class="rv-tab-panel" id="rv-tab-effects" data-rv-tab-panel="effects" role="tabpanel" hidden>
        <div id="rv-effects-main"><div class="rv-effects-empty">読み込み中...</div></div>
      </section>
      <div class="rv-modal" id="rv-modal" role="dialog" aria-modal="true" aria-labelledby="rv-modal-title">
        <div class="rv-modal-card">
          <div class="rv-modal-body">
            <h3 id="rv-modal-title">修正指示</h3>
            <div class="rv-modal-meta" id="rv-modal-meta"></div>
            <img id="rv-modal-img" alt="panel">
            <div class="rv-tags">${tags}</div>
            <textarea id="rv-modal-instruction" maxlength="1000" placeholder="自由記述 (1000 字以内)"></textarea>
            <div class="rv-message" id="rv-modal-message"></div>
            <p class="rv-modal-hint">送信しただけでは画像は変わりません。送信後ヘッダの『修正を反映』で再生成されます。</p>
            <div class="rv-modal-actions">
              <button type="button" class="rv-secondary" id="rv-modal-cancel">キャンセル</button>
              <button type="button" class="rv-primary" id="rv-modal-submit">指示を送信</button>
            </div>
          </div>
        </div>
      </div>
      <div class="rv-modal" id="rv-versions-modal" role="dialog" aria-modal="true" aria-labelledby="rv-versions-title">
        <div class="rv-modal-card rv-versions-card">
          <div class="rv-modal-body">
            <h3 id="rv-versions-title">page 詳細</h3>
            <div class="rv-modal-meta" id="rv-versions-meta"></div>
            <div class="rv-versions-hero" id="rv-versions-hero"></div>
            <div class="rv-versions-thumbs" id="rv-versions-thumbs"></div>
            <div class="rv-modal-actions">
              <button type="button" class="rv-secondary" id="rv-versions-instruct">この page に修正指示を入れる</button>
              <button type="button" class="rv-secondary" id="rv-versions-close">閉じる</button>
            </div>
          </div>
        </div>
      </div>
      <div class="rv-modal" id="rv-adopt-modal" role="dialog" aria-modal="true" aria-labelledby="rv-adopt-title">
        <div class="rv-modal-card">
          <div class="rv-modal-body">
            <h3 id="rv-adopt-title">採用版を選択</h3>
            <div class="rv-modal-meta" id="rv-adopt-meta"></div>
            <img id="rv-adopt-img" alt="adopt preview">
            <label class="rv-adopt-note-label">
              <span>採用理由メモ (任意、200 字以内)</span>
              <textarea id="rv-adopt-note" maxlength="200" placeholder="例: 表情がより悲しげで V1 より物語の起点として強い"></textarea>
            </label>
            <div class="rv-message" id="rv-adopt-message"></div>
            <div class="rv-modal-actions">
              <button type="button" class="rv-secondary" id="rv-adopt-cancel">キャンセル</button>
              <button type="button" class="rv-primary" id="rv-adopt-submit">採用する</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setText(root: HTMLElement, selector: string, text: string): void {
  const el = root.querySelector<HTMLElement>(selector);
  if (el) el.textContent = text;
}

function panelLookup(manifest: Manifest): Map<number, PanelView[]> {
  const byPagePlan = new Map<number, PagePlanPage>();
  for (const page of manifest.page_plan.pages) byPagePlan.set(page.page_no, page);
  const storyboardPanels = new Map<string, PanelV2>();
  for (const page of manifest.storyboard.pages) {
    for (const panel of page.panels) storyboardPanels.set(`${page.page_no}#${panel.panel_id}`, panel);
  }

  const result = new Map<number, PanelView[]>();
  for (const page of manifest.page_plan.pages) {
    const panels = page.panels.map((planned) => {
      const sb = storyboardPanels.get(`${page.page_no}#${planned.panel_id}`);
      const queueKey = page.render_strategy === "page_one_shot" ? `page_${page.page_no}` : planned.panel_id;
      return {
        pageNo: page.page_no,
        pageRole: String(page.page_role),
        renderStrategy: page.render_strategy,
        rawPanelId: planned.panel_id,
        queueKey,
        panelNo: sb?.panel_no,
        readingOrder: sb?.reading_order ?? planned.reading_order,
        importance: sb?.importance ?? planned.importance,
        shotType: sb?.shot_type,
        rect: planned.rect,
        dialogue: sb?.dialogue?.map((d) => d.text).filter((t): t is string => typeof t === "string" && t.length > 0),
        monologue: sb?.monologue?.map((m) => m.text).filter((t): t is string => typeof t === "string" && t.length > 0),
        narration: sb?.narration?.filter((t): t is string => typeof t === "string" && t.length > 0),
        sfx: sb?.sfx?.filter((t): t is string => typeof t === "string" && t.length > 0),
        silence: sb?.silence,
      };
    });
    panels.sort((a, b) => a.readingOrder - b.readingOrder);
    result.set(page.page_no, panels);
  }
  return result;
}

/**
 * page_one_shot overlay 用キャンバスサイズを episode 全体から推定する。
 * page_plan.panels[].rect は px (x+w, y+h の最大が紙面サイズ近似)。
 */
function computeCanvasSize(manifest: Manifest): { w: number; h: number } {
  let w = 0;
  let h = 0;
  for (const page of manifest.page_plan.pages) {
    for (const panel of page.panels) {
      if (!panel.rect) continue;
      w = Math.max(w, panel.rect.x + panel.rect.w);
      h = Math.max(h, panel.rect.y + panel.rect.h);
    }
  }
  // フォールバック: B6 縦比 1748x2480 (a07 capability profile 既定)
  if (!Number.isFinite(w) || w <= 0) w = 1748;
  if (!Number.isFinite(h) || h <= 0) h = 2480;
  return { w, h };
}

/** engagement_audit.per_page_scores を page_no で引ける Map に */
function engagementByPage(manifest: Manifest): Map<number, EngagementAuditPageScore> {
  const result = new Map<number, EngagementAuditPageScore>();
  for (const score of manifest.engagement_audit?.per_page_scores ?? []) {
    if (typeof score.page_no === "number") result.set(score.page_no, score);
  }
  return result;
}

/** panel hover で出すツールチップテキスト (改行区切り、80 字 cap × 行) */
function buildPanelTooltip(panel: PanelView): string {
  const lines: string[] = [];
  const head = `#${panel.readingOrder}${panel.shotType ? ` ${panel.shotType}` : ""}${panel.silence ? " (silence)" : ""}`;
  lines.push(head);
  if (panel.dialogue && panel.dialogue.length > 0) {
    for (const t of panel.dialogue) lines.push(`「${t.slice(0, 80)}」`);
  }
  if (panel.monologue && panel.monologue.length > 0) {
    for (const t of panel.monologue) lines.push(`(M) ${t.slice(0, 80)}`);
  }
  if (panel.narration && panel.narration.length > 0) {
    for (const t of panel.narration) lines.push(`(N) ${t.slice(0, 80)}`);
  }
  if (panel.sfx && panel.sfx.length > 0) {
    lines.push(`SFX: ${panel.sfx.join(" / ").slice(0, 80)}`);
  }
  return lines.join("\n");
}

function versionMap(manifest: Manifest): Map<string, VersionView[]> {
  const result = new Map<string, VersionView[]>();
  for (const entry of manifest.render_manifest ?? []) {
    if (entry.layer !== "render") continue;
    const versions = result.get(entry.panel_id) ?? [];
    versions.push({
      version: entry.version,
      image_path: entry.image_path,
      ts: entry.ts,
      origin: entry.origin,
    });
    result.set(entry.panel_id, versions);
  }
  for (const versions of result.values()) {
    versions.sort((a, b) => parseVersion(a.version) - parseVersion(b.version));
  }
  return result;
}

function failedPanelSet(manifest: Manifest): Set<string> {
  return new Set(manifest.audit?.failed_panel_ids ?? []);
}

function revisedPanelSet(manifest: Manifest): Set<string> {
  const result = new Set<string>();
  for (const entry of manifest.revision_queue ?? []) result.add(entry.panel_id);
  return result;
}

function unresolvedCountByPanel(manifest: Manifest): Map<string, number> {
  const result = new Map<string, number>();
  for (const entry of manifest.revision_queue ?? []) {
    if (entry.resolved_version) continue;
    result.set(entry.panel_id, (result.get(entry.panel_id) ?? 0) + 1);
  }
  return result;
}

function lastUnresolvedByPanel(manifest: Manifest): Map<string, RevisionEntry> {
  const result = new Map<string, RevisionEntry>();
  for (const entry of manifest.revision_queue ?? []) {
    if (!entry.resolved_version) result.set(entry.panel_id, entry);
  }
  return result;
}

function adoptedPanels(manifest: Manifest): AdoptedVersions["panels"] {
  return manifest.adopted?.panels ?? {};
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function computeEffects(manifest: Manifest): EffectsStats {
  const queue = manifest.revision_queue ?? [];
  const adopted = adoptedPanels(manifest);
  const totalQueued = queue.length;
  const resolved = queue.filter((entry) => Boolean(entry.resolved_version)).length;
  const adoptedNonV1 = Object.values(adopted).filter((choice) => choice?.chosen && choice.chosen !== "v1").length;
  const byTag = new Map<RevisionTag, { queued: number; resolved: number; adopted: number }>();
  for (const tag of REVISION_TAGS) byTag.set(tag, { queued: 0, resolved: 0, adopted: 0 });

  const panelStats = new Map<string, { panel_id: string; instructionCount: number; adoptedVersion: string | null; rounds: number }>();
  for (const entry of queue) {
    const tags = (entry.checked_tags ?? []).filter(isRevisionTag);
    const resolvedVersion = entry.resolved_version ?? null;
    for (const tag of tags) {
      const row = byTag.get(tag);
      if (!row) continue;
      row.queued++;
      if (resolvedVersion) row.resolved++;
      if (resolvedVersion && adopted[entry.panel_id]?.chosen === resolvedVersion) row.adopted++;
    }

    const stat = panelStats.get(entry.panel_id) ?? {
      panel_id: entry.panel_id,
      instructionCount: 0,
      adoptedVersion: adopted[entry.panel_id]?.chosen ?? null,
      rounds: 0,
    };
    stat.instructionCount++;
    stat.adoptedVersion = adopted[entry.panel_id]?.chosen ?? stat.adoptedVersion;
    stat.rounds = Math.max(
      stat.rounds,
      parseVersion(stat.adoptedVersion ?? ""),
      parseVersion(entry.resolved_version ?? ""),
      parseVersion(entry.for_version ?? "")
    );
    panelStats.set(entry.panel_id, stat);
  }

  return {
    totalQueued,
    resolved,
    adoptedNonV1,
    resolutionRate: totalQueued > 0 ? resolved / totalQueued : 0,
    adoptionRate: resolved > 0 ? adoptedNonV1 / resolved : 0,
    byTag,
    panelStats: Array.from(panelStats.values()).sort((a, b) => b.instructionCount - a.instructionCount),
  };
}

function renderEffects(manifest: Manifest): string {
  const stats = computeEffects(manifest);
  const unresolved = stats.totalQueued - stats.resolved;
  const tagRows = REVISION_TAGS.map((tag) => {
    const row = stats.byTag.get(tag) ?? { queued: 0, resolved: 0, adopted: 0 };
    const conv = row.resolved > 0 ? row.adopted / row.resolved : 0;
    return `<tr>
      <td>${escapeHtml(TAG_LABELS[tag])}</td>
      <td>${row.queued}</td>
      <td>${row.resolved}</td>
      <td>${row.adopted}</td>
      <td>${formatPct(conv)}</td>
    </tr>`;
  }).join("");
  const hardRows = stats.panelStats
    .filter((panel) => panel.instructionCount >= 3)
    .map((panel) => `<tr>
      <td>${escapeHtml(panel.panel_id)}</td>
      <td>${panel.instructionCount}</td>
      <td>${escapeHtml(panel.adoptedVersion ?? "-")}</td>
      <td>${panel.rounds || "-"}</td>
    </tr>`)
    .join("");

  return `
    <div class="rv-effects">
      <div class="rv-effects-grid">
        <section class="rv-effects-card"><span>総指示数</span><strong>${stats.totalQueued}</strong></section>
        <section class="rv-effects-card"><span>解消率</span><strong>${formatPct(stats.resolutionRate)}</strong></section>
        <section class="rv-effects-card"><span>採用率</span><strong>${formatPct(stats.adoptionRate)}</strong></section>
        <section class="rv-effects-card"><span>未解消</span><strong>${unresolved}</strong></section>
      </div>
      <section class="rv-effects-section">
        <h3>タグ別の効果</h3>
        <table class="rv-effects-table">
          <thead><tr><th>タグ</th><th>指示</th><th>解消</th><th>採用</th><th>採用率</th></tr></thead>
          <tbody>${tagRows}</tbody>
        </table>
      </section>
      <section class="rv-effects-section">
        <h3>困難 panel ランキング</h3>
        ${hardRows ? `<table class="rv-effects-table">
          <thead><tr><th>panel_id</th><th>指示回数</th><th>採用版</th><th>rounds</th></tr></thead>
          <tbody>${hardRows}</tbody>
        </table>` : '<div class="rv-effects-empty">指示回数 3 回以上の panel はありません。</div>'}
      </section>
    </div>`;
}

function matchingVersions(versions: Map<string, VersionView[]>, panel: PanelView): VersionView[] {
  return versions.get(panel.queueKey) ?? [];
}

function matchingAdopted(
  adopted: AdoptedVersions["panels"],
  panel: PanelView
): AdoptedVersions["panels"][string] | undefined {
  return adopted[panel.queueKey];
}

function hasRevision(revised: Set<string>, panel: PanelView): boolean {
  return revised.has(panel.queueKey);
}

function unresolvedCount(counts: Map<string, number>, panel: PanelView): number {
  return counts.get(panel.queueKey) ?? 0;
}

function lastInstruction(
  entries: Map<string, RevisionEntry>,
  panel: PanelView
): RevisionEntry | undefined {
  return entries.get(panel.queueKey);
}

function passesFilter(
  filters: Filters,
  panel: PanelView,
  failed: Set<string>,
  revised: Set<string>,
  adopted: AdoptedVersions["panels"]
): boolean {
  if (filters.failed && !failed.has(panel.queueKey)) return false;
  if (filters.revised && !revised.has(panel.queueKey)) return false;
  const adoptedChoice = matchingAdopted(adopted, panel);
  if (filters.notAdopted && adoptedChoice?.chosen && adoptedChoice.chosen !== "v1") return false;
  return true;
}

function renderSummary(root: HTMLElement, state: ViewState): void {
  const manifest = state.manifest;
  if (!manifest) return;
  const queue = manifest.revision_queue ?? [];
  const unresolved = queue.filter((entry) => !entry.resolved_version).length;
  const resolved = queue.length - unresolved;
  const adopted = Object.keys(adoptedPanels(manifest)).length;
  const failed = manifest.audit?.failed_panel_ids?.length ?? 0;
  setText(root, "#rv-cnt-queue", unresolved + (resolved > 0 ? ` (${resolved} 消化済)` : ""));
  setText(root, "#rv-cnt-adopted", String(adopted));
  setText(root, "#rv-cnt-failed", String(failed));
  const l12ApplyButton = root.querySelector<HTMLButtonElement>("#rv-btn-l12-apply");
  if (l12ApplyButton) {
    l12ApplyButton.disabled = unresolved === 0;
    l12ApplyButton.classList.toggle("rv-button-attention", unresolved > 0);
    l12ApplyButton.textContent = unresolved > 0 ? `修正を反映 (${unresolved})` : "修正を反映";
  }
  const badge = root.querySelector<HTMLElement>("#rv-badge-resolved");
  if (badge) {
    badge.textContent = resolved > 0 ? `+${resolved} 消化` : "";
    badge.classList.toggle("is-visible", resolved > 0);
  }
  renderProgress(root, manifest);
  root.querySelectorAll<HTMLInputElement>("[data-rv-filter]").forEach((input) => {
    if (input.dataset.rvFilter === "failed") input.checked = state.filters.failed;
    else if (input.dataset.rvFilter === "revised") input.checked = state.filters.revised;
    else if (input.dataset.rvFilter === "notAdopted") input.checked = state.filters.notAdopted;
  });
}

type PageProgressStatus = "ng" | "pending" | "ok" | "idle";

function renderProgress(root: HTMLElement, manifest: Manifest): void {
  const progress = root.querySelector<HTMLElement>("#rv-progress");
  if (!progress) return;
  const lookup = panelLookup(manifest);
  const failed = failedPanelSet(manifest);
  const unresolved = unresolvedCountByPanel(manifest);
  const adopted = adoptedPanels(manifest);
  const pages = manifest.page_plan.pages.slice().sort((a, b) => a.page_no - b.page_no);
  const counts: Record<PageProgressStatus, number> = { ng: 0, pending: 0, ok: 0, idle: 0 };

  const segments = pages.map((page) => {
    const panels = lookup.get(page.page_no) ?? [];
    const panelIds = new Set<string>();
    for (const panel of panels) {
      panelIds.add(panel.queueKey);
      panelIds.add(panel.rawPanelId);
    }
    let status: PageProgressStatus = "idle";
    let chosen = "";
    if (Array.from(panelIds).some((id) => failed.has(id))) {
      status = "ng";
    } else if (Array.from(panelIds).some((id) => (unresolved.get(id) ?? 0) > 0)) {
      status = "pending";
    } else {
      for (const id of panelIds) {
        const choice = adopted[id];
        if (choice?.chosen && choice.chosen !== "v1") {
          status = "ok";
          chosen = choice.chosen;
          break;
        }
      }
    }
    counts[status]++;
    const label =
      status === "ng" ? "監査NG" : status === "pending" ? "修正待ち" : status === "ok" ? `採用済 (${chosen})` : "未着手";
    return `<span class="rv-progress-seg rv-progress-seg--${status}" title="${escapeHtml(`P.${page.page_no} ${label}`)}" aria-label="${escapeHtml(`P.${page.page_no} ${label}`)}"></span>`;
  }).join("");

  progress.innerHTML = `
    <div class="rv-progress-bar" role="img" aria-label="${escapeHtml(`${pages.length} ページの承認進捗`)}">${segments}</div>
    <div class="rv-progress-summary">${pages.length} ページ中 ${counts.ok} 採用済 / ${counts.pending} 修正待ち / ${counts.ng} 監査NG</div>
  `;
}

function renderGrid(root: HTMLElement, state: ViewState, slug: string, episode: number): void {
  const manifest = state.manifest;
  const main = root.querySelector<HTMLElement>("#rv-main");
  if (!manifest || !main) return;

  const lookup = panelLookup(manifest);
  const versions = versionMap(manifest);
  const failed = failedPanelSet(manifest);
  const revised = revisedPanelSet(manifest);
  const unresolved = unresolvedCountByPanel(manifest);
  const lastEntries = lastUnresolvedByPanel(manifest);
  const adopted = adoptedPanels(manifest);
  const canvas = computeCanvasSize(manifest);
  const engagement = engagementByPage(manifest);
  let total = 0;
  let shown = 0;

  const pages = manifest.page_plan.pages.slice().sort((a, b) => a.page_no - b.page_no);
  const pageHtml: string[] = [];
  for (const page of pages) {
    const panels = lookup.get(page.page_no) ?? [];
    const pageFailedCount = panels.filter((panel) => failed.has(panel.queueKey)).length;
    const isPageShot = page.render_strategy === "page_one_shot";

    if (isPageShot) {
      // 1 page = 1 click target。panel rect overlay は廃止 (1P 単位生成のため不要)。
      // queueKey は全 panel 共通で `page_${page.page_no}`、状態は page 単位に集約。
      const repr = panels[0];
      if (!repr) continue;
      total++;
      if (!passesFilter(state.filters, repr, failed, revised, adopted)) continue;
      shown++;
      const allVersions = matchingVersions(versions, repr);
      const latest = allVersions[allVersions.length - 1];
      const adoptedChoice = matchingAdopted(adopted, repr);
      const showVersion = adoptedChoice?.chosen ?? latest?.version ?? "v1";
      const imagePath =
        adoptedChoice?.image_path ?? latest?.image_path ?? defaultImagePath(episode, page.page_no);
      const revisionCount = unresolvedCount(unresolved, repr);
      const lastEntry = lastInstruction(lastEntries, repr);
      const stateTooltip = lastEntry
        ? `\n指示 ${revisionCount} 件 / 最新: ${lastEntry.instruction.slice(0, 80)}`
        : pageFailedCount > 0
          ? `\n監査失敗 panel: ${pageFailedCount} 件`
          : "";
      const tooltip = `page ${page.page_no} (${showVersion}) — クリックで過去版表示${stateTooltip}`;

      const classes = ["rv-panel", "rv-page-shot"];
      if (failed.has(repr.queueKey) || pageFailedCount > 0) classes.push("rv-failed");
      if (hasRevision(revised, repr)) classes.push("rv-has-revision");
      if (showVersion !== "v1") classes.push("rv-adopted-v2plus");

      const score = engagement.get(page.page_no);
      const headerBadges: string[] = [];
      if (score) {
        const riskClass =
          score.drop_off_risk >= 70
            ? "rv-page-risk-critical"
            : score.drop_off_risk >= 50
              ? "rv-page-risk-warn"
              : "rv-page-risk-ok";
        headerBadges.push(
          `<span class="rv-page-risk ${riskClass}" title="${escapeHtml(score.comment ?? "")}">risk ${score.drop_off_risk}</span>`
        );
        if (score.boring_flagged) {
          headerBadges.push(
            `<span class="rv-page-boring" title="${escapeHtml(score.boring_reason ?? "boring flagged")}">⚠ boring</span>`
          );
        }
      }
      if (pageFailedCount > 0) {
        headerBadges.push(`<span class="rv-audit-fail">audit failed: ${pageFailedCount}</span>`);
      }

      const aspect = `${canvas.w}/${canvas.h}`;
      pageHtml.push(`
        <section class="rv-page-card rv-page-card--shot">
          <h3>P.${page.page_no} <span class="rv-page-role">[${escapeHtml(String(page.page_role))}]</span>${headerBadges.join("")}</h3>
          <button type="button" class="${classes.join(" ")}"
            data-panel-id="${escapeHtml(repr.queueKey)}"
            data-page-no="${page.page_no}"
            data-image-path="${escapeHtml(imagePath)}"
            data-for-version="${escapeHtml(showVersion)}"
            title="${escapeHtml(tooltip)}"
            aria-label="${escapeHtml(`page ${page.page_no} の修正・採用`)}"
            style="aspect-ratio:${aspect};">
            <img class="rv-page-shot-img" src="${escapeHtml(assetUrl(imagePath))}" loading="lazy" alt="${escapeHtml(`page_${page.page_no} ${showVersion}`)}">
            <span class="rv-page-version-badge">${escapeHtml(showVersion)}</span>
            ${revisionCount > 0 ? `<span class="rv-rev-badge">${revisionCount}</span>` : ""}
          </button>
        </section>
      `);
      continue;
    }

    // panel_composite: 既存 panel grid
    const panelHtml: string[] = [];
    for (const panel of panels) {
      total++;
      if (!passesFilter(state.filters, panel, failed, revised, adopted)) continue;
      shown++;
      const allVersions = matchingVersions(versions, panel);
      const latest = allVersions[allVersions.length - 1];
      const adoptedChoice = matchingAdopted(adopted, panel);
      const showVersion = adoptedChoice?.chosen ?? latest?.version ?? "v1";
      const imagePath =
        adoptedChoice?.image_path ?? latest?.image_path ?? defaultImagePath(episode, panel.pageNo);
      const revisionCount = unresolvedCount(unresolved, panel);
      const lastEntry = lastInstruction(lastEntries, panel);
      const tooltip = lastEntry
        ? `指示 ${revisionCount} 件 / 最新: ${lastEntry.instruction.slice(0, 80)}`
        : failed.has(panel.queueKey)
          ? "監査失敗 panel"
          : "";
      const classes = ["rv-panel"];
      if (failed.has(panel.queueKey)) classes.push("rv-failed");
      if (hasRevision(revised, panel)) classes.push("rv-has-revision");
      if (showVersion !== "v1") classes.push("rv-adopted-v2plus");
      const panelNoAttr = panel.panelNo !== undefined ? ` data-panel-no="${panel.panelNo}"` : "";
      panelHtml.push(`
        <button type="button" class="${classes.join(" ")}"
          data-panel-id="${escapeHtml(panel.queueKey)}"
          data-page-no="${panel.pageNo}"
          ${panelNoAttr}
          data-image-path="${escapeHtml(imagePath)}"
          data-for-version="${escapeHtml(showVersion)}"
          title="${escapeHtml(tooltip)}">
          <span class="rv-label">#${panel.readingOrder} ${escapeHtml(panel.shotType ?? "")}</span>
          <span class="rv-version">${escapeHtml(showVersion)}</span>
          ${revisionCount > 0 ? `<span class="rv-rev-badge">${revisionCount}</span>` : ""}
          <img src="${escapeHtml(assetUrl(imagePath))}" loading="lazy" alt="${escapeHtml(panel.queueKey)}">
        </button>
      `);
    }
    if (panelHtml.length === 0) continue;

    const score = engagement.get(page.page_no);
    const headerBadges: string[] = [];
    if (score) {
      const riskClass =
        score.drop_off_risk >= 70
          ? "rv-page-risk-critical"
          : score.drop_off_risk >= 50
            ? "rv-page-risk-warn"
            : "rv-page-risk-ok";
      headerBadges.push(
        `<span class="rv-page-risk ${riskClass}" title="${escapeHtml(score.comment ?? "")}">risk ${score.drop_off_risk}</span>`
      );
      if (score.boring_flagged) {
        headerBadges.push(
          `<span class="rv-page-boring" title="${escapeHtml(score.boring_reason ?? "boring flagged")}">⚠ boring</span>`
        );
      }
    }
    if (pageFailedCount > 0) {
      headerBadges.push(`<span class="rv-audit-fail">audit failed: ${pageFailedCount}</span>`);
    }

    pageHtml.push(`
      <section class="rv-page-card">
        <h3>P.${page.page_no} <span class="rv-page-role">[${escapeHtml(String(page.page_role))}]</span>${headerBadges.join("")}</h3>
        <div class="rv-panel-grid">${panelHtml.join("")}</div>
      </section>
    `);
  }

  main.innerHTML = `<div class="rv-grid">${pageHtml.join("") || '<div class="rv-empty">該当パネルなし</div>'}</div>`;
  setText(root, "#rv-filter-summary", `${shown} / ${total} panels`);
  void slug;
}

function renderEffectsPanel(root: HTMLElement, state: ViewState): void {
  const main = root.querySelector<HTMLElement>("#rv-effects-main");
  if (!main) return;
  main.innerHTML = state.manifest ? renderEffects(state.manifest) : '<div class="rv-effects-empty">読み込み中...</div>';
}

function renderTabState(root: HTMLElement, state: ViewState, slug: string, episode: number): void {
  root.querySelectorAll<HTMLButtonElement>("[data-rv-tab]").forEach((button) => {
    const active = button.dataset.rvTab === state.tab;
    button.classList.toggle("nc-pill--active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  root.querySelectorAll<HTMLElement>("[data-rv-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.rvTabPanel !== state.tab;
  });
  if (state.tab === "adoption") renderGrid(root, state, slug, episode);
  else renderEffectsPanel(root, state);
}

function refresh(root: HTMLElement, state: ViewState, slug: string, episode: number): void {
  renderSummary(root, state);
  renderTabState(root, state, slug, episode);
}

function selectedTags(root: HTMLElement): RevisionTag[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>("[data-rv-tag]:checked"))
    .map((input) => input.dataset.rvTag)
    .filter(isRevisionTag);
}

function openRevisionModal(root: HTMLElement, state: ViewState, context: ModalContext): void {
  state.modal = context;
  setText(
    root,
    "#rv-modal-meta",
    `panel=${context.panel_id} / page=${context.page_no} / version=${context.for_version}`
  );
  const image = root.querySelector<HTMLImageElement>("#rv-modal-img");
  if (image) image.src = assetUrl(context.image_path);
  const instruction = root.querySelector<HTMLTextAreaElement>("#rv-modal-instruction");
  if (instruction) instruction.value = "";
  root.querySelectorAll<HTMLInputElement>("[data-rv-tag]").forEach((input) => {
    input.checked = false;
  });
  setText(root, "#rv-modal-message", "");
  root.querySelector<HTMLElement>("#rv-modal")?.classList.add("is-open");
  requestAnimationFrame(() => instruction?.focus());
}

function closeRevisionModal(root: HTMLElement, state: ViewState): void {
  state.modal = null;
  root.querySelector<HTMLElement>("#rv-modal")?.classList.remove("is-open");
}

function renderVersionsList(root: HTMLElement, state: ViewState, ctx: VersionsModalContext): void {
  const manifest = state.manifest;
  if (!manifest) return;
  const versions = versionMap(manifest).get(ctx.panel_id) ?? [];
  const adopted = adoptedPanels(manifest);
  const adoptedChoice = adopted[ctx.panel_id];
  const hero = root.querySelector<HTMLElement>("#rv-versions-hero");
  const thumbs = root.querySelector<HTMLElement>("#rv-versions-thumbs");
  if (!hero || !thumbs) return;

  if (versions.length === 0) {
    // render 履歴ゼロでも現在表示中の画像 (defaultImagePath) を hero に出す
    hero.innerHTML = `
      <img class="rv-versions-hero-img" src="${escapeHtml(assetUrl(ctx.current_image_path))}" alt="${escapeHtml(`page ${ctx.page_no}`)}">
      <div class="rv-versions-hero-meta">
        <span class="rv-versions-hero-version">${escapeHtml(ctx.current_for_version)}</span>
        <span class="rv-version-origin">render 履歴未登録</span>
      </div>
    `;
    thumbs.innerHTML = "";
    return;
  }

  // viewing idx 決定: 明示指定 → adopted の最後の出現 → latest (末尾)
  let viewingIdx = typeof ctx.viewingIdx === "number" ? ctx.viewingIdx : -1;
  if (viewingIdx < 0 || viewingIdx >= versions.length) {
    if (adoptedChoice?.chosen) {
      // adopted version 文字列に一致する最後の entry (同 version 重複時、最新を選ぶ)
      for (let i = versions.length - 1; i >= 0; i--) {
        if (versions[i].version === adoptedChoice.chosen) {
          viewingIdx = i;
          break;
        }
      }
    }
    if (viewingIdx < 0) viewingIdx = versions.length - 1;
  }
  const viewing = versions[viewingIdx];
  const viewingIsAdopted = adoptedChoice?.chosen === viewing?.version;
  const adoptLabel = viewingIsAdopted ? "採用中" : "この版を採用";
  const tsLong = viewing?.ts
    ? new Date(viewing.ts).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const noteHtml = viewingIsAdopted && adoptedChoice?.note
    ? `<div class="rv-version-note">${escapeHtml(adoptedChoice.note)}</div>`
    : "";

  hero.innerHTML = `
    <img class="rv-versions-hero-img" src="${escapeHtml(assetUrl(viewing?.image_path ?? ""))}" alt="${escapeHtml(`page ${ctx.page_no} ${viewing?.version ?? ""}`)}">
    <div class="rv-versions-hero-meta">
      <span class="rv-versions-hero-version">${escapeHtml(viewing?.version ?? "")}</span>
      <span class="rv-version-origin">${escapeHtml(viewing?.origin ?? "initial")}</span>
      ${tsLong ? `<span class="rv-version-origin">${escapeHtml(tsLong)}</span>` : ""}
      ${viewingIsAdopted ? `<span class="rv-version-adopted-badge">採用中</span>` : ""}
      <button type="button" class="rv-primary rv-versions-hero-adopt"
        data-rv-adopt-page="${escapeHtml(ctx.panel_id)}"
        data-rv-adopt-version="${escapeHtml(viewing?.version ?? "")}"
        data-rv-adopt-path="${escapeHtml(viewing?.image_path ?? "")}">${escapeHtml(adoptLabel)}</button>
    </div>
    ${noteHtml}
  `;

  if (versions.length <= 1) {
    // 単一 version はサムネ列を出さない (冗長)
    thumbs.innerHTML = "";
  } else {
    thumbs.innerHTML = versions.map((v, i) => {
      const isAdopted = adoptedChoice?.chosen === v.version;
      const isViewing = i === viewingIdx;
      const cls = ["rv-versions-thumb"];
      if (isAdopted) cls.push("rv-adopted");
      if (isViewing) cls.push("rv-viewing");
      return `
        <button type="button" class="${cls.join(" ")}"
          data-rv-thumb
          data-rv-idx="${i}"
          title="${escapeHtml(`${v.version} (${v.origin ?? "initial"})`)}">
          <img src="${escapeHtml(assetUrl(v.image_path))}" loading="lazy" alt="${escapeHtml(v.version)}">
          <span>${escapeHtml(v.version)}${isAdopted ? " ★" : ""}</span>
        </button>
      `;
    }).join("");
  }
}

function openVersionsModal(root: HTMLElement, state: ViewState, context: VersionsModalContext): void {
  state.versionsModal = context;
  const manifest = state.manifest;
  const adopted = manifest ? adoptedPanels(manifest) : {};
  const adoptedChoice = adopted[context.panel_id];
  const versionsCount = manifest ? (versionMap(manifest).get(context.panel_id) ?? []).length : 0;
  const navHint = (versionsCount > 1 ? " · ←/→ で版切替" : "") + " · Tab で前後 page";
  setText(
    root,
    "#rv-versions-meta",
    `page ${context.page_no} / ${versionsCount} 版${adoptedChoice ? ` / 採用中: ${adoptedChoice.chosen}` : ""}${navHint}`
  );
  renderVersionsList(root, state, context);
  root.querySelector<HTMLElement>("#rv-versions-modal")?.classList.add("is-open");
}

function setViewingByIdx(root: HTMLElement, state: ViewState, idx: number): void {
  if (!state.versionsModal) return;
  state.versionsModal.viewingIdx = idx;
  renderVersionsList(root, state, state.versionsModal);
}

/** versions modal を開いたまま、隣の page に対象を切り替える (Tab / Shift+Tab)。
 *  modal は閉じない。viewingIdx は新 page の adopted/latest にリセット。 */
function navigateVersionsModalPage(
  root: HTMLElement,
  state: ViewState,
  dir: 1 | -1,
  episode: number
): void {
  const ctx = state.versionsModal;
  if (!ctx || !state.manifest) return;
  const pages = state.manifest.page_plan.pages.slice().sort((a, b) => a.page_no - b.page_no);
  if (pages.length <= 1) return;
  const currentIdx = pages.findIndex((p) => p.page_no === ctx.page_no);
  if (currentIdx < 0) return;
  // wrap (端で循環): 22 page なら最後の Tab で page 1 に戻る
  const nextIdx = (currentIdx + dir + pages.length) % pages.length;
  const nextPage = pages[nextIdx];
  if (nextPage.page_no === ctx.page_no) return;

  const lookup = panelLookup(state.manifest);
  const versions = versionMap(state.manifest);
  const adopted = adoptedPanels(state.manifest);
  const panels = lookup.get(nextPage.page_no) ?? [];
  const repr = panels[0];
  if (!repr) return;
  const allVersions = versions.get(repr.queueKey) ?? [];
  const latest = allVersions[allVersions.length - 1];
  const adoptedChoice = adopted[repr.queueKey];
  const showVersion = adoptedChoice?.chosen ?? latest?.version ?? "v1";
  const imagePath =
    adoptedChoice?.image_path ?? latest?.image_path ?? defaultImagePath(episode, nextPage.page_no);

  openVersionsModal(root, state, {
    panel_id: repr.queueKey,
    page_no: nextPage.page_no,
    current_image_path: imagePath,
    current_for_version: showVersion,
  });
}

/** versions modal で前/次 version に移動 (矢印キー)。idx で行き来する。 */
function navigateVersion(root: HTMLElement, state: ViewState, dir: 1 | -1): void {
  const ctx = state.versionsModal;
  if (!ctx || !state.manifest) return;
  const versions = versionMap(state.manifest).get(ctx.panel_id) ?? [];
  if (versions.length <= 1) return;
  const adoptedChoice = adoptedPanels(state.manifest)[ctx.panel_id];

  let idx = typeof ctx.viewingIdx === "number" ? ctx.viewingIdx : -1;
  if (idx < 0 || idx >= versions.length) {
    if (adoptedChoice?.chosen) {
      for (let i = versions.length - 1; i >= 0; i--) {
        if (versions[i].version === adoptedChoice.chosen) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) idx = versions.length - 1;
  }

  const nextIdx = Math.max(0, Math.min(versions.length - 1, idx + dir));
  if (nextIdx === idx) return;
  setViewingByIdx(root, state, nextIdx);
}

function closeVersionsModal(root: HTMLElement, state: ViewState): void {
  state.versionsModal = null;
  root.querySelector<HTMLElement>("#rv-versions-modal")?.classList.remove("is-open");
}

function openAdoptModal(root: HTMLElement, state: ViewState, context: AdoptModalContext): void {
  state.adoptModal = context;
  setText(root, "#rv-adopt-meta", `panel=${context.panel_id} / version=${context.chosen_version}`);
  const image = root.querySelector<HTMLImageElement>("#rv-adopt-img");
  if (image) image.src = assetUrl(context.image_path);
  const note = root.querySelector<HTMLTextAreaElement>("#rv-adopt-note");
  if (note) note.value = context.current_note;
  setText(root, "#rv-adopt-message", "");
  root.querySelector<HTMLElement>("#rv-adopt-modal")?.classList.add("is-open");
  requestAnimationFrame(() => note?.focus());
}

function closeAdoptModal(root: HTMLElement, state: ViewState): void {
  state.adoptModal = null;
  root.querySelector<HTMLElement>("#rv-adopt-modal")?.classList.remove("is-open");
}

function toast(root: HTMLElement, message: string, kind: "ok" | "warn" | "error"): void {
  const div = document.createElement("div");
  div.className = `rv-toast rv-toast-${kind}`;
  div.textContent = message;
  root.appendChild(div);
  window.setTimeout(() => div.remove(), 3000);
}

function enqueue(
  chains: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<void>
): void {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  chains.set(
    key,
    next.finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    })
  );
}

async function reloadManifest(state: ViewState, slug: string, episode: number): Promise<void> {
  state.manifest = await apiGetManifest(slug, episode);
}

function bindStaticListeners(
  root: HTMLElement,
  state: ViewState,
  slug: string,
  episode: number,
  signal: AbortSignal,
  chains: Map<string, Promise<void>>
): void {
  let focusIndex = 0;
  const panels = () => Array.from(root.querySelectorAll<HTMLElement>(".rv-panel"));
  const focusPanel = (idx: number): void => {
    const list = panels();
    if (list.length === 0) return;
    focusIndex = (idx + list.length) % list.length;
    list[focusIndex]?.focus();
  };
  const focusPage = (dir: 1 | -1): void => {
    const list = panels();
    if (list.length <= 1) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.classList.contains("rv-panel")) {
      const idx = list.indexOf(active);
      if (idx >= 0) focusIndex = idx;
    }
    const currentPage = Number(list[focusIndex]?.dataset.pageNo ?? NaN);
    if (!Number.isFinite(currentPage)) return;
    // DOM 順で page_no を重複排除した一覧を作る (見開き grid でも DOM 順は P.1, P.2, ... と昇順)
    const pageNos: number[] = [];
    for (const panel of list) {
      const p = Number(panel.dataset.pageNo ?? NaN);
      if (Number.isFinite(p) && pageNos[pageNos.length - 1] !== p) pageNos.push(p);
    }
    if (pageNos.length <= 1) return;
    const currentPageIdx = pageNos.indexOf(currentPage);
    if (currentPageIdx < 0) return;
    const targetPage = pageNos[(currentPageIdx + dir + pageNos.length) % pageNos.length];
    // 該当ページの先頭 panel に focus (両方向対称)
    const targetIndex = list.findIndex((panel) => Number(panel.dataset.pageNo ?? NaN) === targetPage);
    if (targetIndex >= 0) focusPanel(targetIndex);
  };
  const focusedPanel = (): HTMLElement | undefined => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.classList.contains("rv-panel")) {
      const idx = panels().indexOf(active);
      if (idx >= 0) focusIndex = idx;
      return active;
    }
    return panels()[focusIndex];
  };

  root.querySelectorAll<HTMLButtonElement>("[data-rv-rerun]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const layer = button.dataset.rvRerun;
        if (!isRunnableLayer(layer)) return;
        void spawnLayerWithModal({
          layer,
          status: "ready",
          slug,
          episode,
          extraArgs: layer === "L09" ? { "--skip-name-gate": "", "--auto-version": "" } : undefined,
          modalOverrides: layer === "L09"
            ? {
                title: "L09 本番画像生成 (Render) を全頁再生成",
                warning: "全 22 ページを新 version で再生成します。既存 render (v1〜vN) はそのまま保存されます。",
                description: "name gate を skip し、新しい version 番号 (既存最大 +1) を自動採番して全ページの再 render を発行します。コストが大きいので注意。",
                confirmLabel: "新 version で再生成",
              }
            : undefined,
          callbacks: {
            onSuccess: () => refresh(root, state, slug, episode),
            onError: (msg) => alert(msg),
          },
        });
      },
      { signal }
    );
  });
  root.querySelectorAll<HTMLButtonElement>("[data-rv-ai-edit]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const layer = button.dataset.rvAiEdit;
        if (layer) navigateToAiEdit(layer, { slug, episode });
      },
      { signal }
    );
  });
  root.querySelectorAll<HTMLButtonElement>("[data-rv-tab]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const tab = button.dataset.rvTab as RevisionTab | undefined;
        if (tab !== "adoption" && tab !== "effects") return;
        state.tab = tab;
        refresh(root, state, slug, episode);
      },
      { signal }
    );
  });
  root.querySelectorAll<HTMLInputElement>("[data-rv-filter]").forEach((input) => {
    input.addEventListener(
      "change",
      () => {
        if (input.dataset.rvFilter === "failed") state.filters.failed = input.checked;
        else if (input.dataset.rvFilter === "revised") state.filters.revised = input.checked;
        else if (input.dataset.rvFilter === "notAdopted") state.filters.notAdopted = input.checked;
        refresh(root, state, slug, episode);
      },
      { signal }
    );
  });
  root.addEventListener(
    "keydown",
    (event) => {
      if (state.modal || state.adoptModal) {
        if (event.key === "Escape") {
          closeRevisionModal(root, state);
          closeAdoptModal(root, state);
          event.preventDefault();
        }
        return;
      }
      if (state.versionsModal) {
        if (event.key === "Escape") {
          closeVersionsModal(root, state);
          event.preventDefault();
          return;
        }
        // 矢印キー / h・l (vim 風) で version サムネを行き来する
        if (event.key === "ArrowRight" || event.key === "l" || event.key === "L") {
          navigateVersion(root, state, 1);
          event.preventDefault();
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "h" || event.key === "H") {
          navigateVersion(root, state, -1);
          event.preventDefault();
          return;
        }
        // Tab / Shift+Tab で modal を閉じずに前後 page に対象を切替
        if (event.key === "Tab") {
          navigateVersionsModalPage(root, state, event.shiftKey ? -1 : 1, episode);
          event.preventDefault();
          return;
        }
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          if (event.key !== "Escape") return;
        }
      }
      if (event.key === "j" || event.key === "ArrowDown") {
        focusPanel(focusIndex + 1);
        event.preventDefault();
      } else if (event.key === "k" || event.key === "ArrowUp") {
        focusPanel(focusIndex - 1);
        event.preventDefault();
      } else if (event.key === "Tab") {
        focusPage(event.shiftKey ? -1 : 1);
        event.preventDefault();
      } else if (event.key === "Enter") {
        const panel = focusedPanel();
        if (panel) panel.click();
        event.preventDefault();
      } else if (event.key === " ") {
        const panel = focusedPanel();
        if (panel) panel.click();
        event.preventDefault();
      } else if (event.key === "?") {
        toast(root, "j/k 移動 / Tab page 移動 / Enter 修正指示 / esc close", "ok");
        event.preventDefault();
      } else if (event.key === "Escape") {
        closeRevisionModal(root, state);
        closeAdoptModal(root, state);
        closeVersionsModal(root, state);
        event.preventDefault();
      }
    },
    { signal }
  );
  root.querySelector<HTMLButtonElement>("#rv-modal-cancel")?.addEventListener(
    "click",
    () => closeRevisionModal(root, state),
    { signal }
  );
  root.querySelector<HTMLElement>("#rv-modal")?.addEventListener(
    "click",
    (event) => {
      if (event.target === event.currentTarget) closeRevisionModal(root, state);
    },
    { signal }
  );
  root.querySelector<HTMLButtonElement>("#rv-adopt-cancel")?.addEventListener(
    "click",
    () => closeAdoptModal(root, state),
    { signal }
  );
  root.querySelector<HTMLElement>("#rv-adopt-modal")?.addEventListener(
    "click",
    (event) => {
      if (event.target === event.currentTarget) closeAdoptModal(root, state);
    },
    { signal }
  );
  root.querySelector<HTMLButtonElement>("#rv-versions-close")?.addEventListener(
    "click",
    () => closeVersionsModal(root, state),
    { signal }
  );
  root.querySelector<HTMLElement>("#rv-versions-modal")?.addEventListener(
    "click",
    (event) => {
      if (event.target === event.currentTarget) closeVersionsModal(root, state);
    },
    { signal }
  );
  root.querySelector<HTMLButtonElement>("#rv-versions-instruct")?.addEventListener(
    "click",
    () => {
      const ctx = state.versionsModal;
      if (!ctx) return;
      closeVersionsModal(root, state);
      openRevisionModal(root, state, {
        panel_id: ctx.panel_id,
        page_no: ctx.page_no,
        image_path: ctx.current_image_path,
        for_version: ctx.current_for_version,
      });
    },
    { signal }
  );
  root.querySelector<HTMLButtonElement>("#rv-modal-submit")?.addEventListener(
    "click",
    () => {
      const context = state.modal;
      if (!context) return;
      const instruction =
        root.querySelector<HTMLTextAreaElement>("#rv-modal-instruction")?.value.slice(0, 1000) ?? "";
      const checked_tags = selectedTags(root);
      if (!instruction && checked_tags.length === 0) {
        setText(root, "#rv-modal-message", "指示文かタグを最低1つ入れてください");
        return;
      }
      enqueue(chains, `revision#${slug}#${episode}#${context.panel_id}`, async () => {
        try {
          const result = await apiPostRevisionQueue(slug, episode, {
            ...context,
            instruction,
            checked_tags,
          });
          closeRevisionModal(root, state);
          toast(
            root,
            result.duplicate_warning
              ? `⚠ ${result.duplicate_warning}`
              : "修正指示を追加しました。右上『修正を反映』を押すと画像が再生成されます",
            result.duplicate_warning ? "warn" : "ok"
          );
          await reloadManifest(state, slug, episode);
          refresh(root, state, slug, episode);
        } catch (error) {
          setText(root, "#rv-modal-message", errorText(error));
          console.warn("revision queue submit failed", error);
        }
      });
    },
    { signal }
  );
  root.querySelector<HTMLButtonElement>("#rv-adopt-submit")?.addEventListener(
    "click",
    () => {
      const context = state.adoptModal;
      if (!context) return;
      const note = root.querySelector<HTMLTextAreaElement>("#rv-adopt-note")?.value.trim().slice(0, 200) ?? "";
      enqueue(chains, `adopted#${slug}#${episode}#${context.panel_id}`, async () => {
        try {
          await apiPostAdopted(slug, episode, {
            panel_id: context.panel_id,
            chosen_version: context.chosen_version,
            image_path: context.image_path,
            note: note || undefined,
          });
          closeAdoptModal(root, state);
          toast(root, "採用版を更新しました", "ok");
          await reloadManifest(state, slug, episode);
          refresh(root, state, slug, episode);
        } catch (error) {
          setText(root, "#rv-adopt-message", `採用に失敗: ${errorText(error)}`);
          console.warn("adopted submit failed", error);
        }
      });
    },
    { signal }
  );
  root.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // versions modal のサムネ click → hero 画像を切替 (拡大表示する版を変える)
      const thumbBtn = target.closest<HTMLButtonElement>("[data-rv-thumb]");
      if (thumbBtn) {
        const idxAttr = thumbBtn.dataset.rvIdx;
        const idx = idxAttr !== undefined ? Number(idxAttr) : NaN;
        if (Number.isFinite(idx)) setViewingByIdx(root, state, idx);
        return;
      }
      // versions modal の「この版を採用」 / Compare の「採用」ボタン -> openAdoptModal
      const adoptBtn = target.closest<HTMLButtonElement>("[data-rv-adopt-page], [data-rv-adopt-panel]");
      if (adoptBtn) {
        const panelId = adoptBtn.dataset.rvAdoptPage ?? adoptBtn.dataset.rvAdoptPanel ?? "";
        const chosenVersion = adoptBtn.dataset.rvAdoptVersion ?? "";
        const imagePath = adoptBtn.dataset.rvAdoptPath ?? "";
        const currentNote = state.manifest ? adoptedPanels(state.manifest)[panelId]?.note ?? "" : "";
        const adoptedChoice = state.manifest ? adoptedPanels(state.manifest)[panelId] : undefined;
        if (adoptedChoice?.chosen === chosenVersion) return; // 既に採用中なら無視
        if (state.versionsModal) closeVersionsModal(root, state);
        openAdoptModal(root, state, {
          panel_id: panelId,
          chosen_version: chosenVersion,
          image_path: imagePath,
          current_note: currentNote,
        });
        return;
      }
      // page card (page_one_shot) → version chooser modal を優先で開く
      const pageShot = target.closest<HTMLElement>(".rv-page-shot");
      if (pageShot) {
        openVersionsModal(root, state, {
          panel_id: pageShot.dataset.panelId ?? "",
          page_no: Number(pageShot.dataset.pageNo),
          current_image_path: pageShot.dataset.imagePath ?? "",
          current_for_version: pageShot.dataset.forVersion ?? "v1",
        });
        return;
      }
      // panel_composite (panel grid) の従来動線: panel button → 修正指示 modal
      const panel = target.closest<HTMLElement>(".rv-panel");
      if (panel) {
        openRevisionModal(root, state, {
          panel_id: panel.dataset.panelId ?? "",
          page_no: Number(panel.dataset.pageNo),
          panel_no: panel.dataset.panelNo ? Number(panel.dataset.panelNo) : undefined,
          image_path: panel.dataset.imagePath ?? "",
          for_version: panel.dataset.forVersion ?? "v1",
        });
        return;
      }
    },
    { signal }
  );
}

async function loadRevision(
  container: HTMLElement,
  slug: string,
  episode: number,
  signal: AbortSignal,
  chains: Map<string, Promise<void>>
): Promise<void> {
  if (!slug || !episode) return;
  renderShell(container, slug, episode);
  const root = container.querySelector<HTMLElement>(".rv-container");
  if (!root) throw new Error("revision shell mount failed");

  const state: ViewState = {
    manifest: null,
    tab: "adoption",
    filters: { failed: false, revised: false, notAdopted: false },
    modal: null,
    adoptModal: null,
    versionsModal: null,
  };
  bindStaticListeners(root, state, slug, episode, signal, chains);
  try {
    await reloadManifest(state, slug, episode);
    if (signal.aborted) return;
    refresh(root, state, slug, episode);
    requestAnimationFrame(() => {
      if (!signal.aborted) root.focus();
    });
  } catch (error) {
    if (!signal.aborted) renderError(root, "Revision 読み込みエラー", error);
  }
}

export function mountRevisionView(container: HTMLElement): () => void {
  ensureStyles();
  let activeController = new AbortController();
  let activeScope = "";
  const chains = new Map<string, Promise<void>>();

  const unsubscribe = store.subscribe((state) => {
    const nextScope = `${state.currentSlug}#${state.currentEpisode}`;
    if (nextScope === activeScope) return;
    activeScope = nextScope;
    activeController.abort();
    activeController = new AbortController();
    void loadRevision(
      container,
      state.currentSlug,
      state.currentEpisode,
      activeController.signal,
      chains
    );
  });

  return () => {
    unsubscribe();
    activeController.abort();
    container.innerHTML = "";
  };
}
