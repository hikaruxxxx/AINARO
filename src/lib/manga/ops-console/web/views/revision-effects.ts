import { ApiError, apiGetManifest, type Manifest } from "../lib/api";
import { store } from "../lib/store";
import {
  REVISION_TAGS,
  isRevisionTag,
  type AdoptedVersions,
  type RevisionTag,
} from "../../../revision-ui/types";

type EffectsStats = {
  totalQueued: number;
  resolved: number;
  adoptedNonV1: number;
  resolutionRate: number;
  adoptionRate: number;
  byTag: Map<RevisionTag, { queued: number; resolved: number; adopted: number }>;
  panelStats: Array<{ panel_id: string; instructionCount: number; adoptedVersion: string | null; rounds: number }>;
};

const RV_EFFECTS_CSS = `
.rv-effects-view { display: grid; gap: 14px; }
.rv-effects-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--border-default, #dbe1ea);
  border-radius: 8px;
  background: var(--surface-elevated, #fff);
}
.rv-effects-header h2 { margin: 0; font-size: 18px; letter-spacing: 0; }
.rv-effects-info { color: var(--text-secondary, #64748b); font-size: 13px; }
.rv-effects-back {
  margin-left: auto;
  min-height: 30px;
  border: 1px solid var(--border-default, #c7cfdb);
  border-radius: 6px;
  background: var(--surface-elevated, #fff);
  color: var(--text-default, #334155);
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
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
  if (document.getElementById("rv-effects-styles")) return;
  const style = document.createElement("style");
  style.id = "rv-effects-styles";
  style.textContent = RV_EFFECTS_CSS;
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

function errorText(error: unknown): string {
  if (error instanceof ApiError) return `API ${error.status}: ${error.body}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function parseVersion(version: string): number {
  const m = version.match(/^v(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function adoptedPanels(manifest: Manifest): AdoptedVersions["panels"] {
  return manifest.adopted?.panels ?? {};
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

function renderShell(container: HTMLElement, slug: string, episode: number): void {
  container.innerHTML = `
    <div class="rv-effects-view">
      <div class="rv-effects-header">
        <h2>修正効果分析</h2>
        <span class="rv-effects-info">${escapeHtml(slug)} / ${epLabel(episode)}</span>
        <button type="button" class="rv-effects-back" id="rv-effects-back">← ページ承認に戻る</button>
      </div>
      <div id="rv-effects-main"><div class="rv-effects-empty">読み込み中...</div></div>
    </div>
  `;
  container.querySelector<HTMLButtonElement>("#rv-effects-back")?.addEventListener("click", () => {
    store.update({ currentView: "revision" });
  });
}

async function loadRevisionEffects(
  container: HTMLElement,
  slug: string,
  episode: number,
  signal: AbortSignal
): Promise<void> {
  if (!slug || !episode) return;
  renderShell(container, slug, episode);
  const main = container.querySelector<HTMLElement>("#rv-effects-main");
  if (!main) throw new Error("revision effects shell mount failed");
  try {
    const manifest = await apiGetManifest(slug, episode);
    if (signal.aborted) return;
    main.innerHTML = renderEffects(manifest);
  } catch (error) {
    if (!signal.aborted) {
      main.innerHTML = `<div class="view-placeholder"><h2>修正効果分析 読み込みエラー</h2><p>${escapeHtml(errorText(error))}</p></div>`;
    }
  }
}

export function mountRevisionEffectsView(container: HTMLElement): () => void {
  ensureStyles();
  let activeController = new AbortController();
  let activeScope = "";

  const unsubscribe = store.subscribe((state) => {
    const nextScope = `${state.currentSlug}#${state.currentEpisode}`;
    if (nextScope === activeScope) return;
    activeScope = nextScope;
    activeController.abort();
    activeController = new AbortController();
    void loadRevisionEffects(
      container,
      state.currentSlug,
      state.currentEpisode,
      activeController.signal
    );
  });

  return () => {
    unsubscribe();
    activeController.abort();
    container.innerHTML = "";
  };
}
