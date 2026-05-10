/**
 * Name Lint (ネーム監査)
 *
 * Phase 1: static rules only.
 * Phase 2 will add LLM judge integration in the same shape as bible-lint.
 */

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
  if (normalized.length === 0) return new Set();
  if (normalized.length <= 3) return new Set([normalized]);

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

function dialogueTextLength(panel: RuntimePanel): number {
  return panel.dialogue.map(extractText).join("").length;
}

function lineCount(panel: RuntimePanel): number {
  return panel.dialogue.length + panel.monologue.length + panel.narration.length;
}

function pageLabel(pageNo: number): string {
  return `p${String(pageNo).padStart(2, "0")}`;
}

export function staticLintName(input: NameLintInput): NameLintFinding[] {
  void input.sceneGraph;
  void input.brief;
  void input.bible;

  const findings: NameLintFinding[] = [];
  const pages = normalizePages(input.storyboard, input.pagePlan);

  for (const page of pages) {
    const panels = page.panels;
    const panelCount = panels.length;

    for (let i = 0; i < panels.length; i++) {
      const a = panels[i];

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

      if (dialogueTextLength(a) > 60 || lineCount(a) > 4) {
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

export async function lintName(args: NameLintInput & {
  slug: string;
  episode: number;
  skipLlm?: boolean;
  cwd?: string;
}): Promise<NameLintReport> {
  void args.cwd;

  const findings: NameLintFinding[] = [];
  findings.push(...staticLintName(args));

  if (!args.skipLlm) {
    // TODO(Phase 2): add Codex CLI LLM judge integration, mirroring bible-lint.ts.
  }

  const fatal = findings.filter((x) => x.severity === "fatal").length;
  const warn = findings.filter((x) => x.severity === "warn").length;
  const info = findings.filter((x) => x.severity === "info").length;
  const pagesTotal = normalizePages(args.storyboard, args.pagePlan).length;

  return {
    schema_version: 1,
    audited_at: new Date().toISOString(),
    slug: args.slug,
    episode: args.episode,
    pages_total: pagesTotal,
    fatal_count: fatal,
    warn_count: warn,
    info_count: info,
    findings,
    summary: `fatal=${fatal} warn=${warn} info=${info}`,
  };
}
