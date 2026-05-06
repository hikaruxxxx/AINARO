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
  type RevisionTag,
} from "../../../revision-ui/types";
import type { PagePlanPage, PanelV2 } from "../../../schemas-v2";

type Mode = "grid" | "compare" | "effects";
type UiLayer = "renders";
type Filters = {
  failed: boolean;
  revised: boolean;
  notAdopted: boolean;
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

type ViewState = {
  manifest: Manifest | null;
  mode: Mode;
  layer: UiLayer;
  filters: Filters;
  modal: ModalContext | null;
  adoptModal: AdoptModalContext | null;
};

type EffectsStats = {
  totalQueued: number;
  resolved: number;
  adoptedNonV1: number;
  resolutionRate: number;
  adoptionRate: number;
  byTag: Map<RevisionTag, { queued: number; resolved: number; adopted: number }>;
  panelStats: Array<{ panel_id: string; instructionCount: number; adoptedVersion: string | null; rounds: number }>;
};

const RV_CSS = `
.rv-container { display: grid; gap: 12px; }
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
.rv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 14px; }
.rv-page-card { background: #fff; border: 2px solid #e5e7eb; border-radius: 8px; padding: 10px; }
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
  background: #fafafa;
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
.rv-compare-list { display: flex; flex-direction: column; gap: 14px; }
.rv-compare-row { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
.rv-compare-row h3 { margin: 0 0 8px; font-size: 13px; }
.rv-versions { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.rv-ver-card { border: 2px solid #e5e7eb; border-radius: 6px; padding: 6px; background: #fafafa; }
.rv-ver-card.rv-adopted { border-color: #16a34a; background: #f0fdf4; }
.rv-ver-card img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #fff; border: 1px solid #d1d5db; }
.rv-ver-meta { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px; color: #6b7280; font-size: 11px; }
.rv-ver-meta button { background: #2563eb; color: #fff; border: 0; border-radius: 3px; padding: 2px 8px; font-size: 10px; cursor: pointer; }
.rv-ver-card.rv-adopted .rv-ver-meta button { background: #16a34a; }
.rv-ver-note { margin-top: 4px; padding: 4px 6px; background: #f0fdf4; border: 1px solid #16a34a; border-radius: 3px; color: #166534; font-size: 11px; line-height: 1.4; }
.rv-hard { padding: var(--space-3, 12px); border: 1px solid var(--color-warning, #f59e0b); border-radius: var(--radius-md, 6px); background: var(--color-warning-bg, #fef3c7); margin-bottom: var(--space-3, 12px); }
.rv-hard h3 { margin: 0 0 8px; font-size: 14px; }
.rv-hard ul { margin: 0; padding-left: 18px; color: #334155; font-size: 12px; line-height: 1.6; }
.rv-effects { display: grid; gap: 14px; }
.rv-effects-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.rv-effects-card { border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; padding: 12px; }
.rv-effects-card span { display: block; color: #64748b; font-size: 12px; font-weight: 700; }
.rv-effects-card strong { display: block; margin-top: 4px; color: #111827; font-size: 26px; line-height: 1; }
.rv-effects-section { border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; padding: 12px; }
.rv-effects-section h3 { margin: 0 0 10px; font-size: 14px; }
.rv-effects-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.rv-effects-table th, .rv-effects-table td { border-top: 1px solid #e5e7eb; padding: 7px 8px; text-align: left; }
.rv-effects-table th { color: #64748b; font-weight: 700; background: #f8fafc; }
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

function manifestLayer(_layer: UiLayer): "render" {
  return "render";
}

function parseVersion(version: string): number {
  const m = version.match(/^v(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function assetUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function defaultImagePath(layer: UiLayer, episode: number, pageNo: number): string {
  const ep = epLabel(episode);
  const page = String(pageNo).padStart(2, "0");
  void layer;
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
        <h2>Revision</h2>
        <span class="rv-info">${escapeHtml(slug)} / ${epLabel(episode)}</span>
        <span class="rv-summary">
          queue <strong id="rv-cnt-queue">0</strong> / adopted <strong id="rv-cnt-adopted">0</strong> / failed <strong id="rv-cnt-failed">0</strong>
          <span class="rv-resolved-badge" id="rv-badge-resolved"></span>
        </span>
        <div class="rv-controls">
          <button type="button" class="rv-button" data-rv-mode="grid">Grid</button>
          <button type="button" class="rv-button" data-rv-mode="compare">Compare</button>
          <button type="button" class="rv-button" data-rv-mode="effects">Effects</button>
          <button type="button" class="rv-button" data-rv-layer="renders">Renders</button>
          <span style="width: 1px; height: 20px; background: var(--border-default); margin: 0 4px;"></span>
          <button type="button" class="rv-button" data-rv-rerun="L09" title="L09 Render を再実行">L09 再実行</button>
          <button type="button" class="rv-button" data-rv-rerun="L12" title="L12 Repair で revision_queue を適用">L12 適用</button>
          <button type="button" class="rv-button" data-rv-ai-edit="L09" title="L09 を AI 編集 view へ">L09 AI</button>
        </div>
      </div>
      <div class="rv-filters">
        <label class="rv-filter-check"><input type="checkbox" data-rv-filter="failed"> failed only</label>
        <label class="rv-filter-check"><input type="checkbox" data-rv-filter="revised"> revised only</label>
        <label class="rv-filter-check"><input type="checkbox" data-rv-filter="notAdopted"> hide adopted</label>
        <span id="rv-filter-summary"></span>
      </div>
      <div class="rv-help"><code>1</code> renders <code>g</code> grid <code>c</code> compare <code>3</code> effects <code>j/k</code> panel 移動 <code>esc</code> close</div>
      <div class="rv-main" id="rv-main"><div class="rv-empty">読み込み中...</div></div>
      <div class="rv-modal" id="rv-modal" role="dialog" aria-modal="true" aria-labelledby="rv-modal-title">
        <div class="rv-modal-card">
          <div class="rv-modal-body">
            <h3 id="rv-modal-title">修正指示</h3>
            <div class="rv-modal-meta" id="rv-modal-meta"></div>
            <img id="rv-modal-img" alt="panel">
            <div class="rv-tags">${tags}</div>
            <textarea id="rv-modal-instruction" maxlength="1000" placeholder="自由記述 (1000 字以内)"></textarea>
            <div class="rv-message" id="rv-modal-message"></div>
            <div class="rv-modal-actions">
              <button type="button" class="rv-secondary" id="rv-modal-cancel">キャンセル</button>
              <button type="button" class="rv-primary" id="rv-modal-submit">指示を送信</button>
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
      };
    });
    panels.sort((a, b) => a.readingOrder - b.readingOrder);
    result.set(page.page_no, panels);
  }
  return result;
}

function versionMap(manifest: Manifest, layer: UiLayer): Map<string, VersionView[]> {
  const result = new Map<string, VersionView[]>();
  const targetLayer = manifestLayer(layer);
  for (const entry of manifest.render_manifest ?? []) {
    if (entry.layer !== targetLayer) continue;
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

function instructionCountByPanel(manifest: Manifest): Map<string, number> {
  const result = new Map<string, number>();
  for (const entry of manifest.revision_queue ?? []) {
    result.set(entry.panel_id, (result.get(entry.panel_id) ?? 0) + 1);
  }
  return result;
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
  const badge = root.querySelector<HTMLElement>("#rv-badge-resolved");
  if (badge) {
    badge.textContent = resolved > 0 ? `+${resolved} 消化` : "";
    badge.classList.toggle("is-visible", resolved > 0);
  }
  root.querySelectorAll<HTMLElement>("[data-rv-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rvMode === state.mode);
  });
  root.querySelectorAll<HTMLElement>("[data-rv-layer]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rvLayer === state.layer);
  });
  root.querySelectorAll<HTMLInputElement>("[data-rv-filter]").forEach((input) => {
    if (input.dataset.rvFilter === "failed") input.checked = state.filters.failed;
    else if (input.dataset.rvFilter === "revised") input.checked = state.filters.revised;
    else if (input.dataset.rvFilter === "notAdopted") input.checked = state.filters.notAdopted;
  });
}

function renderHardPanels(manifest: Manifest): string {
  const queued = instructionCountByPanel(manifest);
  const adopted = adoptedPanels(manifest);
  const failed = failedPanelSet(manifest);
  const hard = Array.from(queued.entries())
    .filter(([id, count]) => count >= 3 || failed.has(id) || !adopted[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (hard.length === 0) return "";
  return `<section class="rv-hard">
    <h3>注意が必要な panel (上位 ${hard.length})</h3>
    <ul>${hard.map(([id, count]) => {
      const choice = adopted[id];
      const status = [
        `指示 ${count} 回`,
        failed.has(id) ? "audit failed" : "",
        choice ? `採用済 (${choice.chosen})` : "未採用",
      ].filter(Boolean).join(" / ");
      return `<li><strong>${escapeHtml(id)}</strong> ${escapeHtml(status)}</li>`;
    }).join("")}</ul>
  </section>`;
}

function renderGrid(root: HTMLElement, state: ViewState, slug: string, episode: number): void {
  const manifest = state.manifest;
  const main = root.querySelector<HTMLElement>("#rv-main");
  if (!manifest || !main) return;

  const lookup = panelLookup(manifest);
  const versions = versionMap(manifest, state.layer);
  const failed = failedPanelSet(manifest);
  const revised = revisedPanelSet(manifest);
  const unresolved = unresolvedCountByPanel(manifest);
  const lastEntries = lastUnresolvedByPanel(manifest);
  const adopted = adoptedPanels(manifest);
  let total = 0;
  let shown = 0;

  const pages = manifest.page_plan.pages.slice().sort((a, b) => a.page_no - b.page_no);
  const pageHtml: string[] = [];
  for (const page of pages) {
    const panels = lookup.get(page.page_no) ?? [];
    const pageFailedCount = panels.filter((panel) => failed.has(panel.queueKey)).length;
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
        adoptedChoice?.image_path ?? latest?.image_path ?? defaultImagePath(state.layer, episode, panel.pageNo);
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
    pageHtml.push(`
      <section class="rv-page-card">
        <h3>P.${page.page_no} <span class="rv-page-role">[${escapeHtml(String(page.page_role))}]</span>${pageFailedCount > 0 ? `<span class="rv-audit-fail">audit failed: ${pageFailedCount}</span>` : ""}</h3>
        <div class="rv-panel-grid">${panelHtml.join("")}</div>
      </section>
    `);
  }

  main.innerHTML = `${renderHardPanels(manifest)}<div class="rv-grid">${pageHtml.join("") || '<div class="rv-empty">該当パネルなし</div>'}</div>`;
  setText(root, "#rv-filter-summary", `${shown} / ${total} panels`);
  void slug;
}

function renderEffects(root: HTMLElement, state: ViewState): void {
  const manifest = state.manifest;
  const main = root.querySelector<HTMLElement>("#rv-main");
  if (!manifest || !main) return;
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

  main.innerHTML = `
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
          <thead><tr><th>tag</th><th>queued</th><th>resolved</th><th>adopted</th><th>conv%</th></tr></thead>
          <tbody>${tagRows}</tbody>
        </table>
      </section>
      <section class="rv-effects-section">
        <h3>困難 panel ランキング</h3>
        ${hardRows ? `<table class="rv-effects-table">
          <thead><tr><th>panel_id</th><th>指示回数</th><th>採用 v?</th><th>rounds</th></tr></thead>
          <tbody>${hardRows}</tbody>
        </table>` : '<div class="rv-empty">指示回数 3 回以上の panel はありません。</div>'}
      </section>
    </div>`;
  setText(root, "#rv-filter-summary", "effects");
}

function renderCompare(root: HTMLElement, state: ViewState): void {
  const manifest = state.manifest;
  const main = root.querySelector<HTMLElement>("#rv-main");
  if (!manifest || !main) return;

  const versions = versionMap(manifest, state.layer);
  const adopted = adoptedPanels(manifest);
  const rows: string[] = [];
  const queueKeys = Array.from(panelLookup(manifest).values())
    .flat()
    .map((panel) => panel.queueKey);
  for (const panelId of Array.from(new Set(queueKeys))) {
    const panelVersions = versions.get(panelId) ?? [];
    if (panelVersions.length < 2) continue;
    const cards = panelVersions
      .map((version) => {
        const isAdopted = adopted[panelId]?.chosen === version.version;
        return `
          <div class="rv-ver-card${isAdopted ? " rv-adopted" : ""}">
            <img src="${escapeHtml(assetUrl(version.image_path))}" loading="lazy" alt="${escapeHtml(panelId)} ${escapeHtml(version.version)}">
            <div class="rv-ver-meta">
              <span>${escapeHtml(version.version)} (${escapeHtml(version.origin ?? "initial")})</span>
              <button type="button" data-rv-adopt-panel="${escapeHtml(panelId)}" data-rv-adopt-version="${escapeHtml(version.version)}" data-rv-adopt-path="${escapeHtml(version.image_path)}">${isAdopted ? "採用中" : "採用"}</button>
            </div>
            ${isAdopted && adopted[panelId]?.note ? `<div class="rv-ver-note">メモ: ${escapeHtml(adopted[panelId]!.note!)}</div>` : ""}
          </div>
        `;
      })
      .join("");
    rows.push(`<section class="rv-compare-row"><h3>${escapeHtml(panelId)}</h3><div class="rv-versions">${cards}</div></section>`);
  }
  main.innerHTML = rows.length
    ? `<div class="rv-compare-list">${rows.join("")}</div>`
    : '<div class="rv-empty">複数 version のあるパネルはまだありません。</div>';
  setText(root, "#rv-filter-summary", `${rows.length} compare rows`);
}

function refresh(root: HTMLElement, state: ViewState, slug: string, episode: number): void {
  renderSummary(root, state);
  if (state.mode === "effects") renderEffects(root, state);
  else if (state.mode === "compare") renderCompare(root, state);
  else renderGrid(root, state, slug, episode);
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
  const focusedPanel = (): HTMLElement | undefined => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.classList.contains("rv-panel")) {
      const idx = panels().indexOf(active);
      if (idx >= 0) focusIndex = idx;
      return active;
    }
    return panels()[focusIndex];
  };

  root.querySelectorAll<HTMLButtonElement>("[data-rv-mode]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const mode = button.dataset.rvMode;
        if (mode === "grid" || mode === "compare" || mode === "effects") {
          state.mode = mode;
          refresh(root, state, slug, episode);
        }
      },
      { signal }
    );
  });
  root.querySelectorAll<HTMLButtonElement>("[data-rv-layer]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const layer = button.dataset.rvLayer;
        if (layer === "renders") {
          state.layer = "renders";
          refresh(root, state, slug, episode);
        }
      },
      { signal }
    );
  });
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
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          if (event.key !== "Escape") return;
        }
      }
      if (event.key === "1") {
        state.layer = "renders";
        refresh(root, state, slug, episode);
        event.preventDefault();
      } else if (event.key === "g" || event.key === "G") {
        state.mode = "grid";
        refresh(root, state, slug, episode);
        event.preventDefault();
      } else if (event.key === "c" || event.key === "C") {
        state.mode = "compare";
        refresh(root, state, slug, episode);
        event.preventDefault();
      } else if (event.key === "3") {
        state.mode = "effects";
        refresh(root, state, slug, episode);
        event.preventDefault();
      } else if (event.key === "j" || event.key === "ArrowDown") {
        focusPanel(focusIndex + 1);
        event.preventDefault();
      } else if (event.key === "k" || event.key === "ArrowUp") {
        focusPanel(focusIndex - 1);
        event.preventDefault();
      } else if (event.key === "Enter") {
        const panel = focusedPanel();
        if (panel) panel.click();
        event.preventDefault();
      } else if (event.key === " ") {
        const panel = focusedPanel();
        if (panel) {
          state.mode = "compare";
          refresh(root, state, slug, episode);
          toast(root, `${panel.dataset.panelId ?? "panel"} の採用候補を Compare で確認してください`, "ok");
        }
        event.preventDefault();
      } else if (event.key === "?") {
        toast(root, "j/k 移動 / Enter 修正指示 / Space Compare / 1 renders / g grid / c compare / 3 effects / esc close", "ok");
        event.preventDefault();
      } else if (event.key === "Escape") {
        closeRevisionModal(root, state);
        closeAdoptModal(root, state);
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
            result.duplicate_warning ? `⚠ ${result.duplicate_warning}` : "修正指示を queue に追加しました",
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
      const button = target.closest<HTMLButtonElement>("[data-rv-adopt-panel]");
      if (!button) return;
      const panelId = button.dataset.rvAdoptPanel ?? "";
      const chosenVersion = button.dataset.rvAdoptVersion ?? "";
      const imagePath = button.dataset.rvAdoptPath ?? "";
      const currentNote = state.manifest ? adoptedPanels(state.manifest)[panelId]?.note ?? "" : "";
      openAdoptModal(root, state, {
        panel_id: panelId,
        chosen_version: chosenVersion,
        image_path: imagePath,
        current_note: currentNote,
      });
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
    mode: "grid",
    layer: "renders",
    filters: { failed: false, revised: false, notAdopted: false },
    modal: null,
    adoptModal: null,
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
