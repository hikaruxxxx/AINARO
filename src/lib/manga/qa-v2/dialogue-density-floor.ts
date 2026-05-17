/**
 * Dialogue Density Floor Audit
 *
 * 2026-05-18 Sprint 18 で新設。
 *
 * a07 ep01 の集計で 24 page 平均 text 量が 2.2 行 (商業漫画標準 5-12 行の 1/3-1/5)、
 * かつ dialogue page (p3/p6/p7/p12/p22) で dialogue 0-1 行という「会話していない
 * 会話シーン」状態が判明したことを受け、page_role 別の **下限保証** を audit する
 * 仕組みを追加。既存 narration-budget は上限のみだったため、下限は本モジュールで担う。
 *
 * 設計方針:
 * - page_role ごとに minimums を明示 (dialogue/monologue/narration/sfx の per-page 行数)
 * - 不足 = warning (fatal にはしない、ナラティブ意図で例外があり得るため)
 * - findings には specific recommendation を出す (storyboard 設計者向け)
 *
 * 商業漫画ベンチマーク (参考):
 * - dialogue page: 8-15 行 / page
 * - opening_hook: narration 2-4 + dialogue/mono 1-3
 * - action: SFX 3-5 + dialogue 1-3 (短い掛け声)
 * - reveal/cliffhanger: dialogue+mono 3-6 で認識転換の言語化
 *
 * 本実装の floor は上記の **下限** (商業最低水準) を設定。
 */

import type { EpisodeStoryboardV2, PageRoleV2, StoryboardPageV2 } from "../schemas-v2";

export type DialogueDensityRule = {
  /** dialogue 行数の page 単位最小 */
  dialogue_min?: number;
  /** monologue 行数の page 単位最小 */
  monologue_min?: number;
  /** narration 行数の page 単位最小 */
  narration_min?: number;
  /** SFX 件数の page 単位最小 */
  sfx_min?: number;
  /** dialogue + monologue 合算の page 単位最小 (会話 OR 内省で代替可なケース) */
  dialogue_or_monologue_min?: number;
  /** dialogue + monologue + narration 合算の page 単位最小 (text 総量) */
  text_total_min?: number;
};

/**
 * page_role 別の dialogue density 下限。商業漫画最低水準を参照。
 *
 * 「action」は SFX で持つので text は緩め、それ以外は会話/内省/ナレーションで
 * 物語を進めることを期待。
 */
export const DEFAULT_DIALOGUE_DENSITY_FLOORS: Record<PageRoleV2, DialogueDensityRule> = {
  opening_hook: { narration_min: 2, text_total_min: 3 },
  establishing: { text_total_min: 2 },
  dialogue: { dialogue_min: 3, text_total_min: 5 },
  buildup: { dialogue_or_monologue_min: 1, text_total_min: 3 },
  reveal: { dialogue_or_monologue_min: 2, text_total_min: 3 },
  action: { sfx_min: 3, text_total_min: 1 },
  aftermath: { dialogue_or_monologue_min: 2, text_total_min: 3 },
  cliffhanger: { text_total_min: 2 },
};

export type DensityFinding = {
  severity: "warning";
  page_no: number;
  page_role: PageRoleV2;
  kind:
    | "dialogue_floor_below"
    | "monologue_floor_below"
    | "narration_floor_below"
    | "sfx_floor_below"
    | "dialogue_or_monologue_floor_below"
    | "text_total_floor_below";
  found: number;
  expected_min: number;
  message: string;
};

type PageCounts = {
  dialogue: number;
  monologue: number;
  narration: number;
  sfx: number;
};

function countsForPage(page: StoryboardPageV2): PageCounts {
  let dialogue = 0;
  let monologue = 0;
  let narration = 0;
  let sfx = 0;
  for (const panel of page.panels) {
    dialogue += panel.dialogue?.length ?? 0;
    monologue += panel.monologue?.length ?? 0;
    narration += panel.narration?.length ?? 0;
    sfx += panel.sfx?.length ?? 0;
  }
  return { dialogue, monologue, narration, sfx };
}

export function auditPageDensity(
  page: StoryboardPageV2,
  floors: Record<PageRoleV2, DialogueDensityRule> = DEFAULT_DIALOGUE_DENSITY_FLOORS,
): DensityFinding[] {
  const role = page.page_role as PageRoleV2;
  const rule = floors[role];
  if (!rule) return [];

  const c = countsForPage(page);
  const findings: DensityFinding[] = [];

  const push = (
    kind: DensityFinding["kind"],
    found: number,
    min: number,
    msg: string,
  ) => {
    findings.push({
      severity: "warning",
      page_no: page.page_no,
      page_role: role,
      kind,
      found,
      expected_min: min,
      message: msg,
    });
  };

  if (rule.dialogue_min !== undefined && c.dialogue < rule.dialogue_min) {
    push(
      "dialogue_floor_below",
      c.dialogue,
      rule.dialogue_min,
      `page_role=${role} は dialogue ${rule.dialogue_min} 行以上推奨だが、現状 ${c.dialogue} 行。会話シーンとして物語進行が成立しない可能性あり。`,
    );
  }
  if (rule.monologue_min !== undefined && c.monologue < rule.monologue_min) {
    push(
      "monologue_floor_below",
      c.monologue,
      rule.monologue_min,
      `page_role=${role} は monologue ${rule.monologue_min} 行以上推奨だが、現状 ${c.monologue} 行。`,
    );
  }
  if (rule.narration_min !== undefined && c.narration < rule.narration_min) {
    push(
      "narration_floor_below",
      c.narration,
      rule.narration_min,
      `page_role=${role} は narration ${rule.narration_min} 行以上推奨だが、現状 ${c.narration} 行。世界観セットアップ不足。`,
    );
  }
  if (rule.sfx_min !== undefined && c.sfx < rule.sfx_min) {
    push(
      "sfx_floor_below",
      c.sfx,
      rule.sfx_min,
      `page_role=${role} は SFX ${rule.sfx_min} 件以上推奨だが、現状 ${c.sfx} 件。`,
    );
  }
  if (rule.dialogue_or_monologue_min !== undefined) {
    const combined = c.dialogue + c.monologue;
    if (combined < rule.dialogue_or_monologue_min) {
      push(
        "dialogue_or_monologue_floor_below",
        combined,
        rule.dialogue_or_monologue_min,
        `page_role=${role} は dialogue + monologue 合算 ${rule.dialogue_or_monologue_min} 行以上推奨だが、現状 ${combined} 行。`,
      );
    }
  }
  if (rule.text_total_min !== undefined) {
    const total = c.dialogue + c.monologue + c.narration;
    if (total < rule.text_total_min) {
      push(
        "text_total_floor_below",
        total,
        rule.text_total_min,
        `page_role=${role} は dialogue + monologue + narration 合算 ${rule.text_total_min} 行以上推奨だが、現状 ${total} 行。`,
      );
    }
  }

  return findings;
}

/**
 * L04 storyboard 生成 prompt 向けの directive 文字列を生成する。
 *
 * 2026-05-18 Sprint 20 案1 で新設。Sprint 18 で導入した audit 下限を
 * 生成段階の prompt にも反映し、render 前段で問題発生を予防する。
 *
 * 既存の audit-dialogue-density は **検出網**、本 directive は **予防網**。
 * 両者で同じ floor 値を共有することで生成 → 検証の整合性を担保。
 */
export function buildDialogueDensityFloorDirective(
  floors: Record<PageRoleV2, DialogueDensityRule> = DEFAULT_DIALOGUE_DENSITY_FLOORS,
): string {
  const lines: string[] = [];
  lines.push("## Page Role Density Floor (page_role 別 dialogue/text 下限)");
  lines.push("");
  lines.push("各 page の page_role に応じて以下の下限を **必ず満たす** よう dialogue/monologue/narration/sfx を配分してください。商業漫画 (page あたり text 5-12 行) より少なくならないこと、特に **dialogue page で dialogue=0 のような「会話していない会話シーン」は絶対禁止** です。");
  lines.push("");
  const roleLabels: Record<PageRoleV2, string> = {
    opening_hook: "opening_hook (冒頭・世界観セットアップ)",
    establishing: "establishing (情景・場所転換)",
    dialogue: "dialogue (会話で物語進行)",
    buildup: "buildup (緊張感の積み上げ)",
    reveal: "reveal (認識転換)",
    action: "action (戦闘・追跡・擬音中心)",
    aftermath: "aftermath (余韻・回収)",
    cliffhanger: "cliffhanger (引き)",
  };
  for (const role of Object.keys(roleLabels) as PageRoleV2[]) {
    const rule = floors[role];
    if (!rule) continue;
    const parts: string[] = [];
    if (rule.dialogue_min !== undefined) parts.push(`dialogue ≥ ${rule.dialogue_min}`);
    if (rule.monologue_min !== undefined) parts.push(`monologue ≥ ${rule.monologue_min}`);
    if (rule.narration_min !== undefined) parts.push(`narration ≥ ${rule.narration_min}`);
    if (rule.sfx_min !== undefined) parts.push(`SFX ≥ ${rule.sfx_min}`);
    if (rule.dialogue_or_monologue_min !== undefined)
      parts.push(`dialogue+monologue ≥ ${rule.dialogue_or_monologue_min}`);
    if (rule.text_total_min !== undefined)
      parts.push(`text 合計 (dialogue+monologue+narration) ≥ ${rule.text_total_min}`);
    lines.push(`- **${roleLabels[role]}**: ${parts.join(", ")}`);
  }
  lines.push("");
  lines.push("**不足する場合の補強パターン (商業漫画で標準的)**:");
  lines.push("- off-frame voice (画面外の声): TV / ラジオ / 隣室 / 通行人 / 同僚など");
  lines.push("- システム音声 / アナウンス: 公社 / ナビ / ゲート / ID 端末など");
  lines.push("- 状況描写 narration: 時刻 / 気温 / 場所 / 通知音の地の文");
  lines.push("- リアクション dialogue: 短い応答 (「了解」「待って」「……は?」など)");
  lines.push("");
  lines.push("この directive は qa-v2/dialogue-density-floor の audit 基準と同期しており、生成後の audit-dialogue-density が検出する findings をゼロにできる水準で出力してください。");
  return lines.join("\n");
}

export function auditStoryboardDensity(
  storyboard: EpisodeStoryboardV2,
  floors: Record<PageRoleV2, DialogueDensityRule> = DEFAULT_DIALOGUE_DENSITY_FLOORS,
): {
  totalPages: number;
  findings: DensityFinding[];
  pageCounts: Array<{
    page_no: number;
    page_role: PageRoleV2;
    counts: PageCounts;
    total_text: number;
  }>;
} {
  const findings: DensityFinding[] = [];
  const pageCounts: Array<{
    page_no: number;
    page_role: PageRoleV2;
    counts: PageCounts;
    total_text: number;
  }> = [];

  for (const page of storyboard.pages) {
    findings.push(...auditPageDensity(page, floors));
    const c = countsForPage(page);
    pageCounts.push({
      page_no: page.page_no,
      page_role: page.page_role as PageRoleV2,
      counts: c,
      total_text: c.dialogue + c.monologue + c.narration,
    });
  }

  return {
    totalPages: storyboard.pages.length,
    findings,
    pageCounts,
  };
}
