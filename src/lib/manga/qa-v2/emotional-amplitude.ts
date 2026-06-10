/**
 * Emotional Amplitude Audit
 *
 * 2026-05-20 S1 Domain C (品質ガード) で新設。
 *
 * panel.emotional_intensity (0-1) を page 順に並べた感情曲線について、
 * 5 ルールで「凡作テンポ」を検出する:
 *
 *  1. episode_amplitude (= max - min) ≥ 0.65、< 0.5 で hard warn
 *  2. first_30_percent_peak: 冒頭 30% 以内に intensity ≥ 0.55 が無い場合 warn
 *  3. final_peak: climax / title_anchor / cliffhanger ページで intensity ≥ 0.85 が無い場合 warn
 *  4. flat_run: 連続 5P 以上で intensity 差分 < 0.1 が続けば warn
 *  5. monologue_cold_open: 冒頭 25% で dialogue=0 かつ intensity < 0.5 で hard warn
 *
 * 既知問題: 現在の a07 ep1 storyboard は panel.emotional_intensity が全 0.00。
 * その場合 intensity-propagation.ts でフォールバック伝播してから本 audit を実行する。
 *
 * 詳細: /Users/hikarumori/.claude/plans/10-90-codex-wild-goblet.md Section 5.3
 */
import type { EpisodeStoryboardV2, StoryboardPageV2 } from "../schemas-v2";

export type AmplitudeFinding = {
  severity: "warning" | "hard_warning";
  kind:
    | "episode_amplitude_low"
    | "first_30_no_peak"
    | "final_peak_missing"
    | "flat_run"
    | "monologue_cold_open";
  page_no?: number;
  /** どのページ範囲が問題か (flat_run など) */
  page_range?: [number, number];
  message: string;
  metric?: number;
  expected?: string;
};

export type AmplitudeAuditSummary = {
  total_pages: number;
  panels_with_intensity: number;
  panels_total: number;
  min_intensity: number;
  max_intensity: number;
  amplitude: number;
  page_intensity_series: Array<{
    page_no: number;
    page_role: string;
    panel_count: number;
    page_avg_intensity: number;
    page_max_intensity: number;
    total_dialogue: number;
  }>;
  findings: AmplitudeFinding[];
};

/**
 * 各 panel の emotional_intensity を page 単位に集計し、findings を返す。
 */
export function auditEmotionalAmplitude(
  storyboard: EpisodeStoryboardV2,
): AmplitudeAuditSummary {
  const findings: AmplitudeFinding[] = [];
  const pageStats = storyboard.pages.map((page) => computePageStats(page));
  const allIntensities: number[] = [];
  let panelsWithIntensity = 0;
  let panelsTotal = 0;
  for (const page of storyboard.pages) {
    for (const panel of page.panels) {
      panelsTotal++;
      if (typeof panel.emotional_intensity === "number") {
        panelsWithIntensity++;
        allIntensities.push(panel.emotional_intensity);
      }
    }
  }

  const minIntensity = allIntensities.length > 0 ? Math.min(...allIntensities) : 0;
  const maxIntensity = allIntensities.length > 0 ? Math.max(...allIntensities) : 0;
  const amplitude = maxIntensity - minIntensity;

  // Rule 1: episode_amplitude
  if (allIntensities.length > 0) {
    if (amplitude < 0.5) {
      findings.push({
        severity: "hard_warning",
        kind: "episode_amplitude_low",
        message: `episode 全体の振幅 ${amplitude.toFixed(2)} が 0.5 未満 (推奨 0.65+)。感情曲線が平坦、テンポが弱い`,
        metric: amplitude,
        expected: "≥ 0.65 (hard floor 0.5)",
      });
    } else if (amplitude < 0.65) {
      findings.push({
        severity: "warning",
        kind: "episode_amplitude_low",
        message: `episode 全体の振幅 ${amplitude.toFixed(2)} が 0.65 未満`,
        metric: amplitude,
        expected: "≥ 0.65",
      });
    }
  }

  // Rule 2: first_30_percent_peak
  const totalPages = storyboard.pages.length;
  const first30Threshold = Math.max(1, Math.floor(totalPages * 0.3));
  const first30 = pageStats.slice(0, first30Threshold);
  const first30Peak = first30.reduce((m, p) => Math.max(m, p.page_max_intensity), 0);
  if (first30Peak < 0.55 && first30.length > 0) {
    findings.push({
      severity: "warning",
      kind: "first_30_no_peak",
      page_range: [first30[0].page_no, first30[first30.length - 1].page_no],
      message: `冒頭 30% (p${first30[0].page_no}-p${first30[first30.length - 1].page_no}) に intensity ≥ 0.55 の山がない (max=${first30Peak.toFixed(2)})。読者を掴む早期山が不足`,
      metric: first30Peak,
      expected: "first 30% に max intensity ≥ 0.55",
    });
  }

  // Rule 3: final_peak (climax / cliffhanger / aftermath で intensity ≥ 0.85 のページがあるか)
  const finalRoles = new Set(["climax", "cliffhanger", "aftermath", "reveal"]);
  const finalPages = pageStats.filter((p) => finalRoles.has(p.page_role));
  const finalPeak = finalPages.reduce((m, p) => Math.max(m, p.page_max_intensity), 0);
  if (finalPages.length > 0 && finalPeak < 0.85) {
    findings.push({
      severity: "warning",
      kind: "final_peak_missing",
      message: `climax/cliffhanger/aftermath/reveal ページ群の intensity 最大が ${finalPeak.toFixed(2)} で 0.85 未満。山場の見せ場が弱い`,
      metric: finalPeak,
      expected: "final 群で max intensity ≥ 0.85",
    });
  }

  // Rule 4: flat_run (連続 5 page 以上で intensity 差分 < 0.1)
  const flatRuns: Array<[number, number]> = [];
  let runStart = -1;
  let runStartPage = -1;
  for (let i = 0; i < pageStats.length; i++) {
    if (i === 0) {
      runStart = i;
      runStartPage = pageStats[i].page_no;
      continue;
    }
    const diff = Math.abs(
      pageStats[i].page_avg_intensity - pageStats[i - 1].page_avg_intensity,
    );
    if (diff < 0.1) {
      // 続く
      continue;
    } else {
      const runLen = i - runStart;
      if (runLen >= 5) {
        flatRuns.push([runStartPage, pageStats[i - 1].page_no]);
      }
      runStart = i;
      runStartPage = pageStats[i].page_no;
    }
  }
  // 末尾 run チェック
  const lastRunLen = pageStats.length - runStart;
  if (lastRunLen >= 5) {
    flatRuns.push([runStartPage, pageStats[pageStats.length - 1].page_no]);
  }
  for (const [from, to] of flatRuns) {
    findings.push({
      severity: "warning",
      kind: "flat_run",
      page_range: [from, to],
      message: `p${from}-p${to} の ${to - from + 1} ページ連続で intensity 差分 < 0.1 (平坦)。緩急がない`,
      expected: "連続 5P 以上の flat_run を避ける",
    });
  }

  // Rule 5: monologue_cold_open (冒頭 25% で dialogue=0 かつ intensity < 0.5、hard warn)
  const first25Threshold = Math.max(1, Math.floor(totalPages * 0.25));
  const first25 = pageStats.slice(0, first25Threshold);
  const first25Dialogue = first25.reduce((s, p) => s + p.total_dialogue, 0);
  const first25AvgIntensity =
    first25.length > 0
      ? first25.reduce((s, p) => s + p.page_avg_intensity, 0) / first25.length
      : 0;
  if (first25Dialogue === 0 && first25AvgIntensity < 0.5 && first25.length > 0) {
    findings.push({
      severity: "hard_warning",
      kind: "monologue_cold_open",
      page_range: [first25[0].page_no, first25[first25.length - 1].page_no],
      message: `冒頭 25% (p${first25[0].page_no}-p${first25[first25.length - 1].page_no}) で dialogue=0 かつ avg intensity=${first25AvgIntensity.toFixed(2)} < 0.5。「主人公が一人で考えている」絵が連続、読者離脱リスク`,
      metric: first25AvgIntensity,
      expected: "冒頭 25% で dialogue ≥ 1 OR intensity ≥ 0.5",
    });
  }

  return {
    total_pages: totalPages,
    panels_with_intensity: panelsWithIntensity,
    panels_total: panelsTotal,
    min_intensity: minIntensity,
    max_intensity: maxIntensity,
    amplitude,
    page_intensity_series: pageStats,
    findings,
  };
}

function computePageStats(page: StoryboardPageV2): {
  page_no: number;
  page_role: string;
  panel_count: number;
  page_avg_intensity: number;
  page_max_intensity: number;
  total_dialogue: number;
} {
  const intensities: number[] = [];
  let totalDialogue = 0;
  for (const panel of page.panels) {
    if (typeof panel.emotional_intensity === "number") {
      intensities.push(panel.emotional_intensity);
    }
    totalDialogue += panel.dialogue?.length ?? 0;
  }
  const avg = intensities.length > 0
    ? intensities.reduce((s, x) => s + x, 0) / intensities.length
    : 0;
  const max = intensities.length > 0 ? Math.max(...intensities) : 0;
  return {
    page_no: page.page_no,
    page_role: String(page.page_role),
    panel_count: page.panels.length,
    page_avg_intensity: avg,
    page_max_intensity: max,
    total_dialogue: totalDialogue,
  };
}

/**
 * findings を人間可読な markdown レポートに整形。
 */
export function renderAmplitudeReport(summary: AmplitudeAuditSummary): string {
  const lines: string[] = [];
  lines.push(`# Emotional Amplitude Audit`);
  lines.push("");
  lines.push(`- 総 page 数: ${summary.total_pages}`);
  lines.push(
    `- panel intensity 充填率: ${summary.panels_with_intensity}/${summary.panels_total} (${((summary.panels_with_intensity / Math.max(1, summary.panels_total)) * 100).toFixed(1)}%)`,
  );
  lines.push(
    `- intensity 範囲: ${summary.min_intensity.toFixed(2)} - ${summary.max_intensity.toFixed(2)} (振幅 ${summary.amplitude.toFixed(2)})`,
  );
  lines.push("");
  lines.push(`## findings (${summary.findings.length} 件)`);
  lines.push("");
  if (summary.findings.length === 0) {
    lines.push("- (なし、全 5 ルール合格)");
  }
  for (const f of summary.findings) {
    const severity = f.severity === "hard_warning" ? "❌ HARD" : "⚠️  WARN";
    const range = f.page_range
      ? ` [p${f.page_range[0]}-p${f.page_range[1]}]`
      : f.page_no
        ? ` [p${f.page_no}]`
        : "";
    lines.push(`- ${severity} ${f.kind}${range}: ${f.message}`);
    if (f.expected) lines.push(`    expected: ${f.expected}`);
  }
  lines.push("");
  lines.push(`## page 単位 intensity 系列`);
  lines.push("");
  lines.push("| page | role | panels | avg | max | dial |");
  lines.push("|---|---|---|---|---|---|");
  for (const p of summary.page_intensity_series) {
    lines.push(
      `| p${String(p.page_no).padStart(2, "0")} | ${p.page_role} | ${p.panel_count} | ${p.page_avg_intensity.toFixed(2)} | ${p.page_max_intensity.toFixed(2)} | ${p.total_dialogue} |`,
    );
  }
  return lines.join("\n");
}
