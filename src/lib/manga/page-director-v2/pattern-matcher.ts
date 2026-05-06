import type { StoryboardPageV2 } from "../schemas-v2";
import type { Pattern, PatternDict, PatternFrequency, PatternSizeClass } from "./pattern-loader";

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
  /** 直近 history に含まれる同 pattern 1 件あたりの減点係数。default 1.5 */
  historyPenaltyIntensity?: number;
};

const FREQUENCY_RANK: Record<PatternFrequency, number> = {
  high: 3,
  "medium-high": 3,
  medium: 2,
  "rare-medium": 2,
  low: 1,
  rare: 1,
};

const SIZE_RANK: Record<PatternSizeClass, number> = {
  small: 1,
  medium: 2,
  large: 3,
  extra_large: 4,
  xx_large: 5,
};

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

function subtypeMatches(pattern: Pattern, storyboardSubtype?: string): boolean {
  return !!storyboardSubtype && pattern.subtype_hints.includes(storyboardSubtype);
}

function maxSizeRank(pattern: Pattern): number {
  return Math.max(...pattern.slots.map((slot) => SIZE_RANK[slot.size_class] ?? 0));
}

function importanceMax(page: StoryboardPageV2): number {
  return Math.max(...page.panels.map((panel) => panel.importance));
}

function hasLargeSlot(pattern: Pattern): boolean {
  return maxSizeRank(pattern) >= SIZE_RANK.extra_large;
}

function historyPenalty(pattern: Pattern, history: string[], depth: number, intensity: number): number {
  return history.slice(-depth).filter((id) => id === pattern.id).length * intensity;
}

function panelCountBonus(pattern: Pattern, targetPanelCount: number): number {
  const distance = Math.abs(pattern.panel_count - targetPanelCount);
  if (distance === 0) return 0.5;
  if (distance === 1) return 0;
  if (distance === 2) return -0.3;
  return 0;
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
}): ScoredPattern {
  const penalty = historyPenalty(args.pattern, args.history, args.historyPenaltyDepth, args.historyPenaltyIntensity);
  const subtypeBonus = subtypeMatches(args.pattern, args.storyboardSubtype) ? 0.5 : 0;
  const importanceBonus = importanceMax(args.page) >= 4 && hasLargeSlot(args.pattern) ? 0.3 : 0;
  const score =
    FREQUENCY_RANK[args.pattern.frequency] -
    penalty +
    subtypeBonus +
    importanceBonus +
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
  const historyPenaltyIntensity = args.historyPenaltyIntensity ?? 1.5;

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
      warnings: [`phase=3 (role ignored): page_role=${args.page.page_role} pattern=${phase3.pattern.id}`],
    });
  }

  return null;
}
