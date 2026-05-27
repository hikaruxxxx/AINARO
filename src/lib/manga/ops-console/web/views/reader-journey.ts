/**
 * Reader Journey Simulation Console View
 *
 * reader_journey.json の結果を表示:
 * - ページ別エンゲージメント推移
 * - JourneySummary スコアカード
 * - 改善提案カード
 */

import { store } from "../lib/store";

type ReadingMoment = {
  page_no: number;
  comprehension: number;
  engagement: number;
  emotion: string;
  internal_monologue: string;
  unanswered_questions: string[];
  page_turning_motivation: "strong" | "moderate" | "weak" | "at_risk";
  drop_off_trigger?: string;
};

type JourneySummary = {
  overall_satisfaction: number;
  hook_effectiveness: number;
  world_clarity: number;
  protagonist_likability: number;
  cliffhanger_pull: number;
  pacing_assessment: string;
  emotional_arc: string;
  strongest_moment: { page_no: number; reason: string };
  weakest_moment: { page_no: number; reason: string };
  desire_fulfillment: Record<string, number>;
};

type Suggestion = {
  target_pages: number[];
  category: string;
  severity: "critical" | "important" | "minor";
  problem: string;
  suggestion: string;
};

type JourneyData = {
  persona: { age_range: string; manga_literacy: string; genre_familiarity: string; primary_desire: string };
  moments: ReadingMoment[];
  summary: JourneySummary;
  suggestions: Suggestion[];
};

type ViewState = {
  slug: string;
  episode: number;
  data: JourneyData | null;
  loading: boolean;
  error: string | null;
};

const CSS = `
.rj-view { display: grid; gap: var(--space-4); max-width: 1200px; }
.rj-scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-2); }
.rj-score-card {
  padding: var(--space-3); border-radius: var(--radius-md);
  background: var(--color-surface-1); text-align: center;
}
.rj-score-card .label { font-size: 0.75rem; color: var(--color-text-2); }
.rj-score-card .value { font-size: 1.5rem; font-weight: 700; }
.rj-bar-chart { display: flex; align-items: end; gap: 2px; height: 120px; padding: var(--space-2) 0; }
.rj-bar {
  flex: 1; min-width: 8px; border-radius: 2px 2px 0 0; position: relative; cursor: pointer;
  transition: opacity 0.15s;
}
.rj-bar:hover { opacity: 0.8; }
.rj-bar .tip {
  display: none; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  background: var(--color-surface-2); padding: 4px 8px; border-radius: 4px;
  font-size: 0.7rem; white-space: nowrap; z-index: 10;
}
.rj-bar:hover .tip { display: block; }
.rj-suggestion {
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);
  border-left: 4px solid; margin-bottom: var(--space-1);
}
.rj-suggestion.critical { border-color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 8%, transparent); }
.rj-suggestion.important { border-color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 8%, transparent); }
.rj-suggestion.minor { border-color: var(--color-text-3); background: var(--color-surface-1); }
.rj-moments { max-height: 400px; overflow-y: auto; }
.rj-moment {
  display: grid; grid-template-columns: 50px 1fr; gap: var(--space-2);
  padding: var(--space-1) 0; border-bottom: 1px solid var(--color-border);
  font-size: 0.8rem;
}
.rj-moment.at-risk { background: color-mix(in srgb, var(--color-danger) 6%, transparent); }
.rj-page-no { font-weight: 600; text-align: center; }
`;

function scoreColor(v: number): string {
  if (v >= 70) return "var(--color-success, #22c55e)";
  if (v >= 40) return "var(--color-warning, #f59e0b)";
  return "var(--color-danger, #ef4444)";
}

function barColor(m: ReadingMoment): string {
  if (m.page_turning_motivation === "at_risk") return "var(--color-danger, #ef4444)";
  if (m.page_turning_motivation === "weak") return "var(--color-warning, #f59e0b)";
  return "var(--color-primary, #3b82f6)";
}

function renderScores(s: JourneySummary): string {
  const items = [
    { label: "総合満足度", value: s.overall_satisfaction },
    { label: "Hook 効果", value: s.hook_effectiveness },
    { label: "世界観伝達", value: s.world_clarity },
    { label: "主人公好感", value: s.protagonist_likability },
    { label: "引き強度", value: s.cliffhanger_pull },
  ];
  return `<div class="rj-scores">${items
    .map(
      (i) =>
        `<div class="rj-score-card"><div class="label">${i.label}</div><div class="value" style="color:${scoreColor(i.value)}">${i.value}</div></div>`,
    )
    .join("")}<div class="rj-score-card"><div class="label">ペーシング</div><div class="value" style="font-size:1rem">${s.pacing_assessment}</div></div></div>`;
}

function renderBarChart(moments: ReadingMoment[]): string {
  const bars = moments
    .map((m) => {
      const h = Math.max(4, m.engagement * 1.2);
      return `<div class="rj-bar" style="height:${h}px;background:${barColor(m)}"><span class="tip">p${m.page_no}: ${m.engagement} (${m.emotion})</span></div>`;
    })
    .join("");
  return `<div><div style="font-size:0.8rem;color:var(--color-text-2);margin-bottom:4px">ページ別エンゲージメント</div><div class="rj-bar-chart">${bars}</div></div>`;
}

function renderSuggestions(suggestions: Suggestion[]): string {
  if (suggestions.length === 0) return "";
  const sorted = [...suggestions].sort((a, b) => {
    const order = { critical: 0, important: 1, minor: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });
  return `<div><h3>改善提案 (${suggestions.length})</h3>${sorted
    .map(
      (s) =>
        `<div class="rj-suggestion ${s.severity}"><strong>[${s.severity}] ${s.category}</strong> p${s.target_pages.join(",")}<br>${s.problem}<br><em>${s.suggestion}</em></div>`,
    )
    .join("")}</div>`;
}

function renderMoments(moments: ReadingMoment[]): string {
  const rows = moments
    .map((m) => {
      const cls = m.page_turning_motivation === "at_risk" ? "rj-moment at-risk" : "rj-moment";
      const qs = m.unanswered_questions.length > 0 ? `<br>疑問: ${m.unanswered_questions.join(" / ")}` : "";
      const trigger = m.drop_off_trigger ? `<br><strong>離脱要因: ${m.drop_off_trigger}</strong>` : "";
      return `<div class="${cls}"><div class="rj-page-no">p${m.page_no}</div><div>${m.emotion} (理解${m.comprehension} / 興味${m.engagement})<br>${m.internal_monologue}${qs}${trigger}</div></div>`;
    })
    .join("");
  return `<div><h3>ページ別読者内面</h3><div class="rj-moments">${rows}</div></div>`;
}

function renderPersona(p: JourneyData["persona"]): string {
  return `<div style="font-size:0.8rem;color:var(--color-text-2)">ペルソナ: ${p.age_range} / リテラシー=${p.manga_literacy} / ジャンル慣れ=${p.genre_familiarity} / 主要欲求=${p.primary_desire}</div>`;
}

function renderView(state: ViewState): string {
  if (state.loading) return `<div class="rj-view"><p>読み込み中...</p></div>`;
  if (state.error) return `<div class="rj-view"><p style="color:var(--color-danger)">${state.error}</p></div>`;
  if (!state.data) return `<div class="rj-view"><p>reader_journey.json が未生成です。<code>npx tsx scripts/manga/layers/L04_5-reader-journey.ts --slug ${state.slug} --episode ${state.episode}</code> で生成してください。</p></div>`;

  const d = state.data;
  return `<div class="rj-view">
    <h2>Reader Journey — ep${String(state.episode).padStart(2, "0")}</h2>
    ${renderPersona(d.persona)}
    ${renderScores(d.summary)}
    ${renderBarChart(d.moments)}
    <div style="font-size:0.85rem"><strong>感情曲線:</strong> ${d.summary.emotional_arc}</div>
    <div style="font-size:0.85rem"><strong>最強の瞬間:</strong> p${d.summary.strongest_moment.page_no} — ${d.summary.strongest_moment.reason}</div>
    <div style="font-size:0.85rem"><strong>最弱の瞬間:</strong> p${d.summary.weakest_moment.page_no} — ${d.summary.weakest_moment.reason}</div>
    ${renderSuggestions(d.suggestions)}
    ${renderMoments(d.moments)}
  </div>`;
}

export function mountReaderJourney(container: HTMLElement): () => void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const state: ViewState = {
    slug: store.state.currentSlug,
    episode: store.state.currentEpisode,
    data: null,
    loading: true,
    error: null,
  };

  function render(): void {
    container.innerHTML = renderView(state);
  }

  async function load(): Promise<void> {
    state.loading = true;
    state.error = null;
    render();
    try {
      const resp = await fetch(`/api/works/${state.slug}/episodes/ep${state.episode}/reader-journey`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const body = (await resp.json()) as { exists: boolean; data?: JourneyData };
      state.data = body.exists ? (body.data as JourneyData) : null;
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }
    state.loading = false;
    render();
  }

  load();
  return () => {
    style.remove();
  };
}
