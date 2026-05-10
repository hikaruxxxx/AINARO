import {
  ApiError,
  apiGetManifest,
  apiGetNameApproval,
  apiGetNameManifest,
  apiGetStoryboardProposals,
  apiPostNameApproval,
  runNameLintFix,
  type NameManifest,
  type StoryboardProposalsResponse,
} from "../lib/api";
import { store } from "../lib/store";
import { isRunnableLayer, navigateToAiEdit, spawnLayerWithModal } from "../lib/layer-actions";
import { openAiEditModal } from "../components/ai-edit-modal";
import { openStoryboardVariantLightbox } from "../components/storyboard-variant-lightbox";
import type {
  NameAuditFindingLite,
  NamePageDecision,
  NamePageStatus,
  NameRejectReason,
  NameWarning,
} from "../../../name-preview/types";
import type { NameLintFinding, NameLintReport } from "../../../qa-v2/name-lint";
import type { PagePlanPage, PanelV2, StoryboardPageV2 } from "../../../schemas-v2";

type NamePage = NameManifest["pages"][number];

type PageUnit =
  | { kind: "single"; page: NamePage }
  | { kind: "spread"; left: NamePage; right: NamePage };

type DecisionDraft = {
  status: NamePageStatus;
  reasons: NameRejectReason[];
  note: string;
  persistFailed: boolean;
};

type ViewState = {
  storyboardProposals: StoryboardProposalsResponse | null;
};

let activeNameLintFix: AbortController | null = null;

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
.name-gate-grid {
  display: grid;
  grid-template-columns: 1fr;
  row-gap: 16px;
  max-width: 1400px;
}
.name-gate-container .page-card {
  background: #fff;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  outline: none;
  transition: border-color .12s, box-shadow .12s;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    "header header"
    "name storyboard"
    "name lint"
    "warnings warnings"
    "reasons reasons"
    "note note"
    "actions actions";
  column-gap: 14px;
  row-gap: 8px;
}
.name-gate-container .page-card > header { grid-area: header; }
.name-gate-container .page-card > .svg-wrap { grid-area: name; align-self: start; }
.name-gate-container .page-card > .page-storyboard { grid-area: storyboard; align-self: start; margin: 0; }
.name-gate-container .page-card > .page-lint { grid-area: lint; align-self: start; margin: 0; }
.name-gate-container .page-card > .warnings { grid-area: warnings; }
.name-gate-container .page-card > .reasons { grid-area: reasons; }
.name-gate-container .page-card > textarea.note { grid-area: note; }
.name-gate-container .page-card > .page-actions { grid-area: actions; }
.name-gate-container .page-card.is-spread {
  grid-template-columns: 1fr 1fr;
  grid-template-areas: none;
  direction: rtl;
  column-gap: 0;
  row-gap: 10px;
}
.name-gate-container .page-card.is-spread > * { grid-area: auto; }
.name-gate-container .page-card.is-spread .page-card-inner { direction: ltr; padding: 0 8px; }
.name-gate-container .page-card.is-spread .spread-decision { grid-column: 1 / -1; direction: ltr; padding: 8px 8px 0; border-top: 1px solid #e5e7eb; }
.name-gate-container .page-card.is-spread .spread-note { color: #64748b; font-size: 12px; }
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
.name-gate-container .page-storyboard {
  margin: 6px 0 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f8fafc;
}
.name-gate-container .page-storyboard > summary {
  list-style: none;
  cursor: pointer;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}
.name-gate-container .page-storyboard > summary::-webkit-details-marker { display: none; }
.name-gate-container .page-storyboard > summary::before {
  content: "▶";
  font-size: 10px;
  color: #64748b;
  transition: transform .12s;
}
.name-gate-container .page-storyboard[open] > summary::before { transform: rotate(90deg); }
.name-gate-container .page-storyboard .sb-summary-count { color: #94a3b8; font-weight: 400; }
.name-gate-container .page-storyboard .sb-panels {
  display: grid;
  gap: 8px;
  padding: 0 10px 10px;
}
.name-gate-container .page-storyboard .sb-panel {
  border-left: 2px solid #cbd5e1;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.5;
}
.name-gate-container .sb-panel-head {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 11px;
  color: #475569;
}
.name-gate-container .sb-no { font-weight: 700; color: #0f172a; }
.name-gate-container .sb-shot { color: #4f46e5; font-family: ui-monospace, monospace; }
.name-gate-container .sb-tag { padding: 0 4px; border-radius: 3px; font-size: 10px; }
.name-gate-container .sb-tag-silence { background: #fef3c7; color: #92400e; }
.name-gate-container .sb-tag-bleed { background: #e0f2fe; color: #075985; }
.name-gate-container .sb-importance { color: #f59e0b; margin-left: auto; }
.name-gate-container .sb-action { color: #0f172a; padding: 2px 0; }
.name-gate-container .sb-keyvis { color: #64748b; font-size: 11px; font-style: italic; }
.name-gate-container .sb-lines { margin: 4px 0 0; padding-left: 14px; list-style: disc; }
.name-gate-container .sb-lines .line-dialogue { color: #0f172a; }
.name-gate-container .sb-lines .line-dialogue .who,
.name-gate-container .sb-lines .line-monologue .who { color: #4f46e5; font-weight: 600; margin-right: 4px; }
.name-gate-container .sb-lines .line-monologue { color: #475569; }
.name-gate-container .sb-lines .line-narration { color: #6b7280; font-style: italic; }
.name-gate-container .sb-lines .line-sfx { color: #b45309; font-family: ui-monospace, monospace; }
.name-gate-container .sb-empty { padding: 6px 10px; color: #94a3b8; font-size: 12px; }
.name-gate-container .page-lint {
  margin: 6px 0 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff7ed;
}
.name-gate-container .page-lint > summary {
  list-style: none;
  cursor: pointer;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}
.name-gate-container .page-lint > summary::-webkit-details-marker { display: none; }
.name-gate-container .page-lint > summary::before {
  content: "▶";
  font-size: 10px;
  color: #64748b;
  transition: transform .12s;
}
.name-gate-container .page-lint[open] > summary::before { transform: rotate(90deg); }
.name-gate-container .page-lint .lint-summary-count { color: #94a3b8; font-weight: 400; }
.name-gate-container .lint-findings { display: grid; gap: 7px; padding: 0 10px 10px; }
.name-gate-container .lint-finding { display: grid; gap: 2px; padding: 6px 8px; border-left: 3px solid #cbd5e1; background: #fff; font-size: 12px; line-height: 1.45; }
.name-gate-container .lint-finding--fatal { border-left-color: #dc2626; }
.name-gate-container .lint-finding--warn { border-left-color: #f59e0b; }
.name-gate-container .lint-finding--info { border-left-color: #2563eb; }
.name-gate-container .lint-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.name-gate-container .lint-icon { font-size: 10px; line-height: 1; }
.name-gate-container .lint-icon--fatal { color: #dc2626; }
.name-gate-container .lint-icon--warn { color: #f59e0b; }
.name-gate-container .lint-icon--info { color: #2563eb; }
.name-gate-container .lint-rule { font-family: ui-monospace, monospace; font-weight: 700; color: #0f172a; overflow-wrap: anywhere; }
.name-gate-container .lint-target { color: #64748b; margin-left: auto; font-size: 11px; }
.name-gate-container .lint-message { color: #0f172a; }
.name-gate-container .lint-hint { color: #64748b; font-size: 11px; }
.name-gate-container .lint-fix-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.name-gate-container .lint-fix-progress { min-width: 0; color: #64748b; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name-gate-container [data-name-lint-fix-panel][disabled] { opacity: .55; cursor: wait; }
.name-gate-container .lint-empty { padding: 6px 10px; color: #94a3b8; font-size: 12px; }
.name-lint-episode {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 12px;
}
.name-lint-episode__summary { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-weight: 700; }
.name-lint-episode__title { color: #0f172a; margin-right: 4px; }
.name-lint-episode__pill { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border-radius: 999px; background: #e2e8f0; color: #334155; }
.name-lint-episode__pill--fatal { background: #fee2e2; color: #991b1b; }
.name-lint-episode__pill--warn { background: #fef3c7; color: #92400e; }
.name-lint-episode__pill--info { background: #dbeafe; color: #1d4ed8; }
.name-lint-episode__assessments { display: flex; gap: 6px; flex-wrap: wrap; color: #475569; }
.name-lint-episode__assessment { padding: 2px 6px; border-radius: 4px; background: #fff; border: 1px solid #e5e7eb; }
.name-lint-episode__global-findings { display: grid; gap: 6px; }
.name-lint-episode__global-title { color: #475569; font-weight: 700; }
.name-lint-episode__missing { color: #64748b; }
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

// char_桐生_レン_v1 → 桐生_レン (prefix の "char_" と suffix の "_v\d+" を削る)
function shortCharacterId(characterId: string): string {
  return characterId.replace(/^char_/, "").replace(/_v\d+$/, "");
}

function renderPanelLines(panel: PanelV2): string {
  const dialogue = panel.dialogue
    .map(
      (d) =>
        `<li class="line line-dialogue"><span class="who">${escapeHtml(shortCharacterId(d.character_id))}</span>「${escapeHtml(d.text)}」</li>`
    )
    .join("");
  const monologue = panel.monologue
    .map(
      (m) =>
        `<li class="line line-monologue"><span class="who">${escapeHtml(shortCharacterId(m.character_id))}</span>(${escapeHtml(m.text)})</li>`
    )
    .join("");
  const narration = panel.narration
    .map((n) => `<li class="line line-narration">[ナレ] ${escapeHtml(n)}</li>`)
    .join("");
  const sfx =
    panel.sfx.length > 0
      ? `<li class="line line-sfx">[SFX] ${escapeHtml(panel.sfx.join(" / "))}</li>`
      : "";
  const inner = `${dialogue}${monologue}${narration}${sfx}`;
  return inner ? `<ul class="sb-lines">${inner}</ul>` : "";
}

function renderStoryboardSection(storyboardPage: StoryboardPageV2 | undefined): string {
  if (!storyboardPage || storyboardPage.panels.length === 0) {
    return `<details class="page-storyboard" open><summary>ネーム構成 <span class="sb-summary-count">[未生成]</span></summary><div class="sb-empty">このページのネーム (storyboard.json) は未生成です</div></details>`;
  }
  const panelsHtml = storyboardPage.panels
    .map((panel) => {
      const tags = [
        panel.silence ? `<span class="sb-tag sb-tag-silence">silence</span>` : "",
        panel.bleed ? `<span class="sb-tag sb-tag-bleed">bleed</span>` : "",
      ]
        .filter(Boolean)
        .join("");
      const keyvis = panel.key_visual
        ? `<div class="sb-keyvis">${escapeHtml(panel.key_visual)}</div>`
        : "";
      return `<div class="sb-panel">
        <div class="sb-panel-head">
          <span class="sb-no">#${panel.panel_no}</span>
          <span class="sb-shot">${escapeHtml(panel.shot_type)}/${escapeHtml(panel.camera)}</span>
          ${tags}
          <span class="sb-importance">★${panel.importance}</span>
        </div>
        <div class="sb-action">${escapeHtml(panel.action)}</div>
        ${keyvis}
        ${renderPanelLines(panel)}
      </div>`;
    })
    .join("");
  return `<details class="page-storyboard" open>
    <summary>ネーム構成 <span class="sb-summary-count">[${storyboardPage.panels.length} コマ]</span></summary>
    <div class="sb-panels">${panelsHtml}</div>
  </details>`;
}

const LINT_SEVERITY_ORDER: Record<NameLintFinding["severity"], number> = {
  fatal: 0,
  warn: 1,
  info: 2,
};

function lintSeverityIcon(severity: NameLintFinding["severity"]): string {
  if (severity === "fatal") return "■";
  if (severity === "warn") return "▲";
  return "●";
}

function lintTarget(finding: NameLintFinding): string {
  const parts: string[] = [];
  if (finding.scene_id) parts.push(finding.scene_id);
  if (finding.page_no !== undefined) parts.push(`p${finding.page_no}`);
  if (finding.panel_no !== undefined) parts.push(`#${finding.panel_no}`);
  return parts.join(" / ");
}

function sortLintFindings(findings: NameLintFinding[]): NameLintFinding[] {
  return [...findings].sort((a, b) => {
    const severityDiff = LINT_SEVERITY_ORDER[a.severity] - LINT_SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return (a.page_no ?? 9999) - (b.page_no ?? 9999) || (a.panel_no ?? 9999) - (b.panel_no ?? 9999);
  });
}

function lintFindingsByPage(report: NameLintReport | null | undefined): Map<number, NameLintFinding[]> {
  const map = new Map<number, NameLintFinding[]>();
  for (const finding of report?.findings ?? []) {
    if (finding.page_no === undefined) continue;
    const pageFindings = map.get(finding.page_no) ?? [];
    pageFindings.push(finding);
    map.set(finding.page_no, pageFindings);
  }
  return map;
}

function renderLintFinding(finding: NameLintFinding): string {
  const target = lintTarget(finding);
  const hint = finding.hint ? `<div class="lint-hint">hint: ${escapeHtml(finding.hint)}</div>` : "";
  const fixButton = finding.panel_no !== undefined
    ? `<div class="lint-fix-row">
        <button type="button" class="nc-button nc-button--ghost nc-button--sm"
          data-name-lint-fix-panel="${finding.panel_no}"
          data-name-lint-fix-rule="${escapeHtml(finding.rule)}">AI 修正</button>
        <span class="lint-fix-progress" data-name-lint-fix-progress="${finding.panel_no}:${escapeHtml(finding.rule)}"></span>
      </div>`
    : "";
  return `<div class="lint-finding lint-finding--${escapeHtml(finding.severity)}">
    <div class="lint-head">
      <span class="lint-icon lint-icon--${escapeHtml(finding.severity)}">${lintSeverityIcon(finding.severity)}</span>
      <span class="lint-rule">${escapeHtml(finding.rule)}</span>
      ${target ? `<span class="lint-target">${escapeHtml(target)}</span>` : ""}
    </div>
    <div class="lint-message">${escapeHtml(finding.message)}</div>
    ${hint}
    ${fixButton}
  </div>`;
}

function renderLintFindingsSection(findings: NameLintFinding[]): string {
  if (findings.length === 0) return "";
  const fatal = findings.filter((finding) => finding.severity === "fatal").length;
  const warn = findings.filter((finding) => finding.severity === "warn").length;
  const info = findings.filter((finding) => finding.severity === "info").length;
  const findingsHtml = sortLintFindings(findings).map(renderLintFinding).join("");
  const openAttr = findings.some((finding) => finding.severity !== "info") ? " open" : "";
  return `<details class="page-lint"${openAttr}>
    <summary>ネームレビュー <span class="lint-summary-count">[fatal ${fatal} / warn ${warn} / info ${info}]</span></summary>
    <div class="lint-findings">${findingsHtml}</div>
  </details>`;
}

function renderNameLintEpisodeSummary(report: NameLintReport | null | undefined): string {
  if (!report) {
    return `<div class="name-lint-episode">
      <div class="name-lint-episode__missing">ネームレビュー: lint_report.json はまだ生成されていません</div>
    </div>`;
  }
  const assessments = report.findings
    .filter((finding) => finding.rule === "overall_assessment")
    .map((finding) => {
      const scene = finding.scene_id ? `${finding.scene_id}: ` : "";
      return `${scene}${finding.message.replace(/^LLM scene assessment: /, "")}`;
    });
  const assessmentHtml =
    assessments.length > 0
      ? assessments.map((text) => `<span class="name-lint-episode__assessment">${escapeHtml(text)}</span>`).join("")
      : `<span class="name-lint-episode__missing">overall_assessment なし</span>`;
  const globalFindings = sortLintFindings(
    report.findings.filter((finding) => finding.page_no === undefined && finding.rule !== "overall_assessment")
  );
  const globalFindingsHtml =
    globalFindings.length > 0
      ? `<div class="name-lint-episode__global-findings">
          <div class="name-lint-episode__global-title">scene / episode findings</div>
          ${globalFindings.map(renderLintFinding).join("")}
        </div>`
      : "";
  return `<div class="name-lint-episode">
    <div class="name-lint-episode__summary">
      <span class="name-lint-episode__title">ネームレビュー</span>
      <span class="name-lint-episode__pill name-lint-episode__pill--fatal">fatal ${report.fatal_count}</span>
      <span class="name-lint-episode__pill name-lint-episode__pill--warn">warn ${report.warn_count}</span>
      <span class="name-lint-episode__pill name-lint-episode__pill--info">info ${report.info_count}</span>
    </div>
    <div class="name-lint-episode__assessments">${assessmentHtml}</div>
    ${globalFindingsHtml}
  </div>`;
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

function shouldStartSpread(
  page: NamePage,
  nextPage: NamePage | undefined,
  planPages: Map<number, PagePlanPage>
): boolean {
  if (!nextPage) return false;
  const planPage = planPages.get(page.page_no);
  if (planPage?.is_spread === true) return true;
  // Heuristic spread detection is intentionally disabled for Phase A to keep
  // existing episodes without is_spread page-plan flags as single-page units.
  return false;
}

function groupPagesIntoUnits(pages: NamePage[], planPages: Map<number, PagePlanPage>): PageUnit[] {
  const units: PageUnit[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const nextPage = pages[i + 1];
    if (shouldStartSpread(page, nextPage, planPages)) {
      units.push({ kind: "spread", left: page, right: nextPage });
      i++;
      continue;
    }
    units.push({ kind: "single", page });
  }
  return units;
}

function pageUnitPageNos(unit: PageUnit): number[] {
  return unit.kind === "spread" ? [unit.left.page_no, unit.right.page_no] : [unit.page.page_no];
}

function unitRepresentativePageNo(unit: PageUnit): number {
  return pageUnitPageNos(unit)[0] ?? 1;
}

function renderReasonInputs(): string {
  return REASONS.map(
    (reason) =>
      `<label><input type="checkbox" data-reason="${reason.key}"> ${escapeHtml(reason.label)}</label>`
  ).join("");
}

function renderPageInner(
  page: NamePage,
  episode: number,
  storyboardPage: StoryboardPageV2 | undefined,
  lintFindings: NameLintFinding[]
): string {
  return `<div class="page-card-inner">
  <header>
    <span class="page-no">P.${page.page_no}</span>
    <span class="page-role">[${escapeHtml(page.page_role)}]</span>
    <span class="panel-count">${page.panel_count}コマ</span>
  </header>
  ${renderStoryboardSection(storyboardPage)}
  ${renderLintFindingsSection(lintFindings)}
  <div class="svg-wrap"><img src="${escapeHtml(legacySvgPath(episode, page.svg_filename))}" alt="page ${page.page_no} preview"></div>
  <div class="warnings">${warningHtml(page.warnings ?? [], page.audit_findings ?? [])}</div>
</div>`;
}

function renderDecisionControls(pageNo: number, spread: boolean): string {
  const spreadNote = spread ? `<div class="spread-note">見開き判定: 理由・note・a/r/p は両ページに同時適用</div>` : "";
  return `${spreadNote}
  <div class="reasons" data-page-reasons="${pageNo}">${renderReasonInputs()}</div>
  <textarea class="note" placeholder="(任意) note" data-page-note="${pageNo}"></textarea>
  <div class="page-actions">
    <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-status="approved" data-page="${pageNo}">承認</button>
    <button type="button" class="nc-button nc-button--danger nc-button--sm" data-ng-status="rejected" data-page="${pageNo}">却下</button>
    <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-status="pending" data-page="${pageNo}">未判定</button>
  </div>`;
}

function renderPageCards(
  units: PageUnit[],
  episode: number,
  storyboardByPage: Map<number, StoryboardPageV2>,
  lintByPage: Map<number, NameLintFinding[]>
): string {
  return units
    .map((unit) => {
      const pageNos = pageUnitPageNos(unit);
      const representativePageNo = unitRepresentativePageNo(unit);
      const unitPages = pageNos.join(" ");
      const status = `<span class="status status-pending" data-unit-status="${pageNos.join(",")}">判定待ち</span>`;
      if (unit.kind === "single") {
        return `<article class="page-card" data-page-no="${representativePageNo}" data-unit-pages="${unitPages}" tabindex="0" id="page-${representativePageNo}">
  <header>
    <span class="page-no">P.${unit.page.page_no}</span>
    <span class="page-role">[${escapeHtml(unit.page.page_role)}]</span>
    <span class="panel-count">${unit.page.panel_count}コマ</span>
    ${status}
  </header>
  ${renderStoryboardSection(storyboardByPage.get(unit.page.page_no))}
  ${renderLintFindingsSection(lintByPage.get(unit.page.page_no) ?? [])}
  <div class="svg-wrap"><img src="${escapeHtml(legacySvgPath(episode, unit.page.svg_filename))}" alt="page ${unit.page.page_no} preview"></div>
  <div class="warnings">${warningHtml(unit.page.warnings ?? [], unit.page.audit_findings ?? [])}</div>
  ${renderDecisionControls(representativePageNo, false)}
</article>`;
      }
      return `<article class="page-card is-spread" data-page-no="${representativePageNo}" data-unit-pages="${unitPages}" tabindex="0" id="page-${representativePageNo}">
  ${renderPageInner(unit.left, episode, storyboardByPage.get(unit.left.page_no), lintByPage.get(unit.left.page_no) ?? [])}
  ${renderPageInner(unit.right, episode, storyboardByPage.get(unit.right.page_no), lintByPage.get(unit.right.page_no) ?? [])}
  <div class="spread-decision">
    <header>
      <span class="page-no">P.${unit.left.page_no}+P.${unit.right.page_no}</span>
      <span class="page-role">[spread]</span>
      <span class="panel-count">${unit.left.panel_count + unit.right.panel_count}コマ</span>
      ${status}
    </header>
    ${renderDecisionControls(representativePageNo, true)}
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
  units: PageUnit[],
  slug: string,
  episode: number,
  state: ViewState,
  storyboardByPage: Map<number, StoryboardPageV2>,
  lintReport: NameLintReport | null | undefined
): void {
  const proposalCount = state.storyboardProposals?.proposals.length ?? 0;
  const lintByPage = lintFindingsByPage(lintReport);
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
        <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-run-layer="L04">ネームを生成 <span class="nc-layer-label__sub" style="margin-left:4px">L04</span></button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm"
                data-ng-action="open-variant-lightbox"
                ${proposalCount > 0 ? "" : "disabled"}>
          ネーム案を比較 (${proposalCount})
        </button>
        <button type="button" class="nc-button nc-button--primary nc-button--sm" data-ng-run-layer="L08.5">ネーム可視化を生成 <span class="nc-layer-label__sub" style="margin-left:4px">L08.5</span></button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-ng-run-layer="L04_1">冒頭の引き 提案 <span class="nc-layer-label__sub" style="margin-left:4px">L04.1</span></button>
        <button type="button" class="nc-button nc-button--secondary nc-button--sm" data-ng-run-layer="L04_9">次話への引き 提案 <span class="nc-layer-label__sub" style="margin-left:4px">L04.9</span></button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-open-ai-edit
                title="自由入力で AI 編集 modal を開く (target / prompt を手で書く)">AI で修正 (空)</button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-layer-ai-edit="L04"
                title="ネーム (storyboard.json: コマ構成・台詞・構図) を AI で修正する modal を開く">コマ構成を AI で修正 (L04)</button>
        <button type="button" class="nc-button nc-button--ghost nc-button--sm" data-ng-layer-ai-edit="L08.5"
                title="SVG ネーム + 検査結果を AI で修正する modal を開く">ネーム画像/検査を AI で修正 (L08.5)</button>
      </div>
      <div class="name-gate-help">
        <code>a</code> 承認 <code>r</code> 却下 <code>p</code> 判定待ち
        <code>↑/k</code> 前ページ <code>↓/j</code> 次ページ <code>1..6</code> reject 理由
      </div>
      ${renderNameLintEpisodeSummary(lintReport)}
      <section class="ng-section" aria-labelledby="ng-approval-title">
        <h3 class="ng-section-title" id="ng-approval-title">判定</h3>
      <div class="name-gate-grid" id="ng-grid">${renderPageCards(units, episode, storyboardByPage, lintByPage)}</div>
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

function refreshStoryboardProposalButton(container: HTMLElement, state: ViewState): void {
  const button = container.querySelector<HTMLButtonElement>('[data-ng-action="open-variant-lightbox"]');
  if (!button) return;
  const count = state.storyboardProposals?.proposals.length ?? 0;
  button.disabled = count === 0;
  button.textContent = `ネーム案を比較 (${count})`;
}

function unitPageNosFromCard(card: HTMLElement): number[] {
  return (card.dataset.unitPages ?? card.dataset.pageNo ?? "")
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value));
}

function statusLabel(status: NamePageStatus): string {
  return status === "approved" ? "承認" : status === "rejected" ? "却下" : "判定待ち";
}

function refreshCard(
  container: HTMLElement,
  pageNo: number,
  decision: DecisionDraft,
  decisions?: Map<number, DecisionDraft>
): void {
  const card =
    container.querySelector<HTMLElement>(`[data-unit-pages~="${pageNo}"]`) ??
    container.querySelector<HTMLElement>(`[data-page-no="${pageNo}"]`);
  const status = card?.querySelector<HTMLElement>("[data-unit-status]");
  if (!card || !status) return;
  const pageNos = unitPageNosFromCard(card);
  const unitDecisions = decisions
    ? pageNos.map((unitPageNo) => decisions.get(unitPageNo)).filter((d): d is DecisionDraft => Boolean(d))
    : [decision];
  const statuses = new Set(unitDecisions.map((d) => d.status));
  const persistFailed = unitDecisions.some((d) => d.persistFailed);
  const displayStatus = statuses.size === 1 ? unitDecisions[0]?.status ?? decision.status : "pending";
  status.className = `status status-${displayStatus}`;
  if (statuses.size > 1 && decisions) {
    status.innerHTML = `分割 (${pageNos
      .map((unitPageNo) => `P${unitPageNo} ${statusLabel(decisions.get(unitPageNo)?.status ?? "pending")}`)
      .join(" / ")})${persistFailed ? '<span class="persist-error">(保存失敗)</span>' : ""}`;
  } else {
    status.innerHTML = `${statusLabel(displayStatus)}${persistFailed ? '<span class="persist-error">(保存失敗)</span>' : ""}`;
  }
  card.classList.toggle("approved", statuses.size === 1 && displayStatus === "approved");
  card.classList.toggle("rejected", statuses.size === 1 && displayStatus === "rejected");
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

function unitHasPending(unit: PageUnit, decisions: Map<number, DecisionDraft>): boolean {
  return pageUnitPageNos(unit).some((pageNo) => decisions.get(pageNo)?.status === "pending");
}

function firstPendingOrFirst(units: PageUnit[], decisions: Map<number, DecisionDraft>): number {
  const pending = units.find((unit) => unitHasPending(unit, decisions));
  return pending
    ? unitRepresentativePageNo(pending)
    : units[0]
      ? unitRepresentativePageNo(units[0])
      : 1;
}

function nextPendingPage(cards: HTMLElement[], currentPageNo: number, decisions: Map<number, DecisionDraft>): number {
  const pageNos = cards.map((card) => Number(card.dataset.pageNo)).filter((pageNo) => Number.isInteger(pageNo));
  const currentIndex = pageNos.indexOf(currentPageNo);
  if (currentIndex < 0) return currentPageNo;
  for (let offset = 1; offset < pageNos.length; offset++) {
    const pageNo = pageNos[(currentIndex + offset) % pageNos.length];
    const card = cards.find((candidate) => Number(candidate.dataset.pageNo) === pageNo);
    const unitPageNos = card ? unitPageNosFromCard(card) : [pageNo];
    if (unitPageNos.some((unitPageNo) => decisions.get(unitPageNo)?.status === "pending")) return pageNo;
  }
  return currentPageNo;
}

function adjacentUnit(cards: HTMLElement[], currentPageNo: number, delta: number): number {
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
    refreshCard(container, pageNo, decision, decisions);
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
  if (container.querySelector(`[data-page-reasons="${pageNo}"]`)) {
    decision.reasons = readReasons(container, pageNo);
    decision.note = readNote(container, pageNo);
  }
  decision.persistFailed = false;
  refreshCard(container, pageNo, decision, decisions);

  try {
    await apiPostNameApproval(slug, episode, {
      page_no: pageNo,
      status: decision.status,
      reasons: decision.reasons,
      note: decision.note,
    });
  } catch (e) {
    decision.persistFailed = true;
    refreshCard(container, pageNo, decision, decisions);
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
    const [manifest, approval, consoleManifest] = await Promise.all([
      apiGetNameManifest(slug, episode),
      apiGetNameApproval(slug, episode),
      apiGetManifest(slug, episode),
    ]);
    if (signal.aborted) return;

    const planPages = new Map<number, PagePlanPage>(
      consoleManifest.page_plan.pages.map((page) => [page.page_no, page])
    );
    const storyboardByPage = new Map<number, StoryboardPageV2>(
      (consoleManifest.storyboard?.pages ?? []).map((page) => [page.page_no, page])
    );
    const units = groupPagesIntoUnits(manifest.pages, planPages);
    const state: ViewState = { storyboardProposals: null };
    renderShell(container, manifest, units, slug, episode, state, storyboardByPage, consoleManifest.name_lint_report);
    apiGetStoryboardProposals(slug, episode)
      .then((response) => {
        if (signal.aborted) return;
        state.storyboardProposals = response;
        refreshStoryboardProposalButton(container, state);
      })
      .catch(() => {
        // proposals 不在時は無視 (button disabled になる)
      });
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

    const pageNosForUnit = (pageNo: number): number[] => {
      const card =
        container.querySelector<HTMLElement>(`[data-unit-pages~="${pageNo}"]`) ??
        container.querySelector<HTMLElement>(`[data-page-no="${pageNo}"]`);
      const pageNos = card ? unitPageNosFromCard(card) : [pageNo];
      return pageNos.length > 0 ? pageNos : [pageNo];
    };

    const syncUnitDraft = (
      pageNo: number,
      status: NamePageStatus,
      reasons: NameRejectReason[],
      note: string
    ): number[] => {
      const pageNos = pageNosForUnit(pageNo);
      for (const unitPageNo of pageNos) {
        const decision = decisions.get(unitPageNo);
        if (!decision) continue;
        decision.status = status;
        decision.reasons = [...reasons];
        decision.note = note;
        decision.persistFailed = false;
      }
      for (const unitPageNo of pageNos) {
        const decision = decisions.get(unitPageNo);
        if (decision) refreshCard(container, unitPageNo, decision, decisions);
      }
      refreshSummary(container, decisions);
      return pageNos;
    };

    const persistUnitAndAdvance = (pageNos: number[]): void => {
      void Promise.all(pageNos.map((unitPageNo) => persistDecision(container, slug, episode, unitPageNo, decisions)));
      advanceToNextPending();
    };

    const setStatus = (pageNo: number, status: NamePageStatus): void => {
      const current = decisions.get(pageNo);
      if (!current) return;
      const reasons = status === "rejected" ? current.reasons : [];
      const note = current.note;
      const pageNos = syncUnitDraft(pageNo, status, reasons, note);
      applyDecisionToInputs(container, pageNo, current);
      persistUnitAndAdvance(pageNos);
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
      const pageNos = syncUnitDraft(pageNo, "rejected", modalReasons(container), modalNote(container));
      const decision = decisions.get(pageNo);
      if (decision) applyDecisionToInputs(container, pageNo, decision);
      closeRejectModal(container);
      rejectPageNo = null;
      persistUnitAndAdvance(pageNos);
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
              const status = decision.status === "pending" ? "rejected" : decision.status;
              const pageNos = syncUnitDraft(pageNo, status, readReasons(container, pageNo), readNote(container, pageNo));
              void Promise.all(pageNos.map((unitPageNo) => persistDecision(container, slug, episode, unitPageNo, decisions)));
            },
            { signal }
          );
        });
      card
        .querySelector<HTMLTextAreaElement>(`[data-page-note="${pageNo}"]`)
        ?.addEventListener(
          "change",
          () => {
            const decision = decisions.get(pageNo);
            if (!decision) return;
            const pageNos = syncUnitDraft(pageNo, decision.status, readReasons(container, pageNo), readNote(container, pageNo));
            void Promise.all(pageNos.map((unitPageNo) => persistDecision(container, slug, episode, unitPageNo, decisions)));
          },
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
        if (target.matches('[data-ng-action="open-variant-lightbox"]')) {
          if (!state.storyboardProposals?.proposals.length) return;
          void openStoryboardVariantLightbox({
            slug,
            episode,
            proposals: state.storyboardProposals.proposals,
            audit: state.storyboardProposals.audit,
            adopted: state.storyboardProposals.adopted,
            variantSvgs: state.storyboardProposals.variant_svgs,
          }).then((result) => {
            if (result.status === "adopted") {
              // storyboard.json が materialize されたので reload で反映
              window.location.reload();
            }
          });
          return;
        }
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
        const lintFixButton = target.closest<HTMLButtonElement>("[data-name-lint-fix-panel]");
        if (lintFixButton) {
          if (activeNameLintFix) return;
          const panelNo = Number(lintFixButton.dataset.nameLintFixPanel);
          const rule = lintFixButton.dataset.nameLintFixRule;
          if (!Number.isInteger(panelNo) || panelNo <= 0) return;
          const progress = lintFixButton.parentElement?.querySelector<HTMLElement>(".lint-fix-progress");
          lintFixButton.disabled = true;
          lintFixButton.textContent = "修正中...";
          if (progress) progress.textContent = "starting...";
          activeNameLintFix = runNameLintFix(
            slug,
            episode,
            [panelNo],
            rule ? [rule] : undefined,
            (message) => {
              console.log(message);
              if (progress) progress.textContent = message;
            },
            () => {
              activeNameLintFix = null;
              if (progress) progress.textContent = "done. reloading...";
              window.location.reload();
            },
            (error) => {
              activeNameLintFix = null;
              lintFixButton.disabled = false;
              lintFixButton.textContent = "AI 修正";
              if (progress) progress.textContent = error.message;
              alert(`AI 修正に失敗しました: ${error.message}`);
            }
          );
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
          focusPage(adjacentUnit(cards, focusedPageNo, 1));
          event.preventDefault();
          return;
        } else if (event.key === "ArrowUp" || event.key === "k") {
          focusPage(adjacentUnit(cards, focusedPageNo, -1));
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

    focusedPageNo = firstPendingOrFirst(units, decisions);
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
