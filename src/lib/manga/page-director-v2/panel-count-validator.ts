import type { EpisodeStoryboardV2 } from "../schemas-v2";
import { validatePanelCount, type GenerationProfile } from "./panel-count-hint";

/**
 * storyboard 全体の panel_count を hint と比較し、逸脱 page を warning 配列で返す。
 * hard fail しない、warning 配列のみ。
 */
export function validateStoryboardPanelCounts(
  storyboard: EpisodeStoryboardV2,
  profile?: GenerationProfile,
): { warnings: string[] } {
  const warnings = storyboard.pages.flatMap((page) => {
    const result = validatePanelCount(page, profile);
    return result.warning ? [`page ${page.page_no}: ${result.warning}`] : [];
  });
  return { warnings };
}
