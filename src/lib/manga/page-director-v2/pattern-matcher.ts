import type { StoryboardPageV2 } from "../schemas-v2";
import type { Pattern, PatternDict, PatternFrequency } from "./pattern-loader";

export type MatchResult = {
  pattern: Pattern;
  phase: 1 | 2 | 3;
  score: number;
  penalty: number;
  alternatives: Array<{ id: string; score: number; phase: 1 | 2 | 3 }>;
  warnings: string[];
} | null;

export type MatchOptions = {
  page: StoryboardPageV2;
  dict: PatternDict;
  storyboardSubtype?: string;
  history?: string[];
  historyPenaltyDepth?: number;
  /** 直近 history に含まれる同 pattern 1 件あたりの減点係数。default 1.0 */
  historyPenaltyIntensity?: number;
  /** 直近 N ページの applied pattern が non-rect だったかの真偽配列 (最新が末尾) */
  recentNonRectHistory?: boolean[];
};

const FREQUENCY_RANK: Record<PatternFrequency, number> = {
  high: 2.5,
  "medium-high": 2.5,
  medium: 2,
  "rare-medium": 2,
  low: 1,
  rare: 1,
};

/**
 * polygon が axis-aligned rect か判定。
 * 4頂点で xs と ys がそれぞれ 2 種類の値しか持たない場合のみ true。
 * 4頂点斜め台形 / 5+頂点 polygon は false。
 */
export function isAxisAlignedRect(polygon: Array<[number, number]>): boolean {
  if (polygon.length !== 4) return false;
  const xs = new Set(polygon.map(([x]) => x));
  const ys = new Set(polygon.map(([, y]) => y));
  return xs.size === 2 && ys.size === 2;
}

/**
 * pattern の slot に non-rect (axis-aligned rect でない polygon) が 1 個でもあれば true。
 */
export function isNonRect(pattern: Pattern): boolean {
  return pattern.slots.some((slot) => !isAxisAlignedRect(slot.polygon));
}

function roleMatches(pageRole: string, pattern: Pattern): boolean {
  if (pattern.page_role_hints.includes(pageRole)) return true;
  if (pageRole === "action") {
    return pattern.page_role_hints.some((hint) =>
      hint === "action" || hint.startsWith("action_") || hint === "chase" || hint === "brawl"
    );
  }
  if (pageRole === "reveal") {
    return pattern.page_role_hints.some((hint) => hint === "reveal" || hint.includes("reveal"));
  }
  if (pageRole === "cliffhanger") {
    return pattern.page_role_hints.some((hint) =>
      hint === "cliffhanger" || hint.includes("threat") || hint.includes("boss_reveal")
    );
  }
  return false;
}

/** semantic family の一致を判定。例: action と buildup は近い */
function roleSemanticFamilyMatches(pageRole: string, pattern: Pattern): boolean {
  const families: Record<string, string[]> = {
    opening_hook: ["establishing", "buildup"],
    cliffhanger: ["reveal", "aftermath"],
    reveal: ["cliffhanger", "aftermath"],
    action: ["buildup"],
    buildup: ["action", "establishing"],
    aftermath: ["reveal", "dialogue"],
    establishing: ["opening_hook", "buildup"],
    dialogue: ["aftermath", "buildup"],
  };
  const family = families[pageRole] ?? [];
  return family.some((role) => pattern.page_role_hints.includes(role));
}

function subtypeMatches(pattern: Pattern, storyboardSubtype?: string): boolean {
  return !!storyboardSubtype && pattern.subtype_hints.includes(storyboardSubtype);
}

function importanceMax(page: StoryboardPageV2): number {
  return Math.max(...page.panels.map((panel) => panel.importance));
}

function historyPenalty(pattern: Pattern, history: string[], depth: number, intensity: number): number {
  return history.slice(-depth).filter((id) => id === pattern.id).length * intensity;
}

function panelCountBonus(pattern: Pattern, targetPanelCount: number): number {
  const distance = Math.abs(pattern.panel_count - targetPanelCount);
  if (distance === 0) return 0.6;
  if (distance === 1) return 0;
  return -0.5;
}

type ScoredPattern = {
  pattern: Pattern;
  phase: 1 | 2 | 3;
  score: number;
  penalty: number;
};

function scorePattern(args: {
  pattern: Pattern;
  phase: 1 | 2 | 3;
  page: StoryboardPageV2;
  storyboardSubtype?: string;
  targetPanelCount: number;
  history: string[];
  historyPenaltyDepth: number;
  historyPenaltyIntensity: number;
  recentNonRectHistory?: boolean[];
}): ScoredPattern {
  const penalty = historyPenalty(args.pattern, args.history, args.historyPenaltyDepth, args.historyPenaltyIntensity);
  const subtypeBonus = subtypeMatches(args.pattern, args.storyboardSubtype) ? 0.5 : 0;
  const importance = importanceMax(args.page);
  const importanceBonus = importance >= 4 ? 0.3 : 0;
  const nonRectBonus = importance >= 4 && isNonRect(args.pattern) ? 1.2 : 0;
  const roleSoftBonus = roleMatches(args.page.page_role, args.pattern)
    ? 0.5
    : roleSemanticFamilyMatches(args.page.page_role, args.pattern)
      ? 0.3
      : 0;
  const varietyWindowBonus =
    args.recentNonRectHistory &&
    args.recentNonRectHistory.length >= 3 &&
    args.recentNonRectHistory.slice(-3).every((nonRect) => !nonRect) &&
    isNonRect(args.pattern)
      ? 0.8
      : 0;
  // shot_type 多様性 bonus: 単調 page ペナルティではなく「shot 変化のある page」を優先する形で実装。
  // 結果として shot 単調 page では小さい bonus が出ず、かつ 全 pattern 中で diversity-friendly な pattern (mixed shot 想定) が相対的に上位に来る。
  // 2026-05-07 追加: shot_type 多様性 bonus
  // 単調な構図 (同じ shot 連続) を避けるため、distinct shot_type / panel_count 比に応じて加点
  const distinctShotTypes = new Set(args.page.panels.map((panel) => panel.shot_type)).size;
  const diversityRatio = args.page.panels.length > 0 ? distinctShotTypes / args.page.panels.length : 0;
  const diversityBonus =
    diversityRatio >= 0.6 ? 0.5 : diversityRatio >= 0.4 ? 0.3 : diversityRatio >= 0.25 ? 0.1 : 0;
  const score =
    FREQUENCY_RANK[args.pattern.frequency] -
    penalty +
    subtypeBonus +
    importanceBonus +
    nonRectBonus +
    roleSoftBonus +
    varietyWindowBonus +
    diversityBonus +
    panelCountBonus(args.pattern, args.targetPanelCount);

  return {
    pattern: args.pattern,
    phase: args.phase,
    score,
    penalty,
  };
}

function pickPattern(args: {
  candidates: Pattern[];
  phase: 1 | 2 | 3;
  page: StoryboardPageV2;
  storyboardSubtype?: string;
  targetPanelCount: number;
  history: string[];
  historyPenaltyDepth: number;
  historyPenaltyIntensity: number;
  recentNonRectHistory?: boolean[];
}): ScoredPattern | undefined {
  return args.candidates
    .map((pattern) =>
      scorePattern({
        pattern,
        phase: args.phase,
        page: args.page,
        storyboardSubtype: args.storyboardSubtype,
        targetPanelCount: args.targetPanelCount,
        history: args.history,
        historyPenaltyDepth: args.historyPenaltyDepth,
        historyPenaltyIntensity: args.historyPenaltyIntensity,
        recentNonRectHistory: args.recentNonRectHistory,
      })
    )
    .sort((a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id))[0];
}

function buildResult(args: {
  selected: ScoredPattern;
  candidates: Pattern[];
  page: StoryboardPageV2;
  storyboardSubtype?: string;
  targetPanelCount: number;
  history: string[];
  historyPenaltyDepth: number;
  historyPenaltyIntensity: number;
  recentNonRectHistory?: boolean[];
  warnings: string[];
}): MatchResult {
  const alternatives = args.candidates
    .filter((pattern) => pattern.id !== args.selected.pattern.id)
    .map((pattern) =>
      scorePattern({
        pattern,
        phase: args.selected.phase,
        page: args.page,
        storyboardSubtype: args.storyboardSubtype,
        targetPanelCount: args.targetPanelCount,
        history: args.history,
        historyPenaltyDepth: args.historyPenaltyDepth,
        historyPenaltyIntensity: args.historyPenaltyIntensity,
        recentNonRectHistory: args.recentNonRectHistory,
      })
    )
    .sort((a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id))
    .slice(0, 3)
    .map((candidate) => ({
      id: candidate.pattern.id,
      score: candidate.score,
      phase: candidate.phase,
    }));

  return {
    pattern: args.selected.pattern,
    phase: args.selected.phase,
    score: args.selected.score,
    penalty: args.selected.penalty,
    alternatives,
    warnings: args.warnings,
  };
}

export function matchPattern(args: MatchOptions): MatchResult {
  const panelCount = args.page.panels.length;
  const history = args.history ?? [];
  const historyPenaltyDepth = args.historyPenaltyDepth ?? 5;
  const historyPenaltyIntensity = args.historyPenaltyIntensity ?? 1.0;
  const recentNonRectHistory = args.recentNonRectHistory;

  const phase1Candidates = args.dict.patterns.filter((pattern) =>
    Math.abs(pattern.panel_count - panelCount) <= 1 &&
    roleMatches(args.page.page_role, pattern)
  );
  const phase1 = pickPattern({
    candidates: phase1Candidates,
    phase: 1,
    page: args.page,
    storyboardSubtype: args.storyboardSubtype,
    targetPanelCount: panelCount,
    history,
    historyPenaltyDepth,
    historyPenaltyIntensity,
    recentNonRectHistory,
  });
  if (phase1) {
    return buildResult({
      selected: phase1,
      candidates: phase1Candidates,
      page: args.page,
      storyboardSubtype: args.storyboardSubtype,
      targetPanelCount: panelCount,
      history,
      historyPenaltyDepth,
      historyPenaltyIntensity,
      recentNonRectHistory,
      warnings: [],
    });
  }

  const phase2Candidates = args.dict.patterns.filter((pattern) =>
    Math.abs(pattern.panel_count - panelCount) <= 2 &&
    roleMatches(args.page.page_role, pattern)
  );
  const phase2 = pickPattern({
    candidates: phase2Candidates,
    phase: 2,
    page: args.page,
    storyboardSubtype: args.storyboardSubtype,
    targetPanelCount: panelCount,
    history,
    historyPenaltyDepth,
    historyPenaltyIntensity,
    recentNonRectHistory,
  });
  if (phase2) {
    return buildResult({
      selected: phase2,
      candidates: phase2Candidates,
      page: args.page,
      storyboardSubtype: args.storyboardSubtype,
      targetPanelCount: panelCount,
      history,
      historyPenaltyDepth,
      historyPenaltyIntensity,
      recentNonRectHistory,
      warnings: [
        `phase=2 (panel_count mismatch): expected ${panelCount} got pattern of ${phase2.pattern.panel_count}`,
      ],
    });
  }

  const phase3Candidates = args.dict.patterns.filter((pattern) => pattern.panel_count === panelCount);
  const phase3 = pickPattern({
    candidates: phase3Candidates,
    phase: 3,
    page: args.page,
    storyboardSubtype: args.storyboardSubtype,
    targetPanelCount: panelCount,
    history,
    historyPenaltyDepth,
    historyPenaltyIntensity,
    recentNonRectHistory,
  });
  if (phase3) {
    return buildResult({
      selected: phase3,
      candidates: phase3Candidates,
      page: args.page,
      storyboardSubtype: args.storyboardSubtype,
      targetPanelCount: panelCount,
      history,
      historyPenaltyDepth,
      historyPenaltyIntensity,
      recentNonRectHistory,
      warnings: [`phase=3 (role ignored): page_role=${args.page.page_role} pattern=${phase3.pattern.id}`],
    });
  }

  return null;
}
