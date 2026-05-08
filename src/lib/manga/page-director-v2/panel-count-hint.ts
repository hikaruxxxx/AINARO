import type { PageRoleV2 } from "../schemas-v2";

export type PanelCountHint = { min: number; max: number; preferred: number };
export type GenerationProfile = "balanced" | "cinematic" | "clarity-first";

const PAGE_ROLES: PageRoleV2[] = [
  "opening_hook",
  "cliffhanger",
  "reveal",
  "action",
  "buildup",
  "aftermath",
  "establishing",
  "dialogue",
];

const BALANCED_HINTS: Record<PageRoleV2, PanelCountHint> = {
  opening_hook: { min: 1, max: 3, preferred: 2 },
  cliffhanger: { min: 1, max: 3, preferred: 2 },
  reveal: { min: 2, max: 4, preferred: 3 },
  action: { min: 4, max: 5, preferred: 4 },
  buildup: { min: 4, max: 6, preferred: 5 },
  aftermath: { min: 4, max: 6, preferred: 5 },
  establishing: { min: 1, max: 3, preferred: 2 },
  dialogue: { min: 5, max: 7, preferred: 6 },
};

/**
 * page_role x profile から panel_count の hint を返す。
 * profile デフォルトは balanced。
 */
export function panelCountHintByRole(
  role: PageRoleV2,
  profile: GenerationProfile = "balanced",
): PanelCountHint {
  const hint = { ...BALANCED_HINTS[role] };

  if (profile === "cinematic") {
    if (role === "opening_hook" || role === "cliffhanger" || role === "reveal") {
      hint.min -= 1;
    }
  } else if (profile === "clarity-first") {
    if (role === "action") {
      hint.max = Math.max(hint.min, hint.max - 1);
      hint.preferred = Math.min(hint.preferred, hint.max);
    } else if (role === "buildup") {
      hint.min += 1;
      hint.preferred = Math.max(hint.preferred, hint.min);
    }
  }

  return hint;
}

/**
 * prompt 用 markdown table 文字列を返す。
 * LLM への指示文に貼り付ける用途。
 */
export function buildPanelCountHintTable(profile: GenerationProfile): string {
  const lines = [
    `## Panel Count Hints (${profile})`,
    "",
    "| page_role | min | max | preferred |",
    "|---|---:|---:|---:|",
  ];
  for (const role of PAGE_ROLES) {
    const hint = panelCountHintByRole(role, profile);
    lines.push(`| ${role} | ${hint.min} | ${hint.max} | ${hint.preferred} |`);
  }
  return lines.join("\n");
}

/**
 * 生成された storyboard page の panel_count が hint に収まるか判定。
 * 逸脱なら warning 文字列を返す（hard fail しない）。
 */
export function validatePanelCount(
  page: { page_role: PageRoleV2; panels: unknown[] },
  profile: GenerationProfile = "balanced",
): { ok: boolean; warning?: string } {
  const hint = panelCountHintByRole(page.page_role, profile);
  const count = page.panels.length;
  if (count >= hint.min && count <= hint.max) return { ok: true };
  return {
    ok: false,
    warning: `panel_count warning: page_role=${page.page_role} count=${count} outside ${hint.min}-${hint.max} (preferred=${hint.preferred}, profile=${profile})`,
  };
}
