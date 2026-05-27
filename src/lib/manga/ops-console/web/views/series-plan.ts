/**
 * SeriesPlan view (L2b 物語OS再設計、本作レベル長期計画)
 *
 * `series_plan.json` を読み取り専用で可視化する:
 *   - 本作テーマ / long_arc_outline / core_hook_evolution
 *   - arcs[] (arc_phase / volume_range / theme / turning_points)
 *   - protagonist_long_arc (starting_state → arc_endings[] → final_state)
 *
 * 編集 UI は当面用意しない (孤発な L02b --phase=series で再生成する想定)。
 */
import {
  apiGetSeriesPlan,
  apiPostJob,
  openJobStream,
  type JobEvent,
  type SeriesPlanResponse,
} from "../lib/api";
import { asRecord, escapeHtml, jsonHtml } from "../lib/data-display";
import { store } from "../lib/store";

type ViewState = {
  slug: string;
  loading: boolean;
  error: string | null;
  notice: string | null;
  plan: unknown | null;
  running: boolean;
  log: string[];
};

const CSS = `
.sp-view { display: grid; gap: var(--space-3); }
.sp-body { display: grid; gap: var(--space-3); max-width: 1080px; }
.sp-card { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-elevated); }
.sp-card h3 { margin: 0; font-size: var(--fs-lg); }
.sp-meta { display: grid; grid-template-columns: 130px 1fr; gap: var(--space-2) var(--space-3); }
.sp-meta dt { color: var(--text-tertiary); font-size: var(--fs-sm); }
.sp-meta dd { margin: 0; line-height: 1.6; white-space: pre-wrap; }
.sp-arcs { display: grid; gap: var(--space-2); }
.sp-arc { display: grid; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.sp-arc__head { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: baseline; }
.sp-arc__name { margin: 0; font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.sp-arc__body { display: grid; grid-template-columns: 120px 1fr; gap: var(--space-1) var(--space-3); }
.sp-arc__body dt { color: var(--text-tertiary); font-size: var(--fs-sm); }
.sp-arc__body dd { margin: 0; line-height: 1.5; }
.sp-tp-list { display: grid; gap: var(--space-1); margin: 0; padding-left: 1.2em; }
.sp-tp-list li { line-height: 1.5; }
.sp-protagonist-arc { display: grid; gap: var(--space-2); }
.sp-protagonist-step { display: grid; grid-template-columns: 160px 1fr; gap: var(--space-2); padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-sunken); }
.sp-protagonist-step strong { color: var(--text-secondary); font-size: var(--fs-sm); }
.sp-empty { padding: var(--space-3); border: 1px dashed var(--border-default); border-radius: var(--radius-md); color: var(--text-secondary); }
.sp-toolbar { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.sp-toolbar__spacer { flex: 1 1 auto; }
.sp-log { min-height: 120px; padding: var(--space-2); background: var(--surface-sunken); border-radius: var(--radius-md); white-space: pre-wrap; font-family: var(--font-mono); font-size: var(--fs-xs); }
.sp-arc__phase-badge { padding: 2px 8px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.sp-arc__phase-prologue { background: #dbeafe; color: #1e40af; }
.sp-arc__phase-rising { background: #d1fae5; color: #065f46; }
.sp-arc__phase-crisis { background: #fee2e2; color: #991b1b; }
.sp-arc__phase-climax { background: #fef3c7; color: #92400e; }
.sp-arc__phase-epilogue { background: #ede9fe; color: #5b21b6; }
`;

function ensureStyles(): void {
  const id = "nc-series-plan-styles";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function phaseBadge(phase: unknown): string {
  const p = typeof phase === "string" ? phase : "";
  const cls = ["prologue", "rising", "crisis", "climax", "epilogue"].includes(p)
    ? `sp-arc__phase-${p}`
    : "";
  return `<span class="sp-arc__phase-badge ${cls}">${escapeHtml(p || "?")}</span>`;
}

function renderArc(arc: unknown): string {
  const a = asRecord(arc);
  const range = Array.isArray(a.volume_range) ? a.volume_range : [];
  const rangeLabel =
    range.length === 2 && range[0] === range[1]
      ? `vol ${range[0]}`
      : range.length === 2
        ? `vol ${range[0]} - vol ${range[1]}`
        : "vol ?";
  const turningPoints = Array.isArray(a.turning_points) ? a.turning_points : [];
  return `<article class="sp-arc">
    <div class="sp-arc__head">
      ${phaseBadge(a.arc_phase)}
      <h4 class="sp-arc__name">${escapeHtml(String(a.arc_name ?? "(無名章)"))}</h4>
      <span class="nc-code">${escapeHtml(String(a.arc_id ?? ""))}</span>
      <span class="nc-badge nc-badge--neutral">${rangeLabel}</span>
    </div>
    <dl class="sp-arc__body">
      <dt>テーマ</dt><dd>${escapeHtml(String(a.arc_theme ?? ""))}</dd>
      <dt>主人公の成長</dt><dd>${escapeHtml(String(a.protagonist_growth ?? ""))}</dd>
      <dt>開幕</dt><dd>${escapeHtml(String(a.arc_opening ?? ""))}</dd>
      <dt>クライマックス</dt><dd>${escapeHtml(String(a.arc_climax ?? ""))}</dd>
      <dt>決着</dt><dd>${escapeHtml(String(a.arc_resolution ?? ""))}</dd>
    </dl>
    ${
      turningPoints.length > 0
        ? `<details>
            <summary>turning_points (${turningPoints.length})</summary>
            <ol class="sp-tp-list">
              ${turningPoints
                .map((tp) => {
                  const t = asRecord(tp);
                  return `<li><strong>vol${escapeHtml(String(t.volume ?? "?"))} ep${escapeHtml(String(t.episode ?? "?"))}</strong>: ${escapeHtml(String(t.event ?? ""))}</li>`;
                })
                .join("")}
            </ol>
          </details>`
        : ""
    }
  </article>`;
}

function renderPlan(plan: unknown): string {
  const obj = asRecord(plan);
  const arcs = Array.isArray(obj.arcs) ? obj.arcs : [];
  const longArc = asRecord(obj.protagonist_long_arc);
  const arcEndings = Array.isArray(longArc.arc_endings) ? longArc.arc_endings : [];
  return `<div class="sp-body">
    <section class="sp-card">
      <h3>本作概要</h3>
      <dl class="sp-meta">
        <dt>シリーズテーマ</dt><dd>${escapeHtml(String(obj.series_theme ?? ""))}</dd>
        <dt>全巻数</dt><dd>${escapeHtml(String(obj.total_volumes ?? "?"))}</dd>
        <dt>章数</dt><dd>${arcs.length} 章</dd>
        <dt>core_hook 進化</dt><dd>${escapeHtml(String(obj.core_hook_evolution ?? ""))}</dd>
        <dt>長期アウトライン</dt><dd>${escapeHtml(String(obj.long_arc_outline ?? ""))}</dd>
        <dt>生成時刻</dt><dd>${escapeHtml(String(obj.generated_at ?? ""))}</dd>
      </dl>
    </section>

    <section class="sp-card">
      <h3>章構成 (arcs)</h3>
      <div class="sp-arcs">
        ${arcs.map(renderArc).join("") || '<div class="sp-empty">章が定義されていません。</div>'}
      </div>
    </section>

    <section class="sp-card">
      <h3>主人公の長期 arc</h3>
      <div class="sp-protagonist-arc">
        <div class="sp-protagonist-step">
          <strong>開始 (第1巻冒頭)</strong>
          <div>${escapeHtml(String(longArc.starting_state ?? ""))}</div>
        </div>
        ${arcEndings
          .map((end, i) => {
            const arc = arcs[i] as Record<string, unknown> | undefined;
            const arcName = arc ? String(arc.arc_name ?? `arc${i + 1}`) : `arc${i + 1}`;
            return `<div class="sp-protagonist-step">
              <strong>${escapeHtml(arcName)} 終了時</strong>
              <div>${escapeHtml(String(end ?? ""))}</div>
            </div>`;
          })
          .join("")}
        <div class="sp-protagonist-step">
          <strong>最終巻終了時</strong>
          <div>${escapeHtml(String(longArc.final_state ?? ""))}</div>
        </div>
      </div>
    </section>

    <details class="sp-card">
      <summary>raw JSON</summary>
      <pre class="nc-code-block">${jsonHtml(plan)}</pre>
    </details>
  </div>`;
}

function render(container: HTMLElement, state: ViewState): void {
  const main = state.loading
    ? `<div class="nc-loading">読み込み中...</div>`
    : state.error
      ? `<div class="nc-empty">${escapeHtml(state.error)}</div>`
      : state.plan === null
        ? `<div class="sp-empty">
            <p>本作レベルの長期計画 (series_plan.json) は未生成です。</p>
            <p>L2b を <code>--phase=series</code> で起動すると全 ${escapeHtml(String(state.slug))} 巻分の章配分・主人公成長弧・core_hook 進化が一括設計されます。</p>
            <p>ターミナルで:</p>
            <pre class="nc-code-block">npx tsx scripts/manga/layers/L02b-volume-plot.ts \\
  --slug ${escapeHtml(state.slug)} --phase=series \\
  --concept &lt;path/to/v2_concept.json&gt;</pre>
          </div>`
        : renderPlan(state.plan);

  container.innerHTML = `
    <section class="sp-view">
      <header class="sp-toolbar">
        <h2 class="nc-h2" style="margin:0;">SeriesPlan — 本作レベル長期計画</h2>
        <span class="nc-badge nc-badge--info">${escapeHtml(state.slug)}</span>
        <div class="sp-toolbar__spacer"></div>
        <button type="button" class="nc-button nc-button--ghost" data-action="reload">再読み込み</button>
      </header>
      ${state.notice ? `<div class="nc-notice">${escapeHtml(state.notice)}</div>` : ""}
      ${main}
      ${state.running ? `<section class="sp-card"><h3>L02b 進行ログ</h3><pre class="sp-log">${escapeHtml(state.log.join("\n"))}</pre></section>` : ""}
    </section>
  `;
}

async function refresh(state: ViewState, container: HTMLElement): Promise<void> {
  state.loading = true;
  state.error = null;
  render(container, state);
  try {
    const res: SeriesPlanResponse = await apiGetSeriesPlan(state.slug);
    state.plan = res.plan;
    state.notice = res.error ?? null;
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
    state.plan = null;
  } finally {
    state.loading = false;
    render(container, state);
  }
}

export function mountSeriesPlanView(container: HTMLElement): () => void {
  ensureStyles();
  const app = store.state;
  const state: ViewState = {
    slug: app.currentSlug || app.defaultSlug,
    loading: false,
    error: null,
    notice: null,
    plan: null,
    running: false,
    log: [],
  };

  void refresh(state, container);

  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('[data-action="reload"]')) {
      void refresh(state, container);
    }
  };
  container.addEventListener("click", onClick);

  return () => {
    container.removeEventListener("click", onClick);
  };
}

// JobEvent / apiPostJob / openJobStream は将来「Console から L02b --phase=series 起動」UI を
// 追加する際に使う想定 (現状は read-only)。未使用 import が残ると tsc に怒られるため
// dummy export しておく。
export type _internal = JobEvent;
const _unused = { apiPostJob, openJobStream };
void _unused;
