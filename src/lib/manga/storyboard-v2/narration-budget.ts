/**
 * narration-budget (Phase Y WY-2)
 *
 * 設計根拠:
 *   - Plan: /Users/hikarumori/.claude/plans/groovy-wishing-castle.md WY-2
 *   - Codex 修正: 「独立 layer でなく schema 拡張 + budget validator」
 *   - manga_craft_guide v2 ナレーション禁則: 商業ラノベは「会話で世界観説明」、神視点ナレ過多は退屈
 *
 * 役割:
 *   - data/generation/narration-budgets.json をロード
 *   - tone_profile × genre × page_role から panel/page/episode 各スコープの narration 上限を解決
 *   - L8.6 audit-rules.ts から narration_budget_exceeded 検査関数を呼ぶ
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  EpisodeStoryboardV2,
  NarrationKind,
  PanelV2,
  StoryboardPageV2,
  ToneProfile,
} from "../schemas-v2";

export type NarrationBudgetTone = {
  per_panel_chars_max: number;
  per_page_count_max: number;
  per_episode_omniscient_max: number;
  per_episode_protagonist_monologue_max?: number;
  kind_ratio_recommendation?: Record<NarrationKind, number>;
};

export type NarrationBudgetPageRole = {
  per_page_count_max?: number;
};

export type NarrationBudgetGenre = {
  per_page_count_max_relax?: number;
  per_episode_omniscient_max_relax?: number;
};

export type NarrationBudgetFile = {
  schema_version: 1;
  default_budget: NarrationBudgetTone;
  by_tone_profile: Record<string, NarrationBudgetTone>;
  by_page_role: Record<string, NarrationBudgetPageRole>;
  by_genre: Record<string, NarrationBudgetGenre>;
};

let cachedBudget: NarrationBudgetFile | null = null;

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_BUDGET_PATH = path.join(REPO_ROOT, "data/generation/narration-budgets.json");

export async function loadNarrationBudgets(
  budgetJsonPath = DEFAULT_BUDGET_PATH,
): Promise<NarrationBudgetFile> {
  if (cachedBudget) return cachedBudget;
  const buf = await fs.readFile(budgetJsonPath, "utf-8");
  cachedBudget = JSON.parse(buf) as NarrationBudgetFile;
  return cachedBudget;
}

/**
 * tone_profile.darkness を bin に変換 (audit-rules で繰り返し使う)
 */
function toneBinKey(toneProfile: ToneProfile | undefined): string {
  const darkness = toneProfile?.darkness ?? 0.5;
  if (darkness < 0.3) return "darkness_lt_0_3";
  if (darkness < 0.5) return "darkness_0_3_to_0_5";
  if (darkness < 0.7) return "darkness_0_5_to_0_7";
  return "darkness_gte_0_7";
}

export type ResolvedNarrationBudget = {
  per_panel_chars_max: number;
  /** page スコープの上限。tone × page_role × genre relax を考慮した最終値 */
  per_page_count_max: number;
  per_episode_omniscient_max: number;
  per_episode_protagonist_monologue_max?: number;
};

/**
 * tone × page_role × genre から最終 budget を解決。
 * page_role 別 override は tone 値より厳しい方を採用 (min)、genre relax は緩和方向 (+).
 */
export function resolveNarrationBudget(
  budgets: NarrationBudgetFile,
  toneProfile: ToneProfile | undefined,
  genre: string | undefined,
  pageRole: StoryboardPageV2["page_role"] | undefined,
): ResolvedNarrationBudget {
  const toneKey = toneBinKey(toneProfile);
  const toneBudget = budgets.by_tone_profile[toneKey] ?? budgets.default_budget;

  // page_role override (per_page_count_max を min で適用)
  const pageRoleBudget = pageRole ? budgets.by_page_role[pageRole] : undefined;
  let perPageCountMax = toneBudget.per_page_count_max;
  if (pageRoleBudget?.per_page_count_max !== undefined) {
    perPageCountMax = Math.min(perPageCountMax, pageRoleBudget.per_page_count_max);
  }

  // genre relax (per_page_count_max を + で緩和)
  let perEpisodeOmniscientMax = toneBudget.per_episode_omniscient_max;
  if (genre && budgets.by_genre[genre]) {
    const g = budgets.by_genre[genre];
    if (g.per_page_count_max_relax !== undefined) {
      perPageCountMax = perPageCountMax + g.per_page_count_max_relax;
    }
    if (g.per_episode_omniscient_max_relax !== undefined) {
      perEpisodeOmniscientMax = perEpisodeOmniscientMax + g.per_episode_omniscient_max_relax;
    }
  }

  return {
    per_panel_chars_max: toneBudget.per_panel_chars_max,
    per_page_count_max: Math.max(0, perPageCountMax),
    per_episode_omniscient_max: perEpisodeOmniscientMax,
    per_episode_protagonist_monologue_max: toneBudget.per_episode_protagonist_monologue_max,
  };
}

// ===== budget 検査結果型 =====

export type NarrationBudgetViolation = {
  scope: "panel" | "page" | "episode";
  page_no: number;
  panel_no?: number;
  rule: "narration_panel_chars_exceeded" | "narration_page_count_exceeded" | "narration_episode_omniscient_exceeded";
  observed: number;
  limit: number;
  message: string;
};

/**
 * Episode 全体の narration を検査して violations を返す。
 * audit-rules.ts から auditVolume() の延長として呼ぶ想定。
 */
export function checkNarrationBudget(
  storyboard: EpisodeStoryboardV2,
  budgets: NarrationBudgetFile,
  toneProfile: ToneProfile | undefined,
  genre: string | undefined,
): NarrationBudgetViolation[] {
  const violations: NarrationBudgetViolation[] = [];
  let omniscientCountInEp = 0;

  for (const page of storyboard.pages) {
    const resolved = resolveNarrationBudget(budgets, toneProfile, genre, page.page_role);

    // page スコープ: narration 個数の合計
    let pageNarrationCount = 0;
    for (const panel of page.panels) {
      pageNarrationCount += panel.narration.length;

      // panel スコープ: narration 文字数の合計
      const panelNarrationChars = panel.narration.reduce((s, n) => s + n.length, 0);
      if (panelNarrationChars > resolved.per_panel_chars_max) {
        violations.push({
          scope: "panel",
          page_no: page.page_no,
          panel_no: panel.panel_no,
          rule: "narration_panel_chars_exceeded",
          observed: panelNarrationChars,
          limit: resolved.per_panel_chars_max,
          message: `panel#${panel.panel_no}: narration ${panelNarrationChars}字 > 上限 ${resolved.per_panel_chars_max} (tone=${toneBinKey(toneProfile)}, page_role=${page.page_role})`,
        });
      }

      // episode スコープ: omniscient 系をカウント (kind 未指定は caption_box 想定で omniscient ではない)
      const kinds = panel.narration_kinds ?? [];
      for (let i = 0; i < panel.narration.length; i++) {
        const kind: NarrationKind = (kinds[i] as NarrationKind) ?? "caption_box";
        if (kind === "omniscient") {
          omniscientCountInEp++;
        }
      }
    }

    if (pageNarrationCount > resolved.per_page_count_max) {
      violations.push({
        scope: "page",
        page_no: page.page_no,
        rule: "narration_page_count_exceeded",
        observed: pageNarrationCount,
        limit: resolved.per_page_count_max,
        message: `page ${page.page_no} (${page.page_role}): narration ${pageNarrationCount} 個 > 上限 ${resolved.per_page_count_max}`,
      });
    }
  }

  // episode スコープ: omniscient 上限
  // Phase Y では tone × genre のみ参照 (page_role は episode 全体で集約済)
  const episodeBudget = resolveNarrationBudget(budgets, toneProfile, genre, undefined);
  if (omniscientCountInEp > episodeBudget.per_episode_omniscient_max) {
    violations.push({
      scope: "episode",
      page_no: 0,
      rule: "narration_episode_omniscient_exceeded",
      observed: omniscientCountInEp,
      limit: episodeBudget.per_episode_omniscient_max,
      message: `episode 全体: 神視点ナレ ${omniscientCountInEp} 個 > 上限 ${episodeBudget.per_episode_omniscient_max} (tone=${toneBinKey(toneProfile)})`,
    });
  }

  return violations;
}
