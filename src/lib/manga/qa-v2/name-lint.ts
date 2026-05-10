/**
 * Name Lint (ネーム監査)
 *
 * Phase 1: static rules.
 * Phase 2: scene-level LLM judge via Codex CLI.
 */
import { runCodexText } from "../llm/codex-text";

export type NameLintSeverity = "fatal" | "warn" | "info";

export type NameLintFinding = {
  severity: NameLintSeverity;
  scope: "panel" | "page" | "scene" | "episode" | "global";
  page_no?: number;
  panel_no?: number;
  scene_id?: string;
  rule: string;
  message: string;
  hint?: string;
};

export type NameLintReport = {
  schema_version: 1;
  audited_at: string;
  slug: string;
  episode: number;
  pages_total: number;
  fatal_count: number;
  warn_count: number;
  info_count: number;
  findings: NameLintFinding[];
  summary: string;
};

type NameLintInput = {
  storyboard: unknown;
  pagePlan: unknown;
  sceneGraph: unknown;
  brief: unknown;
  bible: unknown;
};

type RuntimePage = {
  page_no: number;
  page_role?: string;
  panels: RuntimePanel[];
};

type RuntimePanel = {
  panel_no: number;
  reading_order: number;
  action: string;
  key_visual: string;
  shot_type?: string;
  camera?: string;
  importance?: number;
  dialogue: unknown[];
  monologue: unknown[];
  narration: unknown[];
};

const PLACEHOLDER_TEXT_RE = /^S\d+ \(.+\/.+\) panel \d+\/\d+:/;
const LLM_CONCURRENCY = 5;

const LLM_JUDGE_SCHEMA = `
type LlmJudgeOutput = {
  overall_assessment: "professional" | "passable" | "shallow" | "lazy";
  rationale: string;
  shallowness_findings: Array<{
    severity: "fatal" | "warn" | "info";
    scope: "panel" | "page" | "scene" | "episode";
    page_no?: number;
    panel_no?: number;
    scene_id?: string;
    rule:
      | "shot_choice_unmotivated"
      | "dialogue_unnatural"
      | "key_visual_generic"
      | "panel_logical_break"
      | "emotion_arc_flat"
      | "scene_pacing_off"
      | "cliffhanger_weak"
      | "opening_hook_weak"
      | string;
    message: string;
    hint?: string;
  }>;
};
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    const text = value.text ?? value.line ?? value.body;
    return typeof text === "string" ? text : "";
  }
  return "";
}

function pagePlanByPageNo(pagePlan: unknown): Map<number, Record<string, unknown>> {
  const map = new Map<number, Record<string, unknown>>();
  if (!isRecord(pagePlan)) return map;
  for (const page of asArray(pagePlan.pages)) {
    if (!isRecord(page)) continue;
    const pageNo = asNumber(page.page_no);
    if (pageNo !== undefined) map.set(pageNo, page);
  }
  return map;
}

function panelPlanById(pagePlanPage: Record<string, unknown> | undefined): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!pagePlanPage) return map;
  for (const panel of asArray(pagePlanPage.panels)) {
    if (!isRecord(panel)) continue;
    const panelId = asString(panel.panel_id);
    if (panelId) map.set(panelId, panel);
  }
  return map;
}

function normalizePages(storyboard: unknown, pagePlan: unknown): RuntimePage[] {
  if (!isRecord(storyboard)) return [];
  const planPages = pagePlanByPageNo(pagePlan);
  const pages: RuntimePage[] = [];

  for (const rawPage of asArray(storyboard.pages)) {
    if (!isRecord(rawPage)) continue;
    const pageNo = asNumber(rawPage.page_no);
    if (pageNo === undefined) continue;

    const planPage = planPages.get(pageNo);
    const planPanels = panelPlanById(planPage);
    const panels: RuntimePanel[] = [];

    for (const rawPanel of asArray(rawPage.panels)) {
      if (!isRecord(rawPanel)) continue;
      const panelId = asString(rawPanel.panel_id);
      const planPanel = panelId ? planPanels.get(panelId) : undefined;
      const panelNo = asNumber(rawPanel.panel_no) ?? asNumber(rawPanel.reading_order) ?? panels.length + 1;
      const readingOrder = asNumber(rawPanel.reading_order) ?? panelNo;
      panels.push({
        panel_no: panelNo,
        reading_order: readingOrder,
        action: asString(rawPanel.action),
        key_visual: asString(rawPanel.key_visual),
        shot_type: asString(rawPanel.shot_type) || undefined,
        camera: asString(rawPanel.camera) || undefined,
        importance: asNumber(rawPanel.importance) ?? asNumber(planPanel?.importance),
        dialogue: asArray(rawPanel.dialogue),
        monologue: asArray(rawPanel.monologue),
        narration: asArray(rawPanel.narration),
      });
    }

    panels.sort((a, b) => a.reading_order - b.reading_order);
    pages.push({
      page_no: pageNo,
      page_role: asString(rawPage.page_role) || asString(planPage?.page_role) || undefined,
      panels,
    });
  }

  pages.sort((a, b) => a.page_no - b.page_no);
  return pages;
}

function charTrigrams(text: string): Set<string> {
  const normalized = text.replace(/\s+/g, "").trim();
  if (normalized.length < 6) return new Set();

  const out = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    out.add(normalized.slice(i, i + 3));
  }
  return out;
}

function jaccard3Gram(a: string, b: string): number {
  const aa = charTrigrams(a);
  const bb = charTrigrams(b);
  if (aa.size === 0 || bb.size === 0) return 0;

  let intersection = 0;
  aa.forEach((token) => {
    if (bb.has(token)) intersection++;
  });
  const union = aa.size + bb.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function dialogueOnlyTextLength(panel: RuntimePanel): number {
  return panel.dialogue.map(extractText).join("").length;
}

function lineCount(panel: RuntimePanel): number {
  return panel.dialogue.length + panel.monologue.length + panel.narration.length;
}

function pageLabel(pageNo: number): string {
  return `p${String(pageNo).padStart(2, "0")}`;
}

function monologueCharacterId(value: unknown): string {
  if (!isRecord(value)) return "";
  return asString(value.character_id) || asString(value.speaker) || asString(value.character);
}

function primaryMonologueCharacterId(panel: RuntimePanel): string {
  for (const line of panel.monologue) {
    const id = monologueCharacterId(line);
    if (id) return id;
  }
  return "";
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function extractBibleMeta(bible: unknown): Record<string, unknown> {
  if (!isRecord(bible) || !isRecord(bible.meta)) return {};
  const meta = bible.meta;
  return {
    genre: meta.genre,
    subtype: meta.subtype,
    core_hook: meta.core_hook,
  };
}

function extractScenes(sceneGraph: unknown): Record<string, unknown>[] {
  if (!isRecord(sceneGraph)) return [];
  return asArray(sceneGraph.scenes).filter(isRecord);
}

function sceneId(scene: Record<string, unknown>, index: number): string {
  return asString(scene.scene_id) || `scene_${index + 1}`;
}

function scenePageRange(scene: Record<string, unknown>): { start?: number; end?: number } {
  const pageRange = isRecord(scene.page_range) ? scene.page_range : {};
  return {
    start: asNumber(pageRange.start),
    end: asNumber(pageRange.end),
  };
}

function scenePanelRange(scene: Record<string, unknown>): { start?: number; end?: number } {
  const panelRange = isRecord(scene.panel_range) ? scene.panel_range : {};
  return {
    start: asNumber(panelRange.start_panel_no),
    end: asNumber(panelRange.end_panel_no),
  };
}

function panelsForScene(storyboard: unknown, scene: Record<string, unknown>): Array<RuntimePanel & { page_no: number }> {
  const pages = normalizePages(storyboard, {});
  const pageRange = scenePageRange(scene);
  const panelRange = scenePanelRange(scene);
  const out: Array<RuntimePanel & { page_no: number }> = [];

  for (const page of pages) {
    if (pageRange.start !== undefined && page.page_no < pageRange.start) continue;
    if (pageRange.end !== undefined && page.page_no > pageRange.end) continue;

    for (const panel of page.panels) {
      if (panelRange.start !== undefined && panel.panel_no < panelRange.start) continue;
      if (panelRange.end !== undefined && panel.panel_no > panelRange.end) continue;
      out.push({ ...panel, page_no: page.page_no });
    }
  }

  return out;
}

function compactDialogue(lines: unknown[]): string[] {
  return lines.map(extractText).filter((text) => text.length > 0);
}

function formatScenePrompt(args: {
  scene: Record<string, unknown>;
  sceneIndex: number;
  storyboard: unknown;
  bible: unknown;
}): string {
  const id = sceneId(args.scene, args.sceneIndex);
  const meta = extractBibleMeta(args.bible);
  const pageRange = scenePageRange(args.scene);
  const panelRange = scenePanelRange(args.scene);
  const panels = panelsForScene(args.storyboard, args.scene);
  const arcPosition = isRecord(args.scene.arc_position) ? args.scene.arc_position : {};
  const dialoguePlan = isRecord(args.scene.dialogue_plan) ? args.scene.dialogue_plan : {};

  const panelLines = panels.map((panel) => {
    const dialogue = compactDialogue(panel.dialogue);
    const monologue = compactDialogue(panel.monologue);
    const narration = compactDialogue(panel.narration);
    return [
      `[panel #${panel.panel_no}] page=${panel.page_no} shot=${panel.shot_type ?? "unknown"}/${panel.camera ?? "unknown"} importance=${panel.importance ?? "unknown"}`,
      `  action: ${truncate(panel.action, 240)}`,
      `  key_visual: ${truncate(panel.key_visual, 240)}`,
      `  dialogue: ${JSON.stringify(dialogue)}`,
      `  monologue: ${JSON.stringify(monologue)}`,
      `  narration: ${JSON.stringify(narration)}`,
    ].join("\n");
  });

  return [
    "あなたは商業漫画 (Young Ace / Comic Walker 系 ライトノベル原作) の編集者です。",
    "以下の scene を商業漫画品質基準で audit してください。お世辞は不要です。",
    "",
    "## 作品メタ",
    `- subtype: ${String(meta.subtype ?? "")}`,
    `- core_hook: ${JSON.stringify(meta.core_hook ?? null)}`,
    `- genre: ${String(meta.genre ?? "")}`,
    "",
    "## scene 概要",
    `- scene_id: ${id}`,
    `- beat_type: ${String(args.scene.beat_type ?? "")}`,
    `- mode: ${String(args.scene.mode ?? "")}`,
    `- arc_position: ${String(arcPosition.arc_phase ?? "")} ${String(arcPosition.arc_position_normalized ?? "")}`,
    `- cast: ${JSON.stringify(args.scene.cast ?? [])}`,
    `- page_range: ${pageRange.start ?? "?"}-${pageRange.end ?? "?"} (panel_range ${panelRange.start ?? "?"}-${panelRange.end ?? "?"})`,
    `- dialogue_plan.key_lines: ${JSON.stringify(dialoguePlan.key_lines ?? [])}`,
    `- key_visual_intent: ${String(args.scene.key_visual_intent ?? "")}`,
    "",
    `## panels (total ${panels.length})`,
    panelLines.join("\n\n"),
    "",
    "## 評価観点",
    "overall_assessment は次の基準で professional / passable / shallow / lazy のいずれかを選んでください。",
    "- professional: 商業漫画として十分通用。場面切替・視線誘導・感情曲線・台詞の自然さがプロ水準",
    "- passable: 大筋は読める。細部の cliché や説明過多が散見",
    "- shallow: 場面構成や台詞が浅い、cliché 多用、emotion arc 不明瞭",
    "- lazy: panel 内容が機械的、説明書き化、商業漫画として読めない",
    "",
    "shallowness_findings は商業漫画として浅い箇所を最大 10 件に絞ってください。",
    "rule は shot_choice_unmotivated / dialogue_unnatural / key_visual_generic / panel_logical_break / emotion_arc_flat / scene_pacing_off / cliffhanger_weak / opening_hook_weak から選ぶか、必要なら string を追加してください。",
    "message は具体的に、hint は修正方針を短く書いてください。",
    "",
    "## 出力スキーマ",
    "```typescript",
    LLM_JUDGE_SCHEMA,
    "```",
    "",
    "## 出力形式",
    "JSON のみを返してください。前置き・後書き・Markdown は不要です。",
    "上記 schema は構造確認用です。そのままコピーせず、この scene の実際の判定内容で各フィールドを埋めてください。",
  ].join("\n");
}

function toSeverity(value: unknown): NameLintSeverity {
  return value === "fatal" || value === "warn" || value === "info" ? value : "info";
}

function toFindingScope(value: unknown): NameLintFinding["scope"] {
  return value === "panel" || value === "page" || value === "scene" || value === "episode" || value === "global" ? value : "scene";
}

type LlmJudgeOutput = {
  overall_assessment?: unknown;
  rationale?: unknown;
  shallowness_findings?: unknown;
};

function normalizeLlmFindings(parsed: LlmJudgeOutput, fallbackSceneId: string, fallbackPageNo?: number): NameLintFinding[] {
  const assessment = asString(parsed.overall_assessment) || "unknown";
  const rationale = asString(parsed.rationale);
  const findings: NameLintFinding[] = [
    {
      severity: "info",
      scope: "episode",
      scene_id: fallbackSceneId,
      rule: "overall_assessment",
      message: `LLM scene assessment: ${assessment}${rationale ? ` - ${rationale}` : ""}`,
    },
  ];

  for (const rawFinding of asArray(parsed.shallowness_findings).slice(0, 10)) {
    if (!isRecord(rawFinding)) continue;
    const scope = toFindingScope(rawFinding.scope);
    const explicitPageNo = asNumber(rawFinding.page_no);
    findings.push({
      severity: toSeverity(rawFinding.severity),
      scope,
      page_no: explicitPageNo ?? (scope === "scene" ? fallbackPageNo : undefined),
      panel_no: asNumber(rawFinding.panel_no),
      scene_id: asString(rawFinding.scene_id) || fallbackSceneId,
      rule: asString(rawFinding.rule) || "llm_shallowness",
      message: asString(rawFinding.message) || "LLM judge が浅さを検出しました。",
      hint: asString(rawFinding.hint) || undefined,
    });
  }

  return findings;
}

export async function llmLintName(args: {
  storyboard: unknown;
  sceneGraph: unknown;
  bible: unknown;
  cwd?: string;
  timeoutMs?: number;
}): Promise<NameLintFinding[]> {
  const scenes = extractScenes(args.sceneGraph);
  const findings: NameLintFinding[] = [];

  for (let start = 0; start < scenes.length; start += LLM_CONCURRENCY) {
    const chunk = scenes.slice(start, start + LLM_CONCURRENCY);
    const chunkFindings = await Promise.allSettled(
      chunk.map(async (scene, offset) => {
        const sceneIndex = start + offset;
        const id = sceneId(scene, sceneIndex);
        const pageRange = scenePageRange(scene);
        console.log(`[L08.7] llm judge: scene ${sceneIndex + 1}/${scenes.length} ${id}`);
        const result = await runCodexText<LlmJudgeOutput>({
          task: formatScenePrompt({
            scene,
            sceneIndex,
            storyboard: args.storyboard,
            bible: args.bible,
          }),
          format: "json",
          cwd: args.cwd,
          timeoutMs: args.timeoutMs ?? 120 * 1000,
          maxRetries: 1,
        });
        if (!result.parsed) return [] satisfies NameLintFinding[];
        return normalizeLlmFindings(result.parsed, id, pageRange.start);
      }),
    );
    chunkFindings.forEach((result, offset) => {
      const scene = chunk[offset];
      const sceneIndex = start + offset;
      const id = scene ? sceneId(scene, sceneIndex) : `scene_${sceneIndex + 1}`;
      if (result.status === "fulfilled") {
        findings.push(...result.value);
        return;
      }
      findings.push({
        severity: "info",
        scope: "episode",
        scene_id: id,
        rule: "llm_judge_failed",
        message: `LLM judge 失敗 (この scene は static lint のみ採用): ${
          result.reason instanceof Error ? result.reason.message : String(result.reason)
        }`,
      });
    });
  }

  return findings;
}

function staticLintPages(pages: RuntimePage[]): NameLintFinding[] {
  const findings: NameLintFinding[] = [];

  for (const page of pages) {
    const panels = page.panels;
    const panelCount = panels.length;
    let monologueRunCharacter = "";
    let monologueRunCount = 0;
    let monologueRunEndPanelNo: number | undefined;

    const flushMonologueRun = () => {
      if (monologueRunCharacter && monologueRunCount >= 3 && monologueRunEndPanelNo !== undefined) {
        findings.push({
          severity: "info",
          scope: "panel",
          page_no: page.page_no,
          panel_no: monologueRunEndPanelNo,
          rule: "monologue_repetition",
          message: `${pageLabel(page.page_no)} で ${monologueRunCharacter} の monologue が ${monologueRunCount} 連続`,
          hint: "同じキャラの内省が連続するとリズムが単調になります。dialogue や別キャラ monologue で挟んでください",
        });
      }
      monologueRunCharacter = "";
      monologueRunCount = 0;
      monologueRunEndPanelNo = undefined;
    };

    for (let i = 0; i < panels.length; i++) {
      const a = panels[i];
      const monologueCharacter = primaryMonologueCharacterId(a);
      if (!monologueCharacter) {
        flushMonologueRun();
      } else if (monologueCharacter === monologueRunCharacter) {
        monologueRunCount++;
        monologueRunEndPanelNo = a.panel_no;
      } else {
        flushMonologueRun();
        monologueRunCharacter = monologueCharacter;
        monologueRunCount = 1;
        monologueRunEndPanelNo = a.panel_no;
      }

      if (PLACEHOLDER_TEXT_RE.test(a.action) || PLACEHOLDER_TEXT_RE.test(a.key_visual)) {
        findings.push({
          severity: "fatal",
          scope: "panel",
          page_no: page.page_no,
          panel_no: a.panel_no,
          rule: "placeholder_text",
          message: `${pageLabel(page.page_no)} panel #${a.panel_no} に Codex enrich 失敗の placeholder が残っています。`,
          hint: "storyboard enrich を再実行し、action/key_visual を具体的な描写に置換してください。",
        });
      }

      if (a.shot_type === "establishing" && i === panels.length - 1) {
        findings.push({
          severity: "info",
          scope: "panel",
          page_no: page.page_no,
          panel_no: a.panel_no,
          rule: "establishing_misplaced",
          message: `${pageLabel(page.page_no)} panel #${a.panel_no} の establishing がページ末尾にあります。`,
          hint: "状況説明カットはページ冒頭か転換点に置くと読みやすくなります。",
        });
      }

      // Character count intentionally covers dialogue.text only; monologue/narration are covered by lineCount.
      if (dialogueOnlyTextLength(a) > 60 || lineCount(a) > 4) {
        findings.push({
          severity: "warn",
          scope: "panel",
          page_no: page.page_no,
          panel_no: a.panel_no,
          rule: "dialogue_overflow",
          message: `${pageLabel(page.page_no)} panel #${a.panel_no} の台詞量が多すぎます。`,
          hint: "1コマ内の台詞を分割するか、次の panel に逃がしてください。",
        });
      }

      for (let j = i + 1; j < panels.length; j++) {
        const b = panels[j];
        const actionScore = jaccard3Gram(a.action, b.action);
        const keyVisualScore = jaccard3Gram(a.key_visual, b.key_visual);
        const score = Math.max(actionScore, keyVisualScore);
        if (score > 0.7) {
          findings.push({
            severity: "warn",
            scope: "panel",
            page_no: page.page_no,
            panel_no: b.panel_no,
            rule: "panel_content_duplicate",
            message: `${pageLabel(page.page_no)} panel #${a.panel_no} と #${b.panel_no} で内容が重複しています。`,
            hint: `action/key_visual の 3-gram Jaccard 類似度が ${score.toFixed(2)} です。`,
          });
        }
      }
    }
    flushMonologueRun();

    if (panelCount >= 3) {
      const distinctShotTypes = new Set(panels.map((p) => p.shot_type).filter(Boolean)).size;
      if (distinctShotTypes / panelCount < 0.5) {
        findings.push({
          severity: "warn",
          scope: "page",
          page_no: page.page_no,
          rule: "shot_type_diversity_low",
          message: `${pageLabel(page.page_no)} の shot_type バリエーションが不足しています (${distinctShotTypes}/${panelCount})。`,
          hint: "wide / medium / close_up / insert などを意図に応じて混ぜてください。",
        });
      }

      const distinctCameras = new Set(panels.map((p) => p.camera).filter(Boolean)).size;
      if (distinctCameras < 2) {
        findings.push({
          severity: "info",
          scope: "page",
          page_no: page.page_no,
          rule: "camera_angle_static",
          message: `${pageLabel(page.page_no)} の camera angle が単調です (${distinctCameras} 種)。`,
          hint: "eye_level 連続の場合は high_angle / low_angle / over_shoulder などを検討してください。",
        });
      }
    }

    if (panelCount >= 4) {
      const importances = panels.map((p) => p.importance ?? 0);
      const maxImportance = Math.max(...importances);
      if (maxImportance < 4) {
        findings.push({
          severity: "warn",
          scope: "page",
          page_no: page.page_no,
          rule: "importance_flat",
          message: `${pageLabel(page.page_no)} に hero panel がありません (max importance=${maxImportance})。`,
          hint: "ページ内で最も見せたいコマを importance 4 以上にしてください。",
        });
      }
    }

    const highImportanceCount = panels.filter((p) => (p.importance ?? 0) >= 4).length;
    if (highImportanceCount >= 3) {
      findings.push({
        severity: "info",
        scope: "page",
        page_no: page.page_no,
        rule: "importance_overload",
        message: `${pageLabel(page.page_no)} に importance 4 以上の panel が ${highImportanceCount} 個あります。`,
        hint: "強調コマが多すぎるとページ内の焦点が散ります。",
      });
    }

    if (page.page_role === "cliffhanger" && panelCount > 3) {
      findings.push({
        severity: "warn",
        scope: "page",
        page_no: page.page_no,
        rule: "cliff_panel_too_many",
        message: `${pageLabel(page.page_no)} は cliffhanger ですが panel が ${panelCount} 個あります。`,
        hint: "引きのページは 1-3 コマに圧縮し、最後の情報を強く見せてください。",
      });
    }

    if (page.page_role === "action" && panelCount < 4) {
      findings.push({
        severity: "warn",
        scope: "page",
        page_no: page.page_no,
        rule: "action_panel_too_few",
        message: `${pageLabel(page.page_no)} は action ですが panel が ${panelCount} 個だけです。`,
        hint: "動作の起点、接触、反応、結果を分けるとリズムが出ます。",
      });
    }
  }

  return findings;
}

export function staticLintName(input: NameLintInput): NameLintFinding[] {
  void input.sceneGraph;
  void input.brief;
  void input.bible;

  return staticLintPages(normalizePages(input.storyboard, input.pagePlan));
}

export async function lintName(args: NameLintInput & {
  slug: string;
  episode: number;
  skipLlm?: boolean;
  cwd?: string;
}): Promise<NameLintReport> {
  void args.cwd;

  const findings: NameLintFinding[] = [];
  const pages = normalizePages(args.storyboard, args.pagePlan);
  findings.push(...staticLintPages(pages));

  if (!args.skipLlm) {
    try {
      const llm = await llmLintName({
        storyboard: args.storyboard,
        sceneGraph: args.sceneGraph,
        bible: args.bible,
        cwd: args.cwd,
      });
      findings.push(...llm);
    } catch (e) {
      findings.push({
        severity: "info",
        scope: "episode",
        rule: "llm_judge_failed",
        message: `LLM judge 失敗 (static lint のみ採用): ${(e as Error).message}`,
      });
    }
  }

  const fatal = findings.filter((x) => x.severity === "fatal").length;
  const warn = findings.filter((x) => x.severity === "warn").length;
  const info = findings.filter((x) => x.severity === "info").length;

  return {
    schema_version: 1,
    audited_at: new Date().toISOString(),
    slug: args.slug,
    episode: args.episode,
    pages_total: pages.length,
    fatal_count: fatal,
    warn_count: warn,
    info_count: info,
    findings,
    summary: `fatal=${fatal} warn=${warn} info=${info}`,
  };
}
