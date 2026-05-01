/**
 * Storyboard → Markdown 絵コンテレンダラ
 *
 * L1.2 ネーム層の出力 (ShotlistData + EpisodePlotData) を、
 * 人間が画像生成前に1次レビューできる Markdown 絵コンテへ変換する純関数。
 *
 * 設計意図:
 *   - JSON は機械judge / Markdown は人間レビューの二段同期 (Source of Truth は JSON)
 *   - AI画像なしで「コマ割りの良し悪し」「ページめくりの効き」「セリフ密度」が判定可能
 *   - 24p で人間レビュー 5-10 分を目標。Phase A の現実上限 (1日5-10p) と整合
 *
 * 効率インパクト:
 *   - 画像生成失敗の発見をネーム段階に前倒し → 無駄な画像生成費を 30-40% → 5-10% に圧縮
 */

import type {
  EpisodePlotData,
  ShotlistData,
  ShotlistPanelEntry,
  StoryboardPageEntry,
  PlotBeat,
} from "../schemas";

export type RenderOptions = {
  /** キャラ ID → 表示名 */
  characterIdToName: Map<string, string>;
  /** ロケ ID → 表示名 */
  locationIdToName: Map<string, string>;
  /** 作品スラッグ・タイトル（ヘッダ用） */
  workSlug: string;
  workTitle: string;
};

/**
 * Storyboard を Markdown 絵コンテへ変換する。
 * 純関数（同じ入力には同じ出力）。
 */
export function renderStoryboardMarkdown(args: {
  episodeNum: number;
  plot: EpisodePlotData;
  shotlist: ShotlistData;
  options: RenderOptions;
}): string {
  const { episodeNum, plot, shotlist, options } = args;
  const lines: string[] = [];

  // ============================================================
  // ヘッダ
  // ============================================================
  const totalPages = shotlist.pages?.length ?? 0;
  const totalPanels = shotlist.panels.length;
  const targetPages =
    shotlist.episode_target_pages ?? plot.episode_target_pages ?? totalPages;

  lines.push(`# ${options.workTitle} ep${episodeNum}`);
  lines.push("");
  lines.push(
    `**${totalPages}p / ${totalPanels} panels** (target ${targetPages}p)`
  );
  lines.push("");

  // ============================================================
  // 概要
  // ============================================================
  lines.push("## 概要");
  lines.push("");
  lines.push(`- **theme**: ${plot.theme}`);
  lines.push(
    `- **arc**: ${plot.protagonist_arc.start} → ${plot.protagonist_arc.turn} → ${plot.protagonist_arc.end}`
  );
  lines.push(`- **cliffhanger_hook**: ${plot.cliffhanger_hook}`);
  lines.push(`- **motifs**: ${plot.motifs.join(" / ") || "(なし)"}`);
  lines.push(
    `- **intended_experience**: ${plot.intended_reading_experience}`
  );
  if (plot.must_include_events && plot.must_include_events.length > 0) {
    const coverage = computeMustEventCoverage(
      shotlist.panels,
      plot.must_include_events
    );
    lines.push("");
    lines.push(`- **必須イベント (must_include)**:`);
    for (const [evt, panelIdx] of coverage) {
      const status =
        panelIdx > 0 ? `✓ panel #${panelIdx}` : "✗ 未消化";
      lines.push(`    - ${evt}: ${status}`);
    }
  }
  lines.push("");

  // ============================================================
  // beats サマリ
  // ============================================================
  lines.push("## beats");
  lines.push("");
  lines.push("| # | label | intensity | budget | summary |");
  lines.push("|---|---|---|---|---|");
  for (const b of plot.beats) {
    const budget = b.page_budget
      ? `${b.page_budget.target_pages}p (${b.page_budget.min_pages}-${b.page_budget.max_pages})`
      : "-";
    lines.push(
      `| ${b.beat_idx} | ${b.label} | ${b.emotional_intensity.toFixed(2)} | ${budget} | ${truncate(b.summary, 60)} |`
    );
  }
  lines.push("");

  // ============================================================
  // judge_input (機械採点用、人間も品質一覧として読める)
  // ============================================================
  const judge = computeJudgeMetrics(shotlist, plot);
  lines.push("## judge_input (画像生成前 1次judge)");
  lines.push("");
  lines.push(`- total_pages: ${judge.totalPages} (target ${targetPages})`);
  lines.push(`- total_panels: ${judge.totalPanels}`);
  lines.push(
    `- importance≥4: ${judge.highImportanceCount} panels (期待 ${judge.expectedHighImportance}+)`
  );
  lines.push(`- silence/pause/emote: ${judge.silenceCount} panels`);
  lines.push(`- max_face_close_run: ${judge.maxFaceCloseRun}`);
  lines.push(`- dialogue_chars_total: ${judge.dialogueCharsTotal}`);
  lines.push(`- avg_chars_per_panel: ${judge.avgCharsPerPanel.toFixed(1)}`);
  lines.push(
    `- episode_cliffhanger_strength: ${judge.episodeCliffhangerStrength}`
  );
  lines.push(`- render_risk_high: ${judge.renderRiskHighCount} panels`);
  lines.push("");

  // ============================================================
  // ページ別 絵コンテ本体
  // ============================================================
  if (!shotlist.pages || shotlist.pages.length === 0) {
    lines.push("## ⚠️ pages[] が空です（旧フォーマット出力）");
    lines.push("");
    lines.push("storyboard-builder が pages[] 階層を出力していない可能性。");
    lines.push("");
    return lines.join("\n");
  }

  for (const page of shotlist.pages) {
    renderPage(page, shotlist.panels, plot.beats, lines, options);
  }

  return lines.join("\n");
}

// ============================================================
// ページ単位レンダラ
// ============================================================

function renderPage(
  page: StoryboardPageEntry,
  allPanels: ShotlistPanelEntry[],
  beats: PlotBeat[],
  lines: string[],
  options: RenderOptions
): void {
  const sideMark =
    page.page_side === "right"
      ? "▶ right (RTL開き側)"
      : page.page_side === "left"
        ? "◀ left"
        : "";
  const turnMark =
    page.turn_strength != null && page.turn_strength > 0
      ? ` — turn_strength=${page.turn_strength}`
      : "";

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    `## P${page.page_idx} [${page.page_role}] ${sideMark} — target ${page.target_panels} panels${turnMark}`
  );
  lines.push("");

  if (page.page_open_hook) {
    lines.push(`> 🪝 **page_open_hook**: ${page.page_open_hook}`);
    lines.push("");
  }

  // panels テーブル (一覧性)
  const pagePanels = page.panel_idxs
    .map((i) => allPanels.find((p) => p.idx === i))
    .filter((p): p is ShotlistPanelEntry => p != null);

  lines.push(
    "| # | imp | shot | NF | char | location | text | risk |"
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const p of pagePanels) {
    const chars = p.characters
      .map((id) => options.characterIdToName.get(id) ?? `?(${id.slice(0, 4)})`)
      .join("/");
    const loc = p.location
      ? options.locationIdToName.get(p.location) ?? `?(${p.location.slice(0, 4)})`
      : "-";
    const dialogueText = (p.dialogue ?? [])
      .map((d) => {
        const speaker =
          options.characterIdToName.get(d.speaker_id) ?? "?";
        return `${speaker}「${d.text}」`;
      })
      .join(" / ");
    const text =
      p.narration && dialogueText
        ? `[N]${p.narration} / ${dialogueText}`
        : p.narration
          ? `[N]${p.narration}`
          : dialogueText || "(silent)";
    const risk = p.render_risk ?? "-";
    lines.push(
      `| ${p.idx} | ${p.importance ?? "-"} | ${p.camera}/${p.aspect} | ${p.narrative_function ?? "-"} | ${chars || "-"} | ${truncate(loc, 12)} | ${truncate(text, 40)} | ${risk} |`
    );
  }
  lines.push("");

  // panel 詳細
  for (const p of pagePanels) {
    renderPanelDetail(p, beats, lines, options);
  }

  if (page.page_end_hook) {
    lines.push(`> 🎬 **page_end_hook**: ${page.page_end_hook}`);
    lines.push("");
  }
}

// ============================================================
// panel 単位詳細
// ============================================================

function renderPanelDetail(
  p: ShotlistPanelEntry,
  beats: PlotBeat[],
  lines: string[],
  options: RenderOptions
): void {
  const beatLabel = beats.find((b) => b.beat_idx === p.beat_idx)?.label ?? "?";

  lines.push(
    `**panel #${p.idx}** [imp=${p.importance ?? "-"}, beat=${p.beat_idx}/${beatLabel}, scene=${p.scene_id}]`
  );

  if (p.purpose) lines.push(`- 🎯 purpose: ${p.purpose}`);
  if (p.change_from_prev)
    lines.push(`- 🔄 change_from_prev: ${p.change_from_prev}`);
  if (p.visual_focus) lines.push(`- 👁 visual_focus: ${p.visual_focus}`);
  if (p.cut_type) lines.push(`- 🎬 cut_type: ${p.cut_type}`);
  if (p.link_to_next) lines.push(`- → link_to_next: ${p.link_to_next}`);

  if (p.narration) lines.push(`- 📜 narration: 「${p.narration}」`);
  if (p.dialogue && p.dialogue.length > 0) {
    for (const d of p.dialogue) {
      const speaker =
        options.characterIdToName.get(d.speaker_id) ?? "?";
      const bt = d.bubble_type ? ` (${d.bubble_type})` : "";
      lines.push(`- 💬 ${speaker}${bt}: 「${d.text}」`);
    }
  }

  if (p.bubble_budget) {
    lines.push(
      `- 📏 bubble_budget: count=${p.bubble_budget.count}, max_chars=${p.bubble_budget.max_chars}${p.bubble_budget.type ? `, type=${p.bubble_budget.type}` : ""}`
    );
  }

  if (p.negative_space_hint)
    lines.push(`- ⬜ negative_space: ${p.negative_space_hint}`);

  if (
    p.turn_candidate &&
    p.turn_candidate !== "none"
  ) {
    lines.push(
      `- 🔃 turn: ${p.turn_candidate} / strength=${p.turn_strength ?? 0}`
    );
  }

  if (p.render_risk && p.render_risk !== "low") {
    lines.push(`- ⚠️ render_risk: ${p.render_risk}`);
  }

  if (p.multi_character_treatment && p.multi_character_treatment !== "normal") {
    lines.push(`- 👥 multi_char: ${p.multi_character_treatment}`);
  }

  lines.push("");
}

// ============================================================
// judge メトリクス計算
// ============================================================

type JudgeMetrics = {
  totalPages: number;
  totalPanels: number;
  highImportanceCount: number;
  expectedHighImportance: number;
  silenceCount: number;
  maxFaceCloseRun: number;
  dialogueCharsTotal: number;
  avgCharsPerPanel: number;
  episodeCliffhangerStrength: number;
  renderRiskHighCount: number;
};

function computeJudgeMetrics(
  shotlist: ShotlistData,
  _plot: EpisodePlotData
): JudgeMetrics {
  const panels = shotlist.panels;
  const totalPanels = panels.length;
  const totalPages = shotlist.pages?.length ?? 0;

  const highImportance = panels.filter((p) => (p.importance ?? 3) >= 4).length;
  const silence = panels.filter(
    (p) =>
      p.narrative_function === "silence" ||
      p.narrative_function === "pause" ||
      p.narrative_function === "emote"
  ).length;

  let maxRun = 0;
  let curRun = 0;
  for (const p of panels) {
    if (p.camera === "face_close") {
      curRun += 1;
      if (curRun > maxRun) maxRun = curRun;
    } else {
      curRun = 0;
    }
  }

  let chars = 0;
  for (const p of panels) {
    chars += (p.narration?.length ?? 0);
    for (const d of p.dialogue ?? []) {
      chars += d.text?.length ?? 0;
    }
  }

  const last = panels[panels.length - 1];
  const cliffStr = last?.turn_strength ?? 0;
  const riskHigh = panels.filter((p) => p.render_risk === "high").length;

  return {
    totalPages,
    totalPanels,
    highImportanceCount: highImportance,
    expectedHighImportance: Math.max(4, Math.floor(totalPanels / 12)),
    silenceCount: silence,
    maxFaceCloseRun: maxRun,
    dialogueCharsTotal: chars,
    avgCharsPerPanel: totalPanels > 0 ? chars / totalPanels : 0,
    episodeCliffhangerStrength: cliffStr,
    renderRiskHighCount: riskHigh,
  };
}

// ============================================================
// 必須イベント消化チェック
// ============================================================

function computeMustEventCoverage(
  panels: ShotlistPanelEntry[],
  events: string[]
): Array<[string, number]> {
  const result: Array<[string, number]> = [];
  for (const evt of events) {
    let panelIdx = 0;
    for (const p of panels) {
      const corpus = [
        p.purpose ?? "",
        p.narration ?? "",
        p.visual_focus ?? "",
        ...(p.dialogue?.map((d) => d.text) ?? []),
      ].join(" ");
      if (corpus.includes(evt)) {
        panelIdx = p.idx;
        break;
      }
    }
    result.push([evt, panelIdx]);
  }
  return result;
}

// ============================================================
// utils
// ============================================================

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
