import type { CapabilityProfile } from "../capability/capability";
import type { EpisodeStoryboardV2, PagePlanPage, PagePlanV2 } from "../schemas-v2";
import { buildPagePlanFromStoryboardV3 } from "./page-mapper-v3";
import { applyPattern } from "./pattern-applier";
import type { PatternDict } from "./pattern-loader";
import { isNonRect, matchPattern } from "./pattern-matcher";

export type LayoutMatchMeta = {
  pattern_id: string;
  phase: 1 | 2 | 3;
  actualApplied: boolean;
  score: number;
  penalty: number;
  nonRect: boolean;
  fallbackReason?: string;
};

type PagePlanPageWithLayoutMatchMeta = PagePlanPage & {
  _layout_match_meta?: LayoutMatchMeta;
};

type PagePlanV2WithLayoutMatchMeta = Omit<PagePlanV2, "pages"> & {
  pages: PagePlanPageWithLayoutMatchMeta[];
};

function polygonWithinPage(args: {
  polygon: [number, number][];
  width: number;
  height: number;
}): boolean {
  return args.polygon.every(([x, y]) => x >= 0 && y >= 0 && x <= args.width && y <= args.height);
}

export function buildPagePlanFromStoryboardV4(args: {
  storyboard: EpisodeStoryboardV2;
  capability: CapabilityProfile;
  dict: PatternDict;
  storyboardSubtype?: string;
}): PagePlanV2WithLayoutMatchMeta {
  const basePlan = buildPagePlanFromStoryboardV3({
    storyboard: args.storyboard,
    capability: args.capability,
  });

  const history: string[] = [];
  const recentNonRectHistory: boolean[] = [];
  const pages = basePlan.pages.map((basePage) => {
    const storyboardPage = args.storyboard.pages.find((page) => page.page_no === basePage.page_no);
    if (!storyboardPage) {
      console.warn(`[page-mapper-v4] page ${basePage.page_no}: storyboard page not found; keeping v3 rect layout`);
      return basePage;
    }

    const match = matchPattern({
      page: storyboardPage,
      dict: args.dict,
      storyboardSubtype: args.storyboardSubtype,
      history,
      historyPenaltyDepth: 5,
      historyPenaltyIntensity: 1.0,
      recentNonRectHistory,
    });
    if (!match) {
      console.warn(
        `[page-mapper-v4] page ${basePage.page_no}: no pattern match for role=${storyboardPage.page_role} panels=${storyboardPage.panels.length}; keeping v3 rect layout`
      );
      return basePage;
    }

    for (const warning of match.warnings) {
      console.warn(`[page-mapper-v4] page ${basePage.page_no}: ${warning}; pattern=${match.pattern.id}`);
    }

    const matchMetaBase = {
      pattern_id: match.pattern.id,
      phase: match.phase,
      score: match.score,
      penalty: match.penalty,
      nonRect: isNonRect(match.pattern),
    };

    const applied = applyPattern({
      panels: basePage.panels,
      pattern: match.pattern,
    });

    const invalidPanel = applied.planPanels.find((panel) =>
      panel.polygon &&
      !polygonWithinPage({
        polygon: panel.polygon,
        width: args.dict.page_dimensions.width,
        height: args.dict.page_dimensions.height,
      })
    );
    if (invalidPanel) {
      const fallbackReason = `polygon out of page bounds on panel=${invalidPanel.panel_id}`;
      console.warn(
        `[L05] page ${basePage.page_no}: v4 polygon validation failed, falling back to v3 (reason: pattern=${match.pattern.id} ${fallbackReason})`
      );
      return {
        ...basePage,
        _layout_match_meta: {
          ...matchMetaBase,
          actualApplied: false,
          fallbackReason,
        },
      };
    }

    history.push(match.pattern.id);
    recentNonRectHistory.push(isNonRect(match.pattern));
    if (recentNonRectHistory.length > 3) recentNonRectHistory.shift();

    return {
      ...basePage,
      layout_template_id: `v4_${match.pattern.id}`,
      panels: applied.planPanels,
      _layout_match_meta: {
        ...matchMetaBase,
        actualApplied: true,
      },
    };
  });

  return {
    ...basePlan,
    schema_version: 2,
    pages,
  };
}
